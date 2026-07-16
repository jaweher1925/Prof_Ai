import React from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppLayout({ children }) {
  const location = useLocation()
  const isWorkspace = location.pathname === '/workspace'

  return (
    <div className="flex h-screen bg-[#f5f7fb] dark:bg-[#0a0e1a] overflow-hidden transition-colors">
      <Sidebar compactMode={isWorkspace} />
      {/* min-w-0 so this pane can actually shrink below its content's
          intrinsic width instead of overflowing the viewport on narrower
          laptop screens (flex children default to min-width:auto). */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
