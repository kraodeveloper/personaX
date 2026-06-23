/**
 * In-process MCP servers + MCP 注入组装(tech-spec §4.2 / §5.2)。
 *
 * - personax-claim-sink:暴露 submit_claim,模型经此提交结构化 Claim。
 * - personax-orchestration:暴露 call_domain_agent / spawn_worker,
 *   agent 间调用唯一入口,每次入口先 guardRecursion,超限降级为 failed_observation。
 * - buildMcpServers:把上述两个 + 绑定且 enabled 的外部 MCP 拼成 record。
 */
import { z } from 'zod';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { McpServerConfig as SdkMcpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import {
  ClaimSubmissionSchema,
  type AgentDefinition,
  type ClaimSubmission,
  type Claim,
} from '@personax/contracts';
import type { RunContext } from '../runtime/context.js';
import { childContext, guardRecursion } from '../runtime/context.js';
import { listAgents } from '../store/agents.js';
import { getMcp } from '../store/mcp.js';
import { runAgent, runWorker, failedObservation } from './runAgent.js';

/** 闭包持有 submit_claim 提交的载荷。 */
export interface ClaimHolder {
  submitted?: ClaimSubmission;
}

/** claim-sink:模型调用一次以提交结构化结论。 */
export function buildClaimSink(holder: ClaimHolder) {
  return createSdkMcpServer({
    name: 'personax-claim-sink',
    version: '1.0.0',
    tools: [
      tool(
        'submit_claim',
        '提交本次调查的结构化结论(必须调用一次)。包含 claimType / claim / scope / confidence / evidenceRefs 等。',
        ClaimSubmissionSchema.shape,
        async (args) => {
          holder.submitted = args as ClaimSubmission;
          return { content: [{ type: 'text', text: 'claim received' }] };
        },
      ),
    ],
  });
}

/** 在域注册表里按 domain 找一个 active 的领域 agent。 */
function findDomainAgent(domain: string): AgentDefinition | undefined {
  const agents = listAgents();
  return (
    agents.find(
      (a) =>
        a.status === 'active' &&
        (a.kind === 'business_domain' || a.kind === 'technical_domain') &&
        a.domain === domain,
    ) ??
    // 退而求其次:按 id / name 含 domain 匹配
    agents.find((a) => a.status === 'active' && a.domain === domain)
  );
}

/** 把 Claim 包成 MCP tool 返回内容(JSON 文本)。 */
function claimResult(claim: Claim) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(claim) }],
  };
}

/** orchestration:agent 间调用入口。 */
export function buildOrchestration(ctx: RunContext) {
  return createSdkMcpServer({
    name: 'personax-orchestration',
    version: '1.0.0',
    tools: [
      tool(
        'call_domain_agent',
        '向某领域主 agent 提问,返回其结构化 Claim(JSON)。',
        { domain: z.string(), question: z.string() },
        async ({ domain, question }) => {
          const def = findDomainAgent(domain);
          if (!def) {
            const fallback: AgentDefinition = synthDomainDef(domain);
            const reason = `未找到 domain=${domain} 的注册 agent`;
            return claimResult(failedObservation(fallback, {}, reason));
          }
          // 候选子上下文(depth+1、追加该 agentId)
          const candidate = childContext(ctx, def.id, ctx.parentNodeId);
          const denied = guardRecursion(candidate, 'call_domain_agent');
          if (denied) {
            return claimResult(failedObservation(def, {}, denied));
          }
          ctx.budget.spentChildAgents += 1;
          const claim = await runAgent(def, question, candidate);
          return claimResult(claim);
        },
      ),
      tool(
        'spawn_worker',
        '派一次性 worker 做检索 / 读代码 / 跑命令,返回其结构化 Claim(JSON)。',
        { task: z.string(), tools: z.array(z.string()).optional() },
        async ({ task, tools }) => {
          const workerDef = synthWorkerDef(tools);
          const candidate = childContext(ctx, 'agent.worker', ctx.parentNodeId);
          const denied = guardRecursion(candidate, 'spawn_worker');
          if (denied) {
            return claimResult(failedObservation(workerDef, {}, denied));
          }
          ctx.budget.spentChildAgents += 1;
          const claim = await runWorker(task, tools, candidate);
          return claimResult(claim);
        },
      ),
    ],
  });
}

/** 合成领域 def(仅用于 failed_observation 出处占位)。 */
function synthDomainDef(domain: string): AgentDefinition {
  return {
    id: `agent.${domain}`,
    name: `${domain} domain`,
    kind: 'business_domain',
    domain,
    skills: [],
    mcpServers: [],
    toolPolicy: { allow: [] },
    status: 'active',
    version: 0,
    updatedAt: new Date().toISOString(),
  };
}

/** 合成 worker def(仅用于 failed_observation 出处占位)。 */
function synthWorkerDef(tools: string[] | undefined): AgentDefinition {
  return {
    id: 'agent.worker',
    name: 'Worker',
    kind: 'worker',
    skills: [],
    mcpServers: [],
    toolPolicy: { allow: tools ?? ['Read', 'Grep', 'Glob', 'Bash'] },
    status: 'active',
    version: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 组装 query 的 mcpServers record:
 * personax-orchestration + personax-claim-sink + 绑定且 enabled 的外部 MCP。
 */
export function buildMcpServers(
  def: AgentDefinition,
  ctx: RunContext,
  claimHolder: ClaimHolder,
): Record<string, SdkMcpServerConfig> {
  const servers: Record<string, SdkMcpServerConfig> = {
    'personax-orchestration': buildOrchestration(ctx),
    'personax-claim-sink': buildClaimSink(claimHolder),
  };

  appendBoundMcp(def, servers);

  return servers;
}

/**
 * 对话(1V1 直聊)用的 mcpServers:**只**装该 agent 绑定且 enabled 的外部 MCP,
 * 不含 orchestration / claim-sink —— 对话回复是自由文本,不走 Claim,也不派子 agent。
 */
export function buildChatMcpServers(
  def: AgentDefinition,
): Record<string, SdkMcpServerConfig> {
  const servers: Record<string, SdkMcpServerConfig> = {};
  appendBoundMcp(def, servers);
  return servers;
}

/** 把 def 绑定且 enabled 的外部 MCP(stdio/sse/http)追加进 servers。 */
function appendBoundMcp(
  def: AgentDefinition,
  servers: Record<string, SdkMcpServerConfig>,
): void {
  for (const mcpId of def.mcpServers) {
    const cfg = getMcp(mcpId);
    if (!cfg || !cfg.enabled) continue;
    if (cfg.transport === 'stdio' && cfg.command) {
      servers[mcpId] = {
        type: 'stdio',
        command: cfg.command,
        args: cfg.args,
        env: cfg.env,
      };
    } else if (cfg.transport === 'sse' && cfg.url) {
      servers[mcpId] = {
        type: 'sse',
        url: cfg.url,
        headers: cfg.headers,
      };
    } else if (cfg.transport === 'http' && cfg.url) {
      servers[mcpId] = {
        type: 'http',
        url: cfg.url,
        headers: cfg.headers,
      };
    }
  }
}
