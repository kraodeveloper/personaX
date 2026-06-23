import { z } from 'zod';

/**
 * Agent 种类。对应架构分层:
 * - lead: Global Lead,任务总入口与编排
 * - business_domain: 业务域主 agent(订单/支付/风控/...)
 * - technical_domain: 技术域 agent(日志/配置/发布/...)
 * - worker: 一次性执行单元,无长期记忆
 */
export const AgentKindSchema = z.enum([
  'lead',
  'business_domain',
  'technical_domain',
  'worker',
]);
export type AgentKind = z.infer<typeof AgentKindSchema>;

/**
 * 能力边界。由 server 的 canUseTool 强制执行(见 tech-spec §4.5)。
 * - allow: 白名单工具(支持 `mcp__server__*` 通配)
 * - confirm: 危险工具(写操作),命中后转治理确认
 *
 * 注意:这不是 SDK 的 allowedTools(那只是 auto-approve 列表)。
 */
export const ToolPolicySchema = z.object({
  allow: z.array(z.string()),
  confirm: z.array(z.string()).optional(),
});
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;

export const AgentStatusSchema = z.enum(['active', 'disabled']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/**
 * Agent 注册表条目(持久化的资产定义)。
 * 一个 agent 的"知识" = baseId(领域知识) + skills(流程) + mcpServers(工具)。
 */
export const AgentDefinitionSchema = z.object({
  id: z.string().min(1), // "agent.payment"
  name: z.string().min(1),
  kind: AgentKindSchema,
  domain: z.string().optional(), // "payment"(lead/worker 可空)
  group: z.string().optional(), // 自定义分组名(侧栏 Agents 子菜单按它聚合;空 = 未分组)
  baseId: z.string().optional(), // 绑定知识库(worker 通常无)
  basePin: z.string().optional(), // 固定到某版本;空 = 用 activeVersion
  model: z.string().optional(), // 指定模型;空 = 用 Settings 默认模型(无 kind 兜底)
  connectionId: z.string().optional(), // 指定连接;空 = 用全局默认连接
  skills: z.array(z.string()), // 绑定 skill 名(→ query 的 skills 选项)
  mcpServers: z.array(z.string()), // 绑定 MCP id(→ query 的 mcpServers)
  toolPolicy: ToolPolicySchema, // 能力边界(供 canUseTool 强制)
  systemPromptExtra: z.string().optional(), // 角色补充提示
  status: AgentStatusSchema,
  version: z.number().int().nonnegative(), // server 维护,单调递增
  updatedAt: z.string(), // ISO 时间戳,server 维护
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

/**
 * 创建请求体。客户端提供业务字段;server 负责盖章 version / updatedAt。
 * 数组与 toolPolicy 给出默认,降低前端负担。
 */
export const AgentDefinitionCreateSchema = AgentDefinitionSchema.omit({
  version: true,
  updatedAt: true,
}).extend({
  skills: z.array(z.string()).default([]),
  mcpServers: z.array(z.string()).default([]),
  toolPolicy: ToolPolicySchema.default({ allow: [] }),
  status: AgentStatusSchema.default('active'),
});
export type AgentDefinitionCreate = z.infer<typeof AgentDefinitionCreateSchema>;

/**
 * 更新请求体。id 不可改;version / updatedAt 由 server 维护。
 * 其余字段可部分更新(PATCH 语义,但路由用 PUT)。
 */
export const AgentDefinitionUpdateSchema = AgentDefinitionSchema.omit({
  id: true,
  version: true,
  updatedAt: true,
}).partial();
export type AgentDefinitionUpdate = z.infer<typeof AgentDefinitionUpdateSchema>;
