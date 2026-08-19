import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  Sun,
  Moon,
  LogOut,
  ShieldCheck,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'
import { useAuth } from '@/lib/AuthContext'
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
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isDark = theme === 'dark'

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  // Icons-only rail while inside a workspace/project, where horizontal space
  // belongs to the editor.
  const isCompact = location.pathname.includes('/workspace') || location.pathname.includes('/projects')
  const showLabels = !isCompact

  // Account menu (2026-08-13 — "navbar should be with icon account and user
  // also"): the old profile block only ever rendered on large screens
  // (hidden lg:block) and outside compact/workspace mode, so on a narrower
  // window or while actually working in a project there was NO sign-in
  // indicator or way to sign out at all. This is now a real avatar button
  // that's always visible, everywhere, and opens a small menu with the
  // account's name/email/role and sign-out instead of relying on a
  // hover-only reveal (which touch devices can't trigger anyway).
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocClick); window.removeEventListener('keydown', onKey) }
  }, [menuOpen])
  // Close automatically on navigation so it doesn't linger open over the new page.
  useEffect(() => { setMenuOpen(false) }, [location.pathname])
  const initials = (user?.name || user?.email || '?')[0].toUpperCase()
  const isAdmin = user?.role === 'admin'

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

      {/* ── 4. Account ──────────────────────────────────────────────────── */}
      <div ref={menuRef} className="relative border-t border-slate-200 dark:border-white/[0.06] p-2 lg:p-3">
        {/* The menu itself — anchored above the trigger since this rail sits
            at the bottom of the screen (a dropdown BELOW would run off the
            viewport). z-50 so it clears workspace panels/modals below it. */}
        {menuOpen && (
          <div className="absolute bottom-full left-2 right-2 lg:left-3 lg:right-3 mb-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden z-50">
            <div className="px-3.5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.name || 'Account'}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{user?.email}</p>
              <span className={cn(
                'inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium',
                isAdmin ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
              )}>
                {isAdmin && <ShieldCheck className="w-3 h-3" />}
                {isAdmin ? 'Admin' : 'Professor'}
              </span>
            </div>
            {isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <ShieldCheck className="w-4 h-4 flex-shrink-0" /> Admin console
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" /> Sign out
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((v) => !v)}
          title={user?.name || user?.email || 'Account'}
          className={cn(
            'w-full flex items-center justify-center lg:justify-start gap-2.5 px-2 lg:px-2.5 py-2 rounded-lg transition-colors',
            menuOpen ? 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10' : 'border border-transparent hover:bg-white dark:hover:bg-white/5'
          )}
        >
          {/* Real account icon — initials on a gradient badge, same style used
              for user avatars in the Admin console, instead of the generic
              app logo that used to sit here (didn't identify WHO was signed
              in at a glance). */}
          <span className="relative flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-[12px] font-bold text-white">
            {initials}
            {isAdmin && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-slate-100 dark:border-slate-950 flex items-center justify-center">
                <ShieldCheck className="w-2 h-2 text-white" />
              </span>
            )}
          </span>
          {showLabels && (
            <>
              <div className="hidden lg:block flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user?.name || user?.email || 'Account'}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{isAdmin ? 'Admin' : 'Professor'}</p>
              </div>
              <ChevronUp className={cn('hidden lg:block w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform', menuOpen && 'rotate-180')} />
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
