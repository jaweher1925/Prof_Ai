/**
 * Visual Designer — WYSIWYG canvas with template gallery, direct avatar
 * manipulation, responsive images, and flexible nested content (#1-#7).
 *
 * Work is scoped MODULE BY MODULE: pick a module first, then choose/apply a
 * template to that module's scenes and edit its slides. Each module keeps
 * its own template choice — nothing is applied project-wide at once.
 *
 * Architecture:
 * - Template Selection: 10 professional templates (ids match slideRenderer.ts's
 *   THEMES table 1:1, so choosing one actually changes the rendered video).
 * - Interactive WYSIWYG Canvas: dedicated avatar placeholder, drag/resize
 *   directly on the slide — no sidebar-only editing.
 * - Layout Fluidity: text content area auto-narrows to stay clear of wherever
 *   the avatar placeholder currently sits.
 * - Responsive images: independent width/height (can stretch), draggable.
 * - No pagination limits: any number of scenes, any number of focused ideas
 *   per slide, any number of nested key points per idea.
 * - Typography: no default bullet symbols — content is a list of focused
 *   ideas, each with its own nested key points underneath.
 * - Content is seeded from the earlier pipeline steps (script/storyboard
 *   generated title + bullets) instead of opening blank — see
 *   api/src/functions/compositions.ts#buildDefaultCompositionSeed.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { modulesService } from '@/services/modules'
import { scenesService } from '@/services/scenes'
import { uploadFile } from '@/services/upload'
import apiClient from '@/api/apiClient'
import {
  CheckCircle, Sparkles, ArrowRight, ArrowLeft, ChevronRight,
  Plus, Trash2, GripHorizontal, Image as ImageIcon, Maximize2, Layers,
  Upload, Wand2, Loader2, AlertCircle, X, Eye, EyeOff, Pencil, Mic, Settings, Palette, FileText,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import StageHeader from '@/components/workspace/StageHeader'

// Text Motion — controls how the narration-synced caption reveals during
// playback/export (drives Scene.textAnimationType → ffmpegVideo.ts's
// caption burn-in). Restored from the original Visual Designer.
const MOTION_STYLES = [
  { id: 'word-by-word', label: 'Word by Word', icon: '✳', desc: 'Captions reveal one word at a time as the voiceover speaks' },
  { id: 'line-by-line', label: 'Line by Line',  icon: '☰', desc: 'Each sentence fades in together as it\u2019s spoken' },
  { id: 'all-at-once',  label: 'All at Once',   icon: '▣', desc: 'Full caption shown immediately once narration starts' },
]

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE LIBRARY — ids map 1:1 to api/src/lib/slideRenderer.ts THEMES
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATE_LIBRARY = [
  { id: 'modern',    name: 'Modern',    colors: { bg: '#0B1220', accent: '#3B82F6', text: '#F8FAFC' } },
  { id: 'minimal',   name: 'Minimal',   colors: { bg: '#FAFAFA', accent: '#6B7280', text: '#111827' } },
  { id: 'corporate', name: 'Corporate', colors: { bg: '#111827', accent: '#F59E0B', text: '#F9FAFB' } },
  { id: 'vibrant',   name: 'Vibrant',   colors: { bg: '#2A0A1A', accent: '#EC4899', text: '#FFF5F7' } },
  { id: 'ocean',     name: 'Ocean',     colors: { bg: '#041A2E', accent: '#06B6D4', text: '#F0FDFF' } },
  { id: 'forest',    name: 'Forest',    colors: { bg: '#08170D', accent: '#16A34A', text: '#F0FDF4' } },
  { id: 'sunset',    name: 'Sunset',    colors: { bg: '#1F1408', accent: '#F97316', text: '#FFFBEB' } },
  { id: 'elegant',   name: 'Elegant',   colors: { bg: '#0D0D0D', accent: '#D97706', text: '#F5F5F5' } },
  { id: 'academic',  name: 'Academic',  colors: { bg: '#0A1A0A', accent: '#10B981', text: '#F0FDF4' } },
  { id: 'startup',   name: 'Startup',   colors: { bg: '#05070D', accent: '#58A6FF', text: '#F0F6FC' } },
]

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — module picker first, then per-module editor
// ═══════════════════════════════════════════════════════════════════════════

export default function VisualDesignerPanel({ project, onUpdate, onContinue }) {
  const [activeModuleId, setActiveModuleId] = useState(null)
  const [completedModules, setCompletedModules] = useState(new Set())

  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['modules', project?.id],
    queryFn: () => modulesService.listByProject(project.id),
    enabled: !!project?.id,
  })

  // Check which modules are actually complete by counting generated scenes
  useEffect(() => {
    const checkCompletedModules = async () => {
      if (!modules.length) return
      const completed = new Set()
      
      for (const mod of modules) {
        try {
          const scenes = await scenesService.listByModule(mod.id)
          const totalScenes = scenes.length
          const generatedScenes = scenes.filter(s => !!s.visualAssetUrl).length
          
          // Module is complete if all scenes have been generated and there's at least 1 scene
          if (totalScenes > 0 && generatedScenes === totalScenes) {
            completed.add(mod.id)
          }
        } catch (err) {
          console.error(`Failed to check module ${mod.id}:`, err)
        }
      }
      setCompletedModules(completed)
    }

    checkCompletedModules()
  }, [modules])

  useEffect(() => {
    // Listen for module design completion but don't auto-advance
    // (ProjectWorkspace handles the stage transition now)
    const handleModuleComplete = (e) => {
      if (e.detail?.moduleId) {
        setCompletedModules(prev => new Set([...prev, e.detail.moduleId]))
      }
    }
    window.addEventListener('moduleDesignComplete', handleModuleComplete)
    return () => window.removeEventListener('moduleDesignComplete', handleModuleComplete)
  }, [])

  const { data: scripts = [], isLoading: scriptsLoading } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn: () => scriptsService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const isLoading = scriptsLoading || modulesLoading

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>
  if (!scripts.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center">
        <p className="text-slate-500 dark:text-slate-400">No scripts yet. Complete the Script stage first.</p>
      </div>
    )
  }

  const activeModuleIndex = modules.findIndex(m => m.id === activeModuleId)
  const activeModule = activeModuleIndex >= 0 ? modules[activeModuleIndex] : null

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      <div className="px-6 pt-6">
        <StageHeader
          icon={Sparkles}
          title="4. Visual Design"
          subtitle={
            activeModule
              ? `Module ${activeModuleIndex + 1}: ${activeModule.title}`
              : `${modules.length} module${modules.length === 1 ? '' : 's'} · design each module's slides separately`
          }
        />
      </div>

      {/* Sub-header: breadcrumb + continue action — wraps on narrow screens
          instead of forcing horizontal overflow */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        <div className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1.5 min-w-0">
          {activeModule ? (
            <>
              <button onClick={() => setActiveModuleId(null)} className="text-indigo-600 dark:text-indigo-400 hover:underline flex-shrink-0">
                All modules
              </button>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="font-medium text-slate-900 dark:text-white truncate">Module {activeModuleIndex + 1}: {activeModule.title}</span>
            </>
          ) : (
            <span>Pick a module to start designing</span>
          )}
        </div>
        <button
          onClick={() => onContinue?.('video-editing')}
          disabled={completedModules.size === 0}
          className={`flex items-center gap-2 px-4 py-2 font-medium rounded-xl transition-colors flex-shrink-0 ${
            completedModules.size === 0
              ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
          title={completedModules.size === 0 ? 'Complete at least one module first' : 'Proceed to Video Editing'}
        >
          Continue to Video
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeModule
          ? <ModuleDesigner module={activeModule} moduleIndex={activeModuleIndex} onBack={() => setActiveModuleId(null)} />
          : <ModulePicker modules={modules} onSelect={setActiveModuleId} completedModules={completedModules} />}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE PICKER — choose which module to design (module-by-module, not all at once)
// ═══════════════════════════════════════════════════════════════════════════

function ModulePicker({ modules, onSelect, completedModules = new Set() }) {
  if (!modules.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center">
        <p className="text-slate-500 dark:text-slate-400">No modules yet.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="max-w-2xl mx-auto grid gap-2">
        {modules.map((mod, idx) => {
          const isComplete = completedModules.has(mod.id)
          return (
            <button
              key={mod.id}
              onClick={() => onSelect(mod.id)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-lg border-2 transition-all text-left ${
                isComplete
                  ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 hover:border-emerald-500 dark:hover:border-emerald-400'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-indigo-400 dark:hover:border-indigo-500'
              } hover:shadow-sm`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isComplete
                  ? 'bg-emerald-100 dark:bg-emerald-500/20'
                  : 'bg-indigo-100 dark:bg-indigo-500/20'
              }`}>
                {isComplete ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {idx + 1}. {mod.title}
                </p>
                <p className={`text-xs ${isComplete ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                  {mod._count?.scenes ?? '—'} scene{mod._count?.scenes === 1 ? '' : 's'}
                  {isComplete && ' • ✓ Complete'}
                </p>
              </div>
              <ChevronRight className={`w-4 h-4 flex-shrink-0 ${
                isComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
              }`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE DESIGNER — template gallery + canvas editor, scoped to ONE module
// ═══════════════════════════════════════════════════════════════════════════

function ModuleDesigner({ module, moduleIndex, onBack }) {
  const queryClient = useQueryClient()
  const [selectedTemplate, setSelectedTemplate] = useState('modern')
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  const [showTemplateGallery, setShowTemplateGallery] = useState(true)
  const [applying, setApplying] = useState(false)
  // Bulk "Generate All Slides" — renders every scene's complete slide graphic
  // (title + key insight + content points, whatever is currently in its
  // composition) in one go, instead of clicking Generate on each one.
  const [generatingAll, setGeneratingAll] = useState(false)
  const [generateAllProgress, setGenerateAllProgress] = useState(null) // { done, total }

  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', module.id],
    queryFn: () => scenesService.listByModule(module.id),
    enabled: !!module.id,
  })

  const sortedScenes = [...scenes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  const generatedCount = sortedScenes.filter(s => !!s.visualAssetUrl).length

  useEffect(() => {
    if (sortedScenes.length && !selectedSceneId) {
      setSelectedSceneId(sortedScenes[0].id)
    }
  }, [sortedScenes, selectedSceneId])

  // Auto-advance to video when all slides are generated for this single module
  useEffect(() => {
    const isComplete = sortedScenes.length > 0 && generatedCount === sortedScenes.length && generatedCount > 0
    if (isComplete && !generatingAll) {
      const timer = setTimeout(() => {
        // Trigger auto-advance to video stage
        const event = new CustomEvent('moduleDesignComplete', { 
          detail: { moduleId: module.id, isReadyForVideo: true } 
        })
        window.dispatchEvent(event)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [generatedCount, sortedScenes.length, generatingAll, module.id])

  const selectedScene = sortedScenes.find(s => s.id === selectedSceneId)

  const applyTemplateToModule = useCallback(async () => {
    setApplying(true)
    try {
      await apiClient.post(`/modules/${module.id}/apply-template`, { templateId: selectedTemplate })
      // Broad ['scenes'] key (not just this module) so ProjectWorkspace's own
      // ['scenes', projectId] query also refreshes — that's what decides
      // whether the Video Editing stage is unlocked in the sidebar.
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      setShowTemplateGallery(false)
    } catch (err) {
      console.error('Template application failed:', err)
    } finally {
      setApplying(false)
    }
  }, [module.id, selectedTemplate, queryClient])

  const handleGenerateAllSlides = useCallback(async () => {
    if (!sortedScenes.length) return
    setGeneratingAll(true)
    setGenerateAllProgress({ done: 0, total: sortedScenes.length })
    for (let i = 0; i < sortedScenes.length; i++) {
      try {
        await apiClient.post('/generateSceneAsset', { scene_id: sortedScenes[i].id })
      } catch (err) {
        console.error(`Slide generation failed for scene ${sortedScenes[i].id}:`, err)
      }
      setGenerateAllProgress({ done: i + 1, total: sortedScenes.length })
    }
    // Broad ['scenes'] key so ProjectWorkspace's own ['scenes', projectId]
    // query also refreshes — a narrower per-module key here left the
    // sidebar's Video Editing stage showing "Locked" even after a module
    // finished, since the stage-lock check reads from that separate cache.
    await queryClient.invalidateQueries({ queryKey: ['scenes'] })
    setGeneratingAll(false)
    
    // Auto-advance to video stage when all slides are generated
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('allSlidesGenerated', { detail: { moduleId: module.id } }))
    }, 500)
  }, [sortedScenes, module.id, queryClient])

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-2.5 border-b border-slate-200 dark:border-white/10 flex items-center gap-3 flex-shrink-0 bg-white dark:bg-slate-900">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <span className="text-xs text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>
        <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline truncate">
          {generatedCount}/{sortedScenes.length} slide{sortedScenes.length === 1 ? '' : 's'} generated
          {generatedCount === sortedScenes.length && sortedScenes.length > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium text-[10px]">
              <CheckCircle className="w-3 h-3" /> Complete!
            </span>
          )}
        </span>
        {!showTemplateGallery && sortedScenes.length > 0 && (
          <button
            onClick={handleGenerateAllSlides}
            disabled={generatingAll}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
              generatingAll
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {generatingAll
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden md:inline">Generating {generateAllProgress?.done}/{generateAllProgress?.total}…</span></>
              : <><Sparkles className="w-3.5 h-3.5" /><span className="hidden md:inline">Generate All Slides</span></>}
          </button>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {showTemplateGallery ? (
          <TemplateGallery
            templates={TEMPLATE_LIBRARY}
            selected={selectedTemplate}
            onSelect={setSelectedTemplate}
            onApply={applyTemplateToModule}
            applying={applying}
            sceneCount={sortedScenes.length}
            moduleTitle={module.title}
          />
        ) : (
          <>
            <SceneList
              scenes={sortedScenes}
              selectedId={selectedSceneId}
              onSelect={setSelectedSceneId}
              onChangeTemplate={() => setShowTemplateGallery(true)}
            />

            {selectedScene && (
              <CanvasEditor
                key={selectedScene.id}
                scene={selectedScene}
                sceneIndex={sortedScenes.findIndex(s => s.id === selectedScene.id)}
                totalScenes={sortedScenes.length}
                moduleIndex={moduleIndex}
                moduleTitle={module.title}
                template={TEMPLATE_LIBRARY.find(t => t.id === selectedTemplate) || TEMPLATE_LIBRARY[0]}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE GALLERY
// ═══════════════════════════════════════════════════════════════════════════

function TemplateGallery({ templates, selected, onSelect, onApply, applying, sceneCount, moduleTitle }) {
  return (
    <div className="w-full flex flex-col items-center justify-center p-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 overflow-y-auto">
      <div className="max-w-4xl">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Choose a Design Template</h3>
          <p className="text-slate-600 dark:text-slate-400">
            Select a template to apply to {sceneCount} slide{sceneCount === 1 ? '' : 's'} in <strong>{moduleTitle}</strong>
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
          {templates.map(template => (
            <button
              key={template.id}
              onClick={() => onSelect(template.id)}
              className={`group relative p-4 rounded-xl border-2 transition-all ${
                selected === template.id
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                  : 'border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500'
              }`}
            >
              <div
                className="w-full h-24 rounded-lg mb-3 border border-slate-200 dark:border-white/10 flex items-end p-2"
                style={{ backgroundColor: template.colors.bg }}
              >
                <div className="h-1.5 w-2/3 rounded" style={{ backgroundColor: template.colors.accent }} />
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-white text-center">{template.name}</p>
              {selected === template.id && (
                <div className="absolute top-2 right-2 bg-indigo-500 rounded-full p-1">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={onApply} disabled={applying} className="bg-indigo-600 hover:bg-indigo-500 text-white" size="lg">
            <Sparkles className="w-4 h-4 mr-2" />
            {applying ? 'Applying…' : `Apply "${templates.find(t => t.id === selected)?.name}" to This Module's Slides`}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE LIST (LEFT SIDEBAR) — no cap on number of scenes shown (#6)
// ═══════════════════════════════════════════════════════════════════════════

function SceneList({ scenes, selectedId, onSelect, onChangeTemplate }) {
  return (
    <div className="w-48 lg:w-64 flex-shrink-0 border-r border-slate-200 dark:border-white/10 overflow-y-auto bg-white dark:bg-slate-900">
      <div className="p-4 border-b border-slate-200 dark:border-white/10 sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Scene List</p>
        <button
          onClick={onChangeTemplate}
          className="w-full px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors border border-indigo-200 dark:border-indigo-800"
        >
          Change Template
        </button>
      </div>

      <div className="p-2 space-y-1">
        {scenes.map((scene, idx) => {
          const isSelected = selectedId === scene.id
          return (
            <div key={scene.id}>
              <button
                onClick={() => onSelect(scene.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  isSelected
                    ? 'bg-indigo-500/20 border-l-2 border-l-indigo-500 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold w-5 h-5 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-700 flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span className="truncate flex-1">Scene {idx + 1}</span>
                  {/* Generated indicator — a slide graphic already exists for this scene */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${scene.visualAssetUrl ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                    title={scene.visualAssetUrl ? 'Slide generated' : 'Not generated yet'}
                  />
                </div>
              </button>
              {/* Thumbnail of the generated slide, shown under the active scene */}
              {isSelected && scene.visualAssetUrl && (
                <div className="mx-2 mt-1.5 mb-1 rounded-md overflow-hidden border border-indigo-300 dark:border-indigo-500/40">
                  <img src={scene.visualAssetUrl} alt="" className="w-full block" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CANVAS EDITOR (MAIN EDITING AREA)
// ═══════════════════════════════════════════════════════════════════════════

// Layout options — ids map 1:1 to api/src/lib/slideRenderer.ts's buildSlide()
// layout switch cases, so picking one here actually changes the exported
// slide, not just the editor. Not every slide defaults to the same layout —
// see compositions.ts#defaultLayoutForScene (e.g. a module's intro/welcome
// scene defaults to 'title-hero', title centered in the middle).
const LAYOUT_OPTIONS = [
  { id: 'title-hero', label: 'Title Intro',  desc: 'Title centered in the middle — good for intros' },
  { id: 'bullets',    label: 'Bullets',      desc: 'Title + focused ideas as a list' },
  { id: 'split',      label: 'Two Column',   desc: 'Concept on the left, examples on the right' },
  { id: 'definition', label: 'Definition',   desc: 'Term + definition + examples' },
  { id: 'quote',      label: 'Quote',        desc: 'Large centered quotation' },
  { id: 'summary',    label: 'Summary',      desc: 'Checklist-style recap' },
]

// Cadre (frame/border) effect options for content points
const CADRE_STYLES = [
  { id: 'none',      label: 'None',      desc: 'No frame — clean text' },
  { id: 'subtle',    label: 'Subtle',    desc: 'Light border with accent color' },
  { id: 'bold',      label: 'Bold',      desc: 'Thick border and background' },
  { id: 'rounded',   label: 'Rounded',   desc: 'Rounded corners with soft shadow' },
]

const DEFAULT_SLIDE = {
  title: 'Untitled Slide',
  subtitle: '',
  contentBlocks: [],
  layout: 'bullets',
  cadreStyle: 'none',    // Frame/border effect for content points
  // Fixed positioning for all slides - same distance for all
  titleX: 0,
  titleY: 0,
  subtitleX: 0,
  subtitleY: 7,
  // Font-size multipliers - DISABLED, use fixed sizes
  titleFontScale: 1,
  subtitleFontScale: 1,
  contentFontScale: 1,
  // Avatar positioned in far right corner with minimal size
  avatarX: 97,           // Far right corner (almost at edge)
  avatarY: 8,            // Near top
  avatarWidth: 5,        // Very small - just border visible
  imageUrl: null,
  imageX: 10,
  imageY: 70,
  imageWidth: 20,
  imageHeight: 20,
  textAnimationType: 'word-by-word',
}

function CanvasEditor({ scene, template, sceneIndex = 0, totalScenes = 1, moduleIndex = 0, moduleTitle = '' }) {
  const queryClient = useQueryClient()
  const [slideData, setSlideData] = useState(DEFAULT_SLIDE)
  const [loaded, setLoaded] = useState(false)

  const [dragTarget, setDragTarget] = useState(null)   // 'avatar' | 'image' | 'title' | 'subtitle' | { type: 'content-block', index: N } | null
  const [resizeTarget, setResizeTarget] = useState(null) // 'avatar' | 'image-corner' | null
  const [saving, setSaving] = useState(false)
  const [showRightPanel, setShowRightPanel] = useState(false) // Collapsed by default to maximize canvas
  const [selectedBlockIdx, setSelectedBlockIdx] = useState(null) // Track which content block is selected for editing
  const canvasRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  // Title, key insight, and each content block are each dragged as a % OFFSET
  // from their own default layout position, not an absolute coordinate —
  // one origin ref per draggable text element so each tracks its own
  // mouse-down origin + starting offset independently (#drop everything
  // separately, not together).
  const titleDragOriginRef = useRef(null)
  const subtitleDragOriginRef = useRef(null)
  const contentBlockDragOriginsRef = useRef({}) // Map of blockIndex -> drag origin
  // Avatar/image use the SAME delta-based origin-tracking pattern — without
  // this, the box would jump/teleport so its center snaps under the cursor
  // the instant you click (bad drag feel), instead of moving smoothly from
  // wherever you actually grabbed it.
  const avatarDragOriginRef = useRef(null)
  const imageDragOriginRef = useRef(null)
  const avatarResizeOriginRef = useRef(null)
  const imageResizeOriginRef = useRef(null)

  // Smart alignment guides (Gamma/Canva-style): while dragging, show a
  // dashed line + snap when an element's center crosses the canvas's
  // horizontal/vertical center, or when a text box returns to its default
  // (un-offset) resting position.
  const [snapGuide, setSnapGuide] = useState({ v: false, h: false })

  // Which text element's narration script viewer is currently open — lets
  // the user check the spoken script without confusing it with the slide's
  // (deliberately different, more concise) on-screen copy.
  const [showScript, setShowScript] = useState(false)

  // Preview mode (Gamma-style "see it before you generate"): toggles the
  // canvas between the editable form (inputs/textareas) and a read-only
  // rendered look at exactly what the slide will contain — same data, no
  // separate preview pipeline, so what's previewed always matches what
  // Generate will produce.
  const [previewMode, setPreviewMode] = useState(false)

  // "Generate" — renders whatever is currently on the canvas (title, key
  // insight, focused ideas + nested key points, template theme, avatar/image
  // placement) into the complete slide graphic used by the render pipeline
  // (slideRenderer.ts's buildSlide()), same data source the editor already
  // shows — the user edits first, then Generate produces the finished slide.
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [generatedUrl, setGeneratedUrl] = useState(scene.visualAssetUrl || null)

  // Everything (title, key insight, focused ideas, nested key points) comes
  // pre-filled from the script/storyboard pipeline — the user only ever
  // EDITS it, never starts from a blank slide. `originalContentRef`
  // snapshots what was loaded/seeded so autoSave can tell whether the user
  // actually changed the text vs. just dragging the avatar/image — only real
  // text edits should mark this slide as user-owned (contentEdited) and stop
  // the backend from re-syncing it with newer script/storyboard output.
  const originalContentRef = useRef(null)
  const interactedRef = useRef(false)

  // Load existing (or freshly seeded) composition on scene switch — the API
  // pre-fills title/subtitle/bullets from earlier pipeline steps on every
  // open, until the user has personally edited that slide's text.
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    interactedRef.current = false
    apiClient.get(`/scenes/${scene.id}/composition`).then(data => {
      if (cancelled) return
      // Initialize contentBlocks with position data and frame style - each block gets its own properties.
      // Default y (when a block genuinely has none) is anchored below wherever
      // the title/key-insight actually sit for THIS slide — a flat 18 used to
      // match the subtitle box's own top position and land points right on
      // top of it instead of below it.
      const fetchedHasSubtitle = !!(data.subtitle && data.subtitle.trim())
      const fetchedIsHero = (data.layout ?? DEFAULT_SLIDE.layout) === 'title-hero'
      const fetchedContentStartY = fetchedIsHero
        ? (fetchedHasSubtitle ? 64 : 52)
        : (fetchedHasSubtitle ? 38 : 32)
      const contentBlocks = Array.isArray(data.contentBlocks) ? data.contentBlocks.map((block, idx) => ({
        text: block.text ?? '',
        keyPoints: Array.isArray(block.keyPoints) ? block.keyPoints : [],
        x: block.x ?? 0,                    // Individual x offset
        y: block.y ?? (fetchedContentStartY + idx * 8), // Cascade y position for each block
        zIndex: block.zIndex ?? idx,        // Stack order
        cadreStyle: block.cadreStyle ?? 'none',  // Per-block frame style
        showDetails: block.showDetails !== false,  // Show details/key points (default: true)
      })) : []
      
      const next = {
        title: data.title ?? DEFAULT_SLIDE.title,
        subtitle: data.subtitle ?? DEFAULT_SLIDE.subtitle,
        contentBlocks,
        layout: data.layout ?? DEFAULT_SLIDE.layout,
        cadreStyle: data.cadreStyle ?? DEFAULT_SLIDE.cadreStyle,
        titleX: data.titleX ?? DEFAULT_SLIDE.titleX,
        titleY: data.titleY ?? DEFAULT_SLIDE.titleY,
        subtitleX: data.subtitleX ?? DEFAULT_SLIDE.subtitleX,
        subtitleY: data.subtitleY ?? DEFAULT_SLIDE.subtitleY,
        titleFontScale: data.titleFontScale ?? DEFAULT_SLIDE.titleFontScale,
        subtitleFontScale: data.subtitleFontScale ?? DEFAULT_SLIDE.subtitleFontScale,
        contentFontScale: data.contentFontScale ?? DEFAULT_SLIDE.contentFontScale,
        avatarX: data.avatarX ?? DEFAULT_SLIDE.avatarX,
        avatarY: data.avatarY ?? DEFAULT_SLIDE.avatarY,
        avatarWidth: data.avatarWidth ?? DEFAULT_SLIDE.avatarWidth,
        imageUrl: data.imageUrl ?? null,
        imageX: data.imageX ?? DEFAULT_SLIDE.imageX,
        imageY: data.imageY ?? DEFAULT_SLIDE.imageY,
        imageWidth: data.imageWidth ?? DEFAULT_SLIDE.imageWidth,
        imageHeight: data.imageHeight ?? DEFAULT_SLIDE.imageHeight,
        textAnimationType: scene.textAnimationType || DEFAULT_SLIDE.textAnimationType,
      }
      originalContentRef.current = JSON.stringify({ title: next.title, subtitle: next.subtitle, contentBlocks: next.contentBlocks })
      setSlideData(next)
      setLoaded(true)
    }).catch(() => setLoaded(true))
    return () => { cancelled = true }
  }, [scene.id, scene.textAnimationType])

  // Debounced auto-save — only fires from actual user interaction, and only
  // includes title/subtitle/contentBlocks in the request when the text
  // genuinely differs from what was loaded (so dragging positions never marks
  // this slide's generated content as user-edited when only moving elements).
  const autoSave = useCallback(async (data) => {
    setSaving(true)
    try {
      const contentChanged = JSON.stringify({ title: data.title, subtitle: data.subtitle, contentBlocks: data.contentBlocks }) !== originalContentRef.current
      await apiClient.patch(`/scenes/${scene.id}/composition`, {
        ...(contentChanged && { title: data.title, subtitle: data.subtitle, contentBlocks: data.contentBlocks }),
        layout: data.layout,
        cadreStyle: data.cadreStyle,
        titleX: data.titleX,
        titleY: data.titleY,
        subtitleX: data.subtitleX,
        subtitleY: data.subtitleY,
        avatarX: data.avatarX,
        avatarY: data.avatarY,
        avatarWidth: data.avatarWidth,
        imageUrl: data.imageUrl,
        imageX: data.imageX,
        imageY: data.imageY,
        imageWidth: data.imageWidth,
        imageHeight: data.imageHeight,
        titleFontScale: data.titleFontScale,
        subtitleFontScale: data.subtitleFontScale,
        contentFontScale: data.contentFontScale,
        textAnimationType: data.textAnimationType,
      })
      if (contentChanged) {
        originalContentRef.current = JSON.stringify({ title: data.title, subtitle: data.subtitle, contentBlocks: data.contentBlocks })
      }
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [scene.id, queryClient])

  useEffect(() => {
    if (!loaded || !interactedRef.current) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => autoSave(slideData), 800)
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideData, loaded])

  // Keep refs pointed at the latest data/save-fn so the unmount flush below
  // (a `[]`-deps effect, whose cleanup closure is otherwise frozen at mount
  // time) always sees the most recent edit instead of a stale one.
  const latestSlideDataRef = useRef(slideData)
  useEffect(() => { latestSlideDataRef.current = slideData }, [slideData])
  const latestAutoSaveRef = useRef(autoSave)
  useEffect(() => { latestAutoSaveRef.current = autoSave }, [autoSave])

  // FLUSH on unmount (#bug: switching straight from Visual Designer to Video
  // Editing right after an edit used to silently drop it). The debounce
  // effect above cancels the pending save's setTimeout on every cleanup —
  // including the final cleanup when this component unmounts because the
  // user navigated to a different stage tab. That cancellation had no
  // replacement timer to take over, so an edit made <800ms before navigating
  // away was never persisted: the canvas showed it, but the backend (and
  // therefore the exported video, which reads straight from the backend's
  // SceneSegment.slideDesign) still had the old content/position. Firing the
  // save immediately here instead of just clearing it closes that gap.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        latestAutoSaveRef.current(latestSlideDataRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Every user-driven change (drag, resize, text edit, image swap) goes
  // through this instead of setSlideData directly, so autoSave only ever
  // fires from real interaction — never from the initial load/seed.
  const updateSlide = useCallback((updater) => {
    interactedRef.current = true
    setSlideData(updater)
  }, [])

  // Generate the complete slide graphic from whatever's currently on the
  // canvas. Flushes any pending auto-save first so the render reflects the
  // very latest edit (e.g. a title tweak made half a second ago that hasn't
  // hit the debounce yet), then asks the backend to build the finished slide
  // image from that composition data.
  const handleGenerateSlide = useCallback(async () => {
    setGenerating(true)
    setGenerateError(null)
    try {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
        await autoSave(slideData)
      }
      const data = await apiClient.post('/generateSceneAsset', { scene_id: scene.id })
      setGeneratedUrl(data.visual_asset_url)
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
    } catch (err) {
      setGenerateError(err.message || 'Slide generation failed')
    } finally {
      setGenerating(false)
    }
  }, [scene.id, slideData, autoSave, queryClient])

  // Snap threshold, in %, for center-alignment guides while dragging.
  const SNAP_PCT = 1.5
  const snapTo = (value, target) => (Math.abs(value - target) < SNAP_PCT ? target : value)

  // ── Drag / resize (direct manipulation, #2/#3) ────────────────────────────
  // All draggable elements (avatar, image, title, subtitle, individual content blocks)
  // use the SAME delta-based pattern: on mouse-down we record where the cursor was
  // AND where the element already was, then every mouse-move only applies
  // the *change* since mouse-down — the element moves smoothly from under
  // the cursor instead of teleporting so its center snaps to the pointer.
  const handleMouseMove = useCallback((e) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const yPct = ((e.clientY - rect.top) / rect.height) * 100
    let nextSnapV = false, nextSnapH = false

    if (dragTarget === 'avatar' && avatarDragOriginRef.current) {
      const { mouseXPct, mouseYPct, startX, startY } = avatarDragOriginRef.current
      let nx = Math.max(5, Math.min(95, startX + (xPct - mouseXPct)))
      let ny = Math.max(5, Math.min(95, startY + (yPct - mouseYPct)))
      const snappedX = snapTo(nx, 50)
      if (snappedX !== nx) { nx = snappedX; nextSnapV = true }
      updateSlide(prev => ({ ...prev, avatarX: nx, avatarY: ny }))
    }
    if (dragTarget === 'image' && imageDragOriginRef.current) {
      const { mouseXPct, mouseYPct, startX, startY } = imageDragOriginRef.current
      const nx = Math.max(0, Math.min(95, startX + (xPct - mouseXPct)))
      const ny = Math.max(0, Math.min(95, startY + (yPct - mouseYPct)))
      updateSlide(prev => ({ ...prev, imageX: nx, imageY: ny }))
    }
    if (dragTarget === 'title' && titleDragOriginRef.current) {
      const { mouseXPct, mouseYPct, startX, startY } = titleDragOriginRef.current
      let nx = Math.max(-40, Math.min(40, startX + (xPct - mouseXPct)))
      const ny = Math.max(-40, Math.min(40, startY + (yPct - mouseYPct)))
      const snappedX = snapTo(nx, 0)
      if (snappedX !== nx) { nx = snappedX; nextSnapV = true }
      updateSlide(prev => ({ ...prev, titleX: nx, titleY: ny }))
    }
    if (dragTarget === 'subtitle' && subtitleDragOriginRef.current) {
      const { mouseXPct, mouseYPct, startX, startY } = subtitleDragOriginRef.current
      let nx = Math.max(-40, Math.min(40, startX + (xPct - mouseXPct)))
      const ny = Math.max(-40, Math.min(40, startY + (yPct - mouseYPct)))
      const snappedX = snapTo(nx, 0)
      if (snappedX !== nx) { nx = snappedX; nextSnapV = true }
      updateSlide(prev => ({ ...prev, subtitleX: nx, subtitleY: ny }))
    }
    // Handle individual content block dragging
    if (dragTarget && typeof dragTarget === 'object' && dragTarget.type === 'content-block') {
      const blockIdx = dragTarget.index
      const origin = contentBlockDragOriginsRef.current[blockIdx]
      if (origin) {
        const { mouseXPct, mouseYPct, startX, startY } = origin
        // Content blocks can move freely across full slide - no tight constraints like title/subtitle
        let nx = Math.max(-10, Math.min(90, startX + (xPct - mouseXPct)))  // Allow x: -10 to 90
        let ny = Math.max(5, Math.min(95, startY + (yPct - mouseYPct)))    // Allow y: 5 to 95 (FULL vertical range)
        const snappedX = snapTo(nx, 0)
        if (snappedX !== nx) { nx = snappedX; nextSnapV = true }
        updateSlide(prev => ({
          ...prev,
          contentBlocks: prev.contentBlocks.map((b, i) =>
            i === blockIdx ? { ...b, x: nx, y: ny } : b
          ),
        }))
      }
    }
    if (resizeTarget === 'avatar' && avatarResizeOriginRef.current) {
      const { mouseXPct, startWidth } = avatarResizeOriginRef.current
      const deltaPct = (xPct - mouseXPct) * 2 // resizing from center, so both edges move
      updateSlide(prev => ({ ...prev, avatarWidth: Math.max(15, Math.min(50, startWidth + deltaPct)) }))
    }
    if (resizeTarget === 'image-corner' && imageResizeOriginRef.current) {
      const { mouseXPct, mouseYPct, startWidth, startHeight } = imageResizeOriginRef.current
      updateSlide(prev => ({
        ...prev,
        imageWidth: Math.max(5, Math.min(95, startWidth + (xPct - mouseXPct))),
        imageHeight: Math.max(5, Math.min(95, startHeight + (yPct - mouseYPct))),
      }))
    }

    if (dragTarget) setSnapGuide({ v: nextSnapV, h: nextSnapH })
  }, [dragTarget, resizeTarget, updateSlide])

  const handleMouseUp = useCallback(() => {
    setDragTarget(null)
    setResizeTarget(null)
    setSnapGuide({ v: false, h: false })
  }, [])

  useEffect(() => {
    if (dragTarget || resizeTarget) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragTarget, resizeTarget, handleMouseMove, handleMouseUp])

  // ── Content block editing (focused ideas + nested key points, #7) ────────
  // Everything here starts pre-filled from the script/storyboard — these
  // handlers only let the user EDIT/reorder/remove what's already there (or
  // add extra ideas if they genuinely want to), they never require the user
  // to write a slide from scratch.
  const addContentBlock = () => {
    updateSlide(prev => ({
      ...prev,
      contentBlocks: [...prev.contentBlocks, {
        text: '',
        keyPoints: [],
        x: 0,                              // Default x offset
        // Cascade from contentStartY (below title/key-insight, layout-aware)
        // instead of a flat 18 — that flat value used to land new points
        // right under/on top of the subtitle text.
        y: LAYOUT_CONFIG.contentStartY + prev.contentBlocks.length * blockSpacing,
        zIndex: prev.contentBlocks.length,  // Stack on top
        cadreStyle: 'none',                // Default frame style for new blocks
        showDetails: true,                 // Show details by default
      }]
    }))
  }
  const updateBlockText = (idx, text) => {
    updateSlide(prev => ({
      ...prev,
      contentBlocks: prev.contentBlocks.map((b, i) => i === idx ? { ...b, text } : b),
    }))
  }
  const removeBlock = (idx) => {
    updateSlide(prev => ({ ...prev, contentBlocks: prev.contentBlocks.filter((_, i) => i !== idx) }))
  }
  const addKeyPoint = (blockIdx) => {
    updateSlide(prev => ({
      ...prev,
      contentBlocks: prev.contentBlocks.map((b, i) =>
        i === blockIdx ? { ...b, keyPoints: [...b.keyPoints, ''] } : b
      ),
    }))
  }
  const updateKeyPoint = (blockIdx, kpIdx, text) => {
    updateSlide(prev => ({
      ...prev,
      contentBlocks: prev.contentBlocks.map((b, i) =>
        i === blockIdx
          ? { ...b, keyPoints: b.keyPoints.map((kp, j) => j === kpIdx ? text : kp) }
          : b
      ),
    }))
  }
  const removeKeyPoint = (blockIdx, kpIdx) => {
    updateSlide(prev => ({
      ...prev,
      contentBlocks: prev.contentBlocks.map((b, i) =>
        i === blockIdx ? { ...b, keyPoints: b.keyPoints.filter((_, j) => j !== kpIdx) } : b
      ),
    }))
  }

  // ── Image: upload, or generate with AI, or paste a URL directly ─────────
  const fileInputRef = useRef(null)
  const [genPrompt, setGenPrompt] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState(null)
  const [uploading, setUploading] = useState(false)

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const data = await uploadFile(file)
      updateSlide(prev => ({ ...prev, imageUrl: data.file_url }))
    } catch (err) {
      console.error('Image upload failed:', err)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleGenerateImage = async () => {
    const prompt = genPrompt.trim()
    if (!prompt || genLoading) return
    setGenLoading(true); setGenError(null)
    try {
      const data = await apiClient.post('/generate-image', { prompt })
      updateSlide(prev => ({ ...prev, imageUrl: data.file_url }))
      setGenPrompt('')
    } catch (err) {
      setGenError(err.message || 'Image generation failed')
    } finally {
      setGenLoading(false)
    }
  }

  // Layout fluidity (#4): the text column narrows automatically to stay
  // clear of wherever the avatar placeholder currently sits — text position
  // is synchronized with the avatar's position, live, same as the exported
  // slide (slideRenderer.ts mirrors this with avatarLeftEdgePct too).
  const avatarLeftEdgePct = slideData.avatarX - slideData.avatarWidth / 2
  // With avatar in far right corner, content can use full width minus small margin
  const contentMaxWidthPct = Math.max(40, Math.min(90, avatarLeftEdgePct - 2))

  // 'title-hero' centers the title/key-insight/content blocks in the middle
  // of the slide (per request: intro slides shouldn't look identical to
  // regular content slides). Other layouts keep the left-aligned column.
  const isHeroLayout = slideData.layout === 'title-hero'

  // Title, key insight, and each content block get their OWN independent
  // position style — dragging one never moves the others (#drop everything
  // separately, not together).
  const titleBoxStyle = isHeroLayout
    ? { left: `${50 + slideData.titleX}%`, top: `${38 + slideData.titleY}%`, width: `${contentMaxWidthPct}%`, transform: 'translate(-50%, -50%)' }
    : { left: `${slideData.titleX}%`, top: `${8 + slideData.titleY}%`, width: `${contentMaxWidthPct}%` }
  const subtitleBoxStyle = isHeroLayout
    ? { left: `${50 + slideData.subtitleX}%`, top: `${48 + slideData.subtitleY}%`, width: `${contentMaxWidthPct}%`, transform: 'translate(-50%, -50%)' }
    : { left: `${slideData.subtitleX}%`, top: `${18 + slideData.subtitleY}%`, width: `${contentMaxWidthPct}%` }

  // ─ Layout Positioning & Spacing ────────────────────────────────────────
  // Organized helpers for clean slide layout calculations

  // Content area boundaries - full slide height.
  // contentStartY used to be a flat 22 regardless of what's above it — but
  // the subtitle box itself starts at 18 (and the hero layout's subtitle sits
  // at 48, centered), so a content point could render right on top of the
  // title/key-insight text instead of clearly below it, especially once
  // wrapped to two lines. Push the starting point down based on what's
  // actually above the content column so points always land clear of it.
  // These are intentionally generous by default (extra margin beyond the
  // minimum needed to clear a wrapped title/subtitle) so there's always a
  // comfortable, consistent gap out of the box, not just "barely clear."
  const hasSubtitle = !!slideData.subtitle?.trim()
  const contentStartY = isHeroLayout
    ? (hasSubtitle ? 64 : 52)   // below the centered title/key-insight block
    : (hasSubtitle ? 38 : 32)   // below the (possibly two-line) title/subtitle
  const LAYOUT_CONFIG = {
    contentStartY,
    contentEndY: 98,      // Extend to near bottom
    minBlockSpacing: 6,   // Minimum space between blocks
    maxDragOffsetY: 10,   // How far beyond bounds user can drag
  }
  
  // Calculate spacing between content blocks
  const calculateBlockSpacing = (numBlocks) => {
    const availableHeight = LAYOUT_CONFIG.contentEndY - LAYOUT_CONFIG.contentStartY
    if (numBlocks === 0) return LAYOUT_CONFIG.minBlockSpacing
    return Math.max(LAYOUT_CONFIG.minBlockSpacing, availableHeight / Math.max(numBlocks, 3))
  }
  
  const blockSpacing = calculateBlockSpacing(slideData.contentBlocks.length)
  
  // Get final position for a content block, accounting for user drag or default
  const getBlockPosition = (block, blockIdx) => {
    // Use user-dragged position if available, otherwise use stacked default
    const defaultY = LAYOUT_CONFIG.contentStartY + (blockIdx * blockSpacing)
    const blockY = block.y !== undefined ? block.y : defaultY
    
    // Clamp to allowed range with generous margins
    const clampedY = Math.max(
      LAYOUT_CONFIG.contentStartY - LAYOUT_CONFIG.maxDragOffsetY,
      Math.min(blockY, LAYOUT_CONFIG.contentEndY + LAYOUT_CONFIG.maxDragOffsetY)
    )
    
    return { x: block.x, y: clampedY }
  }

  // Where the "Add content point" button should sit — right after the last
  // block's actual (clamped) position instead of a fixed bottom offset, so
  // it never lands on top of a block's text when there are several points
  // or a block has grown taller than the default spacing assumed.
  const lastBlockY = slideData.contentBlocks.length > 0
    ? Math.max(...slideData.contentBlocks.map((b, i) => getBlockPosition(b, i).y))
    : LAYOUT_CONFIG.contentStartY - blockSpacing
  const addButtonTopPct = Math.min(94, lastBlockY + blockSpacing)

  // Build complete style object for a content block
  const getContentBlockStyle = (block, blockIdx, isDragging = false) => {
    const pos = getBlockPosition(block, blockIdx)
    const baseStyle = {
      position: 'absolute',
      minHeight: '6%',
      width: `${contentMaxWidthPct}%`,
      zIndex: isDragging ? 1000 : block.zIndex ?? blockIdx,  // Raise on drag to prevent overlap
    }
    
    if (isHeroLayout) {
      return {
        ...baseStyle,
        left: `${50 + pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, 0)',
      }
    }
    
    return {
      ...baseStyle,
      left: `${pos.x}%`,
      top: `${pos.y}%`,
    }
  }

  if (!loaded) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-100 dark:bg-slate-900">
      {/* Canvas card — full width on mobile; shares the row with the options
          sidebar on large screens instead of stacking underneath it */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* Gamma-style context bar: module/scene location + slide title + preview toggle */}
      <div className="px-3 sm:px-6 py-2.5 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 sm:gap-3 flex-shrink-0 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">
            Module {moduleIndex + 1}{moduleTitle ? `: ${moduleTitle}` : ''} · Scene {sceneIndex + 1} of {totalScenes}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {slideData.title || 'Untitled Slide'}
          </p>
        </div>
        {scene.scriptContent && (
          <button
            onClick={() => setShowScript(true)}
            title="View the spoken narration for this scene — the slide's title/key insight/points are deliberately NOT the same text"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:border-indigo-400 transition-colors flex-shrink-0"
          >
            <Mic className="w-3.5 h-3.5" /><span className="hidden sm:inline">Voice Script</span>
          </button>
        )}
        <button
          onClick={() => setPreviewMode(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 ${
            previewMode
              ? 'bg-indigo-600 border-transparent text-white'
              : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
          }`}
        >
          {previewMode ? <><Pencil className="w-3.5 h-3.5" />Edit</> : <><Eye className="w-3.5 h-3.5" />Preview</>}
        </button>
        {/* Desktop-only toggle for the options sidebar — the full-width bar
            below the canvas is reserved for narrow screens */}
        <button
          onClick={() => setShowRightPanel(v => !v)}
          className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 ${
            showRightPanel
              ? 'bg-indigo-600 border-transparent text-white'
              : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
          }`}
          title={showRightPanel ? 'Hide edit options' : 'Show edit options'}
        >
          <Settings className="w-3.5 h-3.5" />
          {showRightPanel ? 'Hide Options' : 'Edit Options'}
        </button>
      </div>

      {/* Voice Script viewer — shows the spoken narration, kept visually
          separate from the slide's own (deliberately more concise/
          professional) title/key insight/content copy so the user never
          confuses the two. */}
      {showScript && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => setShowScript(false)}>
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[70vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-indigo-500" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Voice Script (Narration)</p>
              </div>
              <button onClick={() => setShowScript(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {scene.scriptContent}
              </p>
            </div>
            <div className="px-5 py-2.5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/60 flex-shrink-0">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                This is what's spoken aloud — the slide's title, key insight, and points are written separately to be concise and professional, not a copy of this text.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-2 sm:p-3 lg:p-8 flex items-center justify-center">
        <div
          ref={canvasRef}
          className="relative w-full max-w-4xl lg:max-w-5xl shadow-2xl rounded-lg overflow-hidden select-none"
          style={{ aspectRatio: '16/9', backgroundColor: template.colors.bg, color: template.colors.text }}
        >
          {previewMode ? (
            /* ── Preview: read-only rendered look, same data as the editor.
                Each content block independently positioned on canvas. ── */
            <>
              <div className={`absolute pb-0 ${isHeroLayout ? 'text-center' : ''}`} style={{ ...titleBoxStyle, padding: 'clamp(1rem, 4vw, 2rem) clamp(1rem, 4vw, 2rem) 0 clamp(1rem, 4vw, 2rem)' }}>
                <div className="rounded-full mb-2" style={{ height: 'clamp(2px, 0.3vw, 3px)', width: 'clamp(24px, 3vw, 40px)', backgroundColor: template.colors.accent, marginLeft: isHeroLayout ? 'auto' : 0, marginRight: isHeroLayout ? 'auto' : 0 }} />
                <h3 className="font-bold tracking-tight leading-tight" style={{ color: template.colors.text, fontSize: 'clamp(1.4rem, 3.5vw, 1.75rem)', wordBreak: 'break-word', lineHeight: '1.2' }}>
                  {slideData.title || 'Untitled Slide'}
                </h3>
              </div>
              {slideData.subtitle && (
                <div className={`absolute ${isHeroLayout ? 'text-center' : ''}`} style={{ ...subtitleBoxStyle, padding: 'clamp(0.75rem, 2.5vw, 1.5rem) clamp(1rem, 4vw, 2rem) 0 clamp(1rem, 4vw, 2rem)' }}>
                  <p
                    className={`font-medium inline-block rounded-full`}
                    style={{ color: template.colors.accent, backgroundColor: `${template.colors.accent}15`, fontSize: 'clamp(0.8rem, 2vw, 0.95rem)', padding: 'clamp(0.3rem, 1vw, 0.6rem) clamp(0.6rem, 1.5vw, 1rem)', wordBreak: 'break-word' }}
                  >
                    {slideData.subtitle}
                  </p>
                </div>
              )}
              {/* Each content block independently positioned in preview mode */}
              {slideData.contentBlocks.map((block, blockIdx) => {
                const blockStyle = getContentBlockStyle(block, blockIdx, false)
                // Use per-block cadreStyle instead of global
                const applyFrame = block.cadreStyle && block.cadreStyle !== 'none'
                const frameClass = block.cadreStyle === 'subtle' ? 'rounded-md' : block.cadreStyle === 'bold' ? 'rounded-lg border-2' : block.cadreStyle === 'rounded' ? 'rounded-3xl' : ''
                
                return (
                  <div
                    key={blockIdx}
                    className={`${isHeroLayout ? 'flex flex-col items-center text-center' : ''}`}
                    style={{ ...blockStyle, padding: 'clamp(0.5rem, 2vw, 1.5rem) clamp(0.5rem, 3vw, 2rem)' }}
                  >
                    <div className={`px-3 py-2 ${applyFrame ? frameClass : ''}`} style={{ 
                      backgroundColor: applyFrame ? `${template.colors.text}08` : 'transparent',
                      ...(applyFrame && { borderLeft: `2px solid ${template.colors.accent}` }),
                      ...(block.cadreStyle === 'bold' && { borderColor: template.colors.accent })
                    }}>
                      {block.text && (
                        <p className="font-semibold leading-snug" style={{ color: template.colors.text, fontSize: 'clamp(0.65rem, 1.2vw, 0.8rem)' }}>
                          {block.text}
                        </p>
                      )}
                      {block.showDetails && block.keyPoints.filter(Boolean).length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {block.keyPoints.filter(Boolean).map((kp, kpIdx) => (
                            <p key={kpIdx} className="opacity-75 flex items-start gap-1.5" style={{ color: template.colors.text, fontSize: 'clamp(0.6rem, 1rem, 0.75rem)' }}>
                              <span className="opacity-50 flex-shrink-0 mt-0.5">•</span> <span>{kp}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
          /* ── Edit mode: title/subtitle/content are already pre-filled from
              the generated script — inputs let the user tweak them, they
              never start blank. Each of the three has its OWN drag handle so
              they move independently (#drop everything separately, not
              together) — title, key insight, and content blocks are three
              separate absolutely-positioned regions on the canvas. ── */
          <>
          <div className={`absolute group rounded-lg transition-shadow ${isHeroLayout ? 'text-center' : ''} ${dragTarget === 'title' ? 'ring-2 ring-indigo-400/60 bg-indigo-500/5' : ''}`} style={{ ...titleBoxStyle, padding: 'clamp(1rem, 4vw, 2rem) clamp(1rem, 4vw, 2rem) 0 clamp(1rem, 4vw, 2rem)' }}>
            {/* Drag handle */}
            <div
              className={`absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/80 text-white text-[10px] transition-opacity z-10 ${dragTarget === 'title' ? 'opacity-100 cursor-grabbing' : 'opacity-0 group-hover:opacity-100 cursor-grab'}`}
              onMouseDown={(e) => {
                e.preventDefault()
                const rect = canvasRef.current.getBoundingClientRect()
                titleDragOriginRef.current = {
                  mouseXPct: ((e.clientX - rect.left) / rect.width) * 100,
                  mouseYPct: ((e.clientY - rect.top) / rect.height) * 100,
                  startX: slideData.titleX,
                  startY: slideData.titleY,
                }
                setDragTarget('title')
              }}
              title="Drag to move the title"
            >
              <GripHorizontal className="w-3 h-3" /> Move
            </div>

            <input
              type="text"
              value={slideData.title}
              onChange={(e) => updateSlide(prev => ({ ...prev, title: e.target.value }))}
              className={`font-bold bg-transparent border-b-2 border-transparent hover:border-white/20 focus:border-indigo-400 outline-none w-full`}
              style={{ color: template.colors.text, fontSize: 'clamp(1.4rem, 3.5vw, 1.75rem)', wordBreak: 'break-word', lineHeight: '1.2' }}
              placeholder="Slide Title"
            />
          </div>

          {/* Key Insight — dragged independently from title */}
          <div className={`absolute group rounded-lg transition-shadow ${isHeroLayout ? 'text-center' : ''} ${dragTarget === 'subtitle' ? 'ring-2 ring-indigo-400/60 bg-indigo-500/5' : ''}`} style={{ ...subtitleBoxStyle, padding: 'clamp(0.75rem, 2.5vw, 1.5rem) clamp(1rem, 4vw, 2rem) 0 clamp(1rem, 4vw, 2rem)' }}>
            {/* Drag handle */}
            <div
              className={`absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/80 text-white text-[10px] transition-opacity z-10 ${dragTarget === 'subtitle' ? 'opacity-100 cursor-grabbing' : 'opacity-0 group-hover:opacity-100 cursor-grab'}`}
              onMouseDown={(e) => {
                e.preventDefault()
                const rect = canvasRef.current.getBoundingClientRect()
                subtitleDragOriginRef.current = {
                  mouseXPct: ((e.clientX - rect.left) / rect.width) * 100,
                  mouseYPct: ((e.clientY - rect.top) / rect.height) * 100,
                  startX: slideData.subtitleX,
                  startY: slideData.subtitleY,
                }
                setDragTarget('subtitle')
              }}
              title="Drag to move the key insight"
            >
              <GripHorizontal className="w-3 h-3" /> Move
            </div>

            <input
              type="text"
              value={slideData.subtitle}
              onChange={(e) => updateSlide(prev => ({ ...prev, subtitle: e.target.value }))}
              className={`font-medium bg-transparent border-b border-transparent hover:border-white/20 focus:border-indigo-400 outline-none w-full`}
              style={{ color: template.colors.accent, fontSize: 'clamp(0.8rem, 2vw, 0.95rem)', wordBreak: 'break-word' }}
              placeholder="Key insight (short sentence)"
            />
          </div>

          {/* Each content block is now independently draggable with its own position */}
          {slideData.contentBlocks.map((block, blockIdx) => {
            const isDragging = dragTarget && typeof dragTarget === 'object' && dragTarget.type === 'content-block' && dragTarget.index === blockIdx
            const isSelected = selectedBlockIdx === blockIdx
            const blockStyle = getContentBlockStyle(block, blockIdx, isDragging)

            return (
              <div
                key={blockIdx}
                className={`group rounded-lg transition-shadow ${isHeroLayout ? 'text-center' : ''} ${isDragging ? 'ring-2 ring-indigo-400/60 bg-indigo-500/5' : ''} ${isSelected ? 'ring-2 ring-amber-400/60 bg-amber-500/5' : ''}`}
                style={{ ...blockStyle, padding: 'clamp(0.5rem, 2vw, 2rem) clamp(0.5rem, 3vw, 2.5rem)' }}
              >
                <div style={{ width: '100%' }}>
                  <div className="space-y-2">
                    <div
                      className="group/block px-3 py-2"
                      style={{ backgroundColor: isDragging ? `${template.colors.text}0D` : 'transparent', borderLeft: isDragging ? `3px solid ${template.colors.accent}` : 'none' }}
                    >
                      <div className="flex items-start gap-2">
                        {/* Drag handle — inline with the text on the same row.
                            Kept visible at a steady opacity (not hover-only)
                            and colored with the template's TEXT color (always
                            legible against the slide background, unlike the
                            accent color which can wash out on some themes) so
                            it's easy to find and grab on the first try. */}
                        <div
                          className={`flex items-center justify-center w-6 h-6 -ml-1 flex-shrink-0 select-none transition-opacity z-30 ${isDragging ? 'opacity-100 cursor-grabbing' : 'opacity-60 hover:opacity-100 cursor-grab'}`}
                          style={{ color: template.colors.text }}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            const rect = canvasRef.current.getBoundingClientRect()
                            contentBlockDragOriginsRef.current[blockIdx] = {
                              mouseXPct: ((e.clientX - rect.left) / rect.width) * 100,
                              mouseYPct: ((e.clientY - rect.top) / rect.height) * 100,
                              startX: block.x,
                              startY: block.y,
                            }
                            setDragTarget({ type: 'content-block', index: blockIdx })
                          }}
                          title="Drag to move this content point"
                        >
                          <GripHorizontal className="w-4 h-4" />
                        </div>
                        <textarea
                          value={block.text}
                          onChange={(e) => updateBlockText(blockIdx, e.target.value)}
                          className="flex-1 font-semibold bg-transparent focus:outline-none resize-none"
                          style={{ color: template.colors.text, fontSize: 'clamp(0.65rem, 1.2vw, 0.85rem)' }}
                          placeholder="Content point"
                          rows={1}
                        />
                        <button
                          onClick={() => {
                            setSelectedBlockIdx(isSelected ? null : blockIdx)
                            setShowRightPanel(true)
                          }}
                          className="opacity-0 group-hover/block:opacity-100 text-xs text-indigo-400 hover:text-indigo-300 mt-1.5 transition-opacity"
                          title="Edit frame style"
                        >
                          <Palette className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeBlock(blockIdx)
                          }}
                          className="opacity-0 group-hover/block:opacity-100 text-xs text-red-400 hover:text-red-300 mt-1.5 transition-opacity"
                          title="Delete this point"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="mt-1.5 space-y-1.5">
                        {block.keyPoints.map((kp, kpIdx) => (
                          <div key={kpIdx} className="flex items-center gap-2 group/kp">
                            <span className="text-xs opacity-40">–</span>
                            <input
                              type="text"
                              value={kp}
                              onChange={(e) => updateKeyPoint(blockIdx, kpIdx, e.target.value)}
                              className="flex-1 bg-transparent border-b border-transparent hover:border-white/20 focus:border-indigo-400 outline-none"
                              style={{ color: template.colors.text, opacity: 0.85, fontSize: 'clamp(0.6rem, 1rem, 0.75rem)' }}
                              placeholder="Nested key point"
                            />
                            <button
                              onClick={() => removeKeyPoint(blockIdx, kpIdx)}
                              className="opacity-0 group-hover/kp:opacity-100 text-[10px] text-red-400 hover:text-red-300"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addKeyPoint(blockIdx)}
                          className="text-xs opacity-0 group-hover/block:opacity-70 hover:!opacity-100 flex items-center gap-1 mt-1 transition-opacity"
                          style={{ color: template.colors.accent }}
                        >
                          <Plus className="w-3 h-3" /> Add key point
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Empty state: nothing to drag/edit yet — make the next step obvious
              instead of leaving the canvas looking broken/blank */}
          {slideData.contentBlocks.length === 0 && (
            <div
              className="absolute rounded-xl border-2 border-dashed flex items-center justify-center text-center px-4"
              style={{
                left: `${contentMaxWidthPct / 2}%`,
                top: '50%',
                width: `${contentMaxWidthPct}%`,
                transform: 'translate(-50%, -50%)',
                minHeight: '20%',
                borderColor: `${template.colors.accent}40`,
                color: `${template.colors.text}80`,
              }}
            >
              <p className="text-xs">No content points yet — click "Add content point" below to get started.</p>
            </div>
          )}

          {/* Toned down to a small ghost pill, and anchored right after the
              last content point's actual position (not a fixed bottom
              offset) so it never sits on top of point text. */}
          <button
            onClick={addContentBlock}
            className="absolute flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed text-[11px] font-medium opacity-60 hover:opacity-100 transition-opacity z-10"
            style={{
              color: template.colors.accent,
              borderColor: `${template.colors.accent}50`,
              left: isHeroLayout ? '50%' : `${contentMaxWidthPct / 2}%`,
              top: `${addButtonTopPct}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <Plus className="w-3 h-3" /> Add content point
          </button>
          </>
          )}

          {/* Responsive image (#5): independently resizable width/height —
              can be stretched, not just uniformly scaled. Drag handles are
              hidden in Preview mode — same image, just not editable there. */}
          {slideData.imageUrl && (
            <div
              className={`absolute group ${previewMode ? '' : 'cursor-grab active:cursor-grabbing'} ${dragTarget === 'image' ? 'ring-2 ring-indigo-400 z-20' : ''}`}
              style={{
                left: `${slideData.imageX}%`,
                top: `${slideData.imageY}%`,
                width: `${slideData.imageWidth}%`,
                height: `${slideData.imageHeight}%`,
                transition: dragTarget === 'image' || resizeTarget === 'image-corner' ? 'none' : 'box-shadow 0.15s',
              }}
              onMouseDown={(e) => {
                if (previewMode || e.button !== 0) return
                e.preventDefault()
                const rect = canvasRef.current.getBoundingClientRect()
                imageDragOriginRef.current = {
                  mouseXPct: ((e.clientX - rect.left) / rect.width) * 100,
                  mouseYPct: ((e.clientY - rect.top) / rect.height) * 100,
                  startX: slideData.imageX,
                  startY: slideData.imageY,
                }
                setDragTarget('image')
              }}
            >
              <img
                src={slideData.imageUrl}
                alt="Slide"
                className={`w-full h-full object-cover rounded-lg border-2 transition-colors ${previewMode ? 'border-transparent' : 'border-white/20 group-hover:border-indigo-400'}`}
                draggable={false}
              />
              {!previewMode && (
                <>
                  <div
                    className="absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/90 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <GripHorizontal className="w-3 h-3" /> Drag
                  </div>
                  <div
                    className="absolute bottom-0 right-0 w-5 h-5 bg-indigo-500 rounded-tl cursor-se-resize hover:bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      const rect = canvasRef.current.getBoundingClientRect()
                      imageResizeOriginRef.current = {
                        mouseXPct: ((e.clientX - rect.left) / rect.width) * 100,
                        mouseYPct: ((e.clientY - rect.top) / rect.height) * 100,
                        startWidth: slideData.imageWidth,
                        startHeight: slideData.imageHeight,
                      }
                      setResizeTarget('image-corner')
                    }}
                    title="Drag to stretch/resize"
                  >
                    <Maximize2 className="w-2.5 h-2.5 text-white" />
                  </div>
                  <button
                    onClick={() => updateSlide(prev => ({ ...prev, imageUrl: null }))}
                    className="absolute top-0 right-0 bg-red-500 hover:bg-red-600 text-white p-1 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Avatar Placeholder — direct manipulation on canvas (#2, #3),
              center-anchored 9:16 box, positioned in far right corner with just border. */}
          <div
            className={`absolute flex items-center justify-center bg-transparent border-2 border-indigo-400 rounded-lg transition-colors ${previewMode ? '' : 'group hover:border-indigo-500'} ${dragTarget === 'avatar' ? 'ring-2 ring-indigo-300 z-20' : ''}`}
            style={{
              left: `${slideData.avatarX}%`,
              top: `${slideData.avatarY}%`,
              width: `${slideData.avatarWidth}%`,
              aspectRatio: '9/16',
              transform: 'translate(-50%, -50%)',
              cursor: previewMode ? 'default' : dragTarget === 'avatar' ? 'grabbing' : 'grab',
            }}
            onMouseDown={(e) => {
              if (previewMode || e.button !== 0) return
              e.preventDefault()
              const rect = canvasRef.current.getBoundingClientRect()
              avatarDragOriginRef.current = {
                mouseXPct: ((e.clientX - rect.left) / rect.width) * 100,
                mouseYPct: ((e.clientY - rect.top) / rect.height) * 100,
                startX: slideData.avatarX,
                startY: slideData.avatarY,
              }
              setDragTarget('avatar')
            }}
          >
            <div className="text-center pointer-events-none">
              <div className="text-[10px] font-bold text-indigo-400">AVATAR</div>
            </div>
            {!previewMode && (
              <div
                className="absolute bottom-0 right-0 w-3 h-3 bg-indigo-400 rounded-tl cursor-se-resize hover:bg-indigo-500 opacity-60 hover:opacity-100 transition-opacity"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const rect = canvasRef.current.getBoundingClientRect()
                  avatarResizeOriginRef.current = {
                    mouseXPct: ((e.clientX - rect.left) / rect.width) * 100,
                    startWidth: slideData.avatarWidth,
                  }
                  setResizeTarget('avatar')
                }}
                title="Drag to resize (5%-20% of slide width)"
              />
            )}
          </div>

          {/* Smart alignment guide — appears while dragging any element
              across the canvas's vertical center, snaps it into place. */}
          {snapGuide.v && !previewMode && (
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-indigo-400 pointer-events-none z-30" style={{ boxShadow: '0 0 4px rgba(99,102,241,0.6)' }} />
          )}
        </div>
      </div>

      <div className="px-3 sm:px-6 py-2.5 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 flex items-center justify-between flex-shrink-0 gap-2 flex-wrap">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {previewMode ? 'Previewing — click Edit to make changes' : saving ? '💾 Saving...' : '✓ Auto-saved'}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 hidden sm:flex">
          {!previewMode && <span>Drag the avatar box or image to move · drag the corner handle to resize</span>}
        </div>
      </div>
      </div>

      {/* Edit options: a bottom sheet on narrow screens, a proper right-hand
          sidebar once there's room for it (lg+) so canvas and options share
          the screen instead of one pushing the other out of view. */}
      <button
        onClick={() => setShowRightPanel(!showRightPanel)}
        className="lg:hidden w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-medium bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors border-t border-slate-200 dark:border-white/10"
      >
        <Settings className="w-3 h-3" />
        {showRightPanel ? '▼' : '▶'} Edit Options
      </button>

      {/* Options sidebar: collapsed by default to maximize canvas space,
          full-width stacked panel on mobile, fixed-width right column on lg+ */}
      <div
        className={`flex-shrink-0 border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-y-auto transition-all duration-200 ${
          showRightPanel
            ? 'block w-full p-4 space-y-4 border-t lg:border-t-0 lg:border-l lg:w-80 xl:w-96'
            : 'hidden lg:block lg:w-0 lg:overflow-hidden lg:border-l-0'
        }`}
      >
        {/* Panel title — makes the sidebar's purpose clear on its own, not
            just via the toggle button label in the canvas header */}
        <div className="flex items-center gap-2 pb-1">
          <Settings className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Slide Options</p>
        </div>

        {/* Layout — not the same for every slide by default */}
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-slate-800/30 p-3">
          <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Layout</p>
          <div className="grid grid-cols-2 gap-1.5">
            {LAYOUT_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => updateSlide(prev => ({ ...prev, layout: opt.id }))}
                title={opt.desc}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all text-left ${
                  slideData.layout === opt.id
                    ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-700 dark:text-indigo-300'
                    : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <span className="w-6 h-4 rounded-sm border border-current/40 flex-shrink-0 flex items-center justify-center overflow-hidden relative">
                  {opt.id === 'title-hero' && <span className="w-2.5 h-0.5 bg-current rounded-full" />}
                  {opt.id === 'bullets' && (
                    <span className="absolute left-0.5 top-0.5 flex flex-col gap-0.5">
                      <span className="w-3.5 h-0.5 bg-current rounded-full" />
                      <span className="w-2.5 h-0.5 bg-current rounded-full opacity-60" />
                      <span className="w-2.5 h-0.5 bg-current rounded-full opacity-60" />
                    </span>
                  )}
                  {opt.id === 'split' && (
                    <span className="flex gap-0.5 w-full h-full px-0.5 py-0.5">
                      <span className="flex-1 bg-current opacity-30 rounded-sm" />
                      <span className="flex-1 bg-current opacity-15 rounded-sm" />
                    </span>
                  )}
                  {opt.id === 'definition' && (
                    <span className="absolute left-0.5 top-0.5 w-3.5 h-1 bg-current opacity-30 rounded-sm" />
                  )}
                  {opt.id === 'quote' && <span className="text-[10px] leading-none opacity-60">"</span>}
                  {opt.id === 'summary' && (
                    <span className="absolute left-0.5 top-0.5 flex flex-col gap-0.5">
                      <span className="w-2.5 h-0.5 bg-current rounded-full" />
                      <span className="w-2.5 h-0.5 bg-current rounded-full opacity-60" />
                    </span>
                  )}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
          {slideData.layout === 'title-hero' && (
            <p className="text-[10px] text-slate-500 mt-1.5">Title centered in the middle of the slide — good for an intro.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-slate-800/30 p-3">
          <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> Image / Figure
          </p>

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={slideData.imageUrl && !slideData.imageUrl.startsWith('data:') ? slideData.imageUrl : ''}
              onChange={(e) => updateSlide(prev => ({ ...prev, imageUrl: e.target.value }))}
              placeholder="Paste image URL…"
              className="flex-1 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:border-indigo-500/40 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </div>

          {/* Generate with AI */}
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={genPrompt}
              onChange={(e) => { setGenPrompt(e.target.value); if (genError) setGenError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateImage() }}
              disabled={genLoading}
              placeholder="Or describe an image to generate…"
              className="flex-1 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors disabled:opacity-60"
            />
            <button
              onClick={handleGenerateImage}
              disabled={genLoading || !genPrompt.trim()}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {genLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            </button>
          </div>
          {genError && (
            <div className="flex items-start gap-1.5 mb-2">
              <AlertCircle className="w-3 h-3 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-600 dark:text-red-300">{genError}</p>
            </div>
          )}

          {slideData.imageUrl && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-14 h-10 rounded-md overflow-hidden flex-shrink-0 border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800">
                <img src={slideData.imageUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <p className="text-[10px] text-slate-500 flex-1">Drag on the slide to move · drag corner to stretch/resize</p>
              <button
                onClick={() => updateSlide(prev => ({ ...prev, imageUrl: null }))}
                className="text-slate-400 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Text Motion — how the narration caption reveals on export */}
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-slate-800/30 p-3">
          <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Text Motion</p>
          <div className="grid grid-cols-3 gap-1.5">
            {MOTION_STYLES.map(m => (
              <button
                key={m.id}
                onClick={() => updateSlide(prev => ({ ...prev, textAnimationType: m.id }))}
                title={m.desc}
                className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs font-medium border transition-all ${
                  slideData.textAnimationType === m.id
                    ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-700 dark:text-indigo-300'
                    : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <div className="text-lg">{m.icon}</div>
                <span className="text-[10px] leading-tight text-center">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Point Details - Show when a block is selected */}
        {selectedBlockIdx !== null && slideData.contentBlocks[selectedBlockIdx] && (
          <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Point #{selectedBlockIdx + 1} Details
              </p>

              {/* Toggle: Show Details or Just Text */}
              <div className="mb-2 flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex-1">Include details?</label>
                <button
                  onClick={() => {
                    updateSlide(prev => ({
                      ...prev,
                      contentBlocks: prev.contentBlocks.map((b, i) =>
                        i === selectedBlockIdx ? { ...b, showDetails: !b.showDetails } : b
                      )
                    }))
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    slideData.contentBlocks[selectedBlockIdx].showDetails
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {slideData.contentBlocks[selectedBlockIdx].showDetails ? '✓ With Details' : '✗ Text Only'}
                </button>
              </div>

              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 space-y-2">
                {/* Point text */}
                <div>
                  <label className="text-[10px] font-medium text-slate-600 dark:text-slate-300">Main Text</label>
                  <textarea
                    value={slideData.contentBlocks[selectedBlockIdx].text}
                    onChange={(e) => updateBlockText(selectedBlockIdx, e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                    placeholder="Point text"
                    rows={2}
                  />
                </div>

                {/* Key points - only show if showDetails is true */}
                {slideData.contentBlocks[selectedBlockIdx].showDetails && (
                  <div>
                    <label className="text-[10px] font-medium text-slate-600 dark:text-slate-300 block mb-1">Supporting Details</label>
                    <div className="space-y-1">
                      {slideData.contentBlocks[selectedBlockIdx].keyPoints.map((kp, kpIdx) => (
                        <div key={kpIdx} className="flex items-center gap-1">
                          <input
                            type="text"
                            value={kp}
                            onChange={(e) => updateKeyPoint(selectedBlockIdx, kpIdx, e.target.value)}
                            className="flex-1 p-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                            placeholder="Detail"
                          />
                          <button
                            onClick={() => removeKeyPoint(selectedBlockIdx, kpIdx)}
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addKeyPoint(selectedBlockIdx)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-1"
                      >
                        <Plus className="w-3 h-3" /> Add detail
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-amber-300/50 dark:border-amber-500/20" />

            {/* Frame Style */}
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Frame Style
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {CADRE_STYLES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      updateSlide(prev => ({
                        ...prev,
                        contentBlocks: prev.contentBlocks.map((b, i) =>
                          i === selectedBlockIdx ? { ...b, cadreStyle: c.id } : b
                        )
                      }))
                    }}
                    title={c.desc}
                    className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs font-medium border transition-all ${
                      slideData.contentBlocks[selectedBlockIdx].cadreStyle === c.id
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                    }`}
                  >
                    <span className="text-[10px] leading-tight text-center">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
