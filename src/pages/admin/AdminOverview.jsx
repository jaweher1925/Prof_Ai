import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Users, FolderKanban, Clapperboard, DollarSign, ShieldCheck, AlertTriangle } from 'lucide-react'
import { adminService } from '@/services/admin'
import AdminStatCard from '@/components/admin/AdminStatCard'
import TiltCard from '@/components/auth/TiltCard'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'

export default function AdminOverview() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: adminService.stats,
    retry: false,
  })

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-400 text-sm">
        Couldn't load admin stats.
      </div>
    )
  }

  const { users, projects, scenes, heygen, recentProjects } = data

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Overview</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Platform-wide usage across every professor account.</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-8" style={{ perspective: 1400 }}>
        <AdminStatCard icon={Users} label="Professors" value={users.professors} sublabel={`${users.admins} admin${users.admins === 1 ? '' : 's'}`} accent="indigo" />
        <AdminStatCard icon={FolderKanban} label="Projects" value={projects.total} sublabel={`${projects.modules} modules`} accent="blue" />
        <AdminStatCard icon={Clapperboard} label="Scenes rendered" value={scenes.completed} sublabel={`of ${scenes.total} total`} accent="emerald" />
        <AdminStatCard icon={DollarSign} label="Est. HeyGen spend" value={`$${heygen.estimatedCostUsd.toFixed(2)}`} sublabel="all-time, directional" accent="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mt-6">
        {/* HeyGen engine breakdown — ties directly into the cost work: shows
            how many renders landed on the cheap avatar_iii engine vs the
            pricier avatar_iv fallback. */}
        <TiltCard className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          <div style={{ transform: 'translateZ(24px)' }}>
            <div className="flex items-center gap-2 mb-5">
              <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">HeyGen engine usage</h2>
            </div>
            <div className="space-y-4">
              <EngineBar label="Avatar III (cheap)" count={heygen.avatarIIIRenders} total={heygen.avatarIIIRenders + heygen.avatarIVRenders} color="bg-emerald-500" />
              <EngineBar label="Avatar IV (2-4x cost)" count={heygen.avatarIVRenders} total={heygen.avatarIIIRenders + heygen.avatarIVRenders} color="bg-amber-500" />
            </div>
            {heygen.avatarIVRenders > 0 && (
              <div className="flex items-start gap-2 mt-5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-200/80">{heygen.avatarIVRenders} scene(s) rendered on the costlier engine because their avatar doesn't support Avatar III.</p>
              </div>
            )}
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4 leading-relaxed">{heygen.note}</p>
          </div>
        </TiltCard>

        <TiltCard className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          <div style={{ transform: 'translateZ(24px)' }}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-5">Recently updated projects</h2>
            <div className="space-y-1">
              {recentProjects.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No projects yet.</p>}
              {recentProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                  <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{p.title}</span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge variant={p.status === 'completed' ? 'green' : 'default'}>{p.status}</Badge>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TiltCard>
      </div>
    </div>
  )
}

function EngineBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>
    </div>
  )
}
