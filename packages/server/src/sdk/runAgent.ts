/**
 * runAgent:一个 agent 实例 = 一次 query() 会话(tech-spec §4.1)。
 * 组装 options、消费消息流、收集并强校验 Claim(§4.4)。
 *
 * 无 ANTHROPIC_API_KEY 时,query() 会抛错;runAgent 捕获并降级为
 * failed_observation Claim(emit error 事件),不让进程崩溃。
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  ClaimSchema,
  type AgentDefinition,
  type Claim,
  type ClaimSubmission,
} from '@personax/contracts';
import type { RunContext } from '../runtime/context.js';
import { childContext } from '../runtime/context.js';
import { makeCanUseTool } from './canUseTool.js';
import { buildMcpServers, type ClaimHolder } from './mcp.js';
import { getVersion } from '../store/bases.js';
import { getBase } from '../store/bases.js';
import { getMemory } from '../store/memory.js';
import { saveRun } from '../store/runs.js';
import { getSettings } from '../store/settings.js';
import { insertUsageEvent } from '../store/usage.js';
import { getModelContextWindow } from '../api/models.js';
import { buildEnvForAgent } from './env.js';

// 受管 cwd = packages/server 绝对路径(src/sdk/runAgent.ts → 向上两级)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const MANAGED_CWD = path.resolve(__dirname, '../..');

/** 角色提示:按 kind 给简短定位,并强制完成后调用 submit_claim。 */
export function rolePrompt(def: AgentDefinition): string {
  let role: string;
  switch (def.kind) {
    case 'lead':
      role =
        '你是 Global Lead,负责任务编排与结论合成:把任务拆给相关领域 agent / worker,综合各方 Claim 给出最终结论。' +
        '用 mcp__personax-orchestration__call_domain_agent 向领域 agent 提问,用 mcp__personax-orchestration__spawn_worker 派一次性检索/执行。';
      break;
    case 'business_domain':
    case 'technical_domain':
      role =
        `你是「${def.domain ?? def.name}」领域主 agent,负责本域的语义判断:` +
        '基于本域知识与取到的证据形成结构化结论。必要时可派 worker 取证。';
      break;
    case 'worker':
      role =
        '你是一次性 worker。只做被指派的检索/读代码/跑命令,产出基于证据的结构化结论,不做业务判断。';
      break;
  }
  return (
    `${role}\n\n` +
    '【硬性要求】调查结束后,你**必须**调用 mcp__personax-claim-sink__submit_claim 提交一次结构化 Claim ' +
    '(claimType / claim / scope / confidence / evidenceRefs 等),这是本次任务唯一被接收的产物。' +
    '不要只用自然语言作答而不提交 Claim。'
  );
}

/** 取 def.baseId 的当前生效版本内容(静态注入,Slice 4 简化)。无则空串。 */
function loadBaseCapsule(def: AgentDefinition): {
  capsule: string;
  baseId?: string;
  baseVersion?: number;
  baseFingerprint?: string;
} {
  if (!def.baseId) return { capsule: '' };
  const base = getBase(def.baseId);
  if (!base) return { capsule: '' };
  // basePin 优先,否则用 activeVersion
  const versionNum = def.basePin ? Number(def.basePin) : base.activeVersion;
  if (!Number.isInteger(versionNum) || versionNum < 1) return { capsule: '' };
  const ver = getVersion(def.baseId, versionNum);
  if (!ver) return { capsule: '' };
  return {
    capsule: `【领域知识库 ${def.baseId} v${ver.version}】\n${ver.content}`,
    baseId: def.baseId,
    baseVersion: ver.version,
    baseFingerprint: ver.fingerprint,
  };
}

interface AgentSessionConfig {
  /** 是否为一次性 worker(persistSession:false, settingSources:[]) */
  worker: boolean;
}

