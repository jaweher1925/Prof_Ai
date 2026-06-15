import React from 'react'
import { cn } from '@/lib/utils'

export function Card({ children, className, ...props }) {
  return (
    <div
      className={cn('rounded-xl bg-slate-900/50 border border-white/[0.08] backdrop-blur-xl', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }) {
  return <div className={cn('p-5 border-b border-white/[0.06]', className)}>{children}</div>
}

export function CardTitle({ children, className }) {
  return <h3 className={cn('text-base font-semibold text-white tracking-wide', className)}>{children}</h3>
}

export function CardContent({ children, className }) {
  return <div className={cn('p-5', className)}>{children}</div>
}
