import React from 'react'
import { Link } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'
import LogoBadge from '@/components/ui/LogoBadge'

/** Shared top bar for the auth pages — brand mark (links back to the
 *  Welcome page) on the left, theme toggle on the right. Login/Signup
 *  otherwise have no navigation chrome at all, so this was the only way
 *  back to the main site. */
export default function AuthTopBar() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div className="fixed top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-5">
      <Link
        to="/"
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-xl border backdrop-blur-md transition-colors',
          isDark
            ? 'bg-white/10 border-white/20 hover:bg-white/20'
            : 'bg-slate-900/5 border-slate-200 hover:bg-slate-900/10'
        )}
      >
        <LogoBadge size="w-7 h-7" tone={isDark ? 'white' : 'dark'} />
        <span className={cn('font-bold text-sm tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>ProfAI</span>
      </Link>

      <button
        onClick={toggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center border backdrop-blur-md transition-colors',
          isDark
            ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            : 'bg-slate-900/5 border-slate-200 text-slate-700 hover:bg-slate-900/10'
        )}
      >
        <span className="relative w-4 h-4 block">
          <Sun className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100')} />
          <Moon className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50')} />
        </span>
      </button>
    </div>
  )
}