/**
 * runAgent 主体。生成 nodeId、emit agent_started、记录 fork、组装 query、
 * 消费流、收集 Claim(强校验 + 修复一次 + 降级)。
 */
async function runAgentSession(
  def: AgentDefinition,
  input: string,
  ctx: RunContext,
  cfg: AgentSessionConfig,
): Promise<Claim> {
  const nodeId = nanoid();

  ctx.emit({
    type: 'agent_started',
    nodeId,
    parentNodeId: ctx.parentNodeId,
    agentId: def.id,
    agentKind: def.kind,
    label: def.name,
    depth: ctx.depth,
    input,
  });

  const { capsule, baseId, baseVersion, baseFingerprint } = loadBaseCapsule(def);

  // 记录 fork(基于哪份地图)
  ctx.run.forks.push({
    agentId: def.id,
    baseId,
    baseVersion,
    baseFingerprint,
    forkedAt: new Date().toISOString(),
  });
  saveRun(ctx.run);

  // 出处盖章信息(随 fork)
  const provenance = { baseId, baseVersion, baseFingerprint };

  // 子上下文:本 node 作为后续子调用的 parent
  const childCtxBase = childContext(ctx, def.id, nodeId);

  const claimHolder: ClaimHolder = {};

  // per-agent 记忆:有非空内容则注入(放在 base capsule 之后)
  const memory = getMemory(def.id);
  const memoryBlock = memory.content.trim()
    ? `## Agent 记忆(你过去记录的笔记)\n${memory.content}`
    : '';

  const append = [rolePrompt(def), capsule, memoryBlock, def.systemPromptExtra ?? '']
    .filter((s) => s.length > 0)
    .join('\n\n');

  const options: Options = {
    systemPrompt: { type: 'preset', preset: 'claude_code', append },
    cwd: MANAGED_CWD,
    mcpServers: buildMcpServers(def, childCtxBase, claimHolder),
    allowedTools: [
      ...def.toolPolicy.allow,
      'mcp__personax-orchestration__*',
      'mcp__personax-claim-sink__*',
    ],
    disallowedTools: ['Agent', 'Task'],
    canUseTool: makeCanUseTool(def, ctx),
    permissionMode: 'default',
    strictMcpConfig: true,
    settingSources: cfg.worker ? [] : ['project'],
    skills: def.skills,
    model: cfg.worker ? getSettings().workerModel : (def.model || getSettings().defaultModel),
    includePartialMessages: true,
    // 按连接注入凭据:def.connectionId > 全局默认 > 订阅(worker 无 connectionId → 全局默认)
    env: buildEnvForAgent(def),
  };
  if (cfg.worker) {
    options.persistSession = false;
  }

  const resolvedModel = cfg.worker ? getSettings().workerModel : (def.model || getSettings().defaultModel);

  try {
    const stream = query({ prompt: input, options });
    await consume(stream, ctx, nodeId, def, resolvedModel);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.emit({ type: 'error', nodeId, message: `agent ${def.id} 运行失败: ${message}` });
    const claim = failedObservation(def, provenance, `query() 调用失败: ${message}`);
    recordClaim(ctx, nodeId, claim);
    ctx.emit({ type: 'agent_finished', nodeId });
    return claim;
  }

  // 收集并强校验 Claim
  const claim = await collectClaim(def, ctx, nodeId, claimHolder, provenance, input, cfg);
  recordClaim(ctx, nodeId, claim);
  return claim;
}

/** 公开入口:运行一个注册的 agent。 */
export function runAgent(def: AgentDefinition, input: string, ctx: RunContext): Promise<Claim> {
  return runAgentSession(def, input, ctx, { worker: false });
}

