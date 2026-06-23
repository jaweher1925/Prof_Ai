import React from 'react'
import { cn } from '@/lib/utils'

export function Card({ children, className, ...props }) {
  return (
    <div
      className={cn('rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }) {
  return <div className={cn('p-5 border-b border-slate-100 dark:border-white/10', className)}>{children}</div>
}

export function CardTitle({ children, className }) {
  return <h3 className={cn('text-base font-semibold text-slate-900 dark:text-white tracking-wide', className)}>{children}</h3>
}

export function CardContent({ children, className }) {
  return <div className={cn('p-5', className)}>{children}</div>
}
