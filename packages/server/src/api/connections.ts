/**
 * Fastify 插件:连接(Connection)REST 路由。
 * 读取一律掩码,不回明文 key。订阅(subscription)为内置虚拟连接,不可删/改。
 *
 * GET    /connections      → Connection[](含内置 subscription;掩码)
 * POST   /connections      → 校验 ConnectionCreate → 201(掩码)
 * PUT    /connections/:id  → 校验 ConnectionUpdate → 200 | 404
 * DELETE /connections/:id  → 204 | 404 | 400(订阅不可删)
 */
import type { FastifyPluginAsync } from 'fastify';
import {
  ConnectionCreateSchema,
  ConnectionUpdateSchema,
} from '@personax/contracts';
import {
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  getConnection,
  SUBSCRIPTION_ID,
} from '../store/connections.js';

const connectionsPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /connections — 列出所有连接(掩码)
  fastify.get('/connections', async (_req, reply) => {
    return reply.code(200).send(listConnections());
  });

  // POST /connections — 新建中转连接
  fastify.post('/connections', async (req, reply) => {
    const parsed = ConnectionCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    const conn = createConnection(parsed.data);
    return reply.code(201).send(conn);
  });

  // PUT /connections/:id — 更新中转连接
  fastify.put<{ Params: { id: string } }>('/connections/:id', async (req, reply) => {
    const parsed = ConnectionUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    if (req.params.id === SUBSCRIPTION_ID) {
      return reply.code(400).send({ error: '内置订阅连接不可修改' });
    }
    const conn = updateConnection(req.params.id, parsed.data);
    if (!conn) return reply.code(404).send({ error: `连接不存在: ${req.params.id}` });
    return reply.code(200).send(conn);
  });

  // DELETE /connections/:id — 删除中转连接(订阅不可删)
  fastify.delete<{ Params: { id: string } }>('/connections/:id', async (req, reply) => {
    if (req.params.id === SUBSCRIPTION_ID) {
      return reply.code(400).send({ error: '内置订阅连接不可删除' });
    }
    // 不存在 → 404(订阅已在上面拦截)
    if (!getConnection(req.params.id)) {
      return reply.code(404).send({ error: `连接不存在: ${req.params.id}` });
    }
    deleteConnection(req.params.id);
    return reply.code(204).send();
  });
};

export default connectionsPlugin;
