import React from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default:  'bg-slate-700 text-slate-300',
  indigo:   'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
  green:    'bg-green-500/20 text-green-300 border border-green-500/30',
  yellow:   'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  red:      'bg-red-500/20 text-red-300 border border-red-500/30',
  blue:     'bg-blue-500/20 text-blue-300 border border-blue-500/30',
}

export default function Badge({ children, variant = 'default', className }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}
