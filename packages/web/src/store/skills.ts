import { create } from 'zustand'
import type { SkillDef, SkillWithContent, SkillCreate, SkillUpdate, SkillImport } from '@personax/contracts'
import { listSkills, getSkill, createSkill, updateSkill, deleteSkill, importSkill } from '../api/skills'

interface SkillsState {
  skills: SkillDef[]
  loading: boolean
  error: string | null

  /** 当前选中的 skill (含 content) */
  selectedSkill: SkillWithContent | null
  selectedLoading: boolean

  fetchAll: () => Promise<void>
  fetchSkill: (id: string) => Promise<void>
  clearSelected: () => void
  create: (data: SkillCreate) => Promise<SkillDef>
  import: (data: SkillImport) => Promise<SkillDef>
  update: (id: string, data: SkillUpdate) => Promise<SkillDef>
  remove: (id: string) => Promise<void>
}

export const useSkillsStore = create<SkillsState>((set, _get) => ({
  skills: [],
  loading: false,
  error: null,

  selectedSkill: null,
  selectedLoading: false,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const skills = await listSkills()
      set({ skills, loading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      set({ error: msg, loading: false })
    }
  },

  fetchSkill: async (id) => {
    set({ selectedLoading: true })
    try {
      const skill = await getSkill(id)
      set({ selectedSkill: skill, selectedLoading: false })
    } catch (err) {
      set({ selectedLoading: false })
      throw err
    }
  },

  clearSelected: () => set({ selectedSkill: null }),

  create: async (data) => {
    const skill = await createSkill(data)
    set((s) => ({ skills: [...s.skills, skill] }))
    return skill
  },

  import: async (data) => {
    const skill = await importSkill(data)
    set((s) => ({ skills: [...s.skills, skill] }))
    return skill
  },

  update: async (id, data) => {
    const updated = await updateSkill(id, data)
    set((s) => ({
      skills: s.skills.map((sk) => (sk.id === id ? updated : sk)),
      selectedSkill: s.selectedSkill?.id === id
        ? { ...s.selectedSkill, ...updated }
        : s.selectedSkill,
    }))
    return updated
  },

  remove: async (id) => {
    await deleteSkill(id)
    set((s) => ({
      skills: s.skills.filter((sk) => sk.id !== id),
      selectedSkill: s.selectedSkill?.id === id ? null : s.selectedSkill,
    }))
  },
}))
