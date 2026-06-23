import { create } from 'zustand'
import type { AgentDefinition, AgentDefinitionCreate, AgentDefinitionUpdate } from '@personax/contracts'
import { listAgents, createAgent, updateAgent, deleteAgent } from '../api/client'

interface AgentsState {
  agents: AgentDefinition[]
  loading: boolean
  error: string | null

  /** 侧栏导航:聚焦到某个 agent 卡片(滚动并高亮) */
  focusAgentId: string | null
  /** 侧栏导航:按 group 筛选 Agents 页 */
  filterGroup: string | null

  /** 拉取全部 agents */
  fetchAll: () => Promise<void>
  /** 新建 agent,成功后追加到本地列表 */
  create: (data: AgentDefinitionCreate) => Promise<AgentDefinition>
  /** 更新 agent,成功后替换本地记录 */
  update: (id: string, data: AgentDefinitionUpdate) => Promise<AgentDefinition>
  /** 删除 agent,成功后从本地列表移除 */
  remove: (id: string) => Promise<void>
  /** 设置聚焦目标(侧栏点具体 agent 时调用) */
  setFocusAgent: (id: string | null) => void
  /** 设置组筛选(侧栏点分组时调用) */
  setFilterGroup: (group: string | null) => void
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,
  focusAgentId: null,
  filterGroup: null,

  setFocusAgent: (id) => set({ focusAgentId: id }),
  setFilterGroup: (group) => set({ filterGroup: group }),

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const agents = await listAgents()
      set({ agents, loading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      set({ error: msg, loading: false })
    }
  },

  create: async (data) => {
    const agent = await createAgent(data)
    set((s) => ({ agents: [...s.agents, agent] }))
    return agent
  },

  update: async (id, data) => {
    const updated = await updateAgent(id, data)
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? updated : a)),
    }))
    return updated
  },

  remove: async (id) => {
    await deleteAgent(id)
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
  },
}))
