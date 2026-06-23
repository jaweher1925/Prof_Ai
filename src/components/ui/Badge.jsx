import React from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default:  'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300',
  indigo:   'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
  green:    'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  yellow:   'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  red:      'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
  blue:     'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
}

export default function Badge({ children, variant = 'default', className }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}
