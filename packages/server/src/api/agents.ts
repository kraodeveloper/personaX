/**
 * Fastify 插件:Agent 注册表 REST 路由。
 * 请求体用 shared 的 zod schema safeParse 校验,失败返回 400。
 */
import type { FastifyPluginAsync } from 'fastify';
import {
  AgentDefinitionCreateSchema,
  AgentDefinitionUpdateSchema,
} from '@personax/contracts';
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  DuplicateError,
} from '../store/agents.js';

const agentsPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /agents — 列出所有 agent
  fastify.get('/agents', async (_req, reply) => {
    return reply.code(200).send(listAgents());
  });

  // GET /agents/:id — 查询单个 agent
  fastify.get<{ Params: { id: string } }>('/agents/:id', async (req, reply) => {
    const agent = getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: `Agent 不存在: ${req.params.id}` });
    return reply.code(200).send(agent);
  });

  // POST /agents — 创建 agent
  fastify.post('/agents', async (req, reply) => {
    const parsed = AgentDefinitionCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }

    try {
      const agent = createAgent(parsed.data);
      return reply.code(201).send(agent);
    } catch (err) {
      if (err instanceof DuplicateError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err; // 其他错误交给 Fastify 全局处理
    }
  });

  // PUT /agents/:id — 更新 agent(部分字段)
  fastify.put<{ Params: { id: string } }>('/agents/:id', async (req, reply) => {
    const parsed = AgentDefinitionUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }

    const agent = updateAgent(req.params.id, parsed.data);
    if (!agent) return reply.code(404).send({ error: `Agent 不存在: ${req.params.id}` });
    return reply.code(200).send(agent);
  });

  // DELETE /agents/:id — 删除 agent
  fastify.delete<{ Params: { id: string } }>('/agents/:id', async (req, reply) => {
    const ok = deleteAgent(req.params.id);
    if (!ok) return reply.code(404).send({ error: `Agent 不存在: ${req.params.id}` });
    return reply.code(204).send();
  });
};

export default agentsPlugin;
