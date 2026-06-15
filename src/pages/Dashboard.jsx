import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Search, WifiOff, BookOpen, CheckCircle, Loader2, FileText, GraduationCap } from 'lucide-react'
import { projectsService } from '@/services/projects'
import ProjectCard from '@/components/projects/ProjectCard'
import NewProjectModal from '@/components/projects/NewProjectModal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { delay, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
})

function StatCard({ icon: Icon, label, value, color, index }) {
  return (
    <motion.div
      className="bg-slate-900 border border-white/[0.06] rounded-2xl px-5 py-4 flex items-center gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.07, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      whileHover={{ borderColor: 'rgba(255,255,255,0.12)', y: -2, transition: { duration: 0.15 } }}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </motion.div>
  )
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsService.list,
    retry: false,
  })

  const projects = Array.isArray(data) ? data : []

  const stats = {
    total:      projects.length,
    drafts:     projects.filter(p => p.status === 'draft').length,
    inProgress: projects.filter(p => ['ingesting_sources','in_production','pending_director_approval'].includes(p.status)).length,
    completed:  projects.filter(p => p.status === 'completed').length,
  }

  const filtered = projects.filter((p) =>
    p.title?.toLowerCase().includes(search.toLowerCase())
  )

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <motion.div className="flex items-start justify-between mb-8" {...fadeUp(0)}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-blue-400 tracking-widest uppercase font-medium">ProfAI Studio</span>
            </div>
            <h1 className="text-3xl font-bold text-white">{greeting}, Professor</h1>
            <p className="text-slate-500 mt-1 text-sm">
              {isLoading ? 'Loading your courses…' : isError ? 'Connect the backend to load data' : `You have ${projects.length} course${projects.length !== 1 ? 's' : ''} in total`}
            </p>
          </div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4" />
              New Course
            </Button>
          </motion.div>
        </motion.div>

        {/* No backend banner */}
        {isError && (
          <motion.div
            className="flex items-center gap-3 px-4 py-3 mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm"
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
          >
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>
              Backend not connected. Run <code className="text-xs bg-yellow-500/10 px-1 py-0.5 rounded">npm start</code> in the <code className="text-xs bg-yellow-500/10 px-1 py-0.5 rounded">api/</code> folder.
            </span>
          </motion.div>
        )}

        {/* Stats row */}
        {!isLoading && !isError && projects.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <StatCard icon={BookOpen}    label="Total Courses"  value={stats.total}      color="bg-blue-600"    index={0} />
            <StatCard icon={FileText}    label="Drafts"         value={stats.drafts}     color="bg-slate-600"   index={1} />
            <StatCard icon={Loader2}     label="In Progress"    value={stats.inProgress} color="bg-amber-600"   index={2} />
            <StatCard icon={CheckCircle} label="Completed"      value={stats.completed}  color="bg-emerald-600" index={3} />
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-32">
            <Spinner size="lg" />
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center py-32 text-center"
            {...fadeUp(0.1)}
          >
            <motion.div
              className="w-20 h-20 rounded-2xl bg-slate-900 border border-white/[0.08] flex items-center justify-center mb-6"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <GraduationCap className="w-9 h-9 text-blue-400" />
            </motion.div>
            <h2 className="text-2xl font-semibold text-white mb-3">Create your first course</h2>
            <p className="text-slate-400 max-w-md leading-relaxed mb-8 text-sm">
              Upload your lecture notes, slides, or PDFs and let ProfAI generate a complete
              video course — scripts, voiceover, visuals, and avatar-driven video.
            </p>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button size="lg" onClick={() => setShowModal(true)}>
                <Plus className="w-5 h-5" />
                Create First Course
              </Button>
            </motion.div>
          </motion.div>
        ) : (
          <>
            <motion.div className="flex items-center justify-between mb-5" {...fadeUp(0.08)}>
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-widest">All Courses</h2>
              <div className="relative w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search courses…"
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </motion.div>

            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
            >
              {filtered.map((project) => (
                <motion.div
                  key={project.id}
                  variants={{
                    hidden:  { opacity: 0, y: 24, scale: 0.98 },
                    visible: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
                  }}
                >
                  <ProjectCard project={project} />
                </motion.div>
              ))}
            </motion.div>

            {filtered.length === 0 && search && (
              <p className="text-center py-16 text-slate-500 text-sm">No courses match "{search}"</p>
            )}
          </>
        )}
      </div>

      <NewProjectModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['projects'] })}
      />
    </div>
  )
}
