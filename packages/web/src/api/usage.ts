import type { UsageEvent } from '@personax/contracts'
import { ApiError } from './settings'

const BASE = '/api'

/** 获取用量事件列表(成本曲线数据源) */
export async function getUsage(): Promise<UsageEvent[]> {
  const res = await fetch(`${BASE}/usage`, {
    headers: { 'Content-Type': 'application/json' },
  })

  if (res.status === 204) return []

  const data = await res.json().catch(() => ([]))

  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`
    throw new ApiError(res.status, msg, (data as { details?: unknown }).details)
  }

  return data as UsageEvent[]
}
