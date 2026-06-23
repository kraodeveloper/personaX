/**
 * Fastify 插件:BasePatch REST 路由。
 * 错误响应形状 { error, details? }。
 */
import type { FastifyPluginAsync } from 'fastify';
import { BasePatchCreateSchema, BasePatchReviewSchema } from '@personax/contracts';
import { getBase, getVersion, createVersion } from '../store/bases.js';
import {
  createPatch,
  listPatchesByBase,
  getPatch,
  setPatchStatus,
} from '../store/patches.js';
import { computeAutoEligible } from '../governance/policy.js';

const patchesPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /bases/:id/patches — 列出某知识库所有 patch
  fastify.get<{ Params: { id: string } }>('/bases/:id/patches', async (req, reply) => {
    const base = getBase(req.params.id);
    if (!base) return reply.code(404).send({ error: `知识库不存在: ${req.params.id}` });
    return reply.code(200).send(listPatchesByBase(req.params.id));
  });

  // POST /bases/:id/patches — 手动创建 patch
  fastify.post<{ Params: { id: string } }>('/bases/:id/patches', async (req, reply) => {
    const base = getBase(req.params.id);
    if (!base) return reply.code(404).send({ error: `知识库不存在: ${req.params.id}` });

    const parsed = BasePatchCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }

    // 手动创建时 evidenceRefs 来自请求体,autoEligible 无 claims 上下文 → false
    const patch = createPatch({
      baseId: req.params.id,
      fromRunId: parsed.data.fromRunId,
      proposal: parsed.data.proposal,
      evidenceRefs: parsed.data.evidenceRefs,
      autoEligible: false,
    });

    return reply.code(201).send(patch);
  });

  // PUT /bases/:id/patches/:patchId — 审核(accept | reject)
  fastify.put<{ Params: { id: string; patchId: string } }>(
    '/bases/:id/patches/:patchId',
    async (req, reply) => {
      const base = getBase(req.params.id);
      if (!base) return reply.code(404).send({ error: `知识库不存在: ${req.params.id}` });

      const patch = getPatch(req.params.patchId);
      if (!patch || patch.baseId !== req.params.id) {
        return reply.code(404).send({ error: `patch 不存在: ${req.params.patchId}` });
      }

      if (patch.status !== 'pending') {
        return reply.code(409).send({
          error: `patch 已处理,当前状态: ${patch.status}`,
        });
      }

      const parsed = BasePatchReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: '请求体校验失败',
          details: parsed.error.flatten(),
        });
      }

      const { action } = parsed.data;

      if (action === 'accept') {
        // 取当前 active 版本内容;若 base 尚无版本则用空串
        let oldContent = '';
        if (base.activeVersion > 0) {
          const activeVer = getVersion(req.params.id, base.activeVersion);
          if (activeVer) oldContent = activeVer.content;
        }

        const newContent = oldContent
          ? `${oldContent}\n\n${patch.proposal}`
          : patch.proposal;

        const newVersion = createVersion(req.params.id, {
          content: newContent,
          reason: `patch ${patch.id}`,
        });

        // createVersion 支持 source_patch_id 字段但签名未暴露,
        // 改用 db 直接更新已插入行的 source_patch_id
        if (newVersion) {
          try {
            const { getDb } = await import('../store/db.js');
            getDb()
              .prepare(
                'UPDATE base_versions SET source_patch_id = ? WHERE base_id = ? AND version = ?',
              )
              .run(patch.id, req.params.id, newVersion.version);
          } catch {
            // source_patch_id 写入失败不影响主流程
          }
        }

        const updatedPatch = setPatchStatus(patch.id, 'accepted');
        return reply.code(200).send({ patch: updatedPatch, version: newVersion });
      } else {
        // reject
        const updatedPatch = setPatchStatus(patch.id, 'rejected');
        return reply.code(200).send({ patch: updatedPatch });
      }
    },
  );
};

export default patchesPlugin;
