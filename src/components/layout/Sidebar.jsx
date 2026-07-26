import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  Sun,
  Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'
import LogoBadge from '@/components/ui/LogoBadge'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/library',   icon: BookOpen,        label: 'Resources' },
]

/**
 * App rail.
 *
 * Structured as four visually distinct zones rather than one flat column, so
 * it reads as a designed sidebar instead of a solid slab of colour:
 *
 *   1. Brand header — sits on its own raised surface with a divider under it.
 *   2. Nav          — recessed surface (the rail's base tone), with a section
 *                     label; the active item is a solid GVSU-blue pill, which
 *                     is the one strong colour moment in the whole rail.
 *   3. Utilities    — divided off from the nav so the theme toggle doesn't
 *                     read as a third navigation destination.
 *   4. Profile      — raised card again, bookending the header.
 *
 * Every horizontal inset is 20px (sm) / 24px (lg) — nav's px-2/lg:px-3 plus
 * each row's own px-3 — and the header and profile match it, so the logo, both
 * nav icons, the toggle and the avatar all share one left edge.
 */
export default function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const isDark = theme === 'dark'

  // Icons-only rail while inside a workspace/project, where horizontal space
  // belongs to the editor.
  const isCompact = location.pathname.includes('/workspace') || location.pathname.includes('/projects')
  const showLabels = !isCompact

  return (
    <aside className={cn(
      'h-screen flex flex-col flex-shrink-0 transition-all',
      // Base tone is a step off the page background so the rail reads as its
      // own surface, and the raised zones below can sit *on* it.
      'bg-slate-100/70 dark:bg-slate-950',
      'border-r border-slate-200 dark:border-white/[0.06]',
      isCompact ? 'w-16' : 'w-16 lg:w-60'
    )}>

      {/* ── 1. Brand header ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/[0.06]">
        <button
          onClick={() => navigate('/')}
          title="Back to welcome page"
          className="w-full px-5 lg:px-6 py-5 flex items-center gap-3 text-left hover:opacity-75 transition-opacity"
        >
          <LogoBadge size="w-9 h-9" />
          {showLabels && (
            <div className="hidden lg:block min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-none truncate">ProfAI</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 tracking-[0.16em] uppercase mt-1 font-semibold">
                Studio
              </p>
            </div>
          )}
        </button>
      </div>

      {/* ── 2. Navigation ───────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 lg:px-3 py-4 space-y-1 overflow-y-auto">
        {showLabels && (
          <p className="hidden lg:block px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-600">
            Menu
          </p>
        )}
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            title={isCompact ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                isActive
                  // The single solid-colour element in the rail — brand blue,
                  // white text, so the current page is unmistakable.
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/20'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {showLabels && <span className="hidden lg:block">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* ── 3. Utilities ────────────────────────────────────────────────── */}
      <div className="border-t border-slate-200 dark:border-white/[0.06] px-2 lg:px-3 py-2">
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white transition-all duration-150"
        >
          <div className="relative w-4 h-4 flex-shrink-0">
            <Sun className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100')} />
            <Moon className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50')} />
          </div>
          {showLabels && <span className="hidden lg:block">{isDark ? 'Dark mode' : 'Light mode'}</span>}
        </button>
      </div>

      {/* ── 4. Profile ──────────────────────────────────────────────────── */}
      {showLabels && (
        <div className="hidden lg:block border-t border-slate-200 dark:border-white/[0.06] p-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-transparent">
            <LogoBadge size="w-7 h-7" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">Professor</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">Educator</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
