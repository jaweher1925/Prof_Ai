import React from 'react'
import { cn } from '@/lib/utils'

export default function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-lg bg-slate-800/60 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors',
        className
      )}
      {...props}
    />
  )
}
