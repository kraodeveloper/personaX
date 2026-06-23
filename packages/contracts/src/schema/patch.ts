import { z } from 'zod';

export const BasePatchStatusSchema = z.enum(['pending', 'accepted', 'rejected']);
export type BasePatchStatus = z.infer<typeof BasePatchStatusSchema>;

/**
 * 沉淀产物:从一次 run 的 claims + delivery 提炼的"建议写入 base 的知识"。
 * LLM/确定性逻辑只 propose(pending),不直接改 base;经治理确认后才生成新版本。
 */
export const BasePatchSchema = z.object({
  id: z.string(),
  baseId: z.string(),
  fromRunId: z.string(),
  proposal: z.string(), // 建议写入/修改的知识
  evidenceRefs: z.array(z.string()),
  status: BasePatchStatusSchema,
  autoEligible: z.boolean(), // 由确定性 policy 判定:是否符合自动接受条件
  createdAt: z.string(),
});
export type BasePatch = z.infer<typeof BasePatchSchema>;

/** 手动创建 patch(baseId 由路由 path 提供)。 */
export const BasePatchCreateSchema = z.object({
  fromRunId: z.string().min(1),
  proposal: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});
export type BasePatchCreate = z.infer<typeof BasePatchCreateSchema>;

/** 审核动作:接受 → 写新版本并切 active;拒绝 → 归档。 */
export const BasePatchReviewSchema = z.object({
  action: z.enum(['accept', 'reject']),
});
export type BasePatchReview = z.infer<typeof BasePatchReviewSchema>;
