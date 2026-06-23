import React from 'react'
import { cn } from '@/lib/utils'

const variants = {
  primary:   'bg-gradient-to-r from-blue-700 to-blue-500 hover:from-blue-600 hover:to-blue-400 text-white shadow-md shadow-blue-500/25',
  secondary: 'bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-500/20',
  ghost:     'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
  danger:    'bg-rose-600 hover:bg-rose-500 text-white',
  outline:   'border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-400/40 hover:text-blue-700 dark:hover:text-blue-300 bg-white dark:bg-transparent',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  ...props
}) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium tracking-wide transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400/40 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
