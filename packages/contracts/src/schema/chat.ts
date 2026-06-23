// 对话模块契约：chat（会话）与 message（消息）的 zod schema 及推导类型。
// server 运行时校验请求/响应，web 直接 import 类型，两边以此为单一事实源。

import { z } from 'zod';

// ── 消息角色 ────────────────────────────────────────────────────────────────

/** 消息发送方：用户或 AI 助手 */
export const ChatRoleSchema = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

// ── 单条消息 ────────────────────────────────────────────────────────────────

/**
 * ChatMessage — 对话中的一条消息记录。
 * model / token / cost / contextWindow 仅 assistant 消息有值，user 消息留 undefined。
 */
export const ChatMessageSchema = z.object({
  /** 消息唯一 ID */
  id: z.string(),
  /** 所属会话 ID */
  chatId: z.string(),
  /** 发送方角色 */
  role: ChatRoleSchema,
  /** 消息正文 */
  content: z.string(),
  /** 生成该消息所用的模型标识（仅 assistant） */
  model: z.string().optional(),
  /** 消耗的输入 token 数（仅 assistant） */
  inputTokens: z.number().optional(),
  /** 消耗的输出 token 数（仅 assistant） */
  outputTokens: z.number().optional(),
  /** 本次调用估算费用（USD，仅 assistant） */
  costUsd: z.number().optional(),
  /** 本次调用使用的上下文窗口大小（tokens，仅 assistant） */
  contextWindow: z.number().optional(),
  /** 消息创建时间（ISO 8601） */
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ── 会话 ───────────────────────────────────────────────────────────────────

/** Chat — 一个对话会话，归属于某个 agent */
export const ChatSchema = z.object({
  /** 会话唯一 ID */
  id: z.string(),
  /** 所属 agent ID */
  agentId: z.string(),
  /** 会话标题（可选，首条消息截断生成） */
  title: z.string().optional(),
  /** 会话创建时间（ISO 8601） */
  createdAt: z.string(),
  /** 会话最后更新时间（ISO 8601） */
  updatedAt: z.string(),
});
export type Chat = z.infer<typeof ChatSchema>;

/** ChatWithMessages — 会话详情，含完整消息列表 */
export const ChatWithMessagesSchema = ChatSchema.extend({
  messages: z.array(ChatMessageSchema),
});
export type ChatWithMessages = z.infer<typeof ChatWithMessagesSchema>;

// ── 请求体 ─────────────────────────────────────────────────────────────────

/** ChatSend — POST /chats/:id/messages 的请求体 */
export const ChatSendSchema = z.object({
  /** 用户发送的文本，不得为空 */
  text: z.string().min(1),
});
export type ChatSend = z.infer<typeof ChatSendSchema>;

// ── SSE 流式事件 ───────────────────────────────────────────────────────────

/**
 * ChatEvent — POST /chats/:id/messages 返回的 SSE 事件联合类型。
 *
 * - thinking_delta : 模型 extended thinking 片段（可选阶段）
 * - text_delta     : 正文增量流式片段
 * - done           : 流结束，附带完整 assistant 消息记录
 * - error          : 发生错误，附带错误描述
 */
export const ChatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thinking_delta'), text: z.string() }),
  z.object({ type: z.literal('text_delta'), text: z.string() }),
  z.object({ type: z.literal('done'), message: ChatMessageSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ChatEvent = z.infer<typeof ChatEventSchema>;
