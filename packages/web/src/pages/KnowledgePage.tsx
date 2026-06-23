import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, BookOpen, AlertCircle, Loader2, CheckCircle,
  ChevronDown, FileText, GitCompare, Eye, ClipboardCheck,
  ChevronRight, Zap, User,
} from 'lucide-react'
import type {
  KnowledgeBase,
  KnowledgeBaseCreate,
  KnowledgeBaseKind,
  BaseVersion,
  BaseVersionWithContent,
  BaseVersionCreate,
  BasePatch,
} from '@personax/contracts'
import { useBasesStore } from '../store/bases'
import { ApiError, getVersion } from '../api/bases'

// ─── tiny cn helper ───────────────────────────────────────────────────────────

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

// ─── kind 色板 ────────────────────────────────────────────────────────────────

const KIND_COLORS: Record<KnowledgeBaseKind, string> = {
  business:  '#c9a227',
  technical: '#8b5cf6',
}
const KIND_BG: Record<KnowledgeBaseKind, string> = {
  business:  '#fdf8e7',
  technical: '#f5f3ff',
}
const KIND_LABEL: Record<KnowledgeBaseKind, string> = {
  business:  'Business',
  technical: 'Technical',
}

// ─── status 色板 ─────────────────────────────────────────────────────────────

function statusBadge(status: BaseVersion['status'], isActive: boolean) {
  if (isActive) {
    return {
      bg: '#fdf8e7',
      color: '#c9a227',
      border: '#f5d76e',
      label: 'active',
    }
  }
  switch (status) {
    case 'published':
      return { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', label: 'published' }
    case 'superseded':
      return { bg: '#f3f4f6', color: '#9ca3af', border: '#e5e7eb', label: 'superseded' }
    case 'draft':
    default:
      return { bg: '#ffffff', color: '#6b7280', border: '#d1d5db', label: 'draft' }
  }
}

// ─── Simple LCS-based line diff ───────────────────────────────────────────────

type DiffLine = { type: 'same' | 'add' | 'remove'; text: string }

function computeDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const m = aLines.length
  const n = bLines.length

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aLines[i - 1] === bLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack
  const result: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      result.push({ type: 'same', text: aLines[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: bLines[j - 1] })
      j--
    } else {
      result.push({ type: 'remove', text: aLines[i - 1] })
      i--
    }
  }
  return result.reverse()
}

// ─── Shared input style ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 14,
  color: '#111827',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 0.15s',
}

// ─── Create Base Modal ────────────────────────────────────────────────────────

interface CreateBaseModalProps {
  onSubmit: (data: KnowledgeBaseCreate) => Promise<void>
  onClose: () => void
  submitting: boolean
  submitError: string | null
}

