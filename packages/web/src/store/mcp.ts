import { create } from 'zustand'
import type { McpServerConfig, McpServerCreate, McpServerUpdate, McpImport, McpTestResult } from '@personax/contracts'
import { listMcp, createMcp, updateMcp, deleteMcp, importMcp, testMcp } from '../api/mcp'

interface McpState {
  servers: McpServerConfig[]
  loading: boolean
  error: string | null

  /** 测试结果缓存: id -> result */
  testResults: Record<string, McpTestResult>
  testingId: string | null

  fetchAll: () => Promise<void>
  create: (data: McpServerCreate) => Promise<McpServerConfig>
  import: (data: McpImport) => Promise<McpServerConfig>
  update: (id: string, data: McpServerUpdate) => Promise<McpServerConfig>
  remove: (id: string) => Promise<void>
  test: (id: string) => Promise<McpTestResult>
}

export const useMcpStore = create<McpState>((set) => ({
  servers: [],
  loading: false,
  error: null,

  testResults: {},
  testingId: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const servers = await listMcp()
      set({ servers, loading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      set({ error: msg, loading: false })
    }
  },

  create: async (data) => {
    const server = await createMcp(data)
    set((s) => ({ servers: [...s.servers, server] }))
    return server
  },

  import: async (data) => {
    const server = await importMcp(data)
    set((s) => ({ servers: [...s.servers, server] }))
    return server
  },

  update: async (id, data) => {
    const updated = await updateMcp(id, data)
    set((s) => ({
      servers: s.servers.map((sv) => (sv.id === id ? updated : sv)),
    }))
    return updated
  },

  remove: async (id) => {
    await deleteMcp(id)
    set((s) => ({
      servers: s.servers.filter((sv) => sv.id !== id),
    }))
  },

  test: async (id) => {
    set({ testingId: id })
    try {
      const result = await testMcp(id)
      set((s) => ({
        testResults: { ...s.testResults, [id]: result },
        testingId: null,
      }))
      return result
    } catch (err) {
      set({ testingId: null })
      throw err
    }
  },
}))
