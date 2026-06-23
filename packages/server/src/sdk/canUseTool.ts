/**
 * canUseTool 闸门(tech-spec §4.5):真正的能力边界。
 *
 * 规则(按优先级):
 * 1. personaX in-process 工具(mcp__personax-*)→ 始终 allow(orchestration / claim-sink)。
 * 2. 命中 def.toolPolicy.confirm → deny,提示需治理确认(Slice 5 接入)。
 * 3. 命中 def.toolPolicy.allow(支持 mcp__server__* 通配)→ allow。
 * 4. 其余 → deny,说明不在白名单。
 *
 * confirm 先于 allow 判断:危险工具即便也在 allow 里,也要转确认。
 */
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { AgentDefinition } from '@personax/contracts';
import type { RunContext } from '../runtime/context.js';

/**
 * 简单 glob 匹配:pattern 中的 `*` 匹配任意字符(含空)。
 * 例:`mcp__github__*` 匹配 `mcp__github__create_issue`;`Bash` 精确匹配 `Bash`。
 */
function globMatch(pattern: string, name: string): boolean {
  if (pattern === name) return true;
  if (!pattern.includes('*')) return false;
  // 把 glob 转正则:转义正则元字符,再把 \* 还原为 .*
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(name);
}

function matchesAny(patterns: string[] | undefined, name: string): boolean {
  if (!patterns) return false;
  return patterns.some((p) => globMatch(p, name));
}

/** personaX in-process 工具(orchestration / claim-sink)始终放行。 */
function isPersonaxTool(name: string): boolean {
  return name.startsWith('mcp__personax-');
}

export function makeCanUseTool(def: AgentDefinition, _ctx: RunContext): CanUseTool {
  return async (toolName, input, _options): Promise<PermissionResult> => {
    // 1. personaX 编排/claim-sink 工具始终放行
    if (isPersonaxTool(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // 2. confirm 名单:危险工具转治理确认(Slice 5 接入)
    if (matchesAny(def.toolPolicy.confirm, toolName)) {
      return {
        behavior: 'deny',
        message: `工具 ${toolName} 命中治理确认名单,需治理确认(Slice 5 接入)`,
      };
    }

    // 3. allow 白名单
    if (matchesAny(def.toolPolicy.allow, toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // 4. 其余拒绝
    return {
      behavior: 'deny',
      message: `工具 ${toolName} 不在 agent(${def.id})的能力白名单内,已拒绝`,
    };
  };
}