/** 公开入口:派一个一次性 worker。tools 缺省给基础读类工具。 */
export function runWorker(
  task: string,
  tools: string[] | undefined,
  ctx: RunContext,
): Promise<Claim> {
  const allow = tools ?? ['Read', 'Grep', 'Glob', 'Bash'];
  const def: AgentDefinition = {
    id: 'agent.worker',
    name: 'Worker',
    kind: 'worker',
    skills: [],
    mcpServers: [],
    toolPolicy: { allow },
    status: 'active',
    version: 0,
    updatedAt: new Date().toISOString(),
  };
  return runAgentSession(def, task, ctx, { worker: true });
}

/**
 * 消费消息流:转译为 SSE 事件,并累加成本预算。
 * - stream_event: content_block_delta 的 text_delta / thinking_delta → emit delta
 * - assistant: 扫描 content 里的 tool_use block → emit tool_use
 * - result: 累加 total_cost_usd,emit agent_finished + budget,插入 usage_event
 */
async function consume(
  stream: AsyncIterable<SDKMessage>,
  ctx: RunContext,
  nodeId: string,
  def: AgentDefinition,
  model: string,
): Promise<void> {
  for await (const msg of stream) {
    if (msg.type === 'stream_event') {
      const ev = msg.event as { type?: string; delta?: { type?: string; text?: string; thinking?: string } };
      if (ev.type === 'content_block_delta' && ev.delta) {
        if (ev.delta.type === 'text_delta' && typeof ev.delta.text === 'string') {
          ctx.emit({ type: 'text_delta', nodeId, text: ev.delta.text });
        } else if (ev.delta.type === 'thinking_delta' && typeof ev.delta.thinking === 'string') {
          ctx.emit({ type: 'thinking_delta', nodeId, text: ev.delta.thinking });
        }
      }
    } else if (msg.type === 'assistant') {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as { type?: string; id?: string; name?: string; input?: unknown };
          if (b.type === 'tool_use') {
            ctx.budget.spentToolCalls += 1;
            ctx.emit({
              type: 'tool_use',
              nodeId,
              toolName: b.name ?? 'unknown',
              toolUseId: b.id,
              summary: summarizeToolInput(b.input),
            });
          }
        }
      }
    } else if (msg.type === 'result') {
      const cost = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : 0;
      ctx.budget.spentCostUsd += cost;

      // 取 usage tokens(容错:缺失时用 0)
      const usage = (msg as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } }).usage;
      const inputTokens = typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0;
      const outputTokens = typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0;
      const cacheReadTokens = typeof usage?.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : undefined;
      const contextWindow = getModelContextWindow(model);

      // 落库
      try {
        insertUsageEvent({
          runId: ctx.run.id,
          agentId: def.id,
          agentKind: def.kind,
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          costUsd: cost,
          contextWindow,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[usage] insertUsageEvent 失败:', err);
      }

      ctx.emit({
        type: 'agent_finished',
        nodeId,
        costUsd: cost,
        numTurns: typeof msg.num_turns === 'number' ? msg.num_turns : undefined,
        model,
        inputTokens,
        outputTokens,
        contextWindow,
      });
      ctx.emit({
        type: 'budget',
        spentChildAgents: ctx.budget.spentChildAgents,
        spentToolCalls: ctx.budget.spentToolCalls,
        spentCostUsd: ctx.budget.spentCostUsd,
      });
    }
  }
}

/** 把 tool_use 的 input 摘成一句话(截断)。 */
function summarizeToolInput(input: unknown): string | undefined {
  if (input == null) return undefined;
  try {
    const s = typeof input === 'string' ? input : JSON.stringify(input);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return undefined;
  }
}

interface Provenance {
  baseId?: string;
  baseVersion?: number;
  baseFingerprint?: string;
}

/** 给模型提交的载荷盖出处章,得到完整 Claim 候选(未校验)。 */
function stamp(
  submission: ClaimSubmission,
  def: AgentDefinition,
  prov: Provenance,
): Record<string, unknown> {
  return {
    ...submission,
    agentId: def.id,
    agentKind: def.kind,
    baseId: prov.baseId,
    baseVersion: prov.baseVersion,
    baseFingerprint: prov.baseFingerprint,
  };
}

