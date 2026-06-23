/**
 * Fastify 插件:飞书集成(壳子,无鉴权,跑通流程)。
 *
 * - GET  /integrations/feishu/config  → FeishuConfig
 * - PUT  /integrations/feishu/config  → 校验 FeishuConfigUpdateSchema → 200 FeishuConfig
 * - POST /integrations/feishu/events  → webhook 壳子:
 *     · body 含 challenge(url_verification)→ 回显 { challenge }
 *     · 否则:抽消息文本 + 会话标识 → 打日志 → (配置开 && agentId)异步触发 agent 回复
 *       → 拿到回复后 stub 发送(只打日志,不真调飞书 API)→ 立即返回 { ok: true }
 *
 * TODO(壳子未做):飞书事件签名校验(Encrypt/Verification Token)、
 *   真实飞书 OpenAPI 发送消息(tenant_access_token + im/v1/messages)、
 *   多事件类型路由(目前只 best-effort 抽文本)。
 */
import type { FastifyPluginAsync } from 'fastify';
import { FeishuConfigUpdateSchema, type ChatEvent } from '@personax/contracts';
import { getFeishuConfig, updateFeishuConfig } from '../store/feishu.js';
import { getAgent } from '../store/agents.js';
import { createChat } from '../store/chats.js';
import { runChatTurn } from '../runtime/chat.js';

/** best-effort 从飞书事件 body 抽取消息文本。抽不到给占位。 */
function extractText(body: unknown): string {
  if (!body || typeof body !== 'object') return '(无法解析的事件)';
  const b = body as Record<string, unknown>;

  // 常见路径:body.event.message.content(飞书 im 消息,content 可能是 JSON 字符串)
  const event = b.event as Record<string, unknown> | undefined;
  const message = event?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === 'string' && content.length > 0) {
    // content 多为 JSON 串,如 {"text":"hello"};尝试解析 text 字段
    try {
      const parsed = JSON.parse(content) as { text?: unknown };
      if (typeof parsed.text === 'string' && parsed.text.length > 0) return parsed.text;
    } catch {
      /* 非 JSON,直接用原串 */
    }
    return content;
  }

  // 兜底:body.text
  if (typeof b.text === 'string' && b.text.length > 0) return b.text;

  return '(空消息)';
}

/** best-effort 抽一个会话标识(用于日志/未来路由)。 */
function extractSessionId(body: unknown): string {
  if (!body || typeof body !== 'object') return 'unknown';
  const b = body as Record<string, unknown>;
  const event = b.event as Record<string, unknown> | undefined;
  const message = event?.message as Record<string, unknown> | undefined;
  const chatId = message?.chat_id;
  if (typeof chatId === 'string' && chatId.length > 0) return chatId;
  return 'unknown';
}

/**
 * 异步触发 agent 回复(真实跑一轮 runChatTurn,但不阻塞 webhook 响应)。
 * 收集流式文本,结束后 stub 发送(只打日志)。任何失败只打日志,不抛。
 */
async function triggerReply(agentId: string, text: string, sessionId: string): Promise<void> {
  try {
    const agent = getAgent(agentId);
    if (!agent) {
      console.log(`[feishu] 配置的 agentId=${agentId} 不存在,跳过回复`);
      return;
    }
    // 为本次事件建一个临时 chat(壳子:每次新建;未来可按 sessionId 复用)
    const chat = createChat(agentId, `feishu:${sessionId}`);

    let reply = '';
    const collect = (ev: ChatEvent) => {
      if (ev.type === 'text_delta') {
        reply += ev.text;
      } else if (ev.type === 'done') {
        if (!reply && ev.message?.content) reply = ev.message.content;
      } else if (ev.type === 'error') {
        console.log(`[feishu] agent 回复出错: ${ev.message}`);
      }
    };

    await runChatTurn(chat, text, collect);

    // stub 发送:不真调飞书 API,只打日志(TODO:换成 im/v1/messages)
    const preview = reply.slice(0, 80);
    console.log(`[feishu] 拟回复: ${preview}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[feishu] 触发回复失败: ${message}`);
  }
}

const feishuPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /integrations/feishu/config
  fastify.get('/integrations/feishu/config', async (_req, reply) => {
    return reply.code(200).send(getFeishuConfig());
  });

  // PUT /integrations/feishu/config
  fastify.put('/integrations/feishu/config', async (req, reply) => {
    const parsed = FeishuConfigUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    return reply.code(200).send(updateFeishuConfig(parsed.data));
  });

  // POST /integrations/feishu/events — webhook 壳子
  // TODO(壳子未做):飞书事件签名校验。
  fastify.post('/integrations/feishu/events', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;

    // url_verification:直接回显 challenge
    if (body && typeof body.challenge === 'string') {
      return reply.code(200).send({ challenge: body.challenge });
    }

    // 其他事件:best-effort 抽文本 + 会话标识,打日志
    const text = extractText(body);
    const sessionId = extractSessionId(body);
    console.log(`[feishu] 收到事件,text=${text}`);

    // 配置开 && 有 agentId → 异步触发回复(不阻塞响应)
    const cfg = getFeishuConfig();
    if (cfg.enabled && cfg.agentId) {
      // 故意不 await:异步触发,立即返回
      void triggerReply(cfg.agentId, text, sessionId);
    }

    // 立即返回(壳子链路:收事件 →(配置开)触发 agent → 拿回复 → stub 发送)
    return reply.code(200).send({ ok: true });
  });
};

export default feishuPlugin;
