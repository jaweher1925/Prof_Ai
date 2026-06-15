import React from 'react'
import { cn } from '@/lib/utils'

const variants = {
  primary:   'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10',
  ghost:     'hover:bg-slate-800/60 text-slate-300 hover:text-white',
  danger:    'bg-red-600 hover:bg-red-500 text-white',
  outline:   'border border-white/10 text-slate-300 hover:border-indigo-500/40 hover:text-white bg-transparent',
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
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium tracking-wide transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed',
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
