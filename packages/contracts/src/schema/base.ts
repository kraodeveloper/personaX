import { z } from 'zod';

/**
 * 知识库种类:业务域 base 与技术域 base(见 architecture.md §4.2)。
 */
export const KnowledgeBaseKindSchema = z.enum(['business', 'technical']);
export type KnowledgeBaseKind = z.infer<typeof KnowledgeBaseKindSchema>;

/**
 * 知识库(版本化 base 的元数据)。
 * activeVersion 是**唯一生效指针**:运行时 fork 取的就是它(或 agent 的 basePin)。
 * latestVersion / activeVersion = 0 表示尚无任何版本(空 base)。
 */
export const KnowledgeBaseSchema = z.object({
  id: z.string().min(1), // "base.payment"
  domain: z.string().min(1), // "payment"
  kind: KnowledgeBaseKindSchema,
  latestVersion: z.number().int().nonnegative(), // 最新版本号(0 = 无)
  activeVersion: z.number().int().nonnegative(), // 当前生效版本号(0 = 无)
});
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;

/**
 * 版本生命周期:
 * - draft: 草稿(尚未发布)
 * - published: 已发布(可被生效)
 * - superseded: 被更新版本取代
 * 注意:"是否生效"只由 KnowledgeBase.activeVersion 决定,status 只描述生命周期。
 */
export const BaseVersionStatusSchema = z.enum(['draft', 'published', 'superseded']);
export type BaseVersionStatus = z.infer<typeof BaseVersionStatusSchema>;

/**
 * 不可变版本。行只增不改;fingerprint = sha256(content),内容相同复用文件。
 */
export const BaseVersionSchema = z.object({
  baseId: z.string().min(1),
  version: z.number().int().positive(), // 单调递增,从 1 起
  fingerprint: z.string(), // sha256(content),内容寻址
  contentPath: z.string(), // data/bases/<fingerprint>.md
  status: BaseVersionStatusSchema,
  createdAt: z.string(),
  reason: z.string().optional(), // 由哪个 patch / 任务产生
  sourcePatchId: z.string().optional(),
});
export type BaseVersion = z.infer<typeof BaseVersionSchema>;

/**
 * 创建知识库(仅元数据)。首个内容版本通过 POST /bases/:id/versions 追加。
 * server 初始化 latestVersion = activeVersion = 0。
 */
export const KnowledgeBaseCreateSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  kind: KnowledgeBaseKindSchema,
});
export type KnowledgeBaseCreate = z.infer<typeof KnowledgeBaseCreateSchema>;

/**
 * 新增并发布一个版本。Slice 2 直接由内容创建并发布(治理/patch 流程见后续 slice)。
 * server:fingerprint = sha256(content),version = latestVersion+1,status=published,
 * 旧 published 版本置 superseded,active_version / latest_version 切到新版本。
 */
export const BaseVersionCreateSchema = z.object({
  content: z.string().min(1),
  reason: z.string().optional(),
});
export type BaseVersionCreate = z.infer<typeof BaseVersionCreateSchema>;

/**
 * 版本元数据 + 内容(GET 单个版本内容时返回)。
 */
export const BaseVersionWithContentSchema = BaseVersionSchema.extend({
  content: z.string(),
});
export type BaseVersionWithContent = z.infer<typeof BaseVersionWithContentSchema>;
