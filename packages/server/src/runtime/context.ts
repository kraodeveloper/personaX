/**
 * RunContext:随 agent 间调用向下传递的运行时上下文。
 * 承载预算、防环、SSE emit(见 tech-spec §2.4 / §4.6)。
 *
 * 关键不变量:childContext 与父 ctx **共享同一 budget 对象引用**,
 * 计数(spentChildAgents / spentToolCalls / spentCostUsd)全局累加。
 */
import type { Run, RunEvent, AgentKind } from '@personax/contracts';

export interface RunBudget {
  maxDepth: number;
  maxChildAgents: number;
  maxToolCalls: number;
  maxCostUsd: number;
  maxWallMs: number;
  spentChildAgents: number;
  spentToolCalls: number;
  spentCostUsd: number;
  startedAt: number;
}

export interface RunContext {
  run: Run;
  depth: number;
  visitedAgents: string[];
  budget: RunBudget;
  emit: (ev: RunEvent) => void;
  /** 当前 agent 的 nodeId,供其发起的子调用作 parentNodeId。根上下文为 undefined。 */
  parentNodeId?: string;
}

/** 根上下文:depth=0,合理默认预算。 */
export function rootContext(run: Run, emit: (ev: RunEvent) => void): RunContext {
  return {
    run,
    depth: 0,
    visitedAgents: [],
    budget: {
      maxDepth: 4,
      maxChildAgents: 12,
      maxToolCalls: 80,
      maxCostUsd: 2,
      maxWallMs: 120_000,
      spentChildAgents: 0,
      spentToolCalls: 0,
      spentCostUsd: 0,
      startedAt: Date.now(),
    },
    emit,
  };
}

/**
 * 派生子上下文:depth+1、追加 visitedAgents、共享同一 budget 对象。
 * parentNodeId 由调用方(发起子 agent 的当前 node)传入。
 */
export function childContext(
  ctx: RunContext,
  agentId: string,
  parentNodeId?: string,
): RunContext {
  return {
    run: ctx.run,
    depth: ctx.depth + 1,
    visitedAgents: [...ctx.visitedAgents, agentId],
    budget: ctx.budget, // 共享引用
    emit: ctx.emit,
    parentNodeId: parentNodeId ?? ctx.parentNodeId,
  };
}

/**
 * 递归 / 预算 / 防环闸门。命中任一限制返回拒绝原因字符串;否则 null。
 * **不抛异常**(超限由调用方降级为 failed_observation Claim,让 Lead 知情)。
 *
 * 入参 ctx 应为**候选子上下文**(已 depth+1、已追加待调用 agentId),
 * 这样 depth 与 visitedAgents 的判断对子调用本身生效。
 */
export function guardRecursion(ctx: RunContext, _kind: string): string | null {
  const b = ctx.budget;
  if (ctx.depth > b.maxDepth) {
    return `已达最大递归深度(maxDepth=${b.maxDepth}),拒绝继续下钻`;
  }
  if (b.spentChildAgents >= b.maxChildAgents) {
    return `已达最大子 agent 数(maxChildAgents=${b.maxChildAgents}),拒绝再派生`;
  }
  if (b.spentCostUsd >= b.maxCostUsd) {
    return `已达最大成本预算(maxCostUsd=$${b.maxCostUsd}),拒绝继续`;
  }
  const elapsed = Date.now() - b.startedAt;
  if (elapsed > b.maxWallMs) {
    return `已超最大墙钟时间(maxWallMs=${b.maxWallMs}ms,已用 ${elapsed}ms),拒绝继续`;
  }
  // 防环:候选子上下文的 visitedAgents 末尾即待调用 agentId,
  // 若在更早的链路中已出现(出现次数 > 1)说明同链路重入。
  const last = ctx.visitedAgents[ctx.visitedAgents.length - 1];
  if (last !== undefined) {
    const occurrences = ctx.visitedAgents.filter((a) => a === last).length;
    if (occurrences > 1) {
      return `检测到同链路重入(agent=${last}),拒绝(防环)`;
    }
  }
  return null;
}

/** 已知 agentKind 的便捷类型重导出,供 runtime 其他模块使用。 */
export type { AgentKind };
