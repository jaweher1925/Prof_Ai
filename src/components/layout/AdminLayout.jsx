import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutGrid, Users, FolderKanban, Settings, LogOut, ArrowLeft, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/AuthContext'
import { useTheme } from '@/lib/ThemeContext'
import LogoBadge from '@/components/ui/LogoBadge'

const navItems = [
  { to: '/admin',          icon: LayoutGrid,   label: 'Overview', end: true },
  { to: '/admin/users',    icon: Users,        label: 'Users' },
  { to: '/admin/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/admin/settings', icon: Settings,     label: 'Settings' },
]

/**
 * Admin console shell. Used to be deliberately always-dark regardless of the
 * shared theme toggle, so it read as a distinct "mode" of the app — but that
 * meant switching themes anywhere else (Sidebar, Welcome, Login/Signup all
 * share the same ThemeContext) had no effect here, and there was no toggle
 * in the console itself either (2026-08-13, "if i change theme in one page
 * all the module should change"). Now follows the same light/dark state as
 * everywhere else, with its own toggle in the rail. Nav rail still carries
 * the same real-3D language as TiltCard (perspective + depth via layered
 * shadows/translateZ-style elevation on hover) rather than reusing TiltCard
 * itself, since a full-height rail tilting toward the cursor would be
 * disorienting for navigation — the 3D here shows up as raised/pressed nav
 * pills and the stat cards on each admin page (see AdminOverview.jsx's
 * StatCard).
 */
export default function AdminLayout({ children }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <aside className="w-64 flex-shrink-0 h-screen flex flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-white/[0.06] relative overflow-hidden">
        {/* Ambient depth glow — fixed, doesn't move with content, just gives
            the whole rail a sense of a lit surface rather than flat black. */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-indigo-600/20 dark:bg-indigo-600/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -right-24 w-72 h-72 rounded-full bg-blue-600/10 blur-3xl" />

        <div className="relative px-5 py-5 border-b border-slate-200 dark:border-white/[0.06]">
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center gap-3 text-left"
          >
            <LogoBadge size="w-9 h-9" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-none truncate">ProfAI</p>
              <p className="text-[10px] text-indigo-600/80 dark:text-indigo-300/70 tracking-[0.16em] uppercase mt-1 font-semibold">
                Admin Console
              </p>
            </div>
          </button>
        </div>

        <nav className="relative flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150',
                  isActive
                    // "Raised" pill — layered shadow + inner highlight stands
                    // in for the pressed/elevated feel without literal
                    // rotateX/Y (which would fight the fixed nav layout).
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white font-semibold shadow-lg shadow-indigo-950/60 ring-1 ring-white/10'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white'
                )
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="relative border-t border-slate-200 dark:border-white/[0.06] p-3 space-y-1">
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white transition-all duration-150"
          >
            <div className="relative w-4 h-4 flex-shrink-0">
              <Sun className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100')} />
              <Moon className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50')} />
            </div>
            <span>{isDark ? 'Dark mode' : 'Light mode'}</span>
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white transition-all duration-150"
          >
            <ArrowLeft className="w-4 h-4 flex-shrink-0" />
            <span>Professor view</span>
          </button>
          <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
              {(user?.name || user?.email || 'A')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user?.name || 'Admin'}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto bg-slate-50 dark:bg-slate-900">
        {children}
      </main>
    </div>
  )
}
