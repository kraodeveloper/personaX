import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Bot,
  BookOpen,
  Wrench,
  Server,
  Settings,
  Users,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import AgentsPage from './pages/AgentsPage'
import KnowledgePage from './pages/KnowledgePage'
import SkillsPage from './pages/SkillsPage'
import McpPage from './pages/McpPage'
import RunPage from './pages/RunPage'
import PlaceholderPage from './pages/PlaceholderPage'
import SettingsPage from './pages/SettingsPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAgentsStore } from './store/agents'

// ─── 导航配置 ─────────────────────────────────────────────────────────────────

type ViewId = 'run' | 'agents' | 'knowledge' | 'skills' | 'mcp' | 'team' | 'settings'

interface NavItem {
  id: ViewId
  label: string
  icon: React.ReactNode
  slice: number
}

const NAV_ITEMS: NavItem[] = [
  { id: 'run',       label: 'Run',       icon: <Play size={15} />,      slice: 2 },
  { id: 'agents',    label: 'Agents',    icon: <Bot size={15} />,       slice: 1 },
  { id: 'knowledge', label: 'Knowledge', icon: <BookOpen size={15} />,  slice: 3 },
  { id: 'skills',    label: 'Skills',    icon: <Wrench size={15} />,    slice: 4 },
  { id: 'mcp',       label: 'MCP',       icon: <Server size={15} />,    slice: 5 },
  { id: 'team',      label: 'Team',      icon: <Users size={15} />,     slice: 7 },
  { id: 'settings',  label: 'Settings',  icon: <Settings size={15} />,  slice: 6 },
]

// Kind dot colors (matches AgentsPage KIND_COLORS)
const KIND_COLORS: Record<string, string> = {
  lead:             '#c9a227',
  business_domain:  '#3b82f6',
  technical_domain: '#8b5cf6',
  worker:           '#10b981',
}

// ─── 侧边栏 (agentX light style) ─────────────────────────────────────────────

interface SidebarProps {
  current: ViewId
  onSelect: (id: ViewId) => void
}

