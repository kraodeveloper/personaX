import { z } from 'zod';

/**
 * Skill 来源:imported(导入)/ builtin(内置)。
 */
export const SkillSourceSchema = z.enum(['imported', 'builtin']);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

/**
 * Skill 定义。唯一事实源是磁盘上的 SKILL.md:
 * packages/server/.claude/skills/<id>/SKILL.md(server cwd 下,SDK 经 settingSources 发现)。
 * DB 只存元数据 + enabled 开关。
 */
export const SkillDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string(), // .../.claude/skills/<id>/SKILL.md
  source: SkillSourceSchema,
  enabled: z.boolean(),
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

/**
 * Skill 元数据 + SKILL.md 全文(在线编辑时返回/提交)。
 */
export const SkillWithContentSchema = SkillDefSchema.extend({
  content: z.string(),
});
export type SkillWithContent = z.infer<typeof SkillWithContentSchema>;

/**
 * 创建 skill:写 SKILL.md 全文(YAML frontmatter + markdown)落盘。
 */
export const SkillCreateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  content: z.string().min(1),
  enabled: z.boolean().default(true),
});
export type SkillCreate = z.infer<typeof SkillCreateSchema>;

/**
 * 编辑 skill:更新 SKILL.md 内容 / 名称 / 启用状态。
 */
export const SkillUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  content: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type SkillUpdate = z.infer<typeof SkillUpdateSchema>;

/**
 * 导入 skill:粘贴 SKILL.md 全文;id/name 可显式给出,否则由 server 从 frontmatter 解析。
 */
export const SkillImportSchema = z.object({
  content: z.string().min(1),
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});
export type SkillImport = z.infer<typeof SkillImportSchema>;
