import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, ChevronDown, Loader2, AlertCircle, CheckCircle,
  ShieldCheck, Key, ShieldOff, Cpu, List,
} from 'lucide-react'
import { useSettingsStore } from '../store/settings'
import type { AppSettingsUpdate } from '@personax/contracts'

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

// ─── SettingsPage ─────────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const {
    models, settings, provider, loading, saving, error,
    fetchAll, save,
  } = useSettingsStore()

  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [fetchAll])

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

  // ── provider badge ──────────────────────────────────────────────────────────
  const authBadge = () => {
    if (!provider) return null
    const method = provider.authMethod
    if (method === 'subscription') {
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
          style={{ background: '#fdf8e7', border: '1px solid #f0d87a', color: '#92700d' }}
        >
          <ShieldCheck size={12} />
          订阅
        </span>
      )
    }
    if (method === 'api_key') {
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
          style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}
        >
          <Key size={12} />
          API Key
        </span>
      )
    }
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
        style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280' }}
      >
        <ShieldOff size={12} />
        未配置
      </span>
    )
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
            {/* ── 供应商 ── */}
            {sectionCard(
              <>
                {sectionTitle(
                  <ShieldCheck size={15} style={{ color: '#374151' }} />,
                  '供应商',
                  'AI 运行时提供方',
                )}
                <div
                  className="flex items-center justify-between p-4 rounded-lg"
                  style={{ background: '#f8f9fa', border: '1px solid #f3f4f6' }}
                >
                  <div className="flex items-center gap-3">
                    {/* Anthropic logo placeholder */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-xs text-white"
                      style={{ background: '#18181b' }}
                    >
                      A
                    </div>
                    <div>
                      <p className="font-medium text-sm" style={{ color: '#111827' }}>Anthropic</p>
                      <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                        {provider
                          ? provider.authConfigured
                            ? '认证已配置'
                            : '认证未配置'
                          : '–'}
                      </p>
                    </div>
                  </div>
                  {authBadge()}
                </div>
                <p className="mt-3 text-xs" style={{ color: '#9ca3af' }}>
                  当前运行时基于 Claude Agent SDK,仅支持 Anthropic / Claude 模型。
                </p>
              </>
            )}

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
          </>
        )}
      </div>
    </div>
  )
}

export default SettingsPage
