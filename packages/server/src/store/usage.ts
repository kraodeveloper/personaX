/**
 * 用量事件数据访问层。
 * insertUsageEvent: 写入一条用量记录。
 * listUsageEvents:  按 createdAt 升序返回全部记录(成本曲线用)。
 */
import { nanoid } from 'nanoid';
import { getDb } from './db.js';
import type { UsageEvent } from '@personax/contracts';

interface UsageRow {
  id: string;
  run_id: string | null;
  chat_id: string | null;
  agent_id: string;
  agent_kind: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number | null;
  cost_usd: number;
  context_window: number | null;
  created_at: string;
}

function rowToEvent(row: UsageRow): UsageEvent {
  return {
    id: row.id,
    runId: row.run_id ?? undefined,
    chatId: row.chat_id ?? undefined,
    agentId: row.agent_id,
    agentKind: row.agent_kind ?? undefined,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens ?? undefined,
    costUsd: row.cost_usd,
    contextWindow: row.context_window ?? undefined,
    createdAt: row.created_at,
  };
}

/** 插入一条用量事件;id 自动生成(use_ 前缀)。 */
export function insertUsageEvent(e: Omit<UsageEvent, 'id'>): void {
  const id = `use_${nanoid()}`;
  getDb()
    .prepare(
      `INSERT INTO usage_events
        (id, run_id, chat_id, agent_id, agent_kind, model,
         input_tokens, output_tokens, cache_read_tokens, cost_usd, context_window, created_at)
       VALUES
        (@id, @runId, @chatId, @agentId, @agentKind, @model,
         @inputTokens, @outputTokens, @cacheReadTokens, @costUsd, @contextWindow, @createdAt)`,
    )
    .run({
      id,
      runId: e.runId ?? null,
      chatId: e.chatId ?? null,
      agentId: e.agentId,
      agentKind: e.agentKind ?? null,
      model: e.model,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      cacheReadTokens: e.cacheReadTokens ?? null,
      costUsd: e.costUsd,
      contextWindow: e.contextWindow ?? null,
      createdAt: e.createdAt,
    });
}

/** 返回全部用量事件(createdAt 升序)。 */
export function listUsageEvents(): UsageEvent[] {
  const rows = getDb()
    .prepare('SELECT * FROM usage_events ORDER BY created_at ASC')
    .all() as UsageRow[];
  return rows.map(rowToEvent);
}
