/**
 * Fastify 插件:Run REST + SSE 路由。
 * - POST /runs:校验 RunCreateSchema → createAndStartRun → 201 Run。
 * - GET  /runs/:id:getRun → 200 | 404。
 * - GET  /runs/:id/stream:SSE。用 reply.hijack() + reply.raw 手动写流。
 */
import type { FastifyPluginAsync } from 'fastify';
import { RunCreateSchema, type RunEvent } from '@personax/contracts';
import { getRun } from '../store/runs.js';
import { createAndStartRun, subscribe, getBus } from '../runtime/runManager.js';

const runsPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /runs — 创建并启动 run
  fastify.post('/runs', async (req, reply) => {
    const parsed = RunCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    const run = createAndStartRun(parsed.data.task);
    return reply.code(201).send(run);
  });

  // GET /runs/:id — 查询 run
  fastify.get<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const run = getRun(req.params.id);
    if (!run) return reply.code(404).send({ error: `Run 不存在: ${req.params.id}` });
    return reply.code(200).send(run);
  });

  // GET /runs/:id/stream — SSE 事件流
  fastify.get<{ Params: { id: string } }>('/runs/:id/stream', async (req, reply) => {
    const { id } = req.params;
    // run 不存在(且无总线)→ 404
    if (!getRun(id) && !getBus(id)) {
      return reply.code(404).send({ error: `Run 不存在: ${id}` });
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

    let unsubscribe: (() => void) | undefined;

    const write = (ev: RunEvent) => {
      try {
        raw.write(`data: ${JSON.stringify(ev)}\n\n`);
      } catch {
        // 写失败(连接已断)→ 清理
        cleanup();
      }
      if (ev.type === 'run_finished') {
        cleanup();
        raw.end();
      }
    };

    const cleanup = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
    };

    unsubscribe = subscribe(id, write);
    // 总线已不存在(理论上前面已 404,这里兜底)
    if (!unsubscribe) {
      raw.end();
      return;
    }

    // 客户端断开 → 取消订阅
    req.raw.on('close', cleanup);
  });
};

export default runsPlugin;
