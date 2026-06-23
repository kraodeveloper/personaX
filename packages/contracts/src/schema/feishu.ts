import { z } from 'zod';
/** 飞书集成配置(壳子;鉴权等后续)。 */
export const FeishuConfigSchema = z.object({
  enabled: z.boolean(),
  agentId: z.string().optional(),   // 由哪个 agent 回答 @
  webhookPath: z.string(),          // 展示用,如 /api/integrations/feishu/events
});
export type FeishuConfig = z.infer<typeof FeishuConfigSchema>;
export const FeishuConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  agentId: z.string().optional(),
});
export type FeishuConfigUpdate = z.infer<typeof FeishuConfigUpdateSchema>;
