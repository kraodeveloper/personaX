import { z } from 'zod';

/** 连接类型:subscription=Claude 订阅(内置,凭据来自 .env);api_relay=自定义 API 中转(base URL + key)。 */
export const ConnectionTypeSchema = z.enum(['subscription', 'api_relay']);
export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

/** 读取返回:不含明文 key,只回掩码。 */
export const ConnectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: ConnectionTypeSchema,
  baseUrl: z.string().optional(),
  apiKeyMasked: z.string().optional(), // 如 "sk-…abcd"
  createdAt: z.string().optional(),
});
export type Connection = z.infer<typeof ConnectionSchema>;

/** 新建中转连接。 */
export const ConnectionCreateSchema = z.object({
  label: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
});
export type ConnectionCreate = z.infer<typeof ConnectionCreateSchema>;

/** 更新中转连接(apiKey 传则更新,不传则保留)。 */
export const ConnectionUpdateSchema = z.object({
  label: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
});
export type ConnectionUpdate = z.infer<typeof ConnectionUpdateSchema>;
