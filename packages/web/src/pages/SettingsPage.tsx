import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, ChevronDown, Loader2, AlertCircle, CheckCircle,
  ShieldCheck, Cpu, List, TrendingUp,
  Plug, Copy, Check, Link2, Plus, Pencil, Trash2, Star,
  Layers, Network, Boxes, Lock,
} from 'lucide-react'
import { useSettingsStore } from '../store/settings'
import { useAgentsStore } from '../store/agents'
import { getUsage } from '../api/usage'
import { getFeishuConfig, updateFeishuConfig } from '../api/settings'
import type {
  AppSettingsUpdate, UsageEvent, FeishuConfig, FeishuConfigUpdate,
  Connection, ConnectionCreate,
} from '@personax/contracts'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M ctx`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ctx`
  return `${n} ctx`
}

function fmtOutput(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K out`
  return `${n} out`
}

// ─── sub-components ───────────────────────────────────────────────────────────

const sectionCard = (children: React.ReactNode) => (
  <div
    className="bg-white rounded-xl p-5"
    style={{ border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
  >
    {children}
  </div>
)

const sectionTitle = (icon: React.ReactNode, title: string, subtitle?: string) => (
  <div className="flex items-center gap-3 mb-4">
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: '#f3f4f6' }}
    >
      {icon}
    </div>
    <div>
      <h2 className="font-semibold text-sm" style={{ color: '#111827' }}>{title}</h2>
      {subtitle && <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{subtitle}</p>}
    </div>
  </div>
)

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '7px 32px 7px 10px',
  fontSize: 14,
  color: '#111827',
  fontFamily: 'inherit',
  outline: 'none',
  appearance: 'none',
  transition: 'border-color 0.15s',
}

// ─── 成本曲线 (手写 SVG) ────────────────────────────────────────────────────────

// 浅色友好调色板 (gold 主色之一)
const SERIES_COLORS = [
  '#c9a227', // gold
  '#3b82f6', // blue
  '#10b981', // green
  '#8b5cf6', // violet
  '#ef4444', // red
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#ec4899', // pink
]

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  if (n === 0) return '$0'
  return `$${n.toFixed(4)}`
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

/** 取 createdAt 的日期部分 (YYYY-MM-DD),容错非法时间戳 */
function dayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10) || 'unknown'
  // 本地日期,避免跨时区把同一天算成两天
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface AgentAgg {
  agentId: string
  totalCost: number
  totalIn: number
  totalOut: number
}

interface ChartModel {
  days: string[]                         // 排序后的日期 key
  agentIds: string[]                     // 排序后的 agentId
  // agentId -> day -> cost
  byAgentDay: Map<string, Map<string, number>>
  maxDayCost: number                     // y 轴上界 (单 agent 单日最大成本)
  aggs: AgentAgg[]                       // 按 agent 汇总,降序
}

/** 把 UsageEvent[] 聚合成绘图模型:按天 × 按 agent */
function buildChartModel(events: UsageEvent[]): ChartModel {
  const dayset = new Set<string>()
  const aggMap = new Map<string, AgentAgg>()
  const byAgentDay = new Map<string, Map<string, number>>()

  for (const e of events) {
    const dk = dayKey(e.createdAt)
    dayset.add(dk)

    // 汇总
    let agg = aggMap.get(e.agentId)
    if (!agg) {
      agg = { agentId: e.agentId, totalCost: 0, totalIn: 0, totalOut: 0 }
      aggMap.set(e.agentId, agg)
    }
    agg.totalCost += e.costUsd
    agg.totalIn += e.inputTokens
    agg.totalOut += e.outputTokens

    // 折线数据
    let dm = byAgentDay.get(e.agentId)
    if (!dm) {
      dm = new Map<string, number>()
      byAgentDay.set(e.agentId, dm)
    }
    dm.set(dk, (dm.get(dk) ?? 0) + e.costUsd)
  }

  const days = [...dayset].sort()
  const aggs = [...aggMap.values()].sort((a, b) => b.totalCost - a.totalCost)
  const agentIds = aggs.map((a) => a.agentId)

  // y 轴上界:任一 agent 任一天的最大单日成本
  let maxDayCost = 0
  for (const dm of byAgentDay.values()) {
    for (const v of dm.values()) {
      if (v > maxDayCost) maxDayCost = v
    }
  }

  return { days, agentIds, byAgentDay, maxDayCost, aggs }
}

/** 短日期标签 MM-DD */
function shortDay(dk: string): string {
  const parts = dk.split('-')
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : dk
}

const CostChart: React.FC<{ model: ChartModel }> = ({ model }) => {
  const { days, agentIds, byAgentDay, maxDayCost } = model

  // viewBox 坐标 (固定逻辑尺寸,SVG 随容器宽度自适应)
  const W = 720
  const H = 280
  const padL = 56
  const padR = 16
  const padT = 16
  const padB = 36
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  // y 轴上界 (留 10% 余量,至少 0.01 避免除零)
  const yMax = Math.max(maxDayCost * 1.1, 0.01)

  // x 坐标:单点居中,多点均分
  const xAt = (i: number) =>
    days.length <= 1 ? padL + plotW / 2 : padL + (plotW * i) / (days.length - 1)
  const yAt = (cost: number) => padT + plotH - (cost / yMax) * plotH

  // y 轴网格 (4 等分)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    v: yMax * t,
    y: padT + plotH - plotH * t,
  }))

  // x 轴标签:点多时抽稀,最多 ~8 个
  const xLabelStep = Math.max(1, Math.ceil(days.length / 8))

  const colorOf = (agentId: string) =>
    SERIES_COLORS[agentIds.indexOf(agentId) % SERIES_COLORS.length]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: 'block', fontFamily: 'Inter, system-ui, sans-serif' }}
      role="img"
      aria-label="成本曲线"
    >
      {/* 网格线 + y 刻度 */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL} y1={t.y} x2={W - padR} y2={t.y}
            stroke="#e5e7eb" strokeWidth={1}
          />
          <text
            x={padL - 8} y={t.y + 3}
            textAnchor="end" fontSize={10} fill="#9ca3af"
          >
            {fmtUsd(t.v)}
          </text>
        </g>
      ))}

      {/* x 轴基线 */}
      <line
        x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH}
        stroke="#d1d5db" strokeWidth={1}
      />

      {/* x 轴标签 */}
      {days.map((dk, i) =>
        i % xLabelStep === 0 || i === days.length - 1 ? (
          <text
            key={dk}
            x={xAt(i)} y={padT + plotH + 16}
            textAnchor="middle" fontSize={10} fill="#9ca3af"
          >
            {shortDay(dk)}
          </text>
        ) : null,
      )}

      {/* 每个 agent 一条折线 */}
      {agentIds.map((agentId) => {
        const dm = byAgentDay.get(agentId)!
        const color = colorOf(agentId)
        const pts = days.map((dk, i) => ({
          x: xAt(i),
          y: yAt(dm.get(dk) ?? 0),
        }))
        const path = pts
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          .join(' ')

        return (
          <g key={agentId}>
            {days.length > 1 && (
              <path d={path} fill="none" stroke={color} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" />
            )}
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={days.length > 1 ? 2.5 : 4}
                fill={color}>
                <title>
                  {agentId} · {shortDay(days[i])} · {fmtUsd(dm.get(days[i]) ?? 0)}
                </title>
              </circle>
            ))}
          </g>
        )
      })}
    </svg>
  )
}

// ─── 飞书集成卡 ─────────────────────────────────────────────────────────────

const FeishuCard: React.FC = () => {
  const { agents, fetchAll: fetchAgents } = useAgentsStore()

  const [config, setConfig] = useState<FeishuConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { fetchAgents() }, [fetchAgents])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    getFeishuConfig()
      .then((c) => { if (alive) setConfig(c) })
      .catch((err) => { if (alive) setLoadError(err instanceof Error ? err.message : '加载失败') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const save = async (patch: FeishuConfigUpdate) => {
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateFeishuConfig(patch)
      setConfig(updated)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const webhookUrl = config?.webhookPath ?? ''

  const handleCopy = async () => {
    if (!webhookUrl) return
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 忽略剪贴板失败 */
    }
  }

  return sectionCard(
    <>
      {sectionTitle(
        <Plug size={15} style={{ color: '#374151' }} />,
        '集成 · 飞书',
        '@机器人 → 跑 agent → 回帖(壳子)',
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10" style={{ color: '#9ca3af' }}>
          <Loader2 size={16} className="animate-spin" style={{ color: '#c9a227' }} />
          <span className="text-sm">加载飞书配置…</span>
        </div>
      ) : loadError ? (
        <div
          className="flex items-start gap-2 p-3 rounded-lg text-sm"
          style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
        >
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{loadError}</span>
        </div>
      ) : config ? (
        <div className="space-y-4">
          {/* enabled 开关 */}
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ background: '#f8f9fa', border: '1px solid #f3f4f6' }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: '#111827' }}>启用飞书集成</p>
              <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                {config.enabled ? '已启用' : '已停用'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              disabled={saving}
              onClick={() => save({ enabled: !config.enabled })}
              className="relative rounded-full transition-colors flex-shrink-0"
              style={{
                width: 40,
                height: 22,
                background: config.enabled ? '#c9a227' : '#d1d5db',
                opacity: saving ? 0.6 : 1,
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              <span
                className="absolute rounded-full bg-white"
                style={{
                  width: 18,
                  height: 18,
                  top: 2,
                  left: config.enabled ? 20 : 2,
                  transition: 'left 0.15s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              />
            </button>
          </div>

          {/* 绑定 agent */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#374151' }}>
              由哪个 agent 回答 @
            </label>
            <div className="relative">
              <select
                value={config.agentId ?? ''}
                disabled={saving}
                onChange={(e) => save({ agentId: e.target.value || undefined })}
                style={{ ...inputStyle, opacity: saving ? 0.6 : 1 }}
              >
                <option value="">(未绑定)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: '#9ca3af' }}
              />
            </div>
          </div>

          {/* webhook URL 只读 + 复制 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#374151' }}>Webhook URL</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={webhookUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  ...inputStyle,
                  padding: '7px 10px',
                  appearance: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                  color: '#6b7280',
                  background: '#f8f9fa',
                }}
              />
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md transition-colors flex-shrink-0"
                style={{ color: '#374151', background: '#ffffff', border: '1px solid #e5e7eb' }}
                title="复制 webhook URL"
              >
                {copied
                  ? <><Check size={13} style={{ color: '#16a34a' }} /> 已复制</>
                  : <><Copy size={13} /> 复制</>}
              </button>
            </div>
          </div>

          {/* 保存态 */}
          {saving && (
            <div className="flex items-center gap-2 text-xs" style={{ color: '#9ca3af' }}>
              <Loader2 size={12} className="animate-spin" />
              保存中…
            </div>
          )}

          {/* 保存错误 */}
          {saveError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
            壳子:响应 @机器人 / 回复 → 跑该 agent → 回帖;鉴权与真实发送为后续 TODO。
          </p>
        </div>
      ) : null}
    </>
  )
}

// ─── 接入方式 / Runtime ───────────────────────────────────────────────────────

const relayInput: React.CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 14,
  color: '#111827',
  fontFamily: 'inherit',
  outline: 'none',
}

interface RelayFormState {
  label: string
  baseUrl: string
  apiKey: string
}

const emptyRelayForm = (): RelayFormState => ({ label: '', baseUrl: '', apiKey: '' })

type SdkTab = 'cc_official' | 'cc_api' | 'codex'

/** 灰色「未实现」徽章 */
const notImplBadge = () => (
  <span
    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
    style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#9ca3af' }}
  >
    <Lock size={11} />
    未实现
  </span>
)

/** 置灰占位卡(块 2 / 块 3) */
const dimCard = (
  icon: React.ReactNode,
  title: string,
  subtitle: string,
  placeholder: string,
) => (
  <div
    className="bg-white rounded-xl p-5"
    style={{ border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', opacity: 0.6 }}
  >
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: '#f3f4f6' }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-sm truncate" style={{ color: '#6b7280' }}>{title}</h2>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#9ca3af' }}>{subtitle}</p>
        </div>
      </div>
      {notImplBadge()}
    </div>
    <div
      className="rounded-lg px-3 py-4 text-center"
      style={{ background: '#f8f9fa', border: '1px dashed #e5e7eb' }}
    >
      <p className="text-xs" style={{ color: '#9ca3af' }}>{placeholder}</p>
    </div>
  </div>
)

/** 块 1:SDK 接入(tab 切换:CC 官方 / CC API / Codex) */
const SdkAccessCard: React.FC = () => {
  const {
    connections, settings, provider, saving,
    addConnection, editConnection, removeConnection, save,
  } = useSettingsStore()

  const [tab, setTab] = useState<SdkTab>('cc_official')

  // CC API 中转表单态:null=未打开,'new'=新增,否则为正在编辑的连接 id
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<RelayFormState>(emptyRelayForm())
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const setField = <K extends keyof RelayFormState>(k: K, v: RelayFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const openNew = () => {
    setForm(emptyRelayForm())
    setFormError(null)
    setEditing('new')
  }

  const openEdit = (c: Connection) => {
    setForm({ label: c.label, baseUrl: c.baseUrl ?? '', apiKey: '' })
    setFormError(null)
    setEditing(c.id)
  }

  const closeForm = () => {
    setEditing(null)
    setFormError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      if (editing === 'new') {
        const body: ConnectionCreate = {
          label: form.label.trim(),
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey,
        }
        await addConnection(body)
      } else if (editing) {
        // 编辑:apiKey 留空 = 保留原 key,不提交
        const patch: { label?: string; baseUrl?: string; apiKey?: string } = {
          label: form.label.trim(),
          baseUrl: form.baseUrl.trim(),
        }
        if (form.apiKey) patch.apiKey = form.apiKey
        await editConnection(editing, patch)
      }
      closeForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (c: Connection) => {
    setActionError(null)
    try {
      await removeConnection(c.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const setDefault = async (id: string) => {
    setActionError(null)
    try {
      await save({ defaultConnectionId: id } as AppSettingsUpdate)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '保存失败')
    }
  }

  const defaultId = settings?.defaultConnectionId
  const subConn = connections.find((c) => c.type === 'subscription')
  const relays = connections.filter((c) => c.type === 'api_relay')
  // 订阅认证:provider 为 subscription 或订阅连接存在视为已连接
  const subConnected =
    provider?.authMethod === 'subscription' || provider?.authConfigured === true || !!subConn
  const subId = subConn?.id ?? 'subscription'
  const subIsDefault = defaultId === subId

  // tab 视觉
  const tabBtn = (key: SdkTab, label: string, disabled = false) => {
    const active = tab === key
    return (
      <button
        key={key}
        type="button"
        onClick={() => !disabled && setTab(key)}
        className="text-sm px-3 py-2 transition-colors"
        style={{
          color: disabled ? '#c4c4c4' : active ? '#92700d' : '#6b7280',
          fontWeight: active ? 600 : 500,
          background: active ? '#fdfcf5' : 'transparent',
          borderBottom: active ? '2px solid #c9a227' : '2px solid transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        title={disabled ? '未实现' : undefined}
      >
        {label}
      </button>
    )
  }

  return sectionCard(
    <>
      {sectionTitle(
        <Layers size={15} style={{ color: '#374151' }} />,
        'SDK 接入',
        'Claude Agent SDK · 订阅 / API 中转',
      )}

      {/* tab 头 */}
      <div className="flex items-center gap-1 mb-4" style={{ borderBottom: '1px solid #e5e7eb' }}>
        {tabBtn('cc_official', 'CC 官方')}
        {tabBtn('cc_api', 'CC API')}
        {tabBtn('codex', 'Codex', true)}
      </div>

      {/* ── CC 官方 tab ── */}
      {tab === 'cc_official' && (
        <div className="space-y-3">
          <div
            className="p-3 rounded-lg"
            style={{
              background: subIsDefault ? '#fdfcf5' : '#f8f9fa',
              border: subIsDefault ? '1px solid #f0d87a' : '1px solid #f3f4f6',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate" style={{ color: '#111827' }}>
                    {subConn?.label ?? 'Claude 订阅'}
                  </span>
                  {subConnected ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: '#fdf8e7', border: '1px solid #f0d87a', color: '#92700d' }}
                    >
                      <ShieldCheck size={11} />
                      订阅 已连接
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#9ca3af' }}
                    >
                      <Lock size={11} />
                      未配置
                    </span>
                  )}
                  {subIsDefault && (
                    <span
                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: '#fdf8e7', color: '#92700d' }}
                    >
                      <Star size={10} />
                      默认
                    </span>
                  )}
                </div>
              </div>
              {!subIsDefault && (
                <button
                  type="button"
                  onClick={() => setDefault(subId)}
                  disabled={saving}
                  className="text-xs px-2 py-1 rounded-md transition-colors flex-shrink-0"
                  style={{ color: '#92700d', background: '#fdf8e7', border: '1px solid #f0d87a' }}
                  title="设为默认连接"
                >
                  设为默认
                </button>
              )}
            </div>
          </div>

          {actionError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
            Claude Code 官方订阅登录(CLAUDE_CODE_OAUTH_TOKEN)。
          </p>
        </div>
      )}

      {/* ── CC API tab ── */}
      {tab === 'cc_api' && (
        <div className="space-y-3">
          {/* 中转列表 */}
          <div className="space-y-2">
            {relays.length === 0 && editing !== 'new' && (
              <div
                className="flex flex-col items-center gap-1.5 py-6 text-center rounded-lg"
                style={{ background: '#f8f9fa', border: '1px dashed #e5e7eb' }}
              >
                <Link2 size={20} style={{ color: '#d1d5db' }} />
                <p className="text-sm" style={{ color: '#9ca3af' }}>暂无中转连接</p>
              </div>
            )}
            {relays.map((c) => {
              const isDefault = c.id === defaultId
              return (
                <div
                  key={c.id}
                  className="p-3 rounded-lg"
                  style={{
                    background: isDefault ? '#fdfcf5' : '#f8f9fa',
                    border: isDefault ? '1px solid #f0d87a' : '1px solid #f3f4f6',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate" style={{ color: '#111827' }}>
                          {c.label}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}
                        >
                          <Link2 size={11} />
                          中转
                        </span>
                        {isDefault && (
                          <span
                            className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ background: '#fdf8e7', color: '#92700d' }}
                          >
                            <Star size={10} />
                            默认
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {c.baseUrl && (
                          <p className="text-xs font-mono truncate" style={{ color: '#9ca3af' }} title={c.baseUrl}>
                            {c.baseUrl}
                          </p>
                        )}
                        {c.apiKeyMasked && (
                          <p className="text-xs font-mono" style={{ color: '#9ca3af' }}>
                            {c.apiKeyMasked}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 操作 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isDefault && (
                        <button
                          type="button"
                          onClick={() => setDefault(c.id)}
                          disabled={saving}
                          className="text-xs px-2 py-1 rounded-md transition-colors"
                          style={{ color: '#92700d', background: '#fdf8e7', border: '1px solid #f0d87a' }}
                          title="设为默认连接"
                        >
                          设为默认
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                        style={{ color: '#6b7280', background: '#ffffff', border: '1px solid #e5e7eb' }}
                        title="编辑"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                        style={{ color: '#dc2626', background: '#ffffff', border: '1px solid #fecaca' }}
                        title="删除"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 行内编辑表单 */}
                  {editing === c.id && (
                    <form onSubmit={submit} className="mt-3 pt-3 space-y-2.5" style={{ borderTop: '1px solid #f3f4f6' }}>
                      <input
                        required
                        value={form.label}
                        onChange={(e) => setField('label', e.target.value)}
                        placeholder="名称"
                        style={relayInput}
                      />
                      <input
                        required
                        value={form.baseUrl}
                        onChange={(e) => setField('baseUrl', e.target.value)}
                        placeholder="Base URL — https://..."
                        style={relayInput}
                      />
                      <input
                        type="password"
                        value={form.apiKey}
                        onChange={(e) => setField('apiKey', e.target.value)}
                        placeholder="API Key(留空 = 保留原 key)"
                        style={relayInput}
                      />
                      {formError && (
                        <div className="flex items-start gap-2 text-xs" style={{ color: '#dc2626' }}>
                          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={closeForm} className="text-xs px-3 py-1.5 rounded-md"
                          style={{ color: '#6b7280', background: '#ffffff', border: '1px solid #e5e7eb' }}>
                          取消
                        </button>
                        <button type="submit" disabled={busy}
                          className="text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5"
                          style={{ color: '#fff', background: '#c9a227' }}>
                          {busy && <Loader2 size={12} className="animate-spin" />}
                          保存
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )
            })}
          </div>

          {/* 操作错误 */}
          {actionError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* 添加中转 */}
          <div>
            {editing === 'new' ? (
              <form
                onSubmit={submit}
                className="p-3 rounded-lg space-y-2.5"
                style={{ background: '#f8f9fa', border: '1px solid #f3f4f6' }}
              >
                <p className="text-sm font-medium" style={{ color: '#111827' }}>添加中转连接</p>
                <input
                  required
                  value={form.label}
                  onChange={(e) => setField('label', e.target.value)}
                  placeholder="名称"
                  style={relayInput}
                />
                <input
                  required
                  value={form.baseUrl}
                  onChange={(e) => setField('baseUrl', e.target.value)}
                  placeholder="Base URL — https://..."
                  style={relayInput}
                />
                <input
                  required
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setField('apiKey', e.target.value)}
                  placeholder="API Key"
                  style={relayInput}
                />
                {formError && (
                  <div className="flex items-start gap-2 text-xs" style={{ color: '#dc2626' }}>
                    <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeForm} className="text-xs px-3 py-1.5 rounded-md"
                    style={{ color: '#6b7280', background: '#ffffff', border: '1px solid #e5e7eb' }}>
                    取消
                  </button>
                  <button type="submit" disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5"
                    style={{ color: '#fff', background: '#c9a227' }}>
                    {busy && <Loader2 size={12} className="animate-spin" />}
                    创建
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={openNew}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md transition-colors"
                style={{ color: '#374151', background: '#ffffff', border: '1px solid #e5e7eb' }}
              >
                <Plus size={14} />
                添加中转
              </button>
            )}
          </div>

          <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
            Claude Code + 自定义 API / 中转(base URL + key);与官方订阅互不互通。key 仅本地存储、只回掩码。
          </p>
        </div>
      )}

      {/* ── Codex tab(占位) ── */}
      {tab === 'codex' && (
        <div
          className="rounded-lg px-3 py-6 text-center"
          style={{ background: '#f8f9fa', border: '1px dashed #e5e7eb', opacity: 0.7 }}
        >
          <Lock size={20} className="mx-auto mb-1.5" style={{ color: '#d1d5db' }} />
          <p className="text-sm" style={{ color: '#9ca3af' }}>未实现 —— Codex SDK 接入(规划中)</p>
        </div>
      )}
    </>
  )
}

/** 接入方式 / Runtime 区:块 1(SDK 接入)+ 块 2(ACP)+ 块 3(纯 API) */
const RuntimeSection: React.FC = () => (
  <div className="space-y-5">
    {sectionTitle(
      <Boxes size={15} style={{ color: '#374151' }} />,
      '接入方式 / Runtime',
      'agent 运行时接入形态',
    )}

    {/* 块 1 */}
    <SdkAccessCard />

    {/* 块 2 + 块 3 */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {dimCard(
        <Network size={15} style={{ color: '#9ca3af' }} />,
        'ACP 协议',
        'Agent Client Protocol',
        '未实现 —— Agent Client Protocol 接入(规划中)',
      )}
      {dimCard(
        <Cpu size={15} style={{ color: '#9ca3af' }} />,
        '纯 API · 无 agent 壳子',
        '直连模型 API',
        '未实现 —— 直连模型 API、无 agent 循环(规划中)',
      )}
    </div>
  </div>
)

// ─── SettingsPage ─────────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const {
    models, settings, loading, saving, error,
    fetchAll, save,
  } = useSettingsStore()

  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  // ── 消耗 / 成本 ──────────────────────────────────────────────────────────────
  const [usage, setUsage] = useState<UsageEvent[] | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageErr, setUsageErr] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    let alive = true
    setUsageLoading(true)
    setUsageErr(null)
    getUsage()
      .then((evts) => { if (alive) setUsage(evts) })
      .catch((err) => {
        if (alive) setUsageErr(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => { if (alive) setUsageLoading(false) })
    return () => { alive = false }
  }, [])

  const chartModel = useMemo(
    () => (usage && usage.length > 0 ? buildChartModel(usage) : null),
    [usage],
  )

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 2500)
  }

  const handleSave = async (patch: AppSettingsUpdate) => {
    setSaveErr(null)
    try {
      await save(patch)
      flash('已保存')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      setSaveErr(msg)
    }
  }

  // ── model select ────────────────────────────────────────────────────────────
  const ModelSelect: React.FC<{
    label: string
    value: string
    onChange: (v: string) => void
    saving: boolean
  }> = ({ label, value, onChange, saving: isSaving }) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" style={{ color: '#374151' }}>{label}</label>
      <div className="relative">
        <select
          value={value}
          disabled={isSaving || models.length === 0}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...inputStyle,
            opacity: models.length === 0 ? 0.5 : 1,
            cursor: models.length === 0 ? 'not-allowed' : 'default',
          }}
        >
          {models.length === 0 ? (
            <option value={value}>{value || '(无可用模型)'}</option>
          ) : (
            models.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName}</option>
            ))
          )}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: '#9ca3af' }}
        />
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full" style={{ background: '#f8f9fa' }}>
      {/* 页头 */}
      <div
        className="flex items-center justify-between px-6 py-5 bg-white shrink-0"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: '#f3f4f6' }}
          >
            <Settings size={17} style={{ color: '#374151' }} />
          </div>
          <div>
            <h1 className="font-semibold text-base" style={{ color: '#111827' }}>Settings</h1>
            <p className="text-xs" style={{ color: '#9ca3af' }}>供应商 · 认证 · 模型配置</p>
          </div>
        </div>

        {/* 顶部反馈 */}
        <AnimatePresence>
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a' }}
            >
              <CheckCircle size={14} />
              {successMsg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-2xl">
        {/* 加载中 */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-20" style={{ color: '#9ca3af' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: '#c9a227' }} />
            <span>加载中…</span>
          </div>
        )}

        {/* 加载错误 */}
        {!loading && error && (
          <div
            className="flex items-start gap-2 p-4 rounded-xl text-sm"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
          >
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">加载失败</p>
              <p className="mt-0.5" style={{ color: '#ef4444' }}>{error}</p>
              <button
                onClick={fetchAll}
                className="mt-2 text-xs underline"
                style={{ color: '#dc2626' }}
              >
                重试
              </button>
            </div>
          </div>
        )}

        {/* 保存错误 */}
        {saveErr && (
          <div
            className="flex items-start gap-2 p-3 rounded-xl text-sm"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
          >
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{saveErr}</span>
          </div>
        )}

        {!loading && (
          <>
            {/* ── 接入方式 / Runtime(块1 SDK + 块2 ACP + 块3 纯API) ── */}
            <RuntimeSection />

            {/* ── 默认模型 / Worker 模型 ── */}
            {sectionCard(
              <>
                {sectionTitle(
                  <Cpu size={15} style={{ color: '#374151' }} />,
                  '模型设置',
                  '默认模型与 Worker 模型',
                )}

                {settings ? (
                  <div className="space-y-4">
                    <ModelSelect
                      label="默认模型"
                      value={settings.defaultModel}
                      saving={saving}
                      onChange={(v) => handleSave({ defaultModel: v })}
                    />
                    <ModelSelect
                      label="Worker 模型"
                      value={settings.workerModel}
                      saving={saving}
                      onChange={(v) => handleSave({ workerModel: v })}
                    />
                    {saving && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#9ca3af' }}>
                        <Loader2 size={12} className="animate-spin" />
                        保存中…
                      </div>
                    )}
                    <p className="text-xs" style={{ color: '#9ca3af' }}>
                      修改下拉即自动保存。默认模型用于未指定模型的 Agent,Worker 模型用于临时工作 Agent。
                    </p>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: '#9ca3af' }}>无设置数据</p>
                )}
              </>
            )}

            {/* ── 模型目录 ── */}
            {sectionCard(
              <>
                {sectionTitle(
                  <List size={15} style={{ color: '#374151' }} />,
                  '模型目录',
                  '可用模型列表(实时拉取)',
                )}

                {models.length === 0 ? (
                  <div
                    className="flex flex-col items-center gap-2 py-8 text-center rounded-lg"
                    style={{ background: '#f8f9fa', border: '1px dashed #e5e7eb' }}
                  >
                    <Cpu size={24} style={{ color: '#d1d5db' }} />
                    <p className="text-sm" style={{ color: '#9ca3af' }}>
                      配置认证后可加载模型列表
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {models.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={{ background: '#f8f9fa', border: '1px solid #f3f4f6' }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: '#111827' }}>
                            {m.displayName}
                          </p>
                          <p className="text-xs font-mono truncate mt-0.5" style={{ color: '#9ca3af' }}>
                            {m.id}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe' }}
                          >
                            {fmtCtx(m.contextWindow)}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ background: '#f5f3ff', color: '#8b5cf6', border: '1px solid #ddd6fe' }}
                          >
                            {fmtOutput(m.maxOutput)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── 消耗 / 成本 ── */}
            {sectionCard(
              <>
                {sectionTitle(
                  <TrendingUp size={15} style={{ color: '#374151' }} />,
                  '消耗 / 成本',
                  '按天成本曲线 · 分 agent',
                )}

                {usageLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12" style={{ color: '#9ca3af' }}>
                    <Loader2 size={16} className="animate-spin" style={{ color: '#c9a227' }} />
                    <span className="text-sm">加载消耗数据…</span>
                  </div>
                ) : usageErr ? (
                  <div
                    className="flex items-start gap-2 p-3 rounded-lg text-sm"
                    style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
                  >
                    <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                    <span>{usageErr}</span>
                  </div>
                ) : !chartModel ? (
                  <div
                    className="flex flex-col items-center gap-2 py-10 text-center rounded-lg"
                    style={{ background: '#f8f9fa', border: '1px dashed #e5e7eb' }}
                  >
                    <TrendingUp size={24} style={{ color: '#d1d5db' }} />
                    <p className="text-sm" style={{ color: '#9ca3af' }}>暂无消耗数据</p>
                    <p className="text-xs" style={{ color: '#d1d5db' }}>
                      跑任务或对话后这里会出现成本曲线
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 曲线 */}
                    <div
                      className="rounded-lg p-3"
                      style={{ background: '#ffffff', border: '1px solid #f3f4f6' }}
                    >
                      <CostChart model={chartModel} />
                    </div>

                    {/* 图例 */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {chartModel.agentIds.map((agentId, i) => (
                        <div key={agentId} className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                          />
                          <span className="text-xs truncate" style={{ color: '#6b7280', maxWidth: 160 }}>
                            {agentId}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* 按 agent 汇总表 */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ color: '#9ca3af' }}>
                            <th className="text-left font-medium py-1.5 pr-3">Agent</th>
                            <th className="text-right font-medium py-1.5 px-3">总成本</th>
                            <th className="text-right font-medium py-1.5 px-3">In</th>
                            <th className="text-right font-medium py-1.5 pl-3">Out</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chartModel.aggs.map((a, i) => (
                            <tr key={a.agentId} style={{ borderTop: '1px solid #f3f4f6' }}>
                              <td className="py-1.5 pr-3">
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="w-2 h-2 rounded-sm flex-shrink-0"
                                    style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                                  />
                                  <span className="truncate" style={{ color: '#374151', maxWidth: 200 }}>
                                    {a.agentId}
                                  </span>
                                </span>
                              </td>
                              <td className="text-right py-1.5 px-3 font-mono" style={{ color: '#111827' }}>
                                {fmtUsd(a.totalCost)}
                              </td>
                              <td className="text-right py-1.5 px-3 font-mono" style={{ color: '#6b7280' }}>
                                {fmtTokens(a.totalIn)}
                              </td>
                              <td className="text-right py-1.5 pl-3 font-mono" style={{ color: '#6b7280' }}>
                                {fmtTokens(a.totalOut)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="text-xs" style={{ color: '#9ca3af' }}>
                      成本为<span style={{ color: '#92700d' }}>名义值</span>(订阅模式下不实际计费),仅供用量参考。
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ── 集成 · 飞书 ── */}
            <FeishuCard />
          </>
        )}
      </div>
    </div>
  )
}

export default SettingsPage