const Sidebar: React.FC<SidebarProps> = ({ current, onSelect }) => {
  const { agents, fetchAll, setFocusAgent, setFilterGroup } = useAgentsStore()

  // Fetch agents on mount for sidebar submenu
  useEffect(() => { fetchAll() }, [fetchAll])

  // Agents open/collapse state
  const [agentsOpen, setAgentsOpen] = useState(false)
  // Per-group open state: groupKey -> boolean
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  // Derive groups from agents
  const groupedAgents = useMemo(() => {
    const map: Record<string, typeof agents> = {}
    for (const agent of agents) {
      const key = agent.group || '__ungrouped__'
      if (!map[key]) map[key] = []
      map[key].push(agent)
    }
    return map
  }, [agents])

  // Sorted group keys: named groups first (alpha), then __ungrouped__
  const groupKeys = useMemo(() => {
    const keys = Object.keys(groupedAgents)
    return [
      ...keys.filter((k) => k !== '__ungrouped__').sort(),
      ...(keys.includes('__ungrouped__') ? ['__ungrouped__'] : []),
    ]
  }, [groupedAgents])

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleGroupClick = (groupKey: string) => {
    toggleGroup(groupKey) // 点分组名即展开/折叠它的 agent(与点 Agents tab 行为一致)
    setFilterGroup(groupKey)
    setFocusAgent(null)
    onSelect('agents')
  }

  const handleAgentClick = (agentId: string) => {
    setFilterGroup(null)
    setFocusAgent(agentId)
    onSelect('agents')
  }

  return (
    <aside
      className="flex flex-col w-48 shrink-0 h-full bg-white"
      style={{ borderRight: '1px solid #e5e7eb' }}
    >
      {/* Logo */}
      <div
        className="px-5 py-5 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid #f3f4f6' }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: '#18181b' }}
        >
          <span className="text-xs font-bold text-white tracking-tight">PX</span>
        </div>
        <div>
          <div className="font-semibold text-sm" style={{ color: '#111827', letterSpacing: '-0.01em' }}>
            personaX
          </div>
          <div className="text-xs" style={{ color: '#9ca3af' }}>Agent Registry</div>
        </div>
      </div>

      {/* 导航项 */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = item.id === current

          if (item.id === 'agents') {
            return (
              <div key="agents">
                {/* Agents row */}
                <div
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors duration-150 cursor-pointer"
                  style={{
                    background: active ? '#f3f4f6' : 'transparent',
                    color: active ? '#111827' : '#6b7280',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = '#f9fafb'
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {/* Click icon+label → navigate to agents view + 展开子菜单(箭头用于折叠) */}
                  <button
                    className="flex items-center gap-2.5 flex-1 text-left cursor-pointer bg-transparent border-0 p-0"
                    style={{ color: 'inherit' }}
                    onClick={() => { onSelect('agents'); setAgentsOpen((v) => !v) }}
                  >
                    <Bot size={15} />
                    <span className="text-sm font-medium">Agents</span>
                  </button>
                  {active && !agentsOpen && (
                    <motion.div
                      layoutId="nav-dot"
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: '#c9a227' }}
                    />
                  )}
                  {/* Toggle arrow */}
                  {agents.length > 0 && (
                    <button
                      className="flex-shrink-0 p-0.5 rounded transition-colors bg-transparent border-0 cursor-pointer"
                      style={{ color: '#9ca3af' }}
                      onClick={(e) => { e.stopPropagation(); setAgentsOpen((v) => !v) }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#374151' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af' }}
                      title={agentsOpen ? '折叠' : '展开'}
                    >
                      {agentsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                  )}
                </div>

                {/* Submenu: groups */}
                <AnimatePresence initial={false}>
                  {agentsOpen && groupKeys.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="pl-3 pt-0.5 space-y-0.5">
                        {groupKeys.map((groupKey) => {
                          const groupAgents = groupedAgents[groupKey]
                          const label = groupKey === '__ungrouped__' ? '未分组' : groupKey
                          const isGroupOpen = openGroups[groupKey] ?? false

                          return (
                            <div key={groupKey}>
                              {/* Group row */}
                              <div
                                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors duration-100 cursor-pointer"
                                style={{ color: '#6b7280' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                              >
                                <button
                                  className="flex items-center gap-1.5 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer text-xs font-medium truncate"
                                  style={{ color: 'inherit' }}
                                  onClick={() => handleGroupClick(groupKey)}
                                  title={label}
                                >
                                  <span className="truncate">{label}</span>
                                  <span
                                    className="flex-shrink-0 text-xs"
                                    style={{ color: '#d1d5db' }}
                                  >
                                    {groupAgents.length}
                                  </span>
                                </button>
                                <button
                                  className="flex-shrink-0 p-0.5 rounded bg-transparent border-0 cursor-pointer transition-colors"
                                  style={{ color: '#d1d5db' }}
                                  onClick={() => toggleGroup(groupKey)}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = '#9ca3af' }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = '#d1d5db' }}
                                >
                                  {isGroupOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                </button>
                              </div>

                              {/* Agents under group */}
                              <AnimatePresence initial={false}>
                                {isGroupOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.15, ease: 'easeOut' }}
                                    style={{ overflow: 'hidden' }}
                                  >
                                    <div className="pl-3 pt-0.5 space-y-0.5">
                                      {groupAgents.map((agent) => (
                                        <button
                                          key={agent.id}
                                          className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-left transition-colors duration-100 bg-transparent border-0 cursor-pointer"
                                          style={{ color: '#6b7280' }}
                                          onClick={() => handleAgentClick(agent.id)}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#f9fafb'
                                            e.currentTarget.style.color = '#374151'
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'transparent'
                                            e.currentTarget.style.color = '#6b7280'
                                          }}
                                          title={agent.id}
                                        >
                                          {/* Kind color dot */}
                                          <span
                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                            style={{ background: KIND_COLORS[agent.kind] ?? '#9ca3af' }}
                                          />
                                          <span className="text-xs truncate">{agent.name}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          }

          // Other nav items — unchanged flat style
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors duration-150 cursor-pointer text-left"
              style={{
                background: active ? '#f3f4f6' : 'transparent',
                color: active ? '#111827' : '#6b7280',
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = '#f9fafb'
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent'
              }}
            >
              {item.icon}
              <span className="text-sm font-medium">{item.label}</span>
              {active && (
                <motion.div
                  layoutId="nav-dot"
                  className="ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ background: '#c9a227' }}
                />
              )}
            </motion.button>
          )
        })}
      </nav>

      {/* 底部版本 */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid #f3f4f6' }}>
        <div className="text-xs" style={{ color: '#d1d5db' }}>Slice 1 · 2025</div>
      </div>
    </aside>
  )
}

// ─── 视图路由 ─────────────────────────────────────────────────────────────────

const ViewContent: React.FC<{ view: ViewId }> = ({ view }) => {
  if (view === 'run') return <RunPage />
  if (view === 'agents') return <AgentsPage />
  if (view === 'knowledge') return <KnowledgePage />
  if (view === 'skills') return <SkillsPage />
  if (view === 'mcp') return <McpPage />
  if (view === 'team') return <PlaceholderPage name="Team" slice={7} />
  if (view === 'settings') return <SettingsPage />

  const item = NAV_ITEMS.find((n) => n.id === view)!
  return <PlaceholderPage name={item.label} slice={item.slice} />
}

// ─── App 根组件 ───────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewId>('agents')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8f9fa' }}>
      <Sidebar current={currentView} onSelect={setCurrentView} />

      {/* 主内容区。仅做挂载淡入(无 exit / 无 mode="wait"),避免快速切换时 AnimatePresence 等待 exit 卡死导致白屏。 */}
      <main className="flex-1 overflow-hidden">
        <motion.div
          key={currentView}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="h-full"
        >
          <ErrorBoundary key={currentView}>
            <ViewContent view={currentView} />
          </ErrorBoundary>
        </motion.div>
      </main>
    </div>
  )
}

export default App
