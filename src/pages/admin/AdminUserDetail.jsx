import React from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, ShieldCheck, User as UserIcon, Mail, MailCheck, MailWarning, Clapperboard, DollarSign, FolderKanban } from 'lucide-react'
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

export default function AdminUserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => adminService.getUser(id),
    retry: false,
  })

  if (isLoading) return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
  if (isError || !data) {
    return (
      <div className="px-8 py-10">
        <button onClick={() => navigate('/admin/users')} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to users
        </button>
        <p className="text-center py-16 text-sm text-slate-400 dark:text-slate-400">Couldn't load this user.</p>
      </div>
    )
  }

  const { user, projects, usage } = data
  const isAdmin = user.role === 'admin'

  return (
    <div className="px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <button onClick={() => navigate('/admin/users')} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to users
        </button>

        <div className="flex items-center gap-3.5">
          <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-base font-bold text-white flex-shrink-0">
            {(user.name || user.email)[0].toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{user.name || user.email}</h1>
              <Badge variant={isAdmin ? 'indigo' : 'default'}>
                {isAdmin ? <ShieldCheck className="w-3 h-3 mr-1 inline" /> : <UserIcon className="w-3 h-3 mr-1 inline" />}
                {user.role}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{user.email}</p>
          </div>
        </div>
      </motion.div>

      {/* Account info + usage stats, xl: breakpoint for the same reason as
          AdminOverview's grids (sidebar eats into available width). */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-8">
        <TiltCard className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          <div style={{ transform: 'translateZ(16px)' }}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Account info</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                  {user.emailVerified ? <MailCheck className="w-3.5 h-3.5 text-emerald-500" /> : <MailWarning className="w-3.5 h-3.5 text-amber-500" />}
                  Email verified
                </dt>
                <dd className="text-slate-700 dark:text-slate-200 font-medium">{user.emailVerified ? 'Yes' : 'No'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400 dark:text-slate-500 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</dt>
                <dd className="text-slate-700 dark:text-slate-200 font-medium truncate max-w-[220px]">{user.email}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400 dark:text-slate-500">Joined</dt>
                <dd className="text-slate-700 dark:text-slate-200 font-medium">{new Date(user.createdAt).toLocaleDateString()}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400 dark:text-slate-500">Last updated</dt>
                <dd className="text-slate-700 dark:text-slate-200 font-medium">{new Date(user.updatedAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </TiltCard>

        <TiltCard className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          <div style={{ transform: 'translateZ(16px)' }}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Usage</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-400 flex items-center gap-1"><Clapperboard className="w-3 h-3" /> Scenes rendered</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5">{usage.scenesCompleted}<span className="text-sm text-slate-400 dark:text-slate-500 font-normal"> / {usage.scenesTotal}</span></p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-400 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Est. HeyGen spend</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5">${usage.estimatedCostUsd.toFixed(2)}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4">
              {usage.avatarIIIRenders} on Avatar III (cheap), {usage.avatarIVRenders} on Avatar IV (2-4x cost).
            </p>
          </div>
        </TiltCard>
      </div>

      <TiltCard className="mt-5 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 overflow-hidden">
        <div style={{ transform: 'translateZ(16px)' }} className="p-6 pb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5"><FolderKanban className="w-4 h-4" /> Projects ({projects.length})</h2>
        </div>
        <div>
          {projects.length === 0 && <p className="px-6 pb-6 text-sm text-slate-400 dark:text-slate-500">No projects owned by this user.</p>}
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/admin/projects/${p.id}`}
              className="flex items-center justify-between px-6 py-3 border-t border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium truncate">{p.title}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{p.moduleCount} module{p.moduleCount === 1 ? '' : 's'} · {p.sceneCount} scene{p.sceneCount === 1 ? '' : 's'}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Badge variant={statusVariant[p.status] || 'default'}>{p.status}</Badge>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      </TiltCard>
    </div>
  )
}
