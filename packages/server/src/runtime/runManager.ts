/**
 * RunManager:run 生命周期编排 + per-run 事件总线 + SSE 订阅(tech-spec §6.2)。
 *
 * - createAndStartRun:落库 run → 建总线 → 异步启动(不 await)→ 返回 run。
 * - startRun:根据有无 key / PERSONAX_RUNTIME 决定走 mock 或 real 路径。
 * - subscribe:订阅时先回放 buffer(晚连接的 SSE 也能看到历史),再接收实时事件。
 */
import type { Run, RunEvent, AgentDefinition, Claim } from '@personax/contracts';
import { createRun, saveRun } from '../store/runs.js';
import { listAgents, getAgent } from '../store/agents.js';
import { listBases } from '../store/bases.js';
import { createPatch } from '../store/patches.js';
import { computeAutoEligible } from '../governance/policy.js';
import { rootContext } from './context.js';
import { runMock } from './mock.js';
import { runAgent } from '../sdk/runAgent.js';

// ---------- per-run 事件总线 ----------

interface RunBus {
  subscribers: Set<(ev: RunEvent) => void>;
  buffer: RunEvent[];
  finished: boolean;
  emit: (ev: RunEvent) => void;
}

const buses = new Map<string, RunBus>();

function createBus(): RunBus {
  const bus: RunBus = {
    subscribers: new Set(),
    buffer: [],
    finished: false,
    emit: (ev: RunEvent) => {
      bus.buffer.push(ev);
      if (ev.type === 'run_finished') bus.finished = true;
      for (const cb of bus.subscribers) {
        try {
          cb(ev);
        } catch {
          // 单个订阅者异常不影响其他订阅者
        }
      }
    },
  };
  return bus;
}

export function getBus(runId: string): RunBus | undefined {
  return buses.get(runId);
}

/**
 * 订阅 run 事件流。订阅时先把 buffer 回放给 cb(保证晚连接能看到历史),
 * 再接收后续实时事件。返回取消订阅函数。
 */
export function subscribe(runId: string, cb: (ev: RunEvent) => void): (() => void) | undefined {
  const bus = buses.get(runId);
  if (!bus) return undefined;
  // 回放历史
  for (const ev of bus.buffer) {
    cb(ev);
  }
  // 已结束则不再加入订阅集(回放已含 run_finished)
  if (bus.finished) {
    return () => {};
  }
  bus.subscribers.add(cb);
  return () => {
    bus.subscribers.delete(cb);
  };
}

// ---------- Lead 定义 ----------

/** 找 kind='lead' 的 agent;没有则合成默认 Global Lead。 */
function leadDef(): AgentDefinition {
  const found = listAgents().find((a) => a.status === 'active' && a.kind === 'lead');
  if (found) return found;
  return {
    id: 'agent.lead',
    name: 'Global Lead',
    kind: 'lead',
    skills: [],
    mcpServers: [],
    toolPolicy: { allow: ['Read', 'Grep', 'Glob', 'Bash'] },
    status: 'active',
    version: 0,
    updatedAt: new Date().toISOString(),
  };
}

// ---------- 启动 ----------

/** 创建并异步启动 run。返回已落库的 run(status='running')。 */
export function createAndStartRun(task: string): Run {
  const run = createRun(task);
  const bus = createBus();
  buses.set(run.id, bus);
  // 异步启动,不 await(让 POST 立即返回)
  void startRun(run, bus);
  return run;
}

function useMock(): boolean {
  // 显式覆盖优先
  if (process.env.PERSONAX_RUNTIME === 'mock') return true;
  if (process.env.PERSONAX_RUNTIME === 'real') return false;
  // 有任一凭据(API key / auth token / Claude Code 订阅 OAuth token)→ 走真实路径
  const hasCred = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.CLAUDE_CODE_OAUTH_TOKEN
  );
  return !hasCred;
}

