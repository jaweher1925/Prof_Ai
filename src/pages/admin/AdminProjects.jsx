import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FolderKanban, Layers } from 'lucide-react'
import { adminService } from '@/services/admin'
import TiltCard from '@/components/auth/TiltCard'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'

const statusVariant = {
  draft: 'default',
  completed: 'green',
  in_production: 'blue',
  pending_director_approval: 'yellow',
  journey_approved: 'indigo',
}

export default function AdminProjects() {
  const { data: projects, isLoading, isError } = useQuery({
    queryKey: ['admin', 'projects'],
    queryFn: adminService.listProjects,
    retry: false,
  })

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <p className="text-sm text-slate-400 mt-1">All courses across every professor account.</p>
      </motion.div>

      {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
      {isError && <p className="text-center py-16 text-sm text-slate-400">Couldn't load projects.</p>}

      {projects && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8" style={{ perspective: 1400 }}>
          {projects.length === 0 && <p className="text-sm text-slate-500 col-span-full text-center py-10">No projects yet.</p>}
          {projects.map((p, i) => (
            <TiltCard
              key={p.id}
              className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl p-5 shadow-xl shadow-black/30"
            >
              <div style={{ transform: 'translateZ(24px)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-900/40">
                    <FolderKanban className="w-4 h-4 text-white" />
                  </div>
                  <Badge variant={statusVariant[p.status] || 'default'}>{p.status}</Badge>
                </div>
                <h3 className="text-sm font-semibold text-white mt-3.5 truncate">{p.title}</h3>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{p._count?.modules ?? 0} module{p._count?.modules === 1 ? '' : 's'}</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-3">Updated {new Date(p.updatedAt).toLocaleDateString()}</p>
              </div>
            </TiltCard>
          ))}
        </div>
      )}
    </div>
  )
}
