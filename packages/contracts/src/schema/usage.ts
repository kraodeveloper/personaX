import { z } from 'zod';

/** 单次 agent 调用的用量记录(落库 usage_events,成本曲线/占比的数据源)。 */
export const UsageEventSchema = z.object({
  id: z.string(),
  runId: z.string().optional(),
  chatId: z.string().optional(),
  agentId: z.string(),
  agentKind: z.string().optional(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().optional(),
  costUsd: z.number(),            // 订阅下为名义值
  contextWindow: z.number().optional(), // 该模型上下文窗口,用于 context 占比
  createdAt: z.string(),
});
export type UsageEvent = z.infer<typeof UsageEventSchema>;
