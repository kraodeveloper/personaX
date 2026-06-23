import { z } from 'zod';

/**
 * 应用全局设置(持久化,可由用户修改)。
 * defaultModel: agent 未指定 model 时的全局兜底。
 * workerModel: 临时 worker agent 使用的模型。
 */
export const AppSettingsSchema = z.object({
  defaultModel: z.string(), // 全局默认模型(agent 未指定 model 时用)
  workerModel: z.string(),  // 临时 worker 用的模型
  defaultConnectionId: z.string(), // 全局默认连接 id
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

/** 部分更新(PATCH 语义)。 */
export const AppSettingsUpdateSchema = AppSettingsSchema.partial();
export type AppSettingsUpdate = z.infer<typeof AppSettingsUpdateSchema>;

/**
 * 供应商/认证状态(只读,运行时派生,不持久化)。
 * authMethod: subscription = Claude Max/Team 订阅; api_key = 自带 key; none = 未配置。
 */
export const ProviderStatusSchema = z.object({
  provider: z.string(),                                  // 'anthropic'
  authMethod: z.enum(['subscription', 'api_key', 'none']),
  authConfigured: z.boolean(),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
