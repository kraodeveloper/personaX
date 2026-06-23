import { create } from 'zustand'
import type { ModelInfo, AppSettings, AppSettingsUpdate, ProviderStatus } from '@personax/contracts'
import { getModels, getSettings, updateSettings, getProvider } from '../api/settings'

interface SettingsState {
  models: ModelInfo[]
  settings: AppSettings | null
  provider: ProviderStatus | null
  loading: boolean
  saving: boolean
  error: string | null
  saveError: string | null

  fetchAll: () => Promise<void>
  save: (patch: AppSettingsUpdate) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  models: [],
  settings: null,
  provider: null,
  loading: false,
  saving: false,
  error: null,
  saveError: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const [models, settings, provider] = await Promise.all([
        getModels(),
        getSettings(),
        getProvider(),
      ])
      set({ models, settings, provider, loading: false })
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
}))
