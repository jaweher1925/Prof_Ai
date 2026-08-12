import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ShieldCheck, User as UserIcon } from 'lucide-react'
import { adminService } from '@/services/admin'
import { useAuth } from '@/lib/AuthContext'
import TiltCard from '@/components/auth/TiltCard'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()

  const { data: users, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminService.listUsers,
    retry: false,
  })

  async function toggleRole(u) {
    const nextRole = u.role === 'admin' ? 'professor' : 'admin'
    try {
      await adminService.updateUserRole(u.id, nextRole)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
      toast.success(`${u.email} is now ${nextRole === 'admin' ? 'an admin' : 'a professor'}`)
    } catch (err) {
      toast.error(err?.message || 'Could not update role')
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-sm text-slate-400 mt-1">Every account with access to ProfAI — professors and admins.</p>
      </motion.div>

      <TiltCard className="mt-8 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/30 overflow-hidden">
        <div style={{ transform: 'translateZ(16px)' }}>
          {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
          {isError && <p className="text-center py-16 text-sm text-slate-400">Couldn't load users.</p>}

          {users && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3.5 font-semibold">Name</th>
                  <th className="px-6 py-3.5 font-semibold">Email</th>
                  <th className="px-6 py-3.5 font-semibold">Role</th>
                  <th className="px-6 py-3.5 font-semibold">Joined</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                          {(u.name || u.email)[0].toUpperCase()}
                        </div>
                        <span className="text-slate-200 font-medium">{u.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-400">{u.email}</td>
                    <td className="px-6 py-3.5">
                      <Badge variant={u.role === 'admin' ? 'indigo' : 'default'}>
                        {u.role === 'admin' ? <ShieldCheck className="w-3 h-3 mr-1 inline" /> : <UserIcon className="w-3 h-3 mr-1 inline" />}
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-3.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-slate-300 hover:text-white hover:border-indigo-400/40 bg-transparent"
                        onClick={() => toggleRole(u)}
                      >
                        {u.role === 'admin' ? 'Demote to professor' : 'Promote to admin'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </TiltCard>
    </div>
  )
}
