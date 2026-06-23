/**
 * 治理策略:确定性规则判断 patch 是否符合自动接受条件。
 * 规则(全部满足才 true):
 *   1. 所有贡献 claim 都有非空 evidenceRefs(length > 0)。
 *   2. 没有 claimType 属于 { hypothesis, failed_observation }(敏感性检测开放项)。
 * 两条都满足 → autoEligible = true,否则 false。
 */
import type { Claim } from '@personax/contracts';

/**
 * 计算一组 claim 是否符合自动接受条件。
 *
 * @param claims - 贡献该 patch 的 claim 列表
 * @returns true 表示符合自动接受条件;false 需人工审核
 *
 * TODO(开放项): 可扩展敏感性检测(如 claim 文本含敏感关键字、
 *   confidence < 阈值、scope 跨越多个高风险域等)。
 */
export function computeAutoEligible(claims: Claim[]): boolean {
  if (claims.length === 0) return false;

  const SENSITIVE_TYPES = new Set(['hypothesis', 'failed_observation'] as const);

  for (const claim of claims) {
    // 规则 1: evidenceRefs 非空
    if (!claim.evidenceRefs || claim.evidenceRefs.length === 0) {
      return false;
    }
    // 规则 2: 不含敏感 claimType
    if (SENSITIVE_TYPES.has(claim.claimType as 'hypothesis' | 'failed_observation')) {
      return false;
    }
  }

  return true;
}
