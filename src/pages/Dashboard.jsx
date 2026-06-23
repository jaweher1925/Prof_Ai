import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Search, WifiOff, BookOpen, CheckCircle, Loader2, FileText, GraduationCap, Sparkles, Mic, Video, Image as ImageIcon } from 'lucide-react'
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
      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 shadow-sm rounded-2xl px-5 py-4 flex items-center gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.07, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
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
    <div className="min-h-screen bg-[#f5f3fb] dark:bg-[#0a0e1a] transition-colors">
      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Header row: search + new course */}
        <motion.div className="flex items-center justify-between gap-4 mb-6" {...fadeUp(0)}>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses…"
              className="pl-9 h-10"
            />
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" />
            New Course
          </Button>
        </motion.div>

        {/* Illustrated welcome banner */}
        <motion.div
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-8 py-7 mb-8"
          {...fadeUp(0.05)}
        >
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
          <div className="absolute right-16 bottom-[-3rem] w-28 h-28 rounded-full bg-white/10" />

          {/* floating animated icon bubbles */}
          <motion.div
            className="hidden md:flex absolute right-12 top-6 w-11 h-11 rounded-2xl bg-white shadow-lg items-center justify-center"
            animate={{ y: [0, -10, 0], rotate: [0, 4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Mic className="w-5 h-5 text-blue-600" />
          </motion.div>
          <motion.div
            className="hidden md:flex absolute right-40 top-16 w-10 h-10 rounded-xl bg-white shadow-lg items-center justify-center"
            animate={{ y: [0, 9, 0], rotate: [0, -5, 0] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          >
            <Video className="w-4 h-4 text-emerald-500" />
          </motion.div>
          <motion.div
            className="hidden md:flex absolute right-8 bottom-7 w-10 h-10 rounded-xl bg-white shadow-lg items-center justify-center"
            animate={{ y: [0, -7, 0], rotate: [0, 5, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
          >
            <ImageIcon className="w-4 h-4 text-amber-500" />
          </motion.div>
          <motion.div
            className="hidden lg:flex absolute right-56 bottom-3 w-9 h-9 rounded-xl bg-white shadow-lg items-center justify-center"
            animate={{ y: [0, 6, 0], rotate: [0, -4, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
          >
            <FileText className="w-4 h-4 text-violet-500" />
          </motion.div>

          <div className="relative flex items-center gap-2 mb-2">
            <motion.span
              animate={{ rotate: [0, 15, 0, -15, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-flex"
            >
              <Sparkles className="w-4 h-4 text-blue-200" />
            </motion.span>
            <span className="text-xs text-blue-100 tracking-widest uppercase font-medium">ProfAI Studio</span>
          </div>
          <h1 className="relative text-2xl md:text-3xl font-bold text-white">{greeting}, Professor</h1>
          <p className="relative text-blue-100 mt-1 text-sm max-w-md">
            {isLoading ? 'Loading your courses…' : isError ? 'Connect the backend to load data' : `You have ${projects.length} course${projects.length !== 1 ? 's' : ''} in total — keep the momentum going.`}
          </p>
        </motion.div>

        {/* No backend banner */}
        {isError && (
          <motion.div
            className="flex items-center gap-3 px-4 py-3 mb-6 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300 text-sm"
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
          >
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>
              Backend not connected. <code className="text-xs bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5 rounded"> Please ensure the backend is running</code> 
            </span>
          </motion.div>
        )}

        {/* Stats row */}
        {!isLoading && !isError && projects.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <StatCard icon={BookOpen}    label="Total Courses"  value={stats.total}      color="bg-blue-600"    index={0} />
            <StatCard icon={FileText}    label="Drafts"         value={stats.drafts}     color="bg-slate-400"   index={1} />
            <StatCard icon={Loader2}     label="In Progress"    value={stats.inProgress} color="bg-amber-500"   index={2} />
            <StatCard icon={CheckCircle} label="Completed"      value={stats.completed}  color="bg-emerald-500" index={3} />
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
              className="w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 shadow-sm flex items-center justify-center mb-6"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <GraduationCap className="w-9 h-9 text-blue-500 dark:text-blue-400" />
            </motion.div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">Create your first course</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-md leading-relaxed mb-8 text-sm">
              Upload your lecture notes, slides, or PDFs and let ProfAI generate a complete
              video course — scripts, voiceover, visuals, and avatar-driven video.
            </p>
            <Button size="lg" onClick={() => setShowModal(true)}>
              <Plus className="w-5 h-5" />
              Create First Course
            </Button>
          </motion.div>
        ) : (
          <>
            <motion.h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-5" {...fadeUp(0.08)}>
              All Courses
            </motion.h2>

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
              <p className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">No courses match "{search}"</p>
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
