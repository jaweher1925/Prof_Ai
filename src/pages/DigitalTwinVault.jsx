import React from 'react'
import { Users } from 'lucide-react'

export default function DigitalTwinVault() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-8">
        <Users className="w-5 h-5 text-indigo-400" />
        <h1 className="text-2xl font-light text-white tracking-wide">Digital Twin Vault</h1>
      </div>
      <p className="text-slate-500">Manage your AI presenter avatars and voice profiles.</p>
    </div>
  )
}
