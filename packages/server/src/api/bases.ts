/**
 * Fastify 插件:知识库 REST 路由。
 * 请求体用 contracts zod schema safeParse 校验,失败返回 400。
 * 错误响应形状 { error, details? }。
 */
import type { FastifyPluginAsync } from 'fastify';
import {
  KnowledgeBaseCreateSchema,
  BaseVersionCreateSchema,
} from '@personax/contracts';
import {
  listBases,
  getBase,
  createBase,
  listVersions,
  getVersion,
  createVersion,
} from '../store/bases.js';
import { DuplicateError } from '../store/agents.js';

const basesPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /bases — 列出所有知识库
  fastify.get('/bases', async (_req, reply) => {
    return reply.code(200).send(listBases());
  });

  // POST /bases — 创建知识库
  fastify.post('/bases', async (req, reply) => {
    const parsed = KnowledgeBaseCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    try {
      const base = createBase(parsed.data);
      return reply.code(201).send(base);
    } catch (err) {
      if (err instanceof DuplicateError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // GET /bases/:id — 查询单个知识库
  fastify.get<{ Params: { id: string } }>('/bases/:id', async (req, reply) => {
    const base = getBase(req.params.id);
    if (!base) return reply.code(404).send({ error: `知识库不存在: ${req.params.id}` });
    return reply.code(200).send(base);
  });

  // GET /bases/:id/versions — 列出版本(base 不存在 → 404)
  fastify.get<{ Params: { id: string } }>('/bases/:id/versions', async (req, reply) => {
    const base = getBase(req.params.id);
    if (!base) return reply.code(404).send({ error: `知识库不存在: ${req.params.id}` });
    return reply.code(200).send(listVersions(req.params.id));
  });

  // GET /bases/:id/versions/:version — 查询单个版本(含内容)
  fastify.get<{ Params: { id: string; version: string } }>(
    '/bases/:id/versions/:version',
    async (req, reply) => {
      const base = getBase(req.params.id);
      if (!base) return reply.code(404).send({ error: `知识库不存在: ${req.params.id}` });

      const versionNum = Number(req.params.version);
      if (!Number.isInteger(versionNum) || versionNum < 1) {
        return reply.code(400).send({ error: '版本号必须为正整数' });
      }

      const ver = getVersion(req.params.id, versionNum);
      if (!ver) return reply.code(404).send({ error: `版本不存在: ${versionNum}` });
      return reply.code(200).send(ver);
    },
  );

  // POST /bases/:id/versions — 创建新版本
  fastify.post<{ Params: { id: string } }>('/bases/:id/versions', async (req, reply) => {
    const base = getBase(req.params.id);
    if (!base) return reply.code(404).send({ error: `知识库不存在: ${req.params.id}` });

    const parsed = BaseVersionCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }

    const ver = createVersion(req.params.id, parsed.data);
    if (!ver) return reply.code(404).send({ error: `知识库不存在: ${req.params.id}` });
    return reply.code(201).send(ver);
  });
};

export default basesPlugin;
