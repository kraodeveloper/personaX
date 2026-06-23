/**
 * Fastify 插件:对话(1V1 直聊)REST + SSE 路由。
 *
 * - GET    /agents/:id/chats        → Chat[]            (该 agent 的对话列表)
 * - POST   /agents/:id/chats        → 201 Chat | 404    (新建空对话)
 * - GET    /chats/:chatId           → ChatWithMessages | 404
 * - DELETE /chats/:chatId           → 204 | 404
 * - POST   /chats/:chatId/messages  → 流式 SSE(ChatEvent)| 404
 *
 * 发消息一路用 reply.hijack() 手动写 SSE(text/event-stream),
 * runChatTurn 经回调把每个 ChatEvent 写出,done / error 后 raw.end()。
 */
import type { FastifyPluginAsync } from 'fastify';
import { ChatSendSchema, type ChatEvent } from '@personax/contracts';
import { getAgent } from '../store/agents.js';
import {
  createChat,
  getChat,
  getChatWithMessages,
  listChatsByAgent,
  deleteChat,
} from '../store/chats.js';
import { runChatTurn } from '../runtime/chat.js';

const chatsPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /agents/:id/chats — 该 agent 的对话列表(updatedAt 降序)
  fastify.get<{ Params: { id: string } }>('/agents/:id/chats', async (req, reply) => {
    if (!getAgent(req.params.id)) {
      return reply.code(404).send({ error: `Agent 不存在: ${req.params.id}` });
    }
    return reply.code(200).send(listChatsByAgent(req.params.id));
  });

  // POST /agents/:id/chats — 新建空对话
  fastify.post<{ Params: { id: string }; Body: { title?: string } }>(
    '/agents/:id/chats',
    async (req, reply) => {
      if (!getAgent(req.params.id)) {
        return reply.code(404).send({ error: `Agent 不存在: ${req.params.id}` });
      }
      const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
      const chat = createChat(req.params.id, title);
      return reply.code(201).send(chat);
    },
  );

  // GET /chats/:chatId — 对话详情(含消息)
  fastify.get<{ Params: { chatId: string } }>('/chats/:chatId', async (req, reply) => {
    const chat = getChatWithMessages(req.params.chatId);
    if (!chat) return reply.code(404).send({ error: `Chat 不存在: ${req.params.chatId}` });
    return reply.code(200).send(chat);
  });

  // DELETE /chats/:chatId
  fastify.delete<{ Params: { chatId: string } }>('/chats/:chatId', async (req, reply) => {
    const ok = deleteChat(req.params.chatId);
    if (!ok) return reply.code(404).send({ error: `Chat 不存在: ${req.params.chatId}` });
    return reply.code(204).send();
  });

  // POST /chats/:chatId/messages — 发消息,流式 SSE 返回
  fastify.post<{ Params: { chatId: string } }>('/chats/:chatId/messages', async (req, reply) => {
    const chat = getChat(req.params.chatId);
    // chat 不存在 → 404(非流式 json)
    if (!chat) return reply.code(404).send({ error: `Chat 不存在: ${req.params.chatId}` });

    // body 校验(非流式 json 返回 400)
    const parsed = ChatSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }

    // 接管 reply,手动写 SSE
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let closed = false;
    req.raw.on('close', () => {
      closed = true;
    });

    const write = (ev: ChatEvent) => {
      if (closed) return;
      try {
        raw.write(`data: ${JSON.stringify(ev)}\n\n`);
      } catch {
        closed = true;
      }
    };

    try {
      await runChatTurn(chat, parsed.data.text, write);
    } catch (err) {
      // runChatTurn 内部已尽量自吞;此处兜底
      const message = err instanceof Error ? err.message : String(err);
      write({ type: 'error', message: `对话运行失败: ${message}` });
    } finally {
      if (!closed) raw.end();
    }
  });
};

export default chatsPlugin;
