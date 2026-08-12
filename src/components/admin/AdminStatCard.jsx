import React from 'react'
import TiltCard from '@/components/auth/TiltCard'
import { cn } from '@/lib/utils'

/**
 * The admin dashboard's core "3D" building block — reuses TiltCard's real
 * perspective/rotateX/rotateY tilt (see components/auth/TiltCard.jsx,
 * already used on Login/Signup) instead of a separate implementation, so the
 * whole app shares one genuine-3D primitive rather than two competing ones.
 * The icon badge and value pop forward via translateZ so they visibly lift
 * off the glass when the card tilts, matching the Login card's logo badge.
 */
export default function AdminStatCard({ icon: Icon, label, value, sublabel, accent = 'indigo', delay = 0 }) {
  const accents = {
    indigo: 'from-indigo-500 to-indigo-700 shadow-indigo-900/50',
    blue:   'from-blue-500 to-blue-700 shadow-blue-900/50',
    emerald:'from-emerald-500 to-emerald-700 shadow-emerald-900/50',
    amber:  'from-amber-500 to-amber-700 shadow-amber-900/50',
    rose:   'from-rose-500 to-rose-700 shadow-rose-900/50',
  }

  return (
    <TiltCard
      className={cn(
        'relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl p-5 shadow-xl shadow-black/30',
      )}
    >
      <div className="relative flex items-start justify-between" style={{ transform: 'translateZ(30px)' }}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
          <p className="text-3xl font-bold text-white mt-2 leading-none">{value}</p>
          {sublabel && <p className="text-xs text-slate-500 mt-2">{sublabel}</p>}
        </div>
        <div
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br shadow-lg',
            accents[accent]
          )}
          style={{ transform: 'translateZ(50px)' }}
        >
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
      </div>
    </TiltCard>
  )
}
