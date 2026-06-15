import React from 'react'
import { cn } from '@/lib/utils'

export default function Spinner({ className, size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }
  return (
    <div className={cn('rounded-full border-2 border-slate-700 border-t-indigo-400 animate-spin', sizes[size], className)} />
  )
}
