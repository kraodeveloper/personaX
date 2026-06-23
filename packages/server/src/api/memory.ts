/**
 * Fastify 插件:per-agent 记忆 REST 路由。
 * - GET  /agents/:id/memory          → AgentMemory(agent 不存在 → 404)
 * - PUT  /agents/:id/memory          → 校验 AgentMemoryUpdateSchema → 200 AgentMemory
 * - POST /agents/:id/memory/promote  → 把当前 memory 提升为一条 pending BasePatch → 201 { patch }
 */
import type { FastifyPluginAsync } from 'fastify';
import { AgentMemoryUpdateSchema } from '@personax/contracts';
import { getAgent } from '../store/agents.js';
import { getMemory, upsertMemory } from '../store/memory.js';
import { listBases } from '../store/bases.js';
import { createPatch } from '../store/patches.js';

const memoryPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /agents/:id/memory
  fastify.get<{ Params: { id: string } }>('/agents/:id/memory', async (req, reply) => {
    if (!getAgent(req.params.id)) {
      return reply.code(404).send({ error: `Agent 不存在: ${req.params.id}` });
    }
    return reply.code(200).send(getMemory(req.params.id));
  });

  // PUT /agents/:id/memory
  fastify.put<{ Params: { id: string } }>('/agents/:id/memory', async (req, reply) => {
    if (!getAgent(req.params.id)) {
      return reply.code(404).send({ error: `Agent 不存在: ${req.params.id}` });
    }
    const parsed = AgentMemoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    return reply.code(200).send(upsertMemory(req.params.id, parsed.data.content));
  });

  // POST /agents/:id/memory/promote — 把当前 memory 提升为 pending BasePatch
  fastify.post<{ Params: { id: string } }>(
    '/agents/:id/memory/promote',
    async (req, reply) => {
      const agent = getAgent(req.params.id);
      if (!agent) {
        return reply.code(404).send({ error: `Agent 不存在: ${req.params.id}` });
      }

      const memory = getMemory(req.params.id);
      if (!memory.content.trim()) {
        return reply.code(400).send({ error: '记忆为空,无法提升' });
      }

      // 目标 base:优先 agent.baseId;否则按 agent.domain 在 listBases() 找匹配
      let baseId = agent.baseId;
      if (!baseId && agent.domain) {
        const match = listBases().find((b) => b.domain === agent.domain);
        if (match) baseId = match.id;
      }
      if (!baseId) {
        return reply
          .code(400)
          .send({ error: '该 agent 未绑定知识库,无法提升' });
      }

      const patch = createPatch({
        baseId,
        fromRunId: `memory:${req.params.id}`,
        proposal: memory.content,
        evidenceRefs: [],
        autoEligible: false,
      });

      return reply.code(201).send({ patch });
    },
  );
};

export default memoryPlugin;
