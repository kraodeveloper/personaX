import type { BasePatch } from '@personax/contracts'
import { ApiError } from './bases'

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

export function listPatches(baseId: string): Promise<BasePatch[]> {
  return request<BasePatch[]>(`/bases/${encodeURIComponent(baseId)}/patches`)
}

export interface ReviewPatchResult {
  patch: BasePatch
  version?: unknown
}

export function reviewPatch(
  baseId: string,
  patchId: string,
  action: 'accept' | 'reject',
): Promise<ReviewPatchResult> {
  return request<ReviewPatchResult>(
    `/bases/${encodeURIComponent(baseId)}/patches/${encodeURIComponent(patchId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ action }),
    },
  )
}
