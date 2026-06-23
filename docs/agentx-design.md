# agentX Design Token Reference for personaX

## Core Tokens

| Token | Value | Usage |
|---|---|---|
| body background | `#f8f9fa` | App shell, page backgrounds |
| surface (card) | `#ffffff` + border `#e5e7eb` | Cards, modals, sidebar |
| surface-subtle | `#f8f9fa` + border `#e5e7eb` | Inset sections, tag containers |
| text primary | `#111827` | Headings, active nav |
| text secondary | `#374151` | Labels, sub-headings |
| text muted | `#6b7280` | Body copy, descriptions |
| text placeholder | `#9ca3af` | Inputs, meta info |
| text subtle | `#d1d5db` | Dividers, footer notes |
| border default | `#e5e7eb` | Cards, inputs |
| border hover | `#d1d5db` | Card hover state |
| hover bg | `#f9fafb` | Nav item hover |
| active bg | `#f3f4f6` | Nav item active, model badge |
| gold-500 | `#c9a227` | Gold accent (nav dot, spinner, icons) |
| gold-400 | `#d4a827` | Gradient start |
| gold-600 | `#a8841e` | Gradient end |
| sidebar bg | `#ffffff` | Sidebar fill |
| sidebar border | `#e5e7eb` | Sidebar right edge |
| nav dot | `#c9a227` (gold) | Active route indicator |
| font | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | All text |
| font size base | `14px` | Body |
| scrollbar width | `5px` | Thin scrollbar |
| scrollbar thumb | `#d1d5db` / hover `#9ca3af` | Scrollbar thumb |

## Kind Badge Colors (personaX AgentKind)

| kind | color | bg |
|---|---|---|
| lead | `#c9a227` (gold) | `#fdf8e7` |
| business_domain | `#3b82f6` (blue) | `#eff6ff` |
| technical_domain | `#8b5cf6` (purple) | `#f5f3ff` |
| worker | `#10b981` (green) | `#f0fdf4` |

## agentX → personaX Component Mapping

| agentX component | personaX equivalent | Notes |
|---|---|---|
| `Sidebar.tsx` | `App.tsx` inline `<Sidebar>` | Simplified: no sub-lists, no router. Same white bg + `#e5e7eb` border + `#f3f4f6` active bg + gold nav dot via `motion.div layoutId` |
| `AgentCard.tsx` | `AgentsPage.tsx` inline `AgentCard` | Initials avatar colored by kind. No `model` field → shows kind badge instead. Footer shows version/skills count/mcp count/status dot |
| `AgentDrawer.tsx` | `AgentsPage.tsx` inline `AgentForm` | Centered modal instead of right-drawer (no router context). Spring animation. Same field structure adapted to `AgentDefinition` |
| `AgentsPage.tsx` | `AgentsPage.tsx` | Header with Bot icon + "New Agent" dark button. Responsive 1/2/3-col grid |
| `Layout.tsx` | `App.tsx` root div | `flex h-screen`, bg `#f8f9fa`, sidebar + `<main>` |

## For Future Run Page — Reusable agentX Patterns

- **ThinkingPanel** (`agentX/frontend/src/components/agents/AgentDrawer.tsx` pattern): sliding right panel with spring animation from `x: '100%'`. Can be adapted for Run's agent execution status.
- **RunGraph / Chat**: agentX has `frontend/src/pages/` with a chat view. The `flow-dash` animation keyframe (already in personaX tailwind) is for SVG graph edges.
- **pulse-gold** animation: already in tailwind config — use on agent status indicators when "running".
- **Color-coded agent avatars**: `KIND_COLORS` in AgentsPage maps kind → color. RunGraph nodes can reuse same palette.
