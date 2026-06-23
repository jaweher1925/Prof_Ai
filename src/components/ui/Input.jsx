import React from 'react'
import { cn } from '@/lib/utils'

export default function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/50 transition-colors',
        className
      )}
      {...props}
    />
  )
}
