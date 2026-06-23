import { z } from 'zod';
/** per-agent 记忆:一份可编辑的 markdown 笔记,注入该 agent 上下文,可提升为 Knowledge patch。 */
export const AgentMemorySchema = z.object({
  agentId: z.string(),
  content: z.string(),
  updatedAt: z.string(),
});
export type AgentMemory = z.infer<typeof AgentMemorySchema>;
export const AgentMemoryUpdateSchema = z.object({ content: z.string() });
export type AgentMemoryUpdate = z.infer<typeof AgentMemoryUpdateSchema>;