const CreateBaseModal: React.FC<CreateBaseModalProps> = ({ onSubmit, onClose, submitting, submitError }) => {
  const [form, setForm] = useState<KnowledgeBaseCreate>({ id: '', domain: '', kind: 'business' })
  const set = <K extends keyof KnowledgeBaseCreate>(k: K, v: KnowledgeBaseCreate[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-white rounded-xl w-full max-w-md"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f3f4f6' }}>
          <h2 className="font-semibold text-base" style={{ color: '#111827' }}>新建知识库</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#374151' }}>
              ID <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              required
              value={form.id}
              onChange={(e) => set('id', e.target.value)}
              placeholder="base.payment"
              style={inputStyle}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#374151' }}>
              Domain <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              required
              value={form.domain}
              onChange={(e) => set('domain', e.target.value)}
              placeholder="payment"
              style={inputStyle}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#374151' }}>Kind</label>
            <div className="relative">
              <select
                value={form.kind}
                onChange={(e) => set('kind', e.target.value as KnowledgeBaseKind)}
                style={{ ...inputStyle, paddingRight: 32, appearance: 'none' as const }}
              >
                <option value="business">Business</option>
                <option value="technical">Technical</option>
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: '#9ca3af' }}
              />
            </div>
          </div>

          {submitError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid #f3f4f6' }}>
            <button type="button" onClick={onClose} className="btn-ghost text-sm">取消</button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              创建
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Create Version Modal ─────────────────────────────────────────────────────

interface CreateVersionModalProps {
  onSubmit: (data: BaseVersionCreate) => Promise<void>
  onClose: () => void
  submitting: boolean
  submitError: string | null
}

const CreateVersionModal: React.FC<CreateVersionModalProps> = ({ onSubmit, onClose, submitting, submitError }) => {
  const [content, setContent] = useState('')
  const [reason, setReason] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ content, reason: reason || undefined })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f3f4f6' }}>
          <h2 className="font-semibold text-base" style={{ color: '#111827' }}>新增版本</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#374151' }}>
              Reason <span style={{ color: '#9ca3af', fontWeight: 400 }}>(可选)</span>
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="说明这次版本更新的原因..."
              style={inputStyle}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#374151' }}>
              Content <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              required
              rows={16}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入知识库 Markdown 内容..."
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: '"Fira Mono", "Cascadia Code", "Consolas", monospace',
                fontSize: 13,
                lineHeight: '1.6',
              }}
            />
          </div>

          {submitError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid #f3f4f6' }}>
            <button type="button" onClick={onClose} className="btn-ghost text-sm">取消</button>
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              发布版本
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Version Diff Panel ───────────────────────────────────────────────────────

interface VersionDiffPanelProps {
  versionA: BaseVersionWithContent
  versionB: BaseVersionWithContent
  onClose: () => void
}

const VersionDiffPanel: React.FC<VersionDiffPanelProps> = ({ versionA, versionB, onClose }) => {
  const diff = computeDiff(versionA.content, versionB.content)

  const addCount = diff.filter((l) => l.type === 'add').length
  const removeCount = diff.filter((l) => l.type === 'remove').length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid #f3f4f6' }}>
          <div className="flex items-center gap-3">
            <GitCompare size={16} style={{ color: '#c9a227' }} />
            <h2 className="font-semibold text-base" style={{ color: '#111827' }}>
              版本对比 v{versionA.version} → v{versionB.version}
            </h2>
            <div className="flex items-center gap-2 text-xs ml-2">
              <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: '#dcfce7', color: '#16a34a' }}>
                +{addCount}
              </span>
              <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: '#fee2e2', color: '#dc2626' }}>
                -{removeCount}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          <pre
            className="text-xs leading-6 rounded-lg p-4 overflow-x-auto"
            style={{
              fontFamily: '"Fira Mono", "Cascadia Code", "Consolas", monospace',
              background: '#f8f9fa',
              border: '1px solid #e5e7eb',
            }}
          >
            {diff.map((line, i) => {
              let bg = 'transparent'
              let color = '#374151'
              let prefix = '  '
              if (line.type === 'add') { bg = '#dcfce7'; color = '#166534'; prefix = '+ ' }
              if (line.type === 'remove') { bg = '#fee2e2'; color = '#991b1b'; prefix = '- ' }
              return (
                <div key={i} style={{ background: bg, color, borderRadius: 2 }}>
                  <span style={{ userSelect: 'none', opacity: 0.5, marginRight: 4 }}>{prefix}</span>
                  {line.text}
                </div>
              )
            })}
          </pre>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Base Card (left panel) ───────────────────────────────────────────────────

interface BaseCardProps {
  base: KnowledgeBase
  selected: boolean
  onClick: () => void
}

