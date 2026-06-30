import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Clapperboard,
  HelpCircle,
  Sun,
  Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'
import LogoBadge from '@/components/ui/LogoBadge'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/library',   icon: BookOpen,        label: 'Resources' },
  { to: '/vault',     icon: Users,           label: 'Digital Twin' },
  { to: '/director',  icon: Clapperboard,    label: 'Director' },
]

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  return (
    <aside className="w-16 lg:w-60 h-screen bg-slate-950 flex flex-col flex-shrink-0">
      <button
        onClick={() => navigate('/')}
        title="Back to welcome page"
        className="px-3 lg:px-5 py-6 flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
      >
        <LogoBadge size="w-10 h-10" />
        <div className="hidden lg:block">
          <p className="text-sm font-bold text-white leading-none">ProfAI</p>
          <p className="text-[10px] text-slate-500 tracking-widest uppercase mt-0.5 font-medium">Studio</p>
        </div>
      </button>

      <nav className="flex-1 px-2 lg:px-3 py-2 space-y-1.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150',
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300 font-medium'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden lg:block">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom utilities */}
      <div className="px-2 lg:px-3 space-y-1 pb-1">
        {/* Help */}
        <a
          href="https://hyperframes.heygen.com/guides/mcp"
          target="_blank"
          rel="noopener noreferrer"
          title="HeyGen / HyperFrames docs"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          <span className="hidden lg:block">Help &amp; Docs</span>
        </a>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          <div className="relative w-4 h-4 flex-shrink-0">
            <Sun className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100')} />
            <Moon className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50')} />
          </div>
          <span className="hidden lg:block">{isDark ? 'Dark mode' : 'Light mode'}</span>
        </button>
      </div>

      <div className="px-2 lg:px-3 py-4">
        <div className="flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-xl bg-white/5">
          <LogoBadge size="w-7 h-7" />
          <div className="hidden lg:block flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">Professor</p>
            <p className="text-[10px] text-slate-500 truncate">Educator</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
