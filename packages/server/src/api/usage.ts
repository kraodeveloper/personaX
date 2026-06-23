/**
 * Fastify 插件:GET /usage — 返回全部用量事件(createdAt 升序)。
 * 供成本曲线 / 用量展示使用。
 */
import type { FastifyPluginAsync } from 'fastify';
import { listUsageEvents } from '../store/usage.js';

const usagePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/usage', async (_req, reply) => {
    const events = listUsageEvents();
    return reply.code(200).send(events);
  });
};

export default usagePlugin;
