import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { projectsService } from '@/services/projects'
import { sourceFilesService } from '@/services/sourceFiles'
import { scriptsService } from '@/services/scripts'
import { scenesService } from '@/services/scenes'
import { modulesService } from '@/services/modules'
import { agentsService } from '@/services/agents'
import {
  ArrowLeft, Library, FileText, Mic2, Image, Video, Wand2,
  Settings, BookOpen, ChevronRight, Loader2, CheckCircle
} from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import SourcesPanel from '@/components/workspace/SourcesPanel'
import ScriptsPanel from '@/components/workspace/ScriptsPanel'
import VoicePanel from '@/components/workspace/VoicePanel'
import VisualDesignerPanel from '@/components/workspace/VisualDesignerPanel'
import VideoEditingPanel from '@/components/workspace/VideoEditingPanel'
import FinalVideoPanel from '@/components/workspace/FinalVideoPanel'
import CastingSettings from '@/components/workspace/CastingSettings'

/**
 * SEQUENTIAL PIPELINE ARCHITECTURE (Human-In-The-Loop):
 * 
 * Stage 1: Library
 * → Upload PDF documents and source materials
 * → UI Status: Card turns green with ✓ on success
 * → Actions: View or Delete uploaded PDFs
 * 
 * Stage 2: Scripts
 * → Auto-generate scripts from PDF content
 * → Full CRUD on scenes: Edit, Delete, Add
 * → Dynamic scene architecture (not fixed 4-segment)
 * → HITL Gate: Approve Script → Lock for next stage
 * 
 * Stage 3: Voices
 * → Voice casting with ElevenLabs integration
 * → Configure voice settings and preferences
 * → Clean, streamlined UI
 * 
 * Stage 4: Visual Design
 * → Choose from design template library
 * → WYSIWYG canvas with avatar placeholder
 * → Direct manipulation: Resize, move, position avatar
 * → Dynamic slide generation (remove 4-segment limits)
 * → Manual image scaling and responsive assets
 * → Clean typography with nested key points
 * 
 * Stage 5: Video Editing
 * → Composition canvas (presentation + avatar)
 * → Remotion-based timeline (Synthesia-like experience)
 * → Motion graphics and slide transitions
 * → Module-based merging and sequencing
 * 
 * Stage 6: Avatar Studio
 * → Isolated avatar rendering layer
 * → Fine-tune avatar position, style, settings
 * → Feature parity with voice casting setup
 * 
 * Stage 7: Final Video
 * → Pipeline convergence: Presentation + Motion + Avatar
 * → Synchronized video compilation per module
 * → Output ready for download
 */
const STAGES = [
  { 
    id: 'library',
    label: '1. Library',
    icon: Library,
    desc: 'Upload sources & materials',
  },
  { 
    id: 'scripts',
    label: '2. Scripts',
    icon: FileText,
    desc: 'Generate & edit scenes',
  },
  { 
    id: 'voices',
    label: '3. Voices',
    icon: Mic2,
    desc: 'Voice casting & settings',
  },
  {
    id: 'visual-design',
    label: '4. Visual Design',
    icon: Image,
    desc: 'Design each slide',
  },
  {
    id: 'video-editing',
    label: '5. Module Editing',
    icon: Video,
    desc: 'Scene transitions & generate',
  },
  {
    id: 'final-video',
    label: '6. Video Vault',
    icon: Video,
    desc: 'Play & download all final videos',
  },
]