async function startRun(run: Run, bus: RunBus): Promise<void> {
  const ctx = rootContext(run, bus.emit);
  try {
    if (useMock()) {
      await runMock(run, ctx);
    } else {
      await runReal(run, ctx);
    }
    // 沉淀:run 成功收尾后提案 patch(失败不影响 run 本身)
    if (run.status === 'done') {
      try {
        await proposePatches(run);
      } catch (patchErr) {
        console.error('[proposePatches] 沉淀失败,不影响 run:', patchErr);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    run.status = 'failed';
    saveRun(run);
    bus.emit({ type: 'error', message: `run ${run.id} 失败: ${message}` });
    bus.emit({ type: 'run_finished', runId: run.id, status: 'failed' });
  }
}

/**
 * 沉淀:把 run 的 claims 按来源域分组,对每个有匹配 base 的域生成一条 pending patch。
 * 确定性实现,无需 LLM。
 */
async function proposePatches(run: Run): Promise<void> {
  if (!run.claims || run.claims.length === 0) return;

  // 取所有知识库
  const bases = listBases();
  if (bases.length === 0) return;

  // 按 domain 分组 claim
  const domainClaims = new Map<string, Claim[]>();
  for (const claim of run.claims) {
    const agentDef = getAgent(claim.agentId);
    const domain = agentDef?.domain;
    if (!domain) continue;
    const list = domainClaims.get(domain) ?? [];
    list.push(claim);
    domainClaims.set(domain, list);
  }

  for (const [domain, claims] of domainClaims) {
    // 找匹配该 domain 的知识库
    const base = bases.find((b) => b.domain === domain);
    if (!base) continue;

    // 只取 observed_fact / inference 类 claim 汇总 proposal
    const factualClaims = claims.filter(
      (c) => c.claimType === 'observed_fact' || c.claimType === 'inference',
    );
    if (factualClaims.length === 0) continue;

    const proposalLines = factualClaims.map(
      (c) => `- [${c.claimType}] ${c.claim}`,
    );
    if (run.finalDelivery) {
      // 附加 finalDelivery 摘要(取前 300 字符避免过长)
      const snippet = run.finalDelivery.slice(0, 300);
      proposalLines.push(`\n综合结论(摘要):\n${snippet}`);
    }
    const proposal = proposalLines.join('\n');

    // evidenceRefs 并集
    const evidenceSet = new Set<string>();
    for (const c of factualClaims) {
      for (const ref of c.evidenceRefs ?? []) {
        evidenceSet.add(ref);
      }
    }
    const evidenceRefs = Array.from(evidenceSet);

    const autoEligible = computeAutoEligible(factualClaims);

    createPatch({
      baseId: base.id,
      fromRunId: run.id,
      proposal,
      evidenceRefs,
      autoEligible,
    });

    console.log(`[proposePatches] 已为 base=${base.id}(domain=${domain}) 创建 patch`);
  }
}

/** 真实 SDK 路径:emit run_started → Lead runAgent → 合成 finalDelivery → done。 */
async function runReal(run: Run, ctx: import('./context.js').RunContext): Promise<void> {
  ctx.emit({ type: 'run_started', runId: run.id, task: run.task });

  const lead = leadDef();
  const leadClaim = await runAgent(lead, run.task, ctx);

  // finalDelivery:优先用 Lead 的 claim 文本;失败则汇总各 claim
  const delivery =
    leadClaim.claimType !== 'failed_observation'
      ? leadClaim.claim
      : run.claims.length > 0
        ? run.claims.map((c) => `- [${c.claimType}] ${c.claim}`).join('\n')
        : '本次运行未产出有效结论。';

  run.finalDelivery = delivery;
  run.status = 'done';
  saveRun(run);
  ctx.emit({ type: 'final_delivery', runId: run.id, delivery });
  ctx.emit({ type: 'run_finished', runId: run.id, status: 'done' });
}
