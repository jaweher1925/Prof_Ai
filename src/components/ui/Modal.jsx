import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Modal({ open, onClose, title, children, className }) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 shadow-2xl', className)}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
            <h2 className="text-lg font-medium tracking-wide text-slate-900 dark:text-white">{title}</h2>
            <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
