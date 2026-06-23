/**
 * Agent 注册表数据访问层。
 * 负责 row(snake_case) ↔ AgentDefinition(camelCase) 映射,
 * 以及 skills / mcpServers / toolPolicy 的 JSON 序列化/反序列化。
 * DB 中 NULL 列映射为 undefined,不输出 null。
 */
import { nanoid } from 'nanoid';
import { getDb } from './db.js';
import type {
  AgentDefinition,
  AgentDefinitionCreate,
  AgentDefinitionUpdate,
} from '@personax/contracts';

// ---------- 自定义错误 ----------

/** id 已存在时抛出,供路由层转 409 */
export class DuplicateError extends Error {
  constructor(id: string) {
    super(`Agent id 已存在: ${id}`);
    this.name = 'DuplicateError';
  }
}

// ---------- Row 类型(来自 better-sqlite3) ----------

interface AgentRow {
  id: string;
  name: string;
  kind: string;
  domain: string | null;
  base_id: string | null;
  base_pin: string | null;
  skills_json: string;
  mcp_json: string;
  tool_policy_json: string;
  system_prompt_extra: string | null;
  status: string;
  version: number;
  updated_at: string;
  group_name: string | null;
  model: string | null;
}

// ---------- 行映射 ----------

/** 数据库行 → AgentDefinition(null 转 undefined) */
function rowToAgent(row: AgentRow): AgentDefinition {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as AgentDefinition['kind'],
    domain: row.domain ?? undefined,
    baseId: row.base_id ?? undefined,
    basePin: row.base_pin ?? undefined,
    skills: JSON.parse(row.skills_json) as string[],
    mcpServers: JSON.parse(row.mcp_json) as string[],
    toolPolicy: JSON.parse(row.tool_policy_json) as AgentDefinition['toolPolicy'],
    systemPromptExtra: row.system_prompt_extra ?? undefined,
    status: row.status as AgentDefinition['status'],
    version: row.version,
    updatedAt: row.updated_at,
    group: row.group_name ?? undefined,
    model: row.model ?? undefined,
  };
}

// ---------- CRUD ----------

/** 列出所有 agent */
export function listAgents(): AgentDefinition[] {
  const rows = getDb()
    .prepare('SELECT * FROM agent_definitions ORDER BY rowid')
    .all() as AgentRow[];
  return rows.map(rowToAgent);
}

/** 按 id 查询,不存在返回 undefined */
export function getAgent(id: string): AgentDefinition | undefined {
  const row = getDb()
    .prepare('SELECT * FROM agent_definitions WHERE id = ?')
    .get(id) as AgentRow | undefined;
  return row ? rowToAgent(row) : undefined;
}

/**
 * 创建 agent。
 * server 盖章 version=1, updatedAt=now。
 * id 已存在时抛 DuplicateError。
 */
export function createAgent(input: AgentDefinitionCreate): AgentDefinition {
  const db = getDb();

  // 检查 id 是否重复
  const existing = db
    .prepare('SELECT id FROM agent_definitions WHERE id = ?')
    .get(input.id);
  if (existing) throw new DuplicateError(input.id);

  const now = new Date().toISOString();
  const agent: AgentDefinition = {
    ...input,
    version: 1,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO agent_definitions
      (id, name, kind, domain, base_id, base_pin,
       skills_json, mcp_json, tool_policy_json,
       system_prompt_extra, status, version, updated_at, group_name, model)
    VALUES
      (@id, @name, @kind, @domain, @baseId, @basePin,
       @skillsJson, @mcpJson, @toolPolicyJson,
       @systemPromptExtra, @status, @version, @updatedAt, @groupName, @model)
  `).run({
    id: agent.id,
    name: agent.name,
    kind: agent.kind,
    domain: agent.domain ?? null,
    baseId: agent.baseId ?? null,
    basePin: agent.basePin ?? null,
    skillsJson: JSON.stringify(agent.skills),
    mcpJson: JSON.stringify(agent.mcpServers),
    toolPolicyJson: JSON.stringify(agent.toolPolicy),
    systemPromptExtra: agent.systemPromptExtra ?? null,
    status: agent.status,
    version: agent.version,
    updatedAt: agent.updatedAt,
    groupName: agent.group ?? null,
    model: agent.model ?? null,
  });

  return agent;
}

/**
 * 更新 agent(部分字段合并)。
 * 不存在返回 undefined;存在则 version+1, updatedAt=now,持久化返回新对象。
 */
export function updateAgent(
  id: string,
  patch: AgentDefinitionUpdate,
): AgentDefinition | undefined {
  const db = getDb();
  const existing = getAgent(id);
  if (!existing) return undefined;

  const updated: AgentDefinition = {
    ...existing,
    ...patch,
    id, // id 不可被 patch 覆盖
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE agent_definitions SET
      name                = @name,
      kind                = @kind,
      domain              = @domain,
      base_id             = @baseId,
      base_pin            = @basePin,
      skills_json         = @skillsJson,
      mcp_json            = @mcpJson,
      tool_policy_json    = @toolPolicyJson,
      system_prompt_extra = @systemPromptExtra,
      status              = @status,
      version             = @version,
      updated_at          = @updatedAt,
      group_name          = @groupName,
      model               = @model
    WHERE id = @id
  `).run({
    id: updated.id,
    name: updated.name,
    kind: updated.kind,
    domain: updated.domain ?? null,
    baseId: updated.baseId ?? null,
    basePin: updated.basePin ?? null,
    skillsJson: JSON.stringify(updated.skills),
    mcpJson: JSON.stringify(updated.mcpServers),
    toolPolicyJson: JSON.stringify(updated.toolPolicy),
    systemPromptExtra: updated.systemPromptExtra ?? null,
    status: updated.status,
    version: updated.version,
    updatedAt: updated.updatedAt,
    groupName: updated.group ?? null,
    model: updated.model ?? null,
  });

  return updated;
}

/**
 * 删除 agent。
 * 影响行数 > 0 → true;否则 false。
 */
export function deleteAgent(id: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM agent_definitions WHERE id = ?')
    .run(id);
  return result.changes > 0;
}