// Modern 3D icon chip with unified styling
function IconChip({ active, locked, completed }) {
  return (
    <motion.div
      className={`relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
        locked
          ? 'bg-slate-100 dark:bg-white/5'
          : active
          ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_4px_12px_rgba(0,0,0,0.15)]'
          : completed
          ? 'bg-white dark:bg-slate-800/40 border border-green-500'
          : 'bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-white/10 shadow-sm hover:border-slate-300 dark:hover:border-white/20'
      }`}
      whileHover={!locked ? { scale: 1.1 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    >
      <CheckCircle className={`w-5 h-5 ${
        locked 
          ? 'text-slate-300 dark:text-slate-600' 
          : active 
          ? 'text-white' 
          : completed 
          ? 'text-green-600 dark:text-green-400' 
          : 'text-slate-400 dark:text-slate-500'
      }`} />
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
    refetchOnMount: 'stale',
  })

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts', projectId],
    queryFn: () => scriptsService.listByProject(projectId),
    enabled: !!projectId,
    refetchOnMount: 'stale',
  })

  const { data: modules = [] } = useQuery({
    queryKey: ['modules', projectId],
    queryFn: () => modulesService.listByProject(projectId),
    enabled: !!projectId,
    refetchOnMount: 'stale',
  })

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes', projectId],
    queryFn: async () => {
      if (!modules.length) return []
      // Fetch scenes for all modules
      const allScenes = []
      for (const mod of modules) {
        try {
          const modScenes = await scenesService.listByModule(mod.id)
          allScenes.push(...modScenes)
        } catch (err) {
          console.error(`Failed to fetch scenes for module ${mod.id}:`, err)
        }
      }
      return allScenes
    },
    enabled: !!projectId && modules.length > 0,
    refetchOnMount: 'stale',
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  // Module approvals from Video Editing live in localStorage; mirror them into
  // state so the left-nav "Video Editing" step can turn green the moment every
  // module is approved (same pattern as the Scripts step).
  const moduleApKey = `pa-module-approved-${projectId}`
  const [moduleApprovals, setModuleApprovals] = useState({})
  useEffect(() => {
    try { setModuleApprovals(JSON.parse(localStorage.getItem(moduleApKey) || '{}')) } catch {}
  }, [moduleApKey])

  const castingGateDone = () =>
    !!(project?.defaultAvatarId && project?.defaultVoiceId) ||
    localStorage.getItem(`profai_casting_gate_${projectId}`) === 'done'

  // Navigate to a stage, inserting the Casting Settings popup gate the first
  // time a project heads into Voice (from Scripts, or from the sidebar/jump).
  const goToStage = (stageId) => {
    if (isLocked(stageId)) return
    if (stageId === 'voices' && !castingGateDone()) {
      setShowCastingGate(true)
      return
    }
    setActiveStage(stageId)
    setShowCasting(false)
  }

  const finishCastingGate = () => {
    localStorage.setItem(`profai_casting_gate_${projectId}`, 'done')
    setShowCastingGate(false)
    setActiveStage('voices')
    setShowCasting(false)
  }

  const isLocked = (stageId) => {
    // Stages unlock only when previous stage is complete
    const stageOrder = ['library', 'scripts', 'voices', 'visual-design', 'video-editing', 'final-video']
    const currentIndex = stageOrder.indexOf(stageId)
    
    // Library is always unlocked
    if (currentIndex === 0) return false
    
    // Each stage requires previous stage to be complete
    const previousStageId = stageOrder[currentIndex - 1]
    return !isStageComplete(previousStageId)
  }

  const isStageComplete = (stageId) => {
    /**
     * CLEAR SEQUENTIAL COMPLETION RULES:
     * 
     * Stage 1 (Library):
     *   - User uploads PDFs
     *   - User clicks "Generate Journey"
     *   - Scripts are created
     *   - COMPLETE when: sources exist AND scripts are generated
     * 
     * Stage 2 (Scripts):
     *   - User views auto-generated scripts
     *   - User approves ALL scripts
     *   - COMPLETE when: ALL scripts have approvalStatus === 'approved'
     * 
     * Stage 3 (Voices):
     *   - User selects a voice
     *   - COMPLETE when: defaultVoiceId is set
     * 
     * Stages 4-7: TODO
     * 
     * CASCADE DELETE:
     *   - Delete all PDFs → cascade delete all scripts
     *   - Reset project status to 'draft'
     *   - Clear defaultVoiceId, defaultAvatarId
     *   - Library becomes incomplete (no scripts)
     *   - Scripts stage locks
     *   - Voices stage locks
     *   - User must restart from Library
     */
    
    switch (stageId) {
      case 'library':
        // DONE when: sources uploaded AND scripts generated
        return sources.length > 0 && scripts.length > 0
        
      case 'scripts':
        // DONE when: scripts exist AND ALL are approved
        return (
          scripts.length > 0 &&
          scripts.every(s => s.approvalStatus === 'approved')
        )
        
      case 'voices':
        // DONE when: voice is selected (defaultVoiceId is set)
        return (
          project?.defaultVoiceId !== null &&
          project?.defaultVoiceId !== undefined
        )
        
      case 'visual-design':
        // Green (and unlocks Video Editing) once EVERY part of EVERY scene is
        // APPROVED — same "all approved" gate the Scripts step uses. The
        // per-module "Generate & approve all" button is what flips the whole
        // stage green. Approval lives per-part in each segment's slideDesign
        // JSON (multi-part scenes) or on scene.approvedAt (single-part).
        if (!modules.length || !scenes.length) return false
        return scenes.every(sc => {
          const segs = (sc.segments && sc.segments.length) ? sc.segments : null
          if (segs) {
            return segs.every(seg => {
              try { return !!JSON.parse(seg.slideDesign || '{}').approvedAt } catch { return false }
            })
          }
          return !!sc.approvedAt
        })

      case 'video-editing':
        // Green (and unlocks Final Video) once EVERY module is APPROVED in the
        // Video Editing step — same "all approved" gate the Scripts step uses.
        if (!modules.length) return false
        return modules.every(mod => !!moduleApprovals[mod.id])
        
      case 'avatar-studio':
        return false // TODO
        
      case 'final-video':
        return false // TODO
        
      default:
        return false
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
            <BookOpen className="w-7 h-7 text-slate-300 dark:text-slate-500/60" />
          </div>
          <p className="text-slate-900 dark:text-white font-medium mb-2">{stageInfo?.label} is locked</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {activeStage === 'scripts'
              ? 'Upload at least one source file in the Library first.'
              : ['voices', 'visual-design', 'video-editing', 'final-video'].includes(activeStage)
              ? 'Generate and approve scripts first.'
              : 'Complete the previous stages first.'}
          </p>
        </div>
      )
    }

    switch (activeStage) {
      case 'library':         return <SourcesPanel project={project} onStageChange={setActiveStage} />
      case 'scripts':         return <ScriptsPanel project={project} onUpdate={invalidate} onContinue={goToStage} />
      case 'voices':          return <VoicePanel project={project} onUpdate={invalidate} onContinue={goToStage} regenStatus={voiceRegenStatus} />
      case 'visual-design':   return <VisualDesignerPanel project={project} onUpdate={invalidate} onContinue={setActiveStage} />
      case 'video-editing':   return <VideoEditingPanel project={project} onUpdate={invalidate} onContinue={setActiveStage} onApprovalsChange={setModuleApprovals} />
      case 'final-video':     return <FinalVideoPanel project={project} onUpdate={invalidate} />
      default:                return null
    }
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-slate-500 dark:text-slate-400 mb-4">No project selected.</p>
          <Button onClick={() => navigate('/dashboard')}>Back to Projects</Button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Stage Rail — icon-only on narrow screens, expanded with labels on
          lg+ screens. Fixed per breakpoint, no hover-to-expand interaction. */}
      <div className="w-16 lg:w-72 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 border-r border-slate-100 dark:border-white/10 flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200">

        {/* Header */}
        <div className="px-2 lg:px-6 py-4 border-b border-slate-100 dark:border-white/10 transition-all duration-200">
          <div className="flex items-center justify-center lg:justify-start gap-2 mb-0 lg:mb-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white flex-shrink-0"
              title="Back to dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0 hidden lg:block">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">{project?.title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{project?.status?.replace(/_/g, ' ')}</p>
            </div>
          </div>
        </div>

        {/* Pipeline stages - Scrollable */}
        <nav className="flex-1 overflow-y-auto px-1.5 lg:px-6 py-6 space-y-3 transition-all duration-200">
          {STAGES.map(({ id, label, icon: Icon, desc }) => {
            const locked = isLocked(id)
            const active = activeStage === id && !showCasting
            // Only show as completed if NOT locked AND genuinely complete
            const completed = !locked && isStageComplete(id) && !active

            return (
              <motion.button
                key={id}
                onClick={() => goToStage(id)}
                disabled={locked}
                whileHover={!locked ? { x: 4 } : {}}
                whileTap={!locked ? { scale: 0.98 } : {}}
                title={label}
                className={`w-full group text-left transition-all duration-200 ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className={`p-2 lg:p-4 rounded-2xl border-2 transition-all ${
                  active
                    ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-transparent shadow-lg shadow-opacity-20'
                    : completed
                    ? 'bg-white dark:bg-slate-800/30 border-green-500 shadow-md'
                    : locked
                    ? 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 group-hover:border-slate-200 dark:group-hover:border-white/20'
                    : 'bg-white dark:bg-slate-800/30 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:shadow-md'
                }`}>
                  <div className="flex items-center justify-center lg:justify-start lg:items-start gap-3">
                    <IconChip active={active} locked={locked} completed={completed} />
                    <div className="flex-1 min-w-0 hidden lg:block">
                      <p className={`text-sm font-semibold ${active ? 'text-white' : completed ? 'text-green-700 dark:text-green-300' : 'text-slate-900 dark:text-white'}`}>{label}</p>
                      <p className={`text-xs ${active ? 'text-white/80' : completed ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>{desc}</p>
                    </div>
                    <div className="hidden lg:flex flex-shrink-0 mt-0.5">
                      {active && <CheckCircle className="w-4 h-4 text-white" />}
                      {completed && <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />}
                      {!locked && !active && !completed && <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300" />}
                      {locked && <span className="text-xs text-slate-400 dark:text-slate-500">Locked</span>}
                    </div>
                  </div>
                </div>
              </motion.button>
            )
          })}
        </nav>

        {/* Casting settings button */}
        <div className="p-2 lg:p-6 border-t border-slate-100 dark:border-white/10 bg-gradient-to-b from-transparent to-slate-50 dark:to-slate-900/50 transition-all duration-200">
          <button
            onClick={() => setShowCasting(v => !v)}
            title="Configure avatar, voice, and styling"
            className={`w-full flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-4 py-3 rounded-xl font-medium text-sm transition-all ${
              showCasting
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 hover:shadow-md'
            }`}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span className="hidden lg:inline">Casting Settings</span>
          </button>
        </div>
      </div>

      {/* Main content — min-w-0 lets it actually shrink inside the flex row
          instead of forcing overflow when the viewport is narrow */}
      <div className="flex-1 min-w-0 overflow-y-auto">
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
