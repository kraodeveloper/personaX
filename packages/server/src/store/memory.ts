/**
 * per-agent 记忆数据访问层。
 * agent_memory 表:每个 agent 一行(agent_id 主键)。
 * 无行时返回空内容默认值(content='', updatedAt=''),不抛错。
 */
import { getDb } from './db.js';
import type { AgentMemory } from '@personax/contracts';

interface MemoryRow {
  agent_id: string;
  content: string | null;
  updated_at: string | null;
}

/** 读取某 agent 的记忆;无则返回空白记忆。 */
export function getMemory(agentId: string): AgentMemory {
  const row = getDb()
    .prepare('SELECT * FROM agent_memory WHERE agent_id = ?')
    .get(agentId) as MemoryRow | undefined;
  if (!row) return { agentId, content: '', updatedAt: '' };
  return {
    agentId: row.agent_id,
    content: row.content ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

/** upsert 某 agent 的记忆(INSERT OR REPLACE),updatedAt = now,返回新记忆。 */
export function upsertMemory(agentId: string, content: string): AgentMemory {
  const updatedAt = new Date().toISOString();
  getDb()
    .prepare(`
      INSERT OR REPLACE INTO agent_memory (agent_id, content, updated_at)
      VALUES (@agentId, @content, @updatedAt)
    `)
    .run({ agentId, content, updatedAt });
  return { agentId, content, updatedAt };
}
