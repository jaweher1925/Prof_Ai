import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ShieldCheck, User as UserIcon, Plus, Pencil, Trash2, X, AlertTriangle, Eye } from 'lucide-react'
import { adminService } from '@/services/admin'
import { useAuth } from '@/lib/AuthContext'
import TiltCard from '@/components/auth/TiltCard'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

function errorToString(e) {
  if (!e) return 'Something went wrong'
  if (typeof e === 'string') return e
  if (typeof e.message === 'string') return e.message
  return 'Something went wrong'
}

// Create AND edit share one form — edit just arrives pre-filled and treats
// an empty password field as "leave it unchanged" instead of requiring a
// reset every time you just want to fix someone's name.
function UserFormModal({ mode, user, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(user?.role || 'professor')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!isEdit && password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password && password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSaving(true); setError(null)
    try {
      if (isEdit) {
        await adminService.updateUser(user.id, { name, email, role, ...(password ? { password } : {}) })
      } else {
        await adminService.createUser({ name, email, password, role })
      }
      onSaved()
    } catch (err) {
      setError(errorToString(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{isEdit ? 'Edit user' : 'New user'}</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3.5">
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Email</label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">
              {isEdit ? 'New password (leave blank to keep current)' : 'Password'}
            </label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? 'Unchanged' : 'At least 8 characters'} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30">
              <option value="professor" className="bg-white dark:bg-slate-900">Professor</option>
              <option value="admin" className="bg-white dark:bg-slate-900">Admin</option>
            </select>
          </div>

          {error && (
            <div className="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-600 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-slate-600 dark:text-slate-300">Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Spinner size="sm" /> : (isEdit ? 'Save changes' : 'Create user')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  const { data: users, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminService.listUsers,
    retry: false,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
  }

  async function toggleRole(u) {
    const nextRole = u.role === 'admin' ? 'professor' : 'admin'
    try {
      await adminService.updateUserRole(u.id, nextRole)
      refresh()
      toast.success(`${u.email} is now ${nextRole === 'admin' ? 'an admin' : 'a professor'}`)
    } catch (err) {
      toast.error(errorToString(err))
    }
  }

  async function deleteUser(u) {
    if (!window.confirm(`Delete ${u.email}? This can't be undone.`)) return
    try {
      await adminService.deleteUser(u.id)
      refresh()
      toast.success(`${u.email} was deleted`)
    } catch (err) {
      toast.error(errorToString(err))
    }
  }

  async function purgeNonAdmins() {
    const count = (users || []).filter((u) => u.role !== 'admin').length
    if (count === 0) { toast.info('No non-admin users to delete'); return }
    if (!window.confirm(`Delete all ${count} non-admin user${count === 1 ? '' : 's'}? Admin accounts are kept. This can't be undone.`)) return
    try {
      const res = await adminService.purgeNonAdmins()
      refresh()
      toast.success(`Deleted ${res?.deletedCount ?? count} user${(res?.deletedCount ?? count) === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error(errorToString(err))
    }
  }

  return (
    <div className="px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Users</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Every account with access to ProfAI — professors and admins.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="danger" size="sm" onClick={purgeNonAdmins} title="Delete every user except admins">
            <Trash2 className="w-3.5 h-3.5" /> Delete all non-admins
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5" /> New user
          </Button>
        </div>
      </motion.div>

      <TiltCard className="mt-8 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 overflow-hidden">
        <div style={{ transform: 'translateZ(16px)' }}>
          {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
          {isError && <p className="text-center py-16 text-sm text-slate-400 dark:text-slate-400">Couldn't load users.</p>}

          {users && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <th className="px-6 py-3.5 font-semibold">Name</th>
                  <th className="px-6 py-3.5 font-semibold">Email</th>
                  <th className="px-6 py-3.5 font-semibold">Role</th>
                  <th className="px-6 py-3.5 font-semibold">Joined</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 dark:text-slate-500">No users yet.</td></tr>
                )}
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  return (
                    <tr key={u.id} className="border-b border-slate-100 dark:border-white/[0.04] last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                          <span className="text-slate-700 dark:text-slate-200 font-medium">{u.name || '—'}{isSelf && <span className="ml-1.5 text-[10px] text-slate-400 dark:text-slate-500">(you)</span>}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">{u.email}</td>
                      <td className="px-6 py-3.5">
                        <Badge variant={u.role === 'admin' ? 'indigo' : 'default'}>
                          {u.role === 'admin' ? <ShieldCheck className="w-3 h-3 mr-1 inline" /> : <UserIcon className="w-3 h-3 mr-1 inline" />}
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-slate-400 dark:text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-indigo-400/40 bg-transparent"
                            onClick={() => toggleRole(u)}
                          >
                            {u.role === 'admin' ? 'Demote' : 'Promote'}
                          </Button>
                          <button
                            onClick={() => navigate(`/admin/users/${u.id}`)}
                            title="View details"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingUser(u)}
                            title="Edit user"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => !isSelf && deleteUser(u)}
                            disabled={isSelf}
                            title={isSelf ? "Can't delete your own account here" : 'Delete user'}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </TiltCard>

      {showCreate && (
        <UserFormModal mode="create" onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refresh(); toast.success('User created') }} />
      )}
      {editingUser && (
        <UserFormModal mode="edit" user={editingUser} onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); refresh(); toast.success('User updated') }} />
      )}
    </div>
  )
}