/**
 * 收集 Claim:取 claimHolder.submitted,stamp,zod 校验;
 * 失败则修复一次(再发一次极短 query 要求按 schema 重交);最终失败降级为 failed_observation。
 */
async function collectClaim(
  def: AgentDefinition,
  ctx: RunContext,
  nodeId: string,
  holder: ClaimHolder,
  prov: Provenance,
  originalInput: string,
  cfg: AgentSessionConfig,
): Promise<Claim> {
  if (holder.submitted) {
    const parsed = ClaimSchema.safeParse(stamp(holder.submitted, def, prov));
    if (parsed.success) return parsed.data;
    // 修复一次
    const repaired = await repairOnce(def, ctx, holder, originalInput, cfg, parsed.error);
    if (repaired) {
      const reparsed = ClaimSchema.safeParse(stamp(repaired, def, prov));
      if (reparsed.success) return reparsed.data;
    }
    return failedObservation(def, prov, `Claim 校验失败且修复未通过: ${parsed.error.message}`);
  }
  return failedObservation(def, prov, '该 agent 未通过 submit_claim 提交结构化 Claim');
}

/**
 * 修复一次:重新发起一个极短 query,把 schema 错误回灌,要求重新调用 submit_claim。
 * 任何异常都吞掉(降级路径会兜底)。返回新的 submission 或 undefined。
 */
async function repairOnce(
  def: AgentDefinition,
  ctx: RunContext,
  holder: ClaimHolder,
  originalInput: string,
  cfg: AgentSessionConfig,
  error: unknown,
): Promise<ClaimSubmission | undefined> {
  holder.submitted = undefined;
  const errMsg = error instanceof Error ? error.message : String(error);
  const repairPrompt =
    `你上次提交的 Claim 未通过 schema 校验:${errMsg}\n` +
    `原始任务:${originalInput}\n` +
    '请重新调用 mcp__personax-claim-sink__submit_claim,严格按字段要求提交一次合法 Claim。';
  try {
    const stream = query({
      prompt: repairPrompt,
      options: {
        systemPrompt: { type: 'preset', preset: 'claude_code', append: rolePrompt(def) },
        cwd: MANAGED_CWD,
        mcpServers: buildMcpServers(def, ctx, holder),
        allowedTools: ['mcp__personax-claim-sink__*'],
        disallowedTools: ['Agent', 'Task'],
        canUseTool: makeCanUseTool(def, ctx),
        permissionMode: 'default',
        strictMcpConfig: true,
        settingSources: cfg.worker ? [] : ['project'],
        model: cfg.worker ? getSettings().workerModel : (def.model || getSettings().defaultModel),
        env: buildEnvForAgent(def),
        ...(cfg.worker ? { persistSession: false } : {}),
      },
    });
    // 仅消费到结束以触发工具调用,不再 emit delta(保持安静)
    for await (const _msg of stream) {
      void _msg;
    }
  } catch {
    return undefined;
  }
  return holder.submitted;
}

/** 构造 failed_observation Claim(降级兜底)。 */
export function failedObservation(
  def: AgentDefinition,
  prov: Provenance,
  reason: string,
): Claim {
  return {
    agentId: def.id,
    agentKind: def.kind,
    baseId: prov.baseId,
    baseVersion: prov.baseVersion,
    baseFingerprint: prov.baseFingerprint,
    claimType: 'failed_observation',
    claim: `未取得有效结论:${reason}`,
    scope: def.domain ?? def.name,
    confidence: 0,
    evidenceRefs: [],
  };
}

/** 把 Claim 推入 run.claims + saveRun,并 emit claim 事件。 */
function recordClaim(ctx: RunContext, nodeId: string, claim: Claim): void {
  ctx.run.claims.push(claim);
  saveRun(ctx.run);
  ctx.emit({ type: 'claim', nodeId, claim });
}
