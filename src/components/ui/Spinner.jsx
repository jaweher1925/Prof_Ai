import React from 'react'
import { cn } from '@/lib/utils'

export default function Spinner({ className, size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }
  return (
    <div className={cn('rounded-full border-2 border-blue-100 dark:border-white/10 border-t-blue-500 dark:border-t-blue-400 animate-spin', sizes[size], className)} />
  )
}
