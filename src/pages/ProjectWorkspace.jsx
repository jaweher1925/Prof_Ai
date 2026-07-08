import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { projectsService } from '@/services/projects'
import { sourceFilesService } from '@/services/sourceFiles'
import { scriptsService } from '@/services/scripts'
import { scenesService } from '@/services/scenes'
import { agentsService } from '@/services/agents'
import {
  ArrowLeft, Library, FileText, Mic2, Image, Video, Wand2,
  Download, Settings, BookOpen, ChevronRight, Loader2, CheckCircle
} from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import SourcesPanel from '@/components/workspace/SourcesPanel'
import ScriptsPanel from '@/components/workspace/ScriptsPanel'
import VoicePanel from '@/components/workspace/VoicePanel'
import VisualDesignerPanel from '@/components/workspace/VisualDesignerPanel'
import AvatarStudioPanel from '@/components/workspace/AvatarStudioPanel'
import VideoPanel from '@/components/workspace/VideoPanel'
import CastingSettings from '@/components/workspace/CastingSettings'

/**
 * NEW pipeline order (most expensive last):
 * 1. Library        → upload sources
 * 2. Script         → AI generates text scripts
 * 3. Voice          → Voice AI converts text to audio
 * 4. Visual         → Image AI generates background images
 * 5. Avatar Studio  → HeyGen-style avatar/voice/style settings (#37)
 * 6. Video          → Video AI generates avatar videos (expensive — LAST)
 *
 * Casting (avatar/voice settings) = gear button, quick version of Avatar Studio
 */
const STAGES = [
  { id: 'library',         label: 'Library',         icon: Library,  desc: 'Upload sources',        grad: 'from-blue-500 to-blue-700'    },
  { id: 'script',          label: 'Script',          icon: FileText, desc: 'Generate scripts',      grad: 'from-indigo-500 to-blue-700'  },
  { id: 'voice',           label: 'Voice',           icon: Mic2,     desc: 'Text to audio',         grad: 'from-sky-500 to-blue-700'     },
  { id: 'avatar-studio',   label: 'Avatar Studio',   icon: Wand2,    desc: 'Avatar, voice & style',  grad: 'from-blue-500 to-indigo-700'  },
  { id: 'visual-designer', label: 'Visual Designer', icon: Image,    desc: 'Animated slides',       grad: 'from-cyan-500 to-blue-700'    },
  { id: 'video',           label: 'Video',           icon: Video,    desc: 'Avatar videos',         grad: 'from-blue-600 to-sky-700'     },
]

