import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  Video,
  Users,
  Plug,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'My Courses',   desc: 'All projects' },
  { to: '/library',      icon: BookOpen,        label: 'Resources',    desc: 'Source files' },
  { to: '/director',     icon: Video,           label: 'Director',     desc: 'Review & approve' },
  { to: '/vault',        icon: Users,           label: 'Digital Twin', desc: 'Avatar vault' },
  { to: '/integrations', icon: Plug,            label: 'Integrations', desc: 'API settings' },
]

export default function Sidebar() {
  return (
    <aside className="w-16 lg:w-60 h-screen bg-slate-900 border-r border-white/[0.06] flex flex-col flex-shrink-0">
      <div className="px-3 lg:px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-bold text-white leading-none">ProfAI</p>
            <p className="text-[10px] text-blue-400 tracking-widest uppercase mt-0.5 font-medium">Studio</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        <p className="hidden lg:block text-[10px] text-slate-600 uppercase tracking-widest font-medium px-3 mb-3">Workspace</p>
        {navItems.map(({ to, icon: Icon, label, desc }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-xl text-sm transition-all duration-150 group',
                isActive
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/20'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05]'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300')} />
                <div className="hidden lg:block flex-1 min-w-0">
                  <p className={cn('text-sm font-medium leading-none', isActive ? 'text-blue-300' : 'text-slate-300')}>{label}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{desc}</p>
                </div>
                {isActive && <ChevronRight className="hidden lg:block w-3 h-3 text-blue-400 flex-shrink-0" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 lg:px-3 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="hidden lg:block flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">Professor</p>
            <p className="text-[10px] text-slate-600 truncate">Educator</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
