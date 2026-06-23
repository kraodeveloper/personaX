import { create } from 'zustand'
import type {
  ModelInfo, AppSettings, AppSettingsUpdate, ProviderStatus,
  Connection, ConnectionCreate, ConnectionUpdate,
} from '@personax/contracts'
import { getModels, getSettings, updateSettings, getProvider } from '../api/settings'
import {
  listConnections, createConnection, updateConnection, deleteConnection,
} from '../api/connections'

interface SettingsState {
  models: ModelInfo[]
  settings: AppSettings | null
  provider: ProviderStatus | null
  connections: Connection[]
  loading: boolean
  saving: boolean
  error: string | null
  saveError: string | null

  fetchAll: () => Promise<void>
  save: (patch: AppSettingsUpdate) => Promise<void>
  addConnection: (body: ConnectionCreate) => Promise<Connection>
  editConnection: (id: string, body: ConnectionUpdate) => Promise<Connection>
  removeConnection: (id: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  models: [],
  settings: null,
  provider: null,
  connections: [],
  loading: false,
  saving: false,
  error: null,
  saveError: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const [models, settings, provider, connections] = await Promise.all([
        getModels(),
        getSettings(),
        getProvider(),
        listConnections(),
      ])
      set({ models, settings, provider, connections, loading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      set({ loading: false, error: msg })
    }
  },

  save: async (patch: AppSettingsUpdate) => {
    set({ saving: true, saveError: null })
    try {
      const updated = await updateSettings(patch)
      set({ settings: updated, saving: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      set({ saving: false, saveError: msg })
      throw err
    }
  },

  addConnection: async (body: ConnectionCreate) => {
    const created = await createConnection(body)
    set({ connections: [...get().connections, created] })
    return created
  },

  editConnection: async (id: string, body: ConnectionUpdate) => {
    const updated = await updateConnection(id, body)
    set({ connections: get().connections.map((c) => (c.id === id ? updated : c)) })
    return updated
  },

  removeConnection: async (id: string) => {
    await deleteConnection(id)
    set({ connections: get().connections.filter((c) => c.id !== id) })
  },
}))
