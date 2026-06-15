import React from 'react'
import { Film } from 'lucide-react'

export default function StoryboardPanel({ project, onUpdate }) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-medium text-white tracking-wide mb-1">Storyboard</h2>
      <p className="text-xs text-slate-500 mb-6">Scene-by-scene visual planning and asset generation.</p>
      <div className="flex flex-col items-center py-16 text-center">
        <Film className="w-10 h-10 text-slate-700 mb-3" />
        <p className="text-slate-500">Approve all scripts to unlock the Storyboard stage.</p>
      </div>
    </div>
  )
}
