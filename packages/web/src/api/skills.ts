import type {
  SkillDef,
  SkillWithContent,
  SkillCreate,
  SkillUpdate,
  SkillImport,
} from '@personax/contracts'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })

  if (res.status === 204) {
    return undefined as unknown as T
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`
    throw new ApiError(res.status, msg, (data as { details?: unknown }).details)
  }

  return data as T
}

export function listSkills(): Promise<SkillDef[]> {
  return request<SkillDef[]>('/skills')
}

export function getSkill(id: string): Promise<SkillWithContent> {
  return request<SkillWithContent>(`/skills/${encodeURIComponent(id)}`)
}

export function createSkill(body: SkillCreate): Promise<SkillDef> {
  return request<SkillDef>('/skills', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateSkill(id: string, body: SkillUpdate): Promise<SkillDef> {
  return request<SkillDef>(`/skills/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deleteSkill(id: string): Promise<void> {
  return request<void>(`/skills/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function importSkill(body: SkillImport): Promise<SkillDef> {
  return request<SkillDef>('/skills/import', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
