import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { BookOpen, Clock, ChevronRight, Mic, Video, Image, FileText, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { projectsService } from '@/services/projects'
import { toast } from 'sonner'

const STATUS_MAP = {
  draft:                      { label: 'Draft',         variant: 'default', step: 0 },
  ingesting_sources:          { label: 'Analyzing',     variant: 'yellow',  step: 1 },
  pending_director_approval:  { label: 'Needs Review',  variant: 'indigo',  step: 2 },
  journey_approved:           { label: 'Approved',      variant: 'green',   step: 2 },
  in_production:              { label: 'In Production', variant: 'blue',    step: 3 },
  completed:                  { label: 'Completed',     variant: 'green',   step: 4 },
}

const PIPELINE_STEPS = [
  { icon: FileText, label: 'Script' },
  { icon: Mic,      label: 'Voice'  },
  { icon: Image,    label: 'Visual' },
  { icon: Video,    label: 'Video'  },
]

export default function ProjectCard({ project }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const status = STATUS_MAP[project.status] || STATUS_MAP.draft

  const { mutate: deleteProject, isPending } = useMutation({
    mutationFn: () => projectsService.remove(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success(`"${project.title}" deleted`)
    },
    onError: () => toast.error('Failed to delete project'),
  })

  function handleDelete(e) {
    e.stopPropagation()
    if (!confirming) { setConfirming(true); return }
    deleteProject()
  }

  function handleCancelDelete(e) {
    e.stopPropagation()
    setConfirming(false)
  }

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <Card
        className="cursor-pointer hover:border-blue-500/30 hover:bg-slate-900/80 transition-all duration-200 group h-full"
        onClick={() => navigate(`/workspace?project_id=${project.id}`)}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={status.variant}>{status.label}</Badge>
              {confirming ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={handleDelete} disabled={isPending}
                    className="px-2 py-1 text-[10px] font-medium bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">
                    {isPending ? '...' : 'Confirm'}
                  </button>
                  <button onClick={handleCancelDelete}
                    className="px-2 py-1 text-[10px] font-medium bg-slate-800 border border-white/[0.06] text-slate-400 rounded-lg hover:text-slate-200 transition-colors">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={handleDelete}
                  className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Delete course">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <h3 className="text-white font-semibold mb-1 group-hover:text-blue-300 transition-colors line-clamp-2">
            {project.title}
          </h3>

          <div className="flex items-center gap-1.5 mt-4 mb-4">
            {PIPELINE_STEPS.map(({ icon: Icon, label }, i) => (
              <div key={label} title={label}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-[10px] gap-1 font-medium transition-colors ${
                  i < status.step
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20'
                    : 'bg-slate-800/60 text-slate-600 border border-white/[0.04]'
                }`}>
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{label}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="w-3 h-3" />
              <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-600 group-hover:text-blue-400 transition-colors">
              <span className="hidden sm:inline">Open</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
