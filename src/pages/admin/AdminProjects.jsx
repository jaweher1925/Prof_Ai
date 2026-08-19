import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { FolderKanban, Layers, Pencil, Trash2, X, AlertTriangle } from 'lucide-react'
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

export default function AdminProjects() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editingProject, setEditingProject] = useState(null)

  const { data: projects, isLoading, isError } = useQuery({
    queryKey: ['admin', 'projects'],
    queryFn: adminService.listProjects,
    retry: false,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
  }

  async function deleteProject(p, e) {
    e.stopPropagation()
    if (!window.confirm(`Delete "${p.title}"? This permanently removes its modules, scenes, and scripts. This can't be undone.`)) return
    try {
      await adminService.deleteProject(p.id)
      refresh()
      toast.success(`"${p.title}" was deleted`)
    } catch (err) {
      toast.error(errorToString(err))
    }
  }

  return (
    <div className="px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Projects</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">All courses across every professor account.</p>
      </motion.div>

      {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
      {isError && <p className="text-center py-16 text-sm text-slate-400 dark:text-slate-400">Couldn't load projects.</p>}

      {projects && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8" style={{ perspective: 1400 }}>
          {projects.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500 col-span-full text-center py-10">No projects yet.</p>}
          {projects.map((p) => (
            <TiltCard
              key={p.id}
              className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-5 shadow-xl shadow-slate-200/50 dark:shadow-black/30"
            >
              {/* onClick lives here, not on TiltCard itself — TiltCard only
                  forwards className/children, not arbitrary props. */}
              <div style={{ transform: 'translateZ(24px)' }} className="cursor-pointer" onClick={() => navigate(`/admin/projects/${p.id}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-900/40">
                    <FolderKanban className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingProject(p) }}
                      title="Edit project"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => deleteProject(p, e)}
                      title="Delete project"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-3.5 truncate">{p.title}</h3>
                <div className="flex items-center justify-between mt-2">
                  <Badge variant={statusVariant[p.status] || 'default'}>{p.status}</Badge>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{p._count?.modules ?? 0} module{p._count?.modules === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-3">Updated {new Date(p.updatedAt).toLocaleDateString()}</p>
              </div>
            </TiltCard>
          ))}
        </div>
      )}

      {editingProject && (
        <ProjectEditModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => { setEditingProject(null); refresh(); toast.success('Project updated') }}
        />
      )}
    </div>
  )
}
