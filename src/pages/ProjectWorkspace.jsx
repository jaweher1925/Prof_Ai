import React, { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsService } from '@/services/projects'
import { sourceFilesService } from '@/services/sourceFiles'
import {
  ArrowLeft, Library, FileText, Mic2, Image, Video,
  Download, Settings, BookOpen, ChevronRight
} from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import SourcesPanel from '@/components/workspace/SourcesPanel'
import ScriptsPanel from '@/components/workspace/ScriptsPanel'
import VoicePanel from '@/components/workspace/VoicePanel'
import VisualPanel from '@/components/workspace/VisualPanel'
import VideoPanel from '@/components/workspace/VideoPanel'
import CastingSettings from '@/components/workspace/CastingSettings'

/**
 * NEW pipeline order (most expensive last):
 * 1. Library  → upload sources
 * 2. Script   → AI generates text scripts
 * 3. Voice    → ElevenLabs converts text to audio
 * 4. Visual   → DALL-E generates background images
 * 5. Video    → HeyGen generates avatar videos (expensive — LAST)
 *
 * Casting (avatar/voice settings) = gear button, not a stage
 */
const STAGES = [
  { id: 'library', label: 'Library',  icon: Library,   desc: 'Upload sources' },
  { id: 'script',  label: 'Script',   icon: FileText,  desc: 'Generate text'  },
  { id: 'voice',   label: 'Voice',    icon: Mic2,      desc: 'Text to audio'  },
  { id: 'visual',  label: 'Visual',   icon: Image,     desc: 'Generate images' },
  { id: 'video',   label: 'Video',    icon: Video,     desc: 'Avatar videos'  },
]

export default function ProjectWorkspace() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = params.get('project_id')

  const [activeStage, setActiveStage] = useState('library')
  const [showCasting, setShowCasting] = useState(false)

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsService.get(projectId),
    enabled: !!projectId,
    refetchInterval: (data) =>
      data?.status === 'ingesting_sources' ? 3000 : false,
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

  const isLocked = (stageId) => {
    switch (stageId) {
      case 'library': return false
      case 'script':  return sources.length === 0
      case 'voice':   return !['journey_approved','in_production','completed'].includes(project?.status)
      case 'visual':  return !['journey_approved','in_production','completed'].includes(project?.status)
      case 'video':   return !['in_production','completed'].includes(project?.status)
      default:        return true
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
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/[0.06] flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-slate-700" />
          </div>
          <p className="text-white font-medium mb-2">{stageInfo?.label} is locked</p>
          <p className="text-slate-500 text-sm">
            {activeStage === 'script'
              ? 'Upload at least one source file in the Library first.'
              : activeStage === 'voice' || activeStage === 'visual'
              ? 'Generate and approve scripts first.'
              : 'Complete the previous stages first.'}
          </p>
        </div>
      )
    }

    switch (activeStage) {
      case 'library': return <SourcesPanel project={project} onStageChange={setActiveStage} />
      case 'script':  return <ScriptsPanel project={project} onUpdate={invalidate} />
      case 'voice':   return <VoicePanel project={project} onUpdate={invalidate} />
      case 'visual':  return <VisualPanel project={project} onUpdate={invalidate} />
      case 'video':   return <VideoPanel project={project} onUpdate={invalidate} />
      default:        return null
    }
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-slate-500 mb-4">No project selected.</p>
          <Button onClick={() => navigate('/')}>Back to Projects</Button>
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
    <div className="flex h-full bg-slate-950">
      {/* Stage Rail */}
      <div className="w-14 lg:w-52 border-r border-white/[0.06] flex flex-col flex-shrink-0">

        {/* Back + Project name */}
        <div className="p-3 border-b border-white/[0.06]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="w-full justify-start mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden lg:block">Projects</span>
          </Button>
          <div className="hidden lg:block px-1">
            <p className="text-xs text-slate-400 font-medium truncate">{project?.title}</p>
            <p className="text-xs text-slate-600 capitalize mt-0.5">
              {project?.status?.replace(/_/g, ' ') || 'draft'}
            </p>
          </div>
        </div>

        {/* Pipeline stages */}
        <nav className="flex-1 p-2 space-y-1">
          {STAGES.map(({ id, label, icon: Icon, desc }, index) => {
            const locked = isLocked(id)
            const active = activeStage === id && !showCasting
            return (
              <button
                key={id}
                onClick={() => { if (!locked) { setActiveStage(id); setShowCasting(false) } }}
                disabled={locked}
                title={locked ? 'Complete previous stages first' : desc}
                className={`w-full flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-xl text-sm text-left transition-all ${
                  active
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                    : locked
                    ? 'text-slate-700 cursor-not-allowed'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`text-xs font-bold flex-shrink-0 ${
                    active ? 'text-indigo-400' : locked ? 'text-slate-700' : 'text-slate-600'
                  }`}>{index + 1}</span>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden lg:block truncate">{label}</span>
                </div>
                {!locked && !active && (
                  <ChevronRight className="w-3 h-3 text-slate-700 hidden lg:block flex-shrink-0" />
                )}
              </button>
            )
          })}
        </nav>

        {/* Casting settings button */}
        <div className="p-2 border-t border-white/[0.06]">
          <button
            onClick={() => setShowCasting(v => !v)}
            title="Casting settings — choose avatar and voice"
            className={`w-full flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-xl text-sm transition-all ${
              showCasting
                ? 'bg-slate-700/50 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span className="hidden lg:block text-xs">Casting Settings</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {renderPanel()}
      </div>
    </div>
  )
}
