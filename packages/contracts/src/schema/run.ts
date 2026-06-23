import { z } from 'zod';
import { AgentKindSchema } from './agent';
import { ClaimSchema } from './claim';

export const RunStatusSchema = z.enum(['running', 'done', 'failed']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** 每个被调用 agent 实例基于哪份地图工作(可追溯)。 */
export const RunForkSchema = z.object({
  agentId: z.string(),
  baseId: z.string().optional(),
  baseVersion: z.number().optional(),
  baseFingerprint: z.string().optional(),
  forkedAt: z.string(),
});
export type RunFork = z.infer<typeof RunForkSchema>;

/** 任务实例。 */
export const RunSchema = z.object({
  id: z.string(),
  task: z.string(),
  status: RunStatusSchema,
  forks: z.array(RunForkSchema),
  claims: z.array(ClaimSchema),
  finalDelivery: z.string().optional(),
  createdAt: z.string(),
});
export type Run = z.infer<typeof RunSchema>;

export const RunCreateSchema = z.object({
  task: z.string().min(1),
});
export type RunCreate = z.infer<typeof RunCreateSchema>;

/**
 * SSE 事件:server emit、web 消费,是 RunGraph / ClaimCard / ThinkingPanel 的渲染依据。
 * 用 nodeId / parentNodeId 表达 agent 调用树;text/thinking_delta 按 node 流式;
 * claim 携带结构化结论;budget 反映预算消耗;final_delivery / run_finished 为终态。
 */
export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run_started'), runId: z.string(), task: z.string() }),
  z.object({
    type: z.literal('agent_started'),
    nodeId: z.string(),
    parentNodeId: z.string().optional(),
    agentId: z.string(),
    agentKind: AgentKindSchema,
    label: z.string(),
    depth: z.number(),
    input: z.string().optional(),
  }),
  z.object({ type: z.literal('thinking_delta'), nodeId: z.string(), text: z.string() }),
  z.object({ type: z.literal('text_delta'), nodeId: z.string(), text: z.string() }),
  z.object({
    type: z.literal('tool_use'),
    nodeId: z.string(),
    toolName: z.string(),
    toolUseId: z.string().optional(),
    summary: z.string().optional(),
  }),
  z.object({ type: z.literal('claim'), nodeId: z.string(), claim: ClaimSchema }),
  z.object({
    type: z.literal('agent_finished'),
    nodeId: z.string(),
    costUsd: z.number().optional(),
    numTurns: z.number().optional(),
    model: z.string().optional(),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    contextWindow: z.number().optional(),
  }),
  z.object({
    type: z.literal('budget'),
    spentChildAgents: z.number(),
    spentToolCalls: z.number(),
    spentCostUsd: z.number(),
  }),
  z.object({ type: z.literal('final_delivery'), runId: z.string(), delivery: z.string() }),
  z.object({ type: z.literal('run_finished'), runId: z.string(), status: RunStatusSchema }),
  z.object({ type: z.literal('error'), nodeId: z.string().optional(), message: z.string() }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
