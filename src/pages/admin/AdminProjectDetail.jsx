import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, FolderKanban, Layers, Clapperboard, Pencil, Trash2, X, AlertTriangle, User as UserIcon } from 'lucide-react'
import { adminService } from '@/services/admin'
import TiltCard from '@/components/auth/TiltCard'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const statusVariant = {
  draft: 'default',
  completed: 'green',
  in_production: 'blue',
  pending_director_approval: 'yellow',
  journey_approved: 'indigo',
  proposed: 'default',
}

const STATUS_OPTIONS = ['draft', 'in_production', 'pending_director_approval', 'journey_approved', 'completed']

function errorToString(e) {
  if (!e) return 'Something went wrong'
  if (typeof e === 'string') return e
  if (typeof e.message === 'string') return e.message
  return 'Something went wrong'
}

function ProjectEditModal({ project, onClose, onSaved }) {
  const [title, setTitle] = useState(project.title)
  const [status, setStatus] = useState(project.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError(null)
    try {
      await adminService.updateProject(project.id, { title, status })
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
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Edit project</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3.5">
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Title</label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="bg-white dark:bg-slate-900">{s}</option>)}
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
              {saving ? <Spinner size="sm" /> : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const { data: project, isLoading, isError } = useQuery({
    queryKey: ['admin', 'project', id],
    queryFn: () => adminService.getProject(id),
    retry: false,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'project', id] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
  }

  async function handleDelete() {
    if (!project) return
    if (!window.confirm(`Delete "${project.title}"? This permanently removes its modules, scenes, and scripts. This can't be undone.`)) return
    try {
      await adminService.deleteProject(project.id)
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
      toast.success(`"${project.title}" was deleted`)
      navigate('/admin/projects')
    } catch (err) {
      toast.error(errorToString(err))
    }
  }

  if (isLoading) return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
  if (isError || !project) {
    return (
      <div className="px-8 py-10">
        <button onClick={() => navigate('/admin/projects')} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to projects
        </button>
        <p className="text-center py-16 text-sm text-slate-400 dark:text-slate-400">Couldn't load this project.</p>
      </div>
    )
  }

  const sceneCount = project.modules.reduce((n, m) => n + m.scenes.length, 0)

  return (
    <div className="px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <button onClick={() => navigate('/admin/projects')} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to projects
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-900/40">
              <FolderKanban className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{project.title}</h1>
                <Badge variant={statusVariant[project.status] || 'default'}>{project.status}</Badge>
              </div>
              {project.owner ? (
                <Link to={`/admin/users/${project.owner.id}`} className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mt-0.5 w-fit">
                  <UserIcon className="w-3.5 h-3.5" /> {project.owner.name || project.owner.email}
                </Link>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">No owner assigned</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}
              className="border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-indigo-400/40 bg-transparent">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-8" style={{ perspective: 1400 }}>
        <TiltCard className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-5 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          <div style={{ transform: 'translateZ(24px)' }} className="flex items-center gap-3">
            <Layers className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-400">Modules</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none mt-1">{project.modules.length}</p>
            </div>
          </div>
        </TiltCard>
        <TiltCard className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-5 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          <div style={{ transform: 'translateZ(24px)' }} className="flex items-center gap-3">
            <Clapperboard className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-400">Scenes</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none mt-1">{sceneCount}</p>
            </div>
          </div>
        </TiltCard>
      </div>

      <TiltCard className="mt-5 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 overflow-hidden">
        <div style={{ transform: 'translateZ(16px)' }} className="p-6 pb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Modules &amp; scenes</h2>
        </div>
        <div>
          {project.modules.length === 0 && <p className="px-6 pb-6 text-sm text-slate-400 dark:text-slate-500">No modules yet.</p>}
          {project.modules.map((m) => (
            <div key={m.id} className="border-t border-slate-100 dark:border-white/[0.04] px-6 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{m.title}</p>
                <Badge variant={statusVariant[m.status] || 'default'}>{m.status}</Badge>
              </div>
              {m.scenes.length === 0 ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">No scenes yet.</p>
              ) : (
                <div className="mt-2.5 space-y-1.5">
                  {m.scenes.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.03]">
                      <span className="text-slate-600 dark:text-slate-300">Scene {s.orderIndex + 1} · {s.sceneKind}</span>
                      <div className="flex items-center gap-2">
                        {s.avatarEngineUsed && <span className="text-[10px] text-slate-400 dark:text-slate-500">{s.avatarEngineUsed}</span>}
                        <Badge variant={statusVariant[s.status] || 'default'}>{s.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </TiltCard>

      {editing && (
        <ProjectEditModal
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); refresh(); toast.success('Project updated') }}
        />
      )}
    </div>
  )
}
