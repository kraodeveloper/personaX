import { create } from 'zustand'
import type { Claim, RunEvent, AgentKind, RunStatus } from '@personax/contracts'
import { createRun, streamRun } from '../api/runs'

// ── 节点状态 ─────────────────────────────────────────────────────────────────

export interface RunNode {
  nodeId: string
  parentNodeId?: string
  agentId: string
  agentKind: AgentKind
  label: string
  depth: number
  text: string
  thinking: string
  toolUses: { toolName: string; toolUseId?: string; summary?: string }[]
  claim?: Claim
  status: 'running' | 'done'
  costUsd?: number
  numTurns?: number
  model?: string
  inputTokens?: number
  outputTokens?: number
  contextWindow?: number
}

// ── 预算快照 ──────────────────────────────────────────────────────────────────

export interface BudgetSnapshot {
  spentChildAgents: number
  spentToolCalls: number
  spentCostUsd: number
}

// ── 整体 store ────────────────────────────────────────────────────────────────

interface RunState {
  runId?: string
  running: boolean
  status?: RunStatus
  nodes: Record<string, RunNode>
  order: string[]        // nodeId 首次出现顺序
  claims: Claim[]
  finalDelivery?: string
  budget?: BudgetSnapshot
  error?: string
  /** run 级合计(各 agent_finished 累加) */
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number

  /** 按 RunEvent 更新状态 */
  applyEvent: (ev: RunEvent) => void
  /** 创建 run 并开始流式消费 */
  start: (task: string) => Promise<void>
  /** 重置到空态 */
  reset: () => void
}

// ── 初始空态 ──────────────────────────────────────────────────────────────────

const INITIAL: Omit<RunState, 'applyEvent' | 'start' | 'reset'> = {
  runId: undefined,
  running: false,
  status: undefined,
  nodes: {},
  order: [],
  claims: [],
  finalDelivery: undefined,
  budget: undefined,
  error: undefined,
  totalCostUsd: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useRunStore = create<RunState>((set, get) => ({
  ...INITIAL,

  reset: () => set({ ...INITIAL }),

  applyEvent: (ev) => {
    set((s) => {
      switch (ev.type) {
        case 'run_started':
          return { runId: ev.runId, status: 'running' as RunStatus }

        case 'agent_started': {
          const node: RunNode = {
            nodeId: ev.nodeId,
            parentNodeId: ev.parentNodeId,
            agentId: ev.agentId,
            agentKind: ev.agentKind,
            label: ev.label,
            depth: ev.depth,
            text: '',
            thinking: '',
            toolUses: [],
            status: 'running',
          }
          const alreadyInOrder = s.order.includes(ev.nodeId)
          return {
            nodes: { ...s.nodes, [ev.nodeId]: node },
            order: alreadyInOrder ? s.order : [...s.order, ev.nodeId],
          }
        }

        case 'thinking_delta': {
          const existing = s.nodes[ev.nodeId]
          if (!existing) return s
          return {
            nodes: {
              ...s.nodes,
              [ev.nodeId]: { ...existing, thinking: existing.thinking + ev.text },
            },
          }
        }

        case 'text_delta': {
          const existing = s.nodes[ev.nodeId]
          if (!existing) return s
          return {
            nodes: {
              ...s.nodes,
              [ev.nodeId]: { ...existing, text: existing.text + ev.text },
            },
          }
        }

        case 'tool_use': {
          const existing = s.nodes[ev.nodeId]
          if (!existing) return s
          return {
            nodes: {
              ...s.nodes,
              [ev.nodeId]: {
                ...existing,
                toolUses: [
                  ...existing.toolUses,
                  { toolName: ev.toolName, toolUseId: ev.toolUseId, summary: ev.summary },
                ],
              },
            },
          }
        }

        case 'claim': {
          const existing = s.nodes[ev.nodeId]
          if (!existing) return s
          return {
            nodes: {
              ...s.nodes,
              [ev.nodeId]: { ...existing, claim: ev.claim },
            },
            claims: [...s.claims, ev.claim],
          }
        }

        case 'agent_finished': {
          const existing = s.nodes[ev.nodeId]
          if (!existing) return s
          return {
            nodes: {
              ...s.nodes,
              [ev.nodeId]: {
                ...existing,
                status: 'done',
                costUsd: ev.costUsd,
                numTurns: ev.numTurns,
                model: ev.model,
                inputTokens: ev.inputTokens,
                outputTokens: ev.outputTokens,
                contextWindow: ev.contextWindow,
              },
            },
            totalCostUsd: s.totalCostUsd + (ev.costUsd ?? 0),
            totalInputTokens: s.totalInputTokens + (ev.inputTokens ?? 0),
            totalOutputTokens: s.totalOutputTokens + (ev.outputTokens ?? 0),
          }
        }

        case 'budget':
          return {
            budget: {
              spentChildAgents: ev.spentChildAgents,
              spentToolCalls: ev.spentToolCalls,
              spentCostUsd: ev.spentCostUsd,
            },
          }

        case 'final_delivery':
          return { finalDelivery: ev.delivery }

        case 'run_finished':
          return { status: ev.status, running: false }

        case 'error':
          return { error: ev.message, running: false }

        default:
          return s
      }
    })
  },

  start: async (task) => {
    get().reset()
    set({ running: true, error: undefined })
    try {
      const { id } = await createRun(task)
      set({ runId: id })
      streamRun(id, (ev) => get().applyEvent(ev))
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建任务失败'
      set({ error: msg, running: false })
    }
  },
}))
