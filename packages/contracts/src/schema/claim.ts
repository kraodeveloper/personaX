import { z } from 'zod';
import { AgentKindSchema } from './agent';

/**
 * Claim 类型,Lead 仲裁的关键优先级依据:
 * observed_fact > inference > hypothesis;recommendation 为建议;
 * failed_observation 表示该 agent 没拿到有效证据。
 */
export const ClaimTypeSchema = z.enum([
  'observed_fact',
  'inference',
  'hypothesis',
  'recommendation',
  'failed_observation',
]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

/**
 * Claim:跨 agent 唯一传递物(窄接口),强 schema。
 * 出处字段(agentId/agentKind/baseId/baseVersion/baseFingerprint)由 server 盖章,
 * 不信任模型自报 —— 见 ClaimSubmissionSchema。
 */
export const ClaimSchema = z.object({
  // 出处(server 盖章)
  agentId: z.string(),
  agentKind: AgentKindSchema,
  baseId: z.string().optional(),
  baseVersion: z.number().optional(),
  baseFingerprint: z.string().optional(),
  // 内容(模型产出)
  claimType: ClaimTypeSchema,
  claim: z.string(),
  scope: z.string(), // 调查范围:服务/模块/链路
  timeWindow: z.string().optional(), // 证据时间窗
  confidence: z.number().min(0).max(1),
  uncertainty: z.string().optional(),
  // 证据
  evidenceRefs: z.array(z.string()), // "log://..."、"code://path#L1-20"
  negativeEvidenceRefs: z.array(z.string()).optional(), // 负证据 / 已排除
  relevantExcerpt: z.string().optional(),
  openQuestions: z.array(z.string()).optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * 模型通过 in-process `submit_claim` 工具提交的载荷:只含模型应产出的内容,
 * 不含出处字段(那些由 server 在 stamp() 时补齐)。
 * tool() 需要 raw zod shape —— 用 `ClaimSubmissionSchema.shape` 取得。
 */
export const ClaimSubmissionSchema = ClaimSchema.omit({
  agentId: true,
  agentKind: true,
  baseId: true,
  baseVersion: true,
  baseFingerprint: true,
});
export type ClaimSubmission = z.infer<typeof ClaimSubmissionSchema>;
