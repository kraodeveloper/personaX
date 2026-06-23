import { z } from 'zod';

/**
 * MCP 传输类型。stdio = 子进程;http/sse = 远端。
 */
export const McpTransportSchema = z.enum(['stdio', 'http', 'sse']);
export type McpTransport = z.infer<typeof McpTransportSchema>;

/**
 * MCP server 配置。运行时由 buildMcpServers 程序化注入(Slice 4)。
 * stdio 用 command/args/env;http/sse 用 url/headers。
 */
export const McpServerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: McpTransportSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean(),
});
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/** stdio 必须有 command;http/sse 必须有 url。 */
const transportShapeOk = (v: {
  transport: McpTransport;
  command?: string;
  url?: string;
}) => (v.transport === 'stdio' ? !!v.command : !!v.url);

export const McpServerCreateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    transport: McpTransportSchema,
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().default(true),
  })
  .refine(transportShapeOk, {
    message: 'stdio 需 command;http/sse 需 url',
  });
export type McpServerCreate = z.infer<typeof McpServerCreateSchema>;

export const McpServerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  transport: McpTransportSchema.optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});
export type McpServerUpdate = z.infer<typeof McpServerUpdateSchema>;

/**
 * 导入:粘贴标准 MCP server JSON 片段(如 { command, args, env } 或 { type, url, headers }),
 * server 据此映射到 McpServerConfig 字段。id 必填,name 可空(默认用 id)。
 */
export const McpImportSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()),
});
export type McpImport = z.infer<typeof McpImportSchema>;

/**
 * 连通测试结果。Slice 3 为基础探活;完整 MCP 握手 + 列工具在 Slice 4 接入。
 */
export const McpTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  tools: z.array(z.string()).optional(),
});
export type McpTestResult = z.infer<typeof McpTestResultSchema>;