const BaseCard: React.FC<BaseCardProps> = ({ base, selected, onClick }) => {
  const color = KIND_COLORS[base.kind]
  const bg = KIND_BG[base.kind]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onClick={onClick}
      className="rounded-xl p-4 cursor-pointer transition-all"
      style={{
        background: selected ? '#ffffff' : '#ffffff',
        border: selected ? `1.5px solid #c9a227` : '1px solid #e5e7eb',
        boxShadow: selected ? '0 0 0 3px rgba(201,162,39,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
          e.currentTarget.style.borderColor = '#d1d5db'
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
          e.currentTarget.style.borderColor = '#e5e7eb'
        }
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate" style={{ color: '#111827' }}>{base.id}</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#6b7280' }}>{base.domain}</p>
        </div>
        <span
          className="ml-2 flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: bg, color }}
        >
          {KIND_LABEL[base.kind]}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid #f3f4f6' }}>
        {base.activeVersion === 0 ? (
          <span className="text-xs" style={{ color: '#9ca3af' }}>无版本</span>
        ) : (
          <>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{ background: '#fdf8e7', color: '#c9a227', border: '1px solid #f5d76e' }}
            >
              active v{base.activeVersion}
            </span>
            {base.latestVersion !== base.activeVersion && (
              <span className="text-xs" style={{ color: '#9ca3af' }}>
                latest v{base.latestVersion}
              </span>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

// ─── Version Row ──────────────────────────────────────────────────────────────

interface VersionRowProps {
  version: BaseVersion
  isActive: boolean
  isSelected: boolean
  isDiffA: boolean
  isDiffB: boolean
  onView: () => void
  onSelectDiff: () => void
}

const VersionRow: React.FC<VersionRowProps> = ({
  version, isActive, isSelected, isDiffA, isDiffB, onView, onSelectDiff,
}) => {
  const badge = statusBadge(version.status, isActive)
  const fingerprint = version.fingerprint.slice(0, 10)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-3 px-4 py-3 rounded-lg group cursor-default"
      style={{
        background: isSelected ? '#f8f9fa' : 'transparent',
        border: isSelected ? '1px solid #e5e7eb' : '1px solid transparent',
      }}
    >
      {/* Version number */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
        style={{ background: isActive ? '#fdf8e7' : '#f3f4f6', color: isActive ? '#c9a227' : '#6b7280' }}
      >
        v{version.version}
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
          >
            {badge.label}
          </span>
          <span className="font-mono text-xs" style={{ color: '#9ca3af' }}>{fingerprint}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs" style={{ color: '#9ca3af' }}>
            {new Date(version.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
          {version.reason && (
            <span className="text-xs truncate max-w-[200px]" style={{ color: '#6b7280' }}>
              {version.reason}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Diff selector */}
        <button
          onClick={onSelectDiff}
          title={isDiffA ? 'Diff 起点 (A)' : isDiffB ? 'Diff 终点 (B)' : '选为 Diff'}
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold transition-colors"
          style={{
            background: isDiffA ? '#fdf8e7' : isDiffB ? '#eff6ff' : 'transparent',
            color: isDiffA ? '#c9a227' : isDiffB ? '#3b82f6' : '#9ca3af',
            border: isDiffA ? '1px solid #f5d76e' : isDiffB ? '1px solid #bfdbfe' : '1px solid transparent',
          }}
          onMouseEnter={(e) => {
            if (!isDiffA && !isDiffB) {
              e.currentTarget.style.background = '#f3f4f6'
              e.currentTarget.style.color = '#374151'
            }
          }}
          onMouseLeave={(e) => {
            if (!isDiffA && !isDiffB) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#9ca3af'
            }
          }}
        >
          <GitCompare size={12} />
        </button>

        {/* View content */}
        <button
          onClick={onView}
          title="查看内容"
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
          style={{ color: '#9ca3af' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
        >
          <Eye size={13} />
        </button>
      </div>
    </motion.div>
  )
}

// ─── PatchReview ─────────────────────────────────────────────────────────────

interface PatchRowProps {
  patch: BasePatch
  onAccept: () => Promise<void>
  onReject: () => Promise<void>
}

const PatchRow: React.FC<PatchRowProps> = ({ patch, onAccept, onReject }) => {
  const [expanded, setExpanded] = useState(false)
  const [acting, setActing] = useState<'accept' | 'reject' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handle = async (action: 'accept' | 'reject', fn: () => Promise<void>) => {
    setActing(action)
    setActionError(null)
    try {
      await fn()
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : err instanceof Error ? err.message : '操作失败'
      setActionError(msg)
    } finally {
      setActing(null)
    }
  }

  const isPending = patch.status === 'pending'

  // status badge styles
  const statusStyle: React.CSSProperties =
    patch.status === 'accepted'
      ? { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }
      : patch.status === 'rejected'
        ? { background: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb' }
        : { background: '#ffffff', color: '#6b7280', border: '1px solid #d1d5db' }

  const statusLabel =
    patch.status === 'accepted' ? '已接受' :
    patch.status === 'rejected' ? '已拒绝' : '待审核'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid #e5e7eb', background: '#ffffff' }}
    >
      {/* Row header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ background: '#ffffff' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          size={14}
          className="mt-0.5 shrink-0 transition-transform"
          style={{
            color: '#9ca3af',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />

        {/* Proposal preview */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm leading-snug"
            style={{ color: '#111827', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: expanded ? undefined : 2, overflow: expanded ? 'visible' : 'hidden' }}
          >
            {patch.proposal}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* autoEligible badge */}
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5"
              style={
                patch.autoEligible
                  ? { background: '#fdf8e7', color: '#c9a227', border: '1px solid #f5d76e' }
                  : { background: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb' }
              }
            >
              {patch.autoEligible
                ? <><Zap size={10} />可自动</>
                : <><User size={10} />需人工</>}
            </span>

            {/* status badge */}
            <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={statusStyle}>
              {statusLabel}
            </span>

            {/* fromRunId */}
            <span className="font-mono text-xs" style={{ color: '#9ca3af' }}>
              run:{patch.fromRunId.slice(0, 8)}
            </span>

            {/* createdAt */}
            <span className="text-xs" style={{ color: '#9ca3af' }}>
              {new Date(patch.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>

          {/* evidenceRefs */}
          {patch.evidenceRefs.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {patch.evidenceRefs.map((ref) => (
                <span
                  key={ref}
                  className="font-mono text-xs px-1.5 py-0.5 rounded"
                  style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}
                >
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons (pending only) */}
        {isPending && (
          <div
            className="flex items-center gap-2 shrink-0 ml-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              disabled={acting !== null}
              onClick={() => handle('accept', onAccept)}
              className="btn-primary text-xs flex items-center gap-1"
              style={{ padding: '4px 10px' }}
            >
              {acting === 'accept' ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              接受
            </button>
            <button
              disabled={acting !== null}
              onClick={() => handle('reject', onReject)}
              className="btn-danger text-xs flex items-center gap-1"
              style={{ padding: '4px 10px' }}
            >
              {acting === 'reject' ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
              拒绝
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {actionError && (
        <div
          className="px-4 py-2 text-xs flex items-center gap-1.5"
          style={{ background: '#fef2f2', borderTop: '1px solid #fecaca', color: '#dc2626' }}
        >
          <AlertCircle size={12} />
          {actionError}
        </div>
      )}
    </motion.div>
  )
}

interface PatchReviewPanelProps {
  baseId: string
}

const PatchReviewPanel: React.FC<PatchReviewPanelProps> = ({ baseId }) => {
  const { patches, patchesLoading, patchesError, loadPatches, reviewPatch: doReview } = useBasesStore()

  const handleReview = useCallback(
    (patchId: string, action: 'accept' | 'reject') =>
      doReview(baseId, patchId, action),
    [baseId, doReview],
  )

  const pendingCount = patches.filter((p) => p.status === 'pending').length

  return (
    <div
      className="shrink-0"
      style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa' }}
    >
      {/* Section header */}
      <div
        className="px-4 py-3 bg-white flex items-center justify-between"
        style={{ borderBottom: '1px solid #f3f4f6' }}
      >
        <div className="flex items-center gap-2">
          <ClipboardCheck size={14} style={{ color: '#c9a227' }} />
          <span className="text-sm font-semibold" style={{ color: '#111827' }}>
            沉淀审核 / Patches
          </span>
          {pendingCount > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: '#fdf8e7', color: '#c9a227', border: '1px solid #f5d76e' }}
            >
              {pendingCount} 待审
            </span>
          )}
        </div>
        <button
          onClick={() => loadPatches(baseId)}
          disabled={patchesLoading}
          className="btn-ghost text-xs flex items-center gap-1"
          style={{ padding: '3px 8px' }}
        >
          {patchesLoading
            ? <Loader2 size={11} className="animate-spin" />
            : '刷新'}
        </button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
        {patchesLoading && patches.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8" style={{ color: '#9ca3af' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: '#c9a227' }} />
            <span className="text-sm">加载中…</span>
          </div>
        )}

        {!patchesLoading && patchesError && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertCircle size={18} style={{ color: '#ef4444' }} />
            <p className="text-xs" style={{ color: '#dc2626' }}>{patchesError}</p>
            <button onClick={() => loadPatches(baseId)} className="btn-ghost text-xs">重试</button>
          </div>
        )}

        {!patchesLoading && !patchesError && patches.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center select-none">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: '#ffffff', border: '2px dashed #e5e7eb' }}
            >
              <ClipboardCheck size={18} style={{ color: '#c9a227', opacity: 0.5 }} />
            </div>
            <p className="text-xs" style={{ color: '#9ca3af' }}>
              暂无沉淀(运行任务后会自动产出 proposal)
            </p>
          </div>
        )}

        {patches.map((patch) => (
          <PatchRow
            key={patch.id}
            patch={patch}
            onAccept={() => handleReview(patch.id, 'accept')}
            onReject={() => handleReview(patch.id, 'reject')}
          />
        ))}
      </div>
    </div>
  )
}

// ─── KnowledgePage ────────────────────────────────────────────────────────────

type DialogType = 'none' | 'createBase' | 'createVersion'

const KnowledgePage: React.FC = () => {
  const {
    bases, loading, error, fetchAll,
    selectedBase, versions, versionsLoading, versionsError,
    viewedVersion, viewedVersionLoading,
    selectBase, addVersion, fetchVersionContent, clearViewedVersion,
  } = useBasesStore()

  const { createBase } = useBasesStore()

  const [dialog, setDialog] = useState<DialogType>('none')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Diff selection: up to 2 versions; toggle on click
  const [diffSelections, setDiffSelections] = useState<number[]>([])
  // Diff contents for comparison
  const [diffContents, setDiffContents] = useState<[BaseVersionWithContent, BaseVersionWithContent] | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => { fetchAll() }, [fetchAll])

  // Reset diff when base changes
  useEffect(() => {
    setDiffSelections([])
    setDiffContents(null)
  }, [selectedBase?.id])

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 2500)
  }

  const closeDialog = useCallback(() => {
    setDialog('none')
    setSubmitError(null)
  }, [])

  const handleCreateBase = useCallback(async (data: KnowledgeBaseCreate) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await createBase(data)
      flash('知识库已创建')
      closeDialog()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '操作失败')
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [createBase, closeDialog])

  const handleCreateVersion = useCallback(async (data: BaseVersionCreate) => {
    if (!selectedBase) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await addVersion(selectedBase.id, data)
      flash('版本已发布')
      closeDialog()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '操作失败')
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [selectedBase, addVersion, closeDialog])

  const handleViewVersion = useCallback(async (baseId: string, version: number) => {
    try {
      await fetchVersionContent(baseId, version)
    } catch {
      // error handled silently; could add toast
    }
  }, [fetchVersionContent])

  const handleSelectDiff = useCallback((version: number) => {
    setDiffSelections((prev) => {
      if (prev.includes(version)) {
        return prev.filter((v) => v !== version)
      }
      if (prev.length >= 2) {
        return [prev[1], version]
      }
      return [...prev, version]
    })
  }, [])

  const handleRunDiff = useCallback(async () => {
    if (!selectedBase || diffSelections.length !== 2) return
    setDiffLoading(true)
    try {
      const [a, b] = await Promise.all([
        getVersion(selectedBase.id, Math.min(...diffSelections)),
        getVersion(selectedBase.id, Math.max(...diffSelections)),
      ])
      setDiffContents([a, b])
    } catch {
      // silently ignore
    } finally {
      setDiffLoading(false)
    }
  }, [selectedBase, diffSelections])

  return (
    <div className="flex flex-col h-full" style={{ background: '#f8f9fa' }}>
      {/* 页头 */}
      <div
        className="flex items-center justify-between px-6 py-5 bg-white shrink-0"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f3f4f6' }}>
            <BookOpen size={17} style={{ color: '#374151' }} />
          </div>
          <div>
            <h1 className="font-semibold text-base" style={{ color: '#111827' }}>Knowledge</h1>
            <p className="text-xs" style={{ color: '#9ca3af' }}>知识库版本管理</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          <button
            onClick={() => { setSubmitError(null); setDialog('createBase') }}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Plus size={14} />
            新建知识库
          </button>
        </div>
      </div>

      {/* 主内容: 左右分栏 */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── 左栏: 知识库列表 ── */}
        <div
          className="w-72 shrink-0 flex flex-col overflow-hidden bg-white"
          style={{ borderRight: '1px solid #e5e7eb' }}
        >
          <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #f3f4f6' }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#9ca3af' }}>
              知识库 ({bases.length})
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* 加载 */}
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12" style={{ color: '#9ca3af' }}>
                <Loader2 size={18} className="animate-spin" style={{ color: '#c9a227' }} />
                <span className="text-sm">加载中…</span>
              </div>
            )}

            {/* 错误 */}
            {!loading && error && (
              <div className="flex flex-col items-center gap-3 py-12 text-center px-2">
                <AlertCircle size={24} style={{ color: '#ef4444' }} />
                <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>
                <button onClick={fetchAll} className="btn-ghost text-xs">重试</button>
              </div>
            )}

            {/* 空状态 */}
            {!loading && !error && bases.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center select-none">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: '#ffffff', border: '2px dashed #e5e7eb' }}
                >
                  <Plus size={20} style={{ color: '#c9a227', opacity: 0.6 }} />
                </div>
                <p className="text-sm" style={{ color: '#9ca3af' }}>还没有知识库</p>
              </div>
            )}

            {/* 卡片列表 */}
            {!loading && !error && bases.map((base) => (
              <BaseCard
                key={base.id}
                base={base}
                selected={selectedBase?.id === base.id}
                onClick={() => selectBase(base)}
              />
            ))}
          </div>
        </div>

        {/* ── 右栏: 版本列表 + 内容 ── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedBase ? (
            /* 未选中 base 的空态 */
            <div className="flex flex-col items-center justify-center h-full gap-4 select-none">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                <FileText size={28} style={{ color: '#c9a227', opacity: 0.5 }} />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm" style={{ color: '#374151' }}>选择左侧知识库</p>
                <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>查看版本历史与内容</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* 版本列表 + Patch审核 */}
              <div className="w-80 shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid #e5e7eb' }}>
                {/* 版本栏头 */}
                <div
                  className="px-4 py-3 bg-white shrink-0 flex items-center justify-between"
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                >
                  <div>
                    <p className="text-sm font-semibold truncate" style={{ color: '#111827' }}>{selectedBase.id}</p>
                    <p className="text-xs" style={{ color: '#9ca3af' }}>
                      {versions.length} 个版本
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {diffSelections.length === 2 && (
                      <button
                        onClick={handleRunDiff}
                        disabled={diffLoading}
                        className="btn-ghost text-xs flex items-center gap-1"
                        style={{ padding: '4px 8px' }}
                      >
                        {diffLoading
                          ? <Loader2 size={12} className="animate-spin" />
                          : <GitCompare size={12} />}
                        对比
                      </button>
                    )}
                    <button
                      onClick={() => { setSubmitError(null); setDialog('createVersion') }}
                      className="btn-primary text-xs flex items-center gap-1"
                      style={{ padding: '5px 10px' }}
                    >
                      <Plus size={12} />
                      新增版本
                    </button>
                  </div>
                </div>

                {/* Diff 操作提示 */}
                {diffSelections.length > 0 && (
                  <div
                    className="px-4 py-2 text-xs flex items-center gap-2 shrink-0"
                    style={{ background: '#fdf8e7', borderBottom: '1px solid #f5d76e', color: '#a8841e' }}
                  >
                    <GitCompare size={11} />
                    <span>
                      已选 {diffSelections.length}/2 版本
                      {diffSelections.map((v, i) => (
                        <span key={v}>
                          {' '}<span className="font-bold">{i === 0 ? 'A' : 'B'}=v{v}</span>
                        </span>
                      ))}
                    </span>
                    <button
                      onClick={() => setDiffSelections([])}
                      className="ml-auto transition-colors"
                      style={{ color: '#c9a227' }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-3">
                  {/* 版本加载 */}
                  {versionsLoading && (
                    <div className="flex items-center justify-center gap-2 py-12" style={{ color: '#9ca3af' }}>
                      <Loader2 size={16} className="animate-spin" style={{ color: '#c9a227' }} />
                      <span className="text-sm">加载版本…</span>
                    </div>
                  )}

                  {/* 版本错误 */}
                  {!versionsLoading && versionsError && (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <AlertCircle size={20} style={{ color: '#ef4444' }} />
                      <p className="text-xs" style={{ color: '#dc2626' }}>{versionsError}</p>
                    </div>
                  )}

                  {/* 无版本 */}
                  {!versionsLoading && !versionsError && versions.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-16 text-center select-none">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: '#ffffff', border: '2px dashed #e5e7eb' }}
                      >
                        <Plus size={16} style={{ color: '#c9a227', opacity: 0.6 }} />
                      </div>
                      <p className="text-xs" style={{ color: '#9ca3af' }}>暂无版本,点击「新增版本」</p>
                    </div>
                  )}

                  {/* 版本列表 */}
                  {!versionsLoading && !versionsError && versions.length > 0 && (
                    <div className="space-y-1">
                      {versions.map((v) => (
                        <VersionRow
                          key={v.version}
                          version={v}
                          isActive={v.version === selectedBase.activeVersion}
                          isSelected={viewedVersion?.version === v.version}
                          isDiffA={diffSelections[0] === v.version}
                          isDiffB={diffSelections[1] === v.version}
                          onView={() => handleViewVersion(selectedBase.id, v.version)}
                          onSelectDiff={() => handleSelectDiff(v.version)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Patch 审核区 */}
                <PatchReviewPanel baseId={selectedBase.id} />
              </div>

              {/* 内容查看面板 */}
              <div className="flex-1 overflow-hidden flex flex-col" style={{ background: '#f8f9fa' }}>
                {viewedVersionLoading ? (
                  <div className="flex items-center justify-center h-full gap-2" style={{ color: '#9ca3af' }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: '#c9a227' }} />
                    <span className="text-sm">加载内容…</span>
                  </div>
                ) : viewedVersion ? (
                  <>
                    {/* 内容头 */}
                    <div
                      className="px-5 py-3 bg-white shrink-0 flex items-center justify-between"
                      style={{ borderBottom: '1px solid #e5e7eb' }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold" style={{ color: '#111827' }}>
                          v{viewedVersion.version}
                        </span>
                        {(() => {
                          const badge = statusBadge(viewedVersion.status, viewedVersion.version === selectedBase.activeVersion)
                          return (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded font-medium"
                              style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                            >
                              {badge.label}
                            </span>
                          )
                        })()}
                        <span className="font-mono text-xs" style={{ color: '#9ca3af' }}>
                          {viewedVersion.fingerprint.slice(0, 12)}
                        </span>
                      </div>
                      <button
                        onClick={clearViewedVersion}
                        className="w-6 h-6 rounded flex items-center justify-center"
                        style={{ color: '#9ca3af' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#374151' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af' }}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* 内容正文 */}
                    <div className="flex-1 overflow-y-auto p-5">
                      <pre
                        className="text-sm leading-relaxed rounded-xl p-5 overflow-x-auto"
                        style={{
                          fontFamily: '"Fira Mono", "Cascadia Code", "Consolas", monospace',
                          background: '#ffffff',
                          border: '1px solid #e5e7eb',
                          color: '#374151',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {viewedVersion.content}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
                    <Eye size={28} style={{ color: '#d1d5db' }} />
                    <p className="text-sm" style={{ color: '#9ca3af' }}>点击版本行的眼睛图标查看内容</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 */}
      <AnimatePresence>
        {dialog === 'createBase' && (
          <CreateBaseModal
            key="createBase"
            onSubmit={handleCreateBase}
            onClose={closeDialog}
            submitting={submitting}
            submitError={submitError}
          />
        )}
        {dialog === 'createVersion' && (
          <CreateVersionModal
            key="createVersion"
            onSubmit={handleCreateVersion}
            onClose={closeDialog}
            submitting={submitting}
            submitError={submitError}
          />
        )}
        {diffContents && (
          <VersionDiffPanel
            key="diff"
            versionA={diffContents[0]}
            versionB={diffContents[1]}
            onClose={() => setDiffContents(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default KnowledgePage
