import { create } from 'zustand'
import type { KnowledgeBase, KnowledgeBaseCreate, BaseVersion, BaseVersionWithContent, BaseVersionCreate, BasePatch } from '@personax/contracts'
import { listBases, createBase, listVersions, getVersion, createVersion } from '../api/bases'
import { listPatches, reviewPatch } from '../api/patches'

interface BasesState {
  bases: KnowledgeBase[]
  loading: boolean
  error: string | null

  selectedBase: KnowledgeBase | null
  versions: BaseVersion[]
  versionsLoading: boolean
  versionsError: string | null

  viewedVersion: BaseVersionWithContent | null
  viewedVersionLoading: boolean

  patches: BasePatch[]
  patchesLoading: boolean
  patchesError: string | null

  fetchAll: () => Promise<void>
  createBase: (data: KnowledgeBaseCreate) => Promise<KnowledgeBase>
  selectBase: (base: KnowledgeBase) => Promise<void>
  refreshBase: (id: string) => Promise<void>
  fetchVersionContent: (baseId: string, version: number) => Promise<void>
  clearViewedVersion: () => void
  addVersion: (baseId: string, data: BaseVersionCreate) => Promise<BaseVersionWithContent>
  loadPatches: (baseId: string) => Promise<void>
  reviewPatch: (baseId: string, patchId: string, action: 'accept' | 'reject') => Promise<void>
}

export const useBasesStore = create<BasesState>((set, get) => ({
  bases: [],
  loading: false,
  error: null,

  selectedBase: null,
  versions: [],
  versionsLoading: false,
  versionsError: null,

  viewedVersion: null,
  viewedVersionLoading: false,

  patches: [],
  patchesLoading: false,
  patchesError: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const bases = await listBases()
      set({ bases, loading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      set({ error: msg, loading: false })
    }
  },

  createBase: async (data) => {
    const base = await createBase(data)
    set((s) => ({ bases: [...s.bases, base] }))
    return base
  },

  selectBase: async (base) => {
    set({ selectedBase: base, versions: [], versionsError: null, viewedVersion: null, versionsLoading: true, patches: [], patchesError: null })
    try {
      const versions = await listVersions(base.id)
      set({ versions, versionsLoading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载版本失败'
      set({ versionsError: msg, versionsLoading: false })
    }
    // load patches in parallel (best effort)
    get().loadPatches(base.id).catch(() => undefined)
  },

  refreshBase: async (id) => {
    try {
      const [bases, versions] = await Promise.all([
        listBases(),
        listVersions(id),
      ])
      const updatedBase = bases.find((b) => b.id === id) ?? null
      set({ bases, versions, selectedBase: updatedBase })
    } catch {
      // best effort
    }
  },

  fetchVersionContent: async (baseId, version) => {
    set({ viewedVersionLoading: true })
    try {
      const v = await getVersion(baseId, version)
      set({ viewedVersion: v, viewedVersionLoading: false })
    } catch (err) {
      set({ viewedVersionLoading: false })
      throw err
    }
  },

  clearViewedVersion: () => {
    set({ viewedVersion: null })
  },

  addVersion: async (baseId, data) => {
    const v = await createVersion(baseId, data)
    await get().refreshBase(baseId)
    return v
  },

  loadPatches: async (baseId) => {
    set({ patchesLoading: true, patchesError: null })
    try {
      const patches = await listPatches(baseId)
      set({ patches, patchesLoading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载 patches 失败'
      set({ patchesError: msg, patchesLoading: false })
    }
  },

  reviewPatch: async (baseId, patchId, action) => {
    await reviewPatch(baseId, patchId, action)
    // refresh patches and base metadata (accept creates a new version and switches active)
    await Promise.all([
      get().loadPatches(baseId),
      get().refreshBase(baseId),
    ])
  },
}))
