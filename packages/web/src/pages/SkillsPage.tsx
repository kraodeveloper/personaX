import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, X, Upload,
  AlertCircle, Loader2, CheckCircle, Wrench,
} from 'lucide-react'
import type { SkillDef, SkillCreate, SkillUpdate, SkillImport } from '@personax/contracts'
import { useSkillsStore } from '../store/skills'
import { ApiError } from '../api/skills'

// ─── helpers ──────────────────────────────────────────────────────────────────

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

const monoStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: '"Fira Mono", "Cascadia Code", "Consolas", monospace',
  fontSize: 13,
  lineHeight: '1.6',
  resize: 'vertical',
}

// ─── source badge ─────────────────────────────────────────────────────────────

const SOURCE_COLORS = {
  imported: { bg: '#eff6ff', color: '#3b82f6' },
  builtin:  { bg: '#f5f3ff', color: '#8b5cf6' },
}

// ─── Enabled Toggle ───────────────────────────────────────────────────────────

interface EnabledToggleProps {
  enabled: boolean
  onChange: (v: boolean) => void
  loading?: boolean
}

const EnabledToggle: React.FC<EnabledToggleProps> = ({ enabled, onChange, loading }) => (
  <button
    type="button"
    disabled={loading}
    onClick={(e) => { e.stopPropagation(); onChange(!enabled) }}
    className="relative flex-shrink-0 transition-opacity"
    style={{ opacity: loading ? 0.5 : 1 }}
    title={enabled ? '已启用,点击停用' : '已停用,点击启用'}
  >
    <div
      className="w-9 h-5 rounded-full transition-colors duration-200"
      style={{ background: enabled ? '#c9a227' : '#e5e7eb' }}
    />
    <div
      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
      style={{ transform: enabled ? 'translateX(20px)' : 'translateX(2px)' }}
    />
  </button>
)

// ─── Skill Card ───────────────────────────────────────────────────────────────

interface SkillCardProps {
  skill: SkillDef
  index: number
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  toggling: boolean
}