// Chip that renders a stage icon with a 3D-style bevel: gradient fill, an
// inner top highlight, a soft outer drop shadow, and a gentle hover tilt.
function IconChip({ Icon, active, locked, grad }) {
  return (
    <motion.div
      className={`relative w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
        locked
          ? 'bg-blue-50/70 dark:bg-white/5'
          : active
          ? `bg-gradient-to-br ${grad} shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_3px_6px_rgba(37,99,235,0.35)]`
          : 'bg-gradient-to-br from-blue-50 to-sky-100 dark:from-white/10 dark:to-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_1px_2px_rgba(0,0,0,0.06)]'
      }`}
      whileHover={!locked ? { scale: 1.08, rotate: -3 } : {}}
      transition={{ type: 'spring', stiffness: 350, damping: 15 }}
    >
      <Icon className={`w-4 h-4 ${locked ? 'text-slate-300 dark:text-slate-600' : active ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
    </motion.div>
  )
}

export default function ProjectWorkspace() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = params.get('project_id')

  const [activeStage, setActiveStage] = useState('library')
  const [showCasting, setShowCasting] = useState(false)

  // Casting popup gate: the first time a project moves from Script → Voice,
  // show the Casting Settings popup so the user confirms avatar/voice before
  // voice generation opens. It must only interrupt ONCE per project — ever.
  // Two persistent signals mark it done (the old in-memory ref reset on every
  // page load, which made the popup reappear each time the user came back):
  //   1. The project already has an avatar AND voice saved → casting was chosen.
  //   2. A per-project localStorage flag → the user saw the popup once
  //      (even if they closed it without saving).
  // After that, changes are made deliberately via the Casting Settings button.
  const [showCastingGate, setShowCastingGate] = useState(false)
  const [voiceRegenStatus, setVoiceRegenStatus] = useState(null) // { done, total } | null

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsService.get(projectId),
    enabled: !!projectId,
    refetchInterval: (query) =>
      query.state.data?.status === 'ingesting_sources' ? 3000 : false,
  })

  const { data: sources = [] } = useQuery({
    queryKey: ['sourceFiles', projectId],
    queryFn: () => sourceFilesService.listByProject(projectId),
    enabled: !!projectId,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const castingGateDone = () =>
    !!(project?.defaultAvatarId && project?.defaultVoiceId) ||
    localStorage.getItem(`profai_casting_gate_${projectId}`) === 'done'

  // Navigate to a stage, inserting the Casting Settings popup gate the first
  // time a project heads into Voice (from Script, or from the sidebar/jump).
  const goToStage = (stageId) => {
    if (isLocked(stageId)) return
    if (stageId === 'voice' && !castingGateDone()) {
      setShowCastingGate(true)
      return
    }
    setActiveStage(stageId)
    setShowCasting(false)
  }

  const finishCastingGate = () => {
    localStorage.setItem(`profai_casting_gate_${projectId}`, 'done')
    setShowCastingGate(false)
    setActiveStage('voice')
    setShowCasting(false)
  }

  const isLocked = (stageId) => {
    switch (stageId) {
      case 'library':         return false
      case 'script':          return sources.length === 0
      case 'voice':           return !['journey_approved','in_production','completed'].includes(project?.status)
      case 'visual-designer': return !['journey_approved','in_production','completed'].includes(project?.status)
      case 'avatar-studio':   return !['journey_approved','in_production','completed'].includes(project?.status)
      case 'video':           return !['journey_approved','in_production','completed'].includes(project?.status)
      default:                return true
    }
  }

  const renderPanel = () => {
    if (showCasting) {
      return (
        <CastingSettings
          project={project}
          onUpdate={invalidate}
          onClose={() => setShowCasting(false)}
        />
      )
    }

    if (isLocked(activeStage)) {
      const stageInfo = STAGES.find(s => s.id === activeStage)
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-12">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 shadow-sm flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-blue-300 dark:text-blue-500/60" />
          </div>
          <p className="text-slate-900 dark:text-white font-medium mb-2">{stageInfo?.label} is locked</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {activeStage === 'script'
              ? 'Upload at least one source file in the Library first.'
              : activeStage === 'voice' || activeStage === 'visual-designer'
              ? 'Generate and approve scripts first.'
              : 'Complete the previous stages first.'}
          </p>
        </div>
      )
    }

    switch (activeStage) {
      case 'library':         return <SourcesPanel project={project} onStageChange={setActiveStage} />
      case 'script':          return <ScriptsPanel project={project} onUpdate={invalidate} onContinue={goToStage} />
      case 'voice':           return <VoicePanel project={project} onUpdate={invalidate} onContinue={goToStage} regenStatus={voiceRegenStatus} />
      case 'avatar-studio':   return <AvatarStudioPanel project={project} onUpdate={invalidate} onContinue={() => setActiveStage('visual-designer')} />
      case 'visual-designer': return <VisualDesignerPanel project={project} onUpdate={invalidate} onContinue={setActiveStage} />
      case 'video':           return <VideoPanel project={project} onUpdate={invalidate} />
      default:                return null
    }
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full bg-[#f5f7fb] dark:bg-[#0a0e1a]">
        <div className="text-center">
          <p className="text-slate-500 dark:text-slate-400 mb-4">No project selected.</p>
          <Button onClick={() => navigate('/dashboard')}>Back to Projects</Button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#f5f7fb] dark:bg-[#0a0e1a]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex h-full bg-[#f5f7fb] dark:bg-[#0a0e1a]">
      {/* Stage Rail */}
      <div className="w-14 lg:w-56 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-white/10 flex flex-col flex-shrink-0">

        {/* Back + Project name */}
        <div className="p-3 border-b border-slate-100 dark:border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="w-full justify-start mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden lg:block">Projects</span>
          </Button>
          <div className="hidden lg:block px-1">
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate">{project?.title}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 capitalize mt-0.5">
              {project?.status?.replace(/_/g, ' ') || 'draft'}
            </p>
          </div>
        </div>

        {/* Pipeline stages */}
        <nav className="flex-1 p-2 space-y-1.5">
          {STAGES.map(({ id, label, icon: Icon, desc, grad }, index) => {
            const locked = isLocked(id)
            const active = activeStage === id && !showCasting
            return (
              <button
                key={id}
                onClick={() => goToStage(id)}
                disabled={locked}
                title={locked ? 'Complete previous stages first' : desc}
                className={`w-full flex items-center gap-3 px-2 lg:px-2.5 py-2 rounded-xl text-sm text-left transition-all ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-500/20'
                    : locked
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <IconChip Icon={Icon} active={active} locked={locked} grad={grad} />
                <div className="hidden lg:flex flex-1 items-center justify-between min-w-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{label}</p>
                  </div>
                  {!locked && !active && (
                    <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                  )}
                </div>
              </button>
            )
          })}
        </nav>

        {/* Casting settings button */}
        <div className="p-2 border-t border-slate-100 dark:border-white/10">
          <button
            onClick={() => setShowCasting(v => !v)}
            title="Casting settings — choose avatar and voice"
            className={`w-full flex items-center gap-3 px-2 lg:px-2.5 py-2.5 rounded-xl text-sm transition-all ${
              showCasting
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span className="hidden lg:block text-xs font-medium">Casting Settings</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {renderPanel()}
      </div>

      {/* Video render watcher — keeps HeyGen renders progressing and visible
          no matter which stage the user is on, and notifies when all done */}
      <RenderProgressBanner projectId={projectId} />

      {/* Casting popup gate — shown once per project before entering Voice */}
      {showCastingGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <CastingSettings
              project={project}
              onUpdate={invalidate}
              onClose={finishCastingGate}
              onContinue={finishCastingGate}
              onRegenProgress={setVoiceRegenStatus}
              continueLabel="Continue to Voice Generation"
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Workspace-wide video render watcher.
 *
 * HeyGen renders happen server-side and take minutes — the user shouldn't
 * have to sit on the Video tab. This component:
 *   1. Watches all scenes across the project's modules (only polls the API
 *      while at least one scene is actually rendering).
 *   2. Pings pollHeyGenVideo for each rendering scene so completed videos get
 *      saved + composited even if the Video panel is unmounted.
 *   3. Shows a small floating progress pill, and fires a browser notification
 *      when the last render finishes.
 */
function RenderProgressBanner({ projectId }) {
  const queryClient = useQueryClient()
  const [justFinished, setJustFinished] = useState(false)
  const prevRenderingRef = useRef(0)

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts', projectId],
    queryFn: () => scriptsService.listByProject(projectId),
    enabled: !!projectId,
  })

  const moduleIds = scripts.map(s => s.moduleId).filter(Boolean)
  const sceneQueries = useQueries({
    queries: moduleIds.map(mid => ({
      queryKey: ['scenes', mid],
      queryFn: () => scenesService.listByModule(mid),
      // Only keep refetching while something is actually rendering
      // (react-query v5: callback receives the query object)
      refetchInterval: (query) =>
        query.state.data?.some?.(s => s.status === 'rendering') ? 8000 : false,
    })),
  })

  const scenes = sceneQueries.flatMap(q => q.data || [])
  const rendering = scenes.filter(
    s => s.status === 'rendering' && s.avatarVideoUrl?.startsWith('heygen:')
  )
  const totalWithVideoIntent = rendering.length +
    scenes.filter(s => s.avatarVideoUrl && !s.avatarVideoUrl.startsWith('heygen:')).length

  // Actively poll HeyGen for every rendering scene — this is what actually
  // completes the video (saves URL + composites overlay), independent of
  // which panel is open.
  const renderingKey = rendering.map(s => s.id).join(',')
  useEffect(() => {
    if (!rendering.length) return
    // Ask for notification permission the first time a render is in flight
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    const tick = () => {
      rendering.forEach(s => {
        agentsService
          .pollHeyGen(s.avatarVideoUrl.replace('heygen:', ''), s.id)
          .then(r => {
            if (r?.completed) {
              queryClient.invalidateQueries({ queryKey: ['scenes'] })
            }
          })
          .catch(() => {}) // transient poll errors are fine — next tick retries
      })
    }
    const t = setInterval(tick, 8000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderingKey])

  // Detect the moment the last render completes → toast + browser notification
  useEffect(() => {
    if (prevRenderingRef.current > 0 && rendering.length === 0) {
      setJustFinished(true)
      const t = setTimeout(() => setJustFinished(false), 8000)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('ProfAI — videos ready 🎬', {
            body: 'All avatar videos finished rendering. Come back to review and merge them.',
          })
        } catch { /* notification is best-effort */ }
      }
      return () => clearTimeout(t)
    }
    prevRenderingRef.current = rendering.length
  }, [rendering.length])

  if (!rendering.length && !justFinished) return null

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {rendering.length > 0 ? (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-lg">
          <Loader2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400 animate-spin flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-slate-900 dark:text-white">
              Rendering videos — {rendering.length} in progress
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              You can keep working, we'll notify you when they're done
              {totalWithVideoIntent > rendering.length && ` · ${totalWithVideoIntent - rendering.length} already finished`}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-green-200 dark:border-green-500/30 shadow-lg">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          <p className="text-xs font-medium text-slate-900 dark:text-white">All videos finished rendering 🎬</p>
        </div>
      )}
    </div>
  )
}
