import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  Users,
  Plug,
  Sun,
  Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'

const navItems = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/library',      icon: BookOpen,        label: 'Resources' },
  { to: '/vault',        icon: Users,           label: 'Digital Twin' },
  { to: '/integrations', icon: Plug,            label: 'Integrations' },
]

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <aside className="w-16 lg:w-60 h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-blue-700 flex flex-col flex-shrink-0">
      <div className="px-3 lg:px-5 py-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-bold text-white leading-none">ProfAI</p>
          <p className="text-[10px] text-blue-300 tracking-widest uppercase mt-0.5 font-medium">Studio</p>
        </div>
      </div>

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
                  ? 'bg-white text-blue-700 shadow-md font-medium'
                  : 'text-blue-200 hover:bg-white/10 hover:text-white'
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden lg:block">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Theme toggle */}
      <div className="px-2 lg:px-3">
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-blue-200 hover:bg-white/10 hover:text-white transition-all duration-150"
        >
          <div className="relative w-4 h-4 flex-shrink-0">
            <Sun className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100')} />
            <Moon className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50')} />
          </div>
          <span className="hidden lg:block">{isDark ? 'Dark mode' : 'Light mode'}</span>
        </button>
      </div>

      <div className="px-2 lg:px-3 py-5">
        <div className="flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-xl bg-white/10">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="hidden lg:block flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">Professor</p>
            <p className="text-[10px] text-blue-300 truncate">Educator</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