const SkillCard = React.forwardRef<HTMLDivElement, SkillCardProps>(({ skill, index, onEdit, onDelete, onToggle, toggling }, ref) => {
  const badge = SOURCE_COLORS[skill.source]

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.04, duration: 0.22, ease: 'easeOut' }}
      className="relative group bg-white rounded-xl p-5 cursor-default"
      style={{
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
        e.currentTarget.style.borderColor = '#d1d5db'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
        e.currentTarget.style.borderColor = '#e5e7eb'
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#f3f4f6' }}
          >
            <Wrench size={16} style={{ color: '#374151' }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate" style={{ color: '#111827' }}>
              {skill.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                className="inline-block text-xs px-1.5 py-0.5 rounded font-medium"
                style={{ background: badge.bg, color: badge.color }}
              >
                {skill.source}
              </span>
              {!skill.enabled && (
                <span
                  className="inline-block text-xs px-1.5 py-0.5 rounded"
                  style={{ background: '#f3f4f6', color: '#9ca3af' }}
                >
                  disabled
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0 ml-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onEdit}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            title="编辑内容"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <Pencil size={13} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onDelete}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            title="删除"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <Trash2 size={13} />
          </motion.button>
        </div>
      </div>

      {/* ID */}
      <p className="text-xs font-mono mb-3 truncate" style={{ color: '#9ca3af' }}>{skill.id}</p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid #f3f4f6' }}>
        <span className="text-xs truncate max-w-[200px]" style={{ color: '#9ca3af' }}>
          {skill.path.replace(/\\/g, '/').split('/').slice(-3).join('/')}
        </span>
        <EnabledToggle enabled={skill.enabled} onChange={onToggle} loading={toggling} />
      </div>
    </motion.div>
  )
})
SkillCard.displayName = 'SkillCard'

// ─── Create / Import Dialog ───────────────────────────────────────────────────

type CreateMode = 'import' | 'new'

interface CreateSkillDialogProps {
  onClose: () => void
  onCreate: (data: SkillCreate) => Promise<void>
  onImport: (data: SkillImport) => Promise<void>
  submitting: boolean
  submitError: string | null
}

const CreateSkillDialog: React.FC<CreateSkillDialogProps> = ({
  onClose, onCreate, onImport, submitting, submitError,
}) => {
  const [mode, setMode] = useState<CreateMode>('import')
  const [content, setContent] = useState('')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'import') {
      onImport({
        content,
        id: id.trim() || undefined,
        name: name.trim() || undefined,
      })
    } else {
      onCreate({ id, name, content, enabled })
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    background: active ? '#111827' : 'transparent',
    color: active ? '#ffffff' : '#6b7280',
    transition: 'all 0.15s',
  })

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
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-base" style={{ color: '#111827' }}>添加 Skill</h2>
            <div
              className="flex items-center gap-1 p-1 rounded-lg"
              style={{ background: '#f3f4f6' }}
            >
              <button style={tabStyle(mode === 'import')} onClick={() => setMode('import')}>
                导入 SKILL.md
              </button>
              <button style={tabStyle(mode === 'new')} onClick={() => setMode('new')}>
                新建
              </button>
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

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {mode === 'import' && (
            <>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                粘贴 SKILL.md 全文(含 YAML frontmatter)。留空 id/name 则由服务端从 frontmatter 解析。
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" style={{ color: '#374151' }}>
                    ID <span style={{ color: '#9ca3af', fontWeight: 400 }}>(可选)</span>
                  </label>
                  <input
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="从 frontmatter 自动解析"
                    style={inputStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" style={{ color: '#374151' }}>
                    Name <span style={{ color: '#9ca3af', fontWeight: 400 }}>(可选)</span>
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="从 frontmatter 自动解析"
                    style={inputStyle}
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'new' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: '#374151' }}>
                  ID <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  required
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="my-skill-id"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: '#374151' }}>
                  Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Skill"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#374151' }}>
              Content (SKILL.md){mode === 'new' ? <span style={{ color: '#ef4444' }}> *</span> : ''}
            </label>
            <textarea
              required
              rows={16}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={mode === 'import'
                ? '粘贴 SKILL.md 全文(YAML frontmatter + Markdown 内容)...'
                : '输入 SKILL.md 内容...'}
              style={monoStyle}
            />
          </div>

          {mode === 'new' && (
            <div className="flex items-center gap-3">
              <EnabledToggle enabled={enabled} onChange={setEnabled} />
              <span className="text-sm" style={{ color: '#374151' }}>
                {enabled ? '启用' : '停用'}
              </span>
            </div>
          )}

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
              {mode === 'import' ? '导入' : '创建'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Edit Skill Dialog ────────────────────────────────────────────────────────

interface EditSkillDialogProps {
  skillId: string
  onClose: () => void
  onSave: (id: string, data: SkillUpdate) => Promise<void>
  submitting: boolean
  submitError: string | null
}

const EditSkillDialog: React.FC<EditSkillDialogProps> = ({
  skillId, onClose, onSave, submitting, submitError,
}) => {
  const { selectedSkill, selectedLoading, fetchSkill } = useSkillsStore()
  const [content, setContent] = useState('')
  const [name, setName] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetchSkill(skillId).then(() => setLoaded(true)).catch(() => setLoaded(true))
  }, [skillId, fetchSkill])

  useEffect(() => {
    if (selectedSkill && selectedSkill.id === skillId) {
      setContent(selectedSkill.content)
      setName(selectedSkill.name)
    }
  }, [selectedSkill, skillId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(skillId, {
      name: name.trim() || undefined,
      content: content || undefined,
    })
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
        className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <div>
            <h2 className="font-semibold text-base" style={{ color: '#111827' }}>
              编辑 Skill
            </h2>
            <p className="text-xs font-mono mt-0.5" style={{ color: '#9ca3af' }}>{skillId}</p>
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

        {!loaded || selectedLoading ? (
          <div className="flex items-center justify-center gap-3 py-20" style={{ color: '#9ca3af' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#c9a227' }} />
            <span className="text-sm">加载内容…</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="px-6 py-4 space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: '#374151' }}>Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div className="space-y-1.5 flex flex-col flex-1">
                <label className="text-sm font-medium" style={{ color: '#374151' }}>
                  Content (SKILL.md)
                </label>
                <textarea
                  rows={20}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  style={monoStyle}
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
            </div>

            <div
              className="flex justify-end gap-3 px-6 py-4 shrink-0"
              style={{ borderTop: '1px solid #f3f4f6' }}
            >
              <button type="button" onClick={onClose} className="btn-ghost text-sm">取消</button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                保存
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  skill: SkillDef
  onConfirm: () => Promise<void>
  onClose: () => void
  deleting: boolean
}

const DeleteConfirm: React.FC<DeleteConfirmProps> = ({ skill, onConfirm, onClose, deleting }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="bg-white rounded-xl w-full max-w-sm p-6 space-y-4"
      style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}
    >
      <div className="flex items-center gap-3" style={{ color: '#dc2626' }}>
        <Trash2 size={18} />
        <h3 className="font-semibold text-base">确认删除</h3>
      </div>
      <p className="text-sm" style={{ color: '#6b7280' }}>
        即将删除 Skill{' '}
        <span className="font-semibold" style={{ color: '#111827' }}>{skill.name}</span>
        {' '}<span className="font-mono text-xs" style={{ color: '#9ca3af' }}>({skill.id})</span>，此操作不可撤销。
      </p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost text-sm">取消</button>
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="btn-danger text-sm flex items-center gap-2"
        >
          {deleting && <Loader2 size={14} className="animate-spin" />}
          删除
        </button>
      </div>
    </motion.div>
  </div>
)

// ─── SkillsPage ───────────────────────────────────────────────────────────────

type DialogState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; skill: SkillDef }
  | { type: 'delete'; skill: SkillDef }

const SkillsPage: React.FC = () => {
  const { skills, loading, error, fetchAll, create, import: importSkillFn, update, remove, clearSelected } = useSkillsStore()
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

  useEffect(() => { fetchAll() }, [fetchAll])

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 2500)
  }

  const closeDialog = useCallback(() => {
    setDialog({ type: 'none' })
    setSubmitError(null)
    clearSelected()
  }, [clearSelected])

  const handleCreate = useCallback(async (data: SkillCreate) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await create(data)
      flash('Skill 已创建')
      closeDialog()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '操作失败')
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [create, closeDialog])

  const handleImport = useCallback(async (data: SkillImport) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await importSkillFn(data)
      flash('Skill 已导入')
      closeDialog()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '操作失败')
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [importSkillFn, closeDialog])

  const handleSave = useCallback(async (id: string, data: SkillUpdate) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await update(id, data)
      flash('Skill 已更新')
      closeDialog()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '操作失败')
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [update, closeDialog])

  const handleDelete = useCallback(async () => {
    if (dialog.type !== 'delete') return
    setSubmitting(true)
    try {
      await remove(dialog.skill.id)
      flash(`已删除 ${dialog.skill.name}`)
      closeDialog()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [dialog, remove, closeDialog])

  const handleToggle = useCallback(async (skill: SkillDef, enabled: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(skill.id))
    try {
      await update(skill.id, { enabled })
    } catch {
      // silently ignore toggle failure; list will reflect server truth on next fetch
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev)
        next.delete(skill.id)
        return next
      })
    }
  }, [update])

  return (
    <div className="flex flex-col h-full" style={{ background: '#f8f9fa' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-5 bg-white shrink-0"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: '#f3f4f6' }}
          >
            <Wrench size={17} style={{ color: '#374151' }} />
          </div>
          <div>
            <h1 className="font-semibold text-base" style={{ color: '#111827' }}>Skills</h1>
            <p className="text-xs" style={{ color: '#9ca3af' }}>管理 Claude Code Skill 定义</p>
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
            onClick={() => { setSubmitError(null); setDialog({ type: 'create' }) }}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Upload size={14} />
            导入 / 新建
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-20" style={{ color: '#9ca3af' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: '#c9a227' }} />
            <span>加载中…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <AlertCircle size={32} style={{ color: '#ef4444' }} />
            <p className="text-sm" style={{ color: '#dc2626' }}>{error}</p>
            <button onClick={fetchAll} className="btn-ghost text-sm">重试</button>
          </div>
        )}

        {!loading && !error && skills.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-24 text-center select-none">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: '#ffffff', border: '2px dashed #e5e7eb' }}
            >
              <Plus size={28} style={{ color: '#c9a227', opacity: 0.6 }} />
            </div>
            <div>
              <p className="font-medium" style={{ color: '#374151' }}>还没有 Skill</p>
              <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>点击「导入 / 新建」开始</p>
            </div>
          </div>
        )}

        {!loading && !error && skills.length > 0 && (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {skills.map((skill, i) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  index={i}
                  onEdit={() => { setSubmitError(null); setDialog({ type: 'edit', skill }) }}
                  onDelete={() => { setSubmitError(null); setDialog({ type: 'delete', skill }) }}
                  onToggle={(enabled) => handleToggle(skill, enabled)}
                  toggling={togglingIds.has(skill.id)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Dialogs */}
      <AnimatePresence>
        {dialog.type === 'create' && (
          <CreateSkillDialog
            key="create"
            onClose={closeDialog}
            onCreate={handleCreate}
            onImport={handleImport}
            submitting={submitting}
            submitError={submitError}
          />
        )}
        {dialog.type === 'edit' && (
          <EditSkillDialog
            key="edit"
            skillId={dialog.skill.id}
            onClose={closeDialog}
            onSave={handleSave}
            submitting={submitting}
            submitError={submitError}
          />
        )}
        {dialog.type === 'delete' && (
          <DeleteConfirm
            key="delete"
            skill={dialog.skill}
            onConfirm={handleDelete}
            onClose={closeDialog}
            deleting={submitting}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default SkillsPage
