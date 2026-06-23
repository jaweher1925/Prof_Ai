import React from 'react'
import Sidebar from './Sidebar'

export default function AppLayout({ children }) {
  return (
    <div className="flex h-screen bg-[#f5f7fb] dark:bg-[#0a0e1a] overflow-hidden transition-colors">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
