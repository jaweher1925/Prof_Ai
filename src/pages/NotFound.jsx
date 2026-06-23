import React from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 bg-[#f5f7fb] dark:bg-[#0a0e1a]">
      <p className="text-8xl font-light text-slate-300 dark:text-slate-700 mb-4">404</p>
      <h1 className="text-xl text-slate-900 dark:text-white mb-2">Page not found</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-8">This page doesn't exist.</p>
      <Button onClick={() => navigate('/')}>Back to Projects</Button>
    </div>
  )
}
