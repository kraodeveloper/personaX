/**
 * Mock 运行路径:不调用 SDK,脚本化产出一段可信的多 agent SSE 轨迹,
 * 供前端演示(无 ANTHROPIC_API_KEY 时默认走此路径)。
 *
 * 轨迹:Lead 启动 → 思考 → call_domain_agent(payment) → payment claim →
 *       call_domain_agent(order) → order claim → spawn_worker → worker claim →
 *       Lead 综合 → final_delivery → run_finished('done')。
 *
 * 所有 Claim 经 ClaimSchema.parse 校验。用 setTimeout 制造流式节奏。
 */
import { nanoid } from 'nanoid';
import {
  ClaimSchema,
  type AgentDefinition,
  type AgentKind,
  type Claim,
  type Run,
} from '@personax/contracts';
import type { RunContext } from './context.js';
import { listAgents } from '../store/agents.js';
import { saveRun } from '../store/runs.js';
import { insertUsageEvent } from '../store/usage.js';
import { getSettings } from '../store/settings.js';
import { getModelContextWindow } from '../api/models.js';

/** 生成合成 usage 数据(mock 演示用,无真实 SDK 调用)。 */
function syntheticUsage(numTurns: number): {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  contextWindow: number | undefined;
} {
  const model = getSettings().defaultModel;
  const inputTokens = Math.floor(2000 + Math.random() * 3000) * numTurns;
  const outputTokens = Math.floor(200 + Math.random() * 600) * numTurns;
  // 粗估:input ~$3/M tokens, output ~$15/M tokens (sonnet 定价量级)
  const costUsd = parseFloat(((inputTokens * 3 + outputTokens * 15) / 1_000_000).toFixed(6));
  const contextWindow = getModelContextWindow(model) ?? 1_000_000;
  return { inputTokens, outputTokens, costUsd, model, contextWindow };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 在注册表里按 domain 找 active agent;查不到用合成 def。 */
function resolveAgent(domain: string, kind: AgentKind, name: string): AgentDefinition {
  const found = listAgents().find((a) => a.status === 'active' && a.domain === domain);
  if (found) return found;
  return {
    id: `agent.${domain}`,
    name,
    kind,
    domain,
    skills: [],
    mcpServers: [],
    toolPolicy: { allow: [] },
    status: 'active',
    version: 0,
    updatedAt: new Date().toISOString(),
  };
}

function leadAgent(): AgentDefinition {
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

/** 盖出处 + 校验,返回合法 Claim。 */
function makeClaim(def: AgentDefinition, partial: Omit<Claim, 'agentId' | 'agentKind'>): Claim {
  return ClaimSchema.parse({
    ...partial,
    agentId: def.id,
    agentKind: def.kind,
  });
}

/** 分段流式 emit 一段文本(text_delta)。 */
async function streamText(ctx: RunContext, nodeId: string, segments: string[], thinking = false): Promise<void> {
  for (const seg of segments) {
    ctx.emit({ type: thinking ? 'thinking_delta' : 'text_delta', nodeId, text: seg });
    await sleep(180);
  }
}

export async function runMock(run: Run, ctx: RunContext): Promise<void> {
  ctx.emit({ type: 'run_started', runId: run.id, task: run.task });
  await sleep(150);

  // ---- Lead 启动 ----
  const lead = leadAgent();
  const leadNode = 'L';
  ctx.emit({
    type: 'agent_started',
    nodeId: leadNode,
    agentId: lead.id,
    agentKind: lead.kind,
    label: lead.name,
    depth: 0,
    input: run.task,
  });
  run.forks.push({ agentId: lead.id, forkedAt: new Date().toISOString() });
  saveRun(run);

  await streamText(
    ctx,
    leadNode,
    ['让我分析这个问题。', '「支付成功但订单未完成」', '通常横跨支付域与订单域,', '需要分别取证再交叉验证。'],
    true,
  );
  await streamText(ctx, leadNode, ['我先向支付域 agent 确认支付侧状态,', '再向订单域 agent 确认订单状态机。']);

  // ---- call_domain_agent(payment) ----
  ctx.emit({ type: 'tool_use', nodeId: leadNode, toolName: 'mcp__personax-orchestration__call_domain_agent', toolUseId: nanoid(), summary: '{"domain":"payment","question":"支付是否真的成功扣款?"}' });
  ctx.budget.spentChildAgents += 1;
  ctx.budget.spentToolCalls += 1;
  await sleep(200);

  const payment = resolveAgent('payment', 'business_domain', '支付域 Agent');
  const payNode = nanoid();
  ctx.emit({
    type: 'agent_started',
    nodeId: payNode,
    parentNodeId: leadNode,
    agentId: payment.id,
    agentKind: payment.kind,
    label: payment.name,
    depth: 1,
    input: '支付是否真的成功扣款?对应订单的支付回调是否到达?',
  });
  run.forks.push({ agentId: payment.id, forkedAt: new Date().toISOString() });
  saveRun(run);

  await streamText(ctx, payNode, ['查支付流水…', '交易 txn=abc 状态为 SUCCESS,', '已扣款,但回调投递记录缺失。'], true);
  ctx.emit({ type: 'tool_use', nodeId: payNode, toolName: 'mcp__personax-claim-sink__submit_claim', toolUseId: nanoid(), summary: 'observed_fact' });
  await sleep(150);

  const payClaim = makeClaim(payment, {
    claimType: 'observed_fact',
    claim: '支付侧已成功扣款(txn=abc,状态 SUCCESS),但向订单服务的支付成功回调未见投递成功记录。',
    scope: 'payment-service / 支付回调链路',
    timeWindow: '2026-06-22 14:00~14:30',
    confidence: 0.9,
    evidenceRefs: ['log://trace=abc', 'code://payment/callback.ts#L40-72'],
    negativeEvidenceRefs: ['log://callback-ack?trace=abc(无 ack 记录)'],
  });
  ctx.run.claims.push(payClaim);
  saveRun(ctx.run);
  ctx.emit({ type: 'claim', nodeId: payNode, claim: payClaim });
  {
    const u = syntheticUsage(2);
    ctx.budget.spentCostUsd += u.costUsd;
    try {
      insertUsageEvent({ runId: run.id, agentId: payment.id, agentKind: payment.kind, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, contextWindow: u.contextWindow, createdAt: new Date().toISOString() });
    } catch (err) { console.error('[usage/mock] payment insert failed:', err); }
    ctx.emit({ type: 'agent_finished', nodeId: payNode, costUsd: u.costUsd, numTurns: 2, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, contextWindow: u.contextWindow });
  }
  ctx.emit({ type: 'budget', spentChildAgents: ctx.budget.spentChildAgents, spentToolCalls: ctx.budget.spentToolCalls, spentCostUsd: ctx.budget.spentCostUsd });
  await sleep(150);

  // ---- call_domain_agent(order) ----
  ctx.emit({ type: 'tool_use', nodeId: leadNode, toolName: 'mcp__personax-orchestration__call_domain_agent', toolUseId: nanoid(), summary: '{"domain":"order","question":"订单状态机停留在哪一步?"}' });
  ctx.budget.spentChildAgents += 1;
  ctx.budget.spentToolCalls += 1;
  await sleep(200);

  const order = resolveAgent('order', 'business_domain', '订单域 Agent');
  const orderNode = nanoid();
  ctx.emit({
    type: 'agent_started',
    nodeId: orderNode,
    parentNodeId: leadNode,
    agentId: order.id,
    agentKind: order.kind,
    label: order.name,
    depth: 1,
    input: '该订单状态机停留在哪一步?是否收到支付成功事件?',
  });
  run.forks.push({ agentId: order.id, forkedAt: new Date().toISOString() });
  saveRun(run);

  await streamText(ctx, orderNode, ['查订单状态机…', '订单停留在 WAIT_PAY,', '未收到 PaymentSucceeded 事件。'], true);
  ctx.emit({ type: 'tool_use', nodeId: orderNode, toolName: 'mcp__personax-claim-sink__submit_claim', toolUseId: nanoid(), summary: 'observed_fact' });
  await sleep(150);

  const orderClaim = makeClaim(order, {
    claimType: 'observed_fact',
    claim: '订单状态机停留在 WAIT_PAY,从未消费到 PaymentSucceeded 事件,因此未推进到 PAID。',
    scope: 'order-service / 订单状态机',
    timeWindow: '2026-06-22 14:00~14:30',
    confidence: 0.88,
    evidenceRefs: ['log://order-fsm?order=o123', 'code://order/fsm.ts#L88-130'],
  });
  ctx.run.claims.push(orderClaim);
  saveRun(ctx.run);
  ctx.emit({ type: 'claim', nodeId: orderNode, claim: orderClaim });
  {
    const u = syntheticUsage(2);
    ctx.budget.spentCostUsd += u.costUsd;
    try {
      insertUsageEvent({ runId: run.id, agentId: order.id, agentKind: order.kind, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, contextWindow: u.contextWindow, createdAt: new Date().toISOString() });
    } catch (err) { console.error('[usage/mock] order insert failed:', err); }
    ctx.emit({ type: 'agent_finished', nodeId: orderNode, costUsd: u.costUsd, numTurns: 2, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, contextWindow: u.contextWindow });
  }
  ctx.emit({ type: 'budget', spentChildAgents: ctx.budget.spentChildAgents, spentToolCalls: ctx.budget.spentToolCalls, spentCostUsd: ctx.budget.spentCostUsd });
  await sleep(150);

  // ---- spawn_worker(检索消息队列) ----
  ctx.emit({ type: 'tool_use', nodeId: leadNode, toolName: 'mcp__personax-orchestration__spawn_worker', toolUseId: nanoid(), summary: '{"task":"检查 MQ 中 PaymentSucceeded 的投递与消费记录"}' });
  ctx.budget.spentChildAgents += 1;
  ctx.budget.spentToolCalls += 1;
  await sleep(200);

  const worker: AgentDefinition = {
    id: 'agent.worker',
    name: 'Worker(MQ 检索)',
    kind: 'worker',
    skills: [],
    mcpServers: [],
    toolPolicy: { allow: ['Read', 'Grep', 'Glob', 'Bash'] },
    status: 'active',
    version: 0,
    updatedAt: new Date().toISOString(),
  };
  const workerNode = nanoid();
  ctx.emit({
    type: 'agent_started',
    nodeId: workerNode,
    parentNodeId: leadNode,
    agentId: worker.id,
    agentKind: worker.kind,
    label: worker.name,
    depth: 1,
    input: '检查消息队列中 PaymentSucceeded 事件的投递与消费记录',
  });

  await streamText(ctx, workerNode, ['grep MQ 投递日志…', 'PaymentSucceeded(trace=abc)生产成功,', '但消费组 order-consumer 无消费 offset 推进。'], false);
  ctx.emit({ type: 'tool_use', nodeId: workerNode, toolName: 'mcp__personax-claim-sink__submit_claim', toolUseId: nanoid(), summary: 'observed_fact' });
  await sleep(150);

  const workerClaim = makeClaim(worker, {
    claimType: 'observed_fact',
    claim: 'MQ 中 PaymentSucceeded(trace=abc)已成功生产,但 order-consumer 消费组 offset 未推进,事件堆积未被消费。',
    scope: 'message-queue / order-consumer 消费组',
    confidence: 0.82,
    evidenceRefs: ['log://mq?topic=payment&trace=abc', 'log://consumer-group?group=order-consumer'],
  });
  ctx.run.claims.push(workerClaim);
  saveRun(ctx.run);
  ctx.emit({ type: 'claim', nodeId: workerNode, claim: workerClaim });
  {
    const u = syntheticUsage(1);
    ctx.budget.spentCostUsd += u.costUsd;
    try {
      insertUsageEvent({ runId: run.id, agentId: worker.id, agentKind: worker.kind, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, contextWindow: u.contextWindow, createdAt: new Date().toISOString() });
    } catch (err) { console.error('[usage/mock] worker insert failed:', err); }
    ctx.emit({ type: 'agent_finished', nodeId: workerNode, costUsd: u.costUsd, numTurns: 1, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, contextWindow: u.contextWindow });
  }
  ctx.emit({ type: 'budget', spentChildAgents: ctx.budget.spentChildAgents, spentToolCalls: ctx.budget.spentToolCalls, spentCostUsd: ctx.budget.spentCostUsd });
  await sleep(150);

  // ---- Lead 综合 ----
  await streamText(ctx, leadNode, ['三方证据交叉一致:', '支付已扣款 → 事件已生产 → 但 order-consumer 未消费,', '订单因此卡在 WAIT_PAY。', '根因定位到消费组堆积。']);

  const leadClaim = makeClaim(lead, {
    claimType: 'inference',
    claim: '根因:order-consumer 消费组停止消费(offset 未推进),导致 PaymentSucceeded 事件未被订单服务处理,订单停留在 WAIT_PAY。支付侧已成功扣款。',
    scope: '支付→MQ→订单 全链路',
    confidence: 0.85,
    evidenceRefs: ['log://trace=abc', 'log://consumer-group?group=order-consumer', 'code://order/fsm.ts#L88-130'],
    openQuestions: ['order-consumer 停止消费的触发原因(OOM / 反序列化异常 / rebalance 卡死)需进一步排查'],
  });
  ctx.run.claims.push(leadClaim);
  saveRun(ctx.run);
  ctx.emit({ type: 'claim', nodeId: leadNode, claim: leadClaim });
  {
    const u = syntheticUsage(4);
    ctx.budget.spentCostUsd += u.costUsd;
    try {
      insertUsageEvent({ runId: run.id, agentId: lead.id, agentKind: lead.kind, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, contextWindow: u.contextWindow, createdAt: new Date().toISOString() });
    } catch (err) { console.error('[usage/mock] lead insert failed:', err); }
    ctx.emit({ type: 'agent_finished', nodeId: leadNode, costUsd: u.costUsd, numTurns: 4, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, contextWindow: u.contextWindow });
  }

  const delivery =
    '## 排查结论\n\n' +
    '**根因**:order-consumer 消费组停止消费(offset 未推进),`PaymentSucceeded` 事件堆积未被订单服务处理,订单状态机停留在 `WAIT_PAY`。\n\n' +
    '**链路证据**:\n' +
    '1. 支付域:txn=abc 已成功扣款,状态 SUCCESS(observed_fact,conf 0.90)。\n' +
    '2. 消息队列:PaymentSucceeded(trace=abc)已成功生产,但 order-consumer offset 未推进(observed_fact,conf 0.82)。\n' +
    '3. 订单域:状态机停留 WAIT_PAY,未消费到 PaymentSucceeded(observed_fact,conf 0.88)。\n\n' +
    '**建议**:立即排查 order-consumer 消费组(OOM / 反序列化异常 / rebalance 卡死),恢复消费后对堆积事件做补偿重放,并对受影响订单做对账修复。';

  run.finalDelivery = delivery;
  run.status = 'done';
  saveRun(run);
  ctx.emit({ type: 'final_delivery', runId: run.id, delivery });
  await sleep(100);
  ctx.emit({ type: 'run_finished', runId: run.id, status: 'done' });
}
