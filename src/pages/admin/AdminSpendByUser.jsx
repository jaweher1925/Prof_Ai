import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, ShieldCheck, User as UserIcon, DollarSign } from 'lucide-react'
import { adminService } from '@/services/admin'
import TiltCard from '@/components/auth/TiltCard'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'

export default function AdminSpendByUser() {
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'spend-by-user'],
    queryFn: adminService.spendByUser,
    retry: false,
  })

  return (
    <div className="px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <button onClick={() => navigate('/admin')} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to overview
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><DollarSign className="w-5 h-5 text-amber-500" /> HeyGen spend by professor</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Directional estimate, split by whoever's projects generated it — sorted highest first.</p>
      </motion.div>

      {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
      {isError && <p className="text-center py-16 text-sm text-slate-400 dark:text-slate-400">Couldn't load spend breakdown.</p>}

      {data && (
        <TiltCard className="mt-8 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 overflow-hidden">
          <div>
            {data.users.length === 0 && <p className="px-6 py-10 text-center text-sm text-slate-400 dark:text-slate-500">No users yet.</p>}
            {data.users.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="px-6 py-3.5 font-semibold">User</th>
                    <th className="px-6 py-3.5 font-semibold">Projects</th>
                    <th className="px-6 py-3.5 font-semibold">Scenes rendered</th>
                    <th className="px-6 py-3.5 font-semibold">Engine split</th>
                    <th className="px-6 py-3.5 font-semibold text-right">Est. spend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 dark:border-white/[0.04] last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3.5">
                        <Link to={`/admin/users/${u.id}`} className="flex items-center gap-2.5 group">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-slate-700 dark:text-slate-200 font-medium group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{u.name || u.email}</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{u.email}</p>
                          </div>
                          {u.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />}
                        </Link>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">{u.projectCount}</td>
                      <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">{u.scenesCompleted} / {u.scenesTotal}</td>
                      <td className="px-6 py-3.5 text-[11px] text-slate-400 dark:text-slate-500">{u.avatarIIIRenders} III · {u.avatarIVRenders} IV</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-slate-900 dark:text-white">${u.estimatedCostUsd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TiltCard>
      )}

      {data && data.unassigned.projectCount > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
          Plus {data.unassigned.projectCount} project{data.unassigned.projectCount === 1 ? '' : 's'} with no owner assigned (${data.unassigned.estimatedCostUsd.toFixed(2)}, {data.unassigned.scenesCompleted}/{data.unassigned.scenesTotal} scenes) — not attributed to any user above.
        </p>
      )}
    </div>
  )
}
