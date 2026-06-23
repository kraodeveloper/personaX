/**
 * MCP server 配置数据访问层。
 * JSON 列:args_json / env_json / headers_json。
 * row(snake_case) ↔ McpServerConfig(camelCase),NULL → undefined。
 */
import { getDb } from './db.js';
import { DuplicateError } from './agents.js';
import type {
  McpServerConfig,
  McpServerCreate,
  McpServerUpdate,
  McpImport,
} from '@personax/contracts';

// ---------- Row 类型 ----------

interface McpRow {
  id: string;
  name: string;
  transport: string;
  command: string | null;
  args_json: string | null;
  env_json: string | null;
  url: string | null;
  headers_json: string | null;
  enabled: number;
}

// ---------- 行映射 ----------

function rowToMcp(row: McpRow): McpServerConfig {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport as McpServerConfig['transport'],
    command: row.command ?? undefined,
    args: row.args_json ? (JSON.parse(row.args_json) as string[]) : undefined,
    env: row.env_json ? (JSON.parse(row.env_json) as Record<string, string>) : undefined,
    url: row.url ?? undefined,
    headers: row.headers_json
      ? (JSON.parse(row.headers_json) as Record<string, string>)
      : undefined,
    enabled: row.enabled === 1,
  };
}

// ---------- CRUD ----------

/** 列出所有 MCP server 配置 */
export function listMcp(): McpServerConfig[] {
  const rows = getDb()
    .prepare('SELECT * FROM mcp_servers ORDER BY rowid')
    .all() as McpRow[];
  return rows.map(rowToMcp);
}

/** 按 id 查询,不存在返回 undefined */
export function getMcp(id: string): McpServerConfig | undefined {
  const row = getDb()
    .prepare('SELECT * FROM mcp_servers WHERE id = ?')
    .get(id) as McpRow | undefined;
  return row ? rowToMcp(row) : undefined;
}

/**
 * 创建 MCP server 配置。
 * id 重复抛 DuplicateError。
 */
export function createMcp(input: McpServerCreate): McpServerConfig {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM mcp_servers WHERE id = ?').get(input.id);
  if (existing) throw new DuplicateError(input.id);

  const config: McpServerConfig = {
    id: input.id,
    name: input.name,
    transport: input.transport,
    command: input.command,
    args: input.args,
    env: input.env,
    url: input.url,
    headers: input.headers,
    enabled: input.enabled ?? true,
  };

  db.prepare(`
    INSERT INTO mcp_servers (id, name, transport, command, args_json, env_json, url, headers_json, enabled)
    VALUES (@id, @name, @transport, @command, @argsJson, @envJson, @url, @headersJson, @enabled)
  `).run({
    id: config.id,
    name: config.name,
    transport: config.transport,
    command: config.command ?? null,
    argsJson: config.args !== undefined ? JSON.stringify(config.args) : null,
    envJson: config.env !== undefined ? JSON.stringify(config.env) : null,
    url: config.url ?? null,
    headersJson: config.headers !== undefined ? JSON.stringify(config.headers) : null,
    enabled: config.enabled ? 1 : 0,
  });

  return config;
}

/**
 * 更新 MCP server 配置(部分字段合并)。
 * 不存在返回 undefined。
 */
export function updateMcp(id: string, patch: McpServerUpdate): McpServerConfig | undefined {
  const db = getDb();
  const existing = getMcp(id);
  if (!existing) return undefined;

  const updated: McpServerConfig = {
    ...existing,
    ...patch,
    id, // id 不可被 patch 覆盖
  };

  db.prepare(`
    UPDATE mcp_servers SET
      name         = @name,
      transport    = @transport,
      command      = @command,
      args_json    = @argsJson,
      env_json     = @envJson,
      url          = @url,
      headers_json = @headersJson,
      enabled      = @enabled
    WHERE id = @id
  `).run({
    id: updated.id,
    name: updated.name,
    transport: updated.transport,
    command: updated.command ?? null,
    argsJson: updated.args !== undefined ? JSON.stringify(updated.args) : null,
    envJson: updated.env !== undefined ? JSON.stringify(updated.env) : null,
    url: updated.url ?? null,
    headersJson: updated.headers !== undefined ? JSON.stringify(updated.headers) : null,
    enabled: updated.enabled ? 1 : 0,
  });

  return updated;
}

/**
 * 删除 MCP server 配置。
 * 影响行数 > 0 → true;否则 false。
 */
export function deleteMcp(id: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM mcp_servers WHERE id = ?')
    .run(id);
  return result.changes > 0;
}

/**
 * 导入 MCP server:把标准 MCP config JSON 映射到字段。
 * 有 command → transport=stdio;否则有 url → transport 取 config.type(http/sse,缺省 http)。
 * name 缺省用 id。
 */
export function importMcp(input: McpImport): McpServerConfig {
  const cfg = input.config;
  const name = input.name ?? input.id;

  let create: McpServerCreate;

  if (typeof cfg['command'] === 'string') {
    // stdio 类型
    create = {
      id: input.id,
      name,
      transport: 'stdio',
      command: cfg['command'] as string,
      args: Array.isArray(cfg['args']) ? (cfg['args'] as string[]) : undefined,
      env:
        cfg['env'] && typeof cfg['env'] === 'object' && !Array.isArray(cfg['env'])
          ? (cfg['env'] as Record<string, string>)
          : undefined,
      enabled: true,
    };
  } else if (typeof cfg['url'] === 'string') {
    // http/sse 类型
    const rawType = cfg['type'];
    const transport: 'http' | 'sse' =
      rawType === 'sse' ? 'sse' : 'http';
    create = {
      id: input.id,
      name,
      transport,
      url: cfg['url'] as string,
      headers:
        cfg['headers'] && typeof cfg['headers'] === 'object' && !Array.isArray(cfg['headers'])
          ? (cfg['headers'] as Record<string, string>)
          : undefined,
      enabled: true,
    };
  } else {
    throw new Error('config 必须包含 command(stdio)或 url(http/sse)');
  }

  return createMcp(create);
}
