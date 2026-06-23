/**
 * Fastify 插件:Skill 管理 REST 路由。
 * 请求体用 contracts zod schema safeParse 校验,失败返回 400。
 * 错误响应形状 { error, details? }。
 */
import type { FastifyPluginAsync } from 'fastify';
import {
  SkillCreateSchema,
  SkillUpdateSchema,
  SkillImportSchema,
} from '@personax/contracts';
import {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  importSkill,
} from '../store/skills.js';
import { DuplicateError } from '../store/agents.js';

const skillsPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /skills — 列出所有 skill
  fastify.get('/skills', async (_req, reply) => {
    return reply.code(200).send(listSkills());
  });

  // GET /skills/:id — 查询单个 skill(含 content)
  fastify.get<{ Params: { id: string } }>('/skills/:id', async (req, reply) => {
    // 注意:避免 /skills/import 被这里捕获 — Fastify 按注册顺序匹配,
    // import 路由注册在后,因此此处只会匹配真实 id。
    const skill = getSkill(req.params.id);
    if (!skill) return reply.code(404).send({ error: `Skill 不存在: ${req.params.id}` });
    return reply.code(200).send(skill);
  });

  // POST /skills — 创建 skill
  fastify.post('/skills', async (req, reply) => {
    const parsed = SkillCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    try {
      const skill = createSkill(parsed.data);
      return reply.code(201).send(skill);
    } catch (err) {
      if (err instanceof DuplicateError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // PUT /skills/:id — 更新 skill
  fastify.put<{ Params: { id: string } }>('/skills/:id', async (req, reply) => {
    const parsed = SkillUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    const skill = updateSkill(req.params.id, parsed.data);
    if (!skill) return reply.code(404).send({ error: `Skill 不存在: ${req.params.id}` });
    return reply.code(200).send(skill);
  });

  // DELETE /skills/:id — 删除 skill
  fastify.delete<{ Params: { id: string } }>('/skills/:id', async (req, reply) => {
    const ok = deleteSkill(req.params.id);
    if (!ok) return reply.code(404).send({ error: `Skill 不存在: ${req.params.id}` });
    return reply.code(204).send();
  });

  // POST /skills/import — 导入 skill(从 content frontmatter 解析 id/name)
  fastify.post('/skills/import', async (req, reply) => {
    const parsed = SkillImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    try {
      const skill = importSkill(parsed.data);
      return reply.code(201).send(skill);
    } catch (err) {
      if (err instanceof DuplicateError) {
        return reply.code(409).send({ error: (err as Error).message });
      }
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });
};

export default skillsPlugin;
