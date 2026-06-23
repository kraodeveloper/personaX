/**
 * 对话(chat)+ 消息(chat_message)数据访问层。
 * row(snake_case) ↔ 类型(camelCase)映射,NULL 列映射为 undefined(不输出 null)。
 *
 * - createChat / getChat / getChatWithMessages / listChatsByAgent
 * - appendMessage(实时落库,user 与 assistant 各一次)
 * - touchChat(更新 updated_at,使最近活跃的对话排前)
 */
import { nanoid } from 'nanoid';
import { getDb } from './db.js';
import type { Chat, ChatMessage, ChatWithMessages } from '@personax/contracts';

// ---------- Row 类型 ----------

interface ChatRow {
  id: string;
  agent_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRow {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  context_window: number | null;
  created_at: string;
}

// ---------- 行映射 ----------

function rowToChat(row: ChatRow): Chat {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role as ChatMessage['role'],
    content: row.content,
    model: row.model ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    contextWindow: row.context_window ?? undefined,
    createdAt: row.created_at,
  };
}

// ---------- Chat CRUD ----------

/** 新建空对话。id 自动生成(chat_ 前缀),createdAt = updatedAt = now。 */
export function createChat(agentId: string, title?: string): Chat {
  const now = new Date().toISOString();
  const chat: Chat = {
    id: `chat_${nanoid()}`,
    agentId,
    title,
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO chats (id, agent_id, title, created_at, updated_at)
       VALUES (@id, @agentId, @title, @createdAt, @updatedAt)`,
    )
    .run({
      id: chat.id,
      agentId: chat.agentId,
      title: chat.title ?? null,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    });
  return chat;
}

/** 按 id 查 chat,不存在返回 undefined。 */
export function getChat(id: string): Chat | undefined {
  const row = getDb()
    .prepare('SELECT * FROM chats WHERE id = ?')
    .get(id) as ChatRow | undefined;
  return row ? rowToChat(row) : undefined;
}

/** 取 chat 及其全部消息(按 createdAt 升序)。chat 不存在返回 undefined。 */
export function getChatWithMessages(id: string): ChatWithMessages | undefined {
  const chat = getChat(id);
  if (!chat) return undefined;
  const messages = listMessages(id);
  return { ...chat, messages };
}

/** 取某 chat 全部消息(createdAt 升序;同刻按 rowid 保序)。 */
export function listMessages(chatId: string): ChatMessage[] {
  const rows = getDb()
    .prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(chatId) as ChatMessageRow[];
  return rows.map(rowToMessage);
}

/** 列出某 agent 的对话(updatedAt 降序,最近活跃在前)。 */
export function listChatsByAgent(agentId: string): Chat[] {
  const rows = getDb()
    .prepare('SELECT * FROM chats WHERE agent_id = ? ORDER BY updated_at DESC, rowid DESC')
    .all(agentId) as ChatRow[];
  return rows.map(rowToChat);
}

/** 删除 chat 及其全部消息。影响行数 > 0 → true。 */
export function deleteChat(id: string): boolean {
  const db = getDb();
  db.prepare('DELETE FROM chat_messages WHERE chat_id = ?').run(id);
  const result = db.prepare('DELETE FROM chats WHERE id = ?').run(id);
  return result.changes > 0;
}

// ---------- Message ----------

/**
 * 追加一条消息并落库。id 自动生成(msg_ 前缀),createdAt 缺省取 now。
 * 返回完整 ChatMessage(供 done 事件回传)。
 */
export function appendMessage(
  msg: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
): ChatMessage {
  const full: ChatMessage = {
    id: msg.id ?? `msg_${nanoid()}`,
    chatId: msg.chatId,
    role: msg.role,
    content: msg.content,
    model: msg.model,
    inputTokens: msg.inputTokens,
    outputTokens: msg.outputTokens,
    costUsd: msg.costUsd,
    contextWindow: msg.contextWindow,
    createdAt: msg.createdAt ?? new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO chat_messages
        (id, chat_id, role, content, model,
         input_tokens, output_tokens, cost_usd, context_window, created_at)
       VALUES
        (@id, @chatId, @role, @content, @model,
         @inputTokens, @outputTokens, @costUsd, @contextWindow, @createdAt)`,
    )
    .run({
      id: full.id,
      chatId: full.chatId,
      role: full.role,
      content: full.content,
      model: full.model ?? null,
      inputTokens: full.inputTokens ?? null,
      outputTokens: full.outputTokens ?? null,
      costUsd: full.costUsd ?? null,
      contextWindow: full.contextWindow ?? null,
      createdAt: full.createdAt,
    });
  return full;
}

/** 更新 chat 的 updated_at 为 now。 */
export function touchChat(id: string): void {
  getDb()
    .prepare('UPDATE chats SET updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}
