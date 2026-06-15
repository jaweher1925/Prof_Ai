/**
 * Stage 4 — Visual
 * Generates background images for each scene using DALL-E 3.
 */
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { Image, Loader2, CheckCircle, Sparkles, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'

export default function VisualPanel({ project, onUpdate }) {
  const [generating, setGenerating] = useState({})
  const [errors, setErrors] = useState({})

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn: () => scriptsService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const handleGenerate = async (sceneId) => {
    setGenerating(prev => ({ ...prev, [sceneId]: true }))
    setErrors(prev => ({ ...prev, [sceneId]: null }))
    try {
      await agentsService.runGenerateAsset(sceneId)
      onUpdate?.()
    } catch (e) {
      setErrors(prev => ({ ...prev, [sceneId]: e.message || 'Visual generation failed' }))
    } finally {
      setGenerating(prev => ({ ...prev, [sceneId]: false }))
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  if (scripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center">
        <Image className="w-10 h-10 text-slate-700 mb-3" />
        <p className="text-slate-400">No scripts yet. Complete the Script stage first.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <Image className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-medium text-white tracking-wide">Visual Generation</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Generate background images for each scene using DALL-E 3.
        Images are created from each scene's visual prompt.
      </p>

      {scripts.map(script => (
        <div key={script.id} className="mb-8">
          <h3 className="text-sm font-medium text-white mb-3">{script.title}</h3>
          <SceneVisualList
            moduleId={script.moduleId}
            generating={generating}
            errors={errors}
            onGenerate={handleGenerate}
          />
        </div>
      ))}
    </div>
  )
}

function SceneVisualList({ moduleId, generating, errors, onGenerate }) {
  const { data: scenes = [], isLoading, refetch } = useQuery({
    queryKey: ['scenes', moduleId],
    queryFn: () => moduleId
      ? fetch(`/api/modules/${moduleId}/scenes`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!moduleId,
  })

  if (isLoading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>
  if (!scenes.length) return <p className="text-slate-600 text-sm">No scenes.</p>

  return (
    <div className="grid grid-cols-1 gap-4">
      {scenes.map((scene, i) => {
        const isGen = generating[scene.id]
        const hasImage = !!scene.visualAssetUrl
        const err = errors[scene.id]

        return (
          <div key={scene.id}
            className="rounded-xl bg-slate-900/40 border border-white/[0.06] overflow-hidden">
            <div className="flex gap-4 p-4">
              {/* Thumbnail */}
              <div className="w-24 h-16 rounded-lg bg-slate-800 flex-shrink-0 overflow-hidden">
                {hasImage
                  ? <img src={scene.visualAssetUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <Image className="w-5 h-5 text-slate-600" />
                    </div>
                }
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs text-white mb-1">Scene {i + 1}</p>
                <p className="text-xs text-slate-500 truncate italic">
                  {scene.visualPrompt || 'No visual prompt'}
                </p>
                {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {hasImage && (
                  <a href={scene.visualAssetUrl} target="_blank" rel="noopener noreferrer"
                    className="text-slate-500 hover:text-indigo-400 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                {hasImage
                  ? <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Done</Badge>
                  : <Button size="sm" variant="secondary" disabled={isGen} onClick={() => onGenerate(scene.id)}>
                      {isGen
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                        : <><Sparkles className="w-3.5 h-3.5" />Generate</>}
                    </Button>
                }
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
