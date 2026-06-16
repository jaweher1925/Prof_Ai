/**
 * Stage 4 — Slides
 * Two-column: slide list on left, editor + preview on right.
 * Slide content = educational text students READ (separate from voice script).
 */
import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import {
  Image, Loader2, CheckCircle, Sparkles, RotateCcw,
  ArrowRight, Video, Plus, Trash2, Wand2, ExternalLink, ChevronRight
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

const LAYOUTS = [
  { id: 'title-hero', label: 'Intro',      icon: '▣' },
  { id: 'bullets',    label: 'Bullets',    icon: '≡' },
  { id: 'definition', label: 'Definition', icon: '📖' },
  { id: 'quote',      label: 'Quote',      icon: '"'  },
  { id: 'summary',    label: 'Summary',    icon: '✓'  },
]

const THEMES = [
  { id: 'dark-navy',  label: 'Navy',     color: '#3B82F6', bg: '#020C1B' },
  { id: 'ocean',      label: 'Ocean',    color: '#06B6D4', bg: '#041A2E' },
  { id: 'academic',   label: 'Academic', color: '#10B981', bg: '#0A1A0A' },
  { id: 'light',      label: 'Light',    color: '#6366F1', bg: '#F1F5F9' },
  { id: 'corporate',  label: 'Corp',     color: '#F59E0B', bg: '#111827' },
]

// ─── Main Panel ────────────────────────────────────────────────────────────────

export default function VisualPanel({ project, onUpdate, onContinue }) {
  const queryClient = useQueryClient()
  const [generating, setGenerating] = useState({})
  const [errors, setErrors] = useState({})
  const [selectedScene, setSelectedScene] = useState(null)
  const [allScenes, setAllScenes] = useState([])

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
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      onUpdate?.()
    } catch (e) {
      setErrors(prev => ({ ...prev, [sceneId]: e.message || 'Failed' }))
    } finally {
      setGenerating(prev => ({ ...prev, [sceneId]: false }))
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>
  if (!scripts.length) return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      <Image className="w-10 h-10 text-slate-700 mb-3" />
      <p className="text-slate-400">Complete the Script stage first.</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-white">Presentation Slides</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Each scene has a student-facing slide. Select a scene to edit its content and generate the image.
          </p>
        </div>
        <button onClick={() => onContinue?.('video')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0">
          <Video className="w-4 h-4" /> Continue to Video <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: scene list */}
        <div className="w-64 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto">
          {scripts.map((script, vi) => (
            <SceneList
              key={script.id}
              script={script}
              videoIndex={vi}
              selectedId={selectedScene?.id}
              generating={generating}
              errors={errors}
              onSelect={setSelectedScene}
            />
          ))}
        </div>

        {/* RIGHT: editor */}
        <div className="flex-1 overflow-y-auto">
          {selectedScene ? (
            <SlideEditor
              key={selectedScene.id}
              scene={selectedScene}
              isGenerating={!!generating[selectedScene.id]}
              error={errors[selectedScene.id]}
              onGenerate={handleGenerate}
              onSceneUpdate={(updated) => setSelectedScene(updated)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-12">
              <ChevronRight className="w-8 h-8 text-slate-700 mb-3" />
              <p className="text-slate-400 text-sm">Select a scene on the left to edit its slide</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Scene list (left column) ─────────────────────────────────────────────────

function SceneList({ script, videoIndex, selectedId, generating, errors, onSelect }) {
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', script.moduleId],
    queryFn: () => script.moduleId
      ? fetch('/api/modules/' + script.moduleId + '/scenes').then(r => r.json())
      : Promise.resolve([]),
    enabled: !!script.moduleId,
    refetchInterval: 5000,
  })

  if (isLoading) return <div className="py-4 flex justify-center"><Spinner size="sm" /></div>

  return (
    <div>
      <div className="px-3 py-2 sticky top-0 bg-slate-950/80 backdrop-blur-sm border-b border-white/[0.04]">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Video {videoIndex + 1}
        </p>
        <p className="text-xs text-white font-medium truncate">{script.title}</p>
      </div>
      {scenes.map((scene, i) => {
        const isSelected = selectedId === scene.id
        const hasSlide = !!scene.visualAssetUrl
        const isGen = !!generating[scene.id]
        const parsedSlide = (() => { try { return JSON.parse(scene.slideDeckContent || '{}') } catch { return {} } })()
        const slideTitle = parsedSlide.title || `Scene ${i + 1}`

        return (
          <button
            key={scene.id}
            onClick={() => onSelect(scene)}
            className={`w-full text-left px-3 py-2.5 border-b border-white/[0.03] transition-colors ${
              isSelected ? 'bg-indigo-600/15 border-l-2 border-l-indigo-500' : 'hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-center gap-2">
              {/* Thumbnail */}
              <div className="w-10 h-7 rounded flex-shrink-0 overflow-hidden bg-slate-800">
                {hasSlide
                  ? <img src={scene.visualAssetUrl} className="w-full h-full object-cover" alt="" />
                  : <div className="w-full h-full flex items-center justify-center">
                      {isGen ? <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                              : <Image className="w-3 h-3 text-slate-600" />}
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{slideTitle}</p>
                <p className="text-[10px] text-slate-600">
                  {hasSlide ? '✓ Generated' : isGen ? 'Generating…' : 'Not generated'}
                </p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Slide editor (right column) ──────────────────────────────────────────────

function SlideEditor({ scene, isGenerating, error, onGenerate, onSceneUpdate }) {
  const parsedSlide = (() => { try { return JSON.parse(scene.slideDeckContent || '{}') } catch { return {} } })()

  // Auto-derive values from AI content — user just edits, never types from scratch
  const deriveTitle = (p, s) => {
    if (p.title) return p.title
    // Derive from visual prompt (first clause)
    const vp = s.visualPrompt || ''
    return vp.split(/[.,–—]/)[0].trim().slice(0, 80) || `Scene ${scene.orderIndex + 1}`
  }

  const deriveSubtitle = (p, s) => {
    if (p.subtitle) return p.subtitle
    // Derive first meaningful sentence from script as key insight
    const sentences = (s.scriptContent || '')
      .replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)
      .filter(x => x.length > 20 && x.length < 120)
    return sentences[0] || ''
  }

  const deriveBullets = (p, s) => {
    const items = p.blocks?.[0]?.items
    if (items?.length) return items
    // Auto-extract 3-4 key sentences from script as initial bullets
    const sentences = (s.scriptContent || '')
      .replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)
      .filter(x => x.length > 20 && x.length < 180)
      .slice(0, 4)
    return sentences.map(t => ({ text: t, level: 1 }))
  }

  const [layout, setLayout] = useState(parsedSlide.layout || 'bullets')
  const [theme, setTheme] = useState(parsedSlide.theme || 'dark-navy')
  const [title, setTitle] = useState(() => deriveTitle(parsedSlide, scene))
  const [subtitle, setSubtitle] = useState(() => deriveSubtitle(parsedSlide, scene))
  const [bullets, setBullets] = useState(() => deriveBullets(parsedSlide, scene))
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAction, setAiAction] = useState(null)

  // Sync when scene changes — always auto-fill from AI data
  useEffect(() => {
    const p = (() => { try { return JSON.parse(scene.slideDeckContent || '{}') } catch { return {} } })()
    setLayout(p.layout || 'bullets')
    setTheme(p.theme || 'dark-navy')
    setTitle(deriveTitle(p, scene))
    setSubtitle(deriveSubtitle(p, scene))
    setBullets(deriveBullets(p, scene))
  }, [scene.id, scene.slideDeckContent])

  const themeObj = THEMES.find(t => t.id === theme) || THEMES[0]
  const hasImage = !!scene.visualAssetUrl

  const buildContent = () => ({
    title, subtitle, layout, theme,
    blocks: [{ type: layout === 'summary' ? 'summary' : 'bullets', items: bullets }],
  })

  const saveContent = async () => {
    setSaving(true)
    try {
      await fetch('/api/scenes/' + scene.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide_deck_content: JSON.stringify(buildContent()) }),
      })
    } catch {}
    finally { setSaving(false) }
  }

  const handleGenerate = async () => {
    await saveContent()
    onGenerate(scene.id)
  }

  const handleAi = async (action, prompt) => {
    setAiLoading(true); setAiAction(action)
    try {
      const bulletText = bullets.map(b => (b.level === 2 ? '  - ' : '- ') + b.text).join('\n')
      const res = await fetch('/api/scenes/' + scene.id + '/ai-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, prompt, content: bulletText || 'No content yet', title }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.bullets) setBullets(data.bullets)
      }
    } catch {}
    finally { setAiLoading(false); setAiAction(null) }
  }

  return (
    <div className="p-6 max-w-2xl">

      {/* Slide preview */}
      {hasImage && (
        <div className="relative w-full rounded-xl overflow-hidden mb-6 border border-white/[0.06]" style={{ paddingBottom: '56.25%' }}>
          <img src={scene.visualAssetUrl} alt="Slide" className="absolute inset-0 w-full h-full object-cover" />
          <a href={scene.visualAssetUrl} target="_blank" rel="noopener noreferrer"
            className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-lg flex items-center justify-center">
            <ExternalLink className="w-3.5 h-3.5 text-white" />
          </a>
        </div>
      )}

      {/* Voice script (read-only — for reference) */}
      {scene.scriptContent && (
        <div className="mb-5 p-3 rounded-xl bg-slate-800/30 border border-white/[0.04]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-medium">
            🎙 Voiceover Script (reference — this is what the presenter SAYS)
          </p>
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{scene.scriptContent}</p>
        </div>
      )}

      {/* Slide content editor */}
      <div className="space-y-5">

        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-white mb-1">
            Slide Title <span className="text-slate-500 font-normal">— auto-generated · click to edit</span>
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveContent}
            placeholder="e.g. The 3 Laws of Clean Architecture"
            className="w-full bg-slate-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="block text-xs font-semibold text-white mb-1">
            Key Insight <span className="text-slate-500 font-normal">— auto-generated · click to edit</span>
          </label>
          <input
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
            onBlur={saveContent}
            placeholder="e.g. Separation of concerns is the foundation of maintainable code"
            className="w-full bg-slate-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Bullet points */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-white">
              Slide Bullets <span className="text-slate-500 font-normal">— auto-generated · edit or use AI to refine</span>
            </label>
            <div className="flex gap-1.5">
              {[
                { id: 'shorten',  label: 'Shorter',  prompt: 'Make each bullet shorter and more concise, max 8 words each.' },
                { id: 'simplify', label: 'Simpler',  prompt: 'Rewrite in plain simple language. No jargon.' },
                { id: 'expand',   label: 'Expand',   prompt: 'Add more educational detail and one example per bullet.' },
              ].map(a => (
                <button key={a.id} onClick={() => handleAi(a.id, a.prompt)} disabled={aiLoading}
                  className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg border transition-colors ${
                    aiLoading && aiAction === a.id
                      ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                      : 'bg-slate-800/60 border-white/10 text-slate-400 hover:border-indigo-500/30 hover:text-indigo-400'
                  }`}>
                  {aiLoading && aiAction === a.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Wand2 className="w-3 h-3" />}
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-center gap-2 group/b">
                <button
                  onClick={() => setBullets(bs => bs.map((x, idx) => idx === i ? { ...x, level: x.level === 1 ? 2 : 1 } : x))}
                  className={`w-5 h-5 flex-shrink-0 rounded text-xs font-bold flex items-center justify-center transition-colors ${
                    b.level === 2 ? 'bg-slate-700 text-slate-400' : 'bg-indigo-500/20 text-indigo-400'
                  }`}
                  title="Toggle main/sub point"
                >{b.level === 2 ? '◦' : '•'}</button>
                <input
                  value={b.text}
                  onChange={e => setBullets(bs => bs.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))}
                  onBlur={saveContent}
                  placeholder={b.level === 1 ? 'Key concept or fact students need to learn' : 'Supporting detail, example, or context'}
                  className={`flex-1 bg-slate-800/40 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500/40 transition-colors ${
                    b.level === 2 ? 'text-slate-400 ml-3' : 'text-white'
                  }`}
                />
                <button
                  onClick={() => { setBullets(bs => bs.filter((_, idx) => idx !== i)); saveContent() }}
                  className="opacity-0 group-hover/b:opacity-100 text-slate-600 hover:text-red-400 transition-all flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>



          <div className="flex gap-3 mt-2">
            <button onClick={() => setBullets(b => [...b, { text: '', level: 1 }])}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-400 transition-colors">
              <Plus className="w-3 h-3" /> Add main point
            </button>
            <button onClick={() => setBullets(b => [...b, { text: '', level: 2 }])}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors">
              <Plus className="w-3 h-3" /> Add sub-point
            </button>
          </div>
        </div>

        {/* Layout + Theme */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-white mb-2">Layout</label>
            <div className="grid grid-cols-3 gap-1.5">
              {LAYOUTS.map(l => (
                <button key={l.id} onClick={() => { setLayout(l.id); saveContent() }}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    layout === l.id
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-white'
                      : 'border-white/[0.06] bg-slate-800/40 text-slate-500 hover:border-white/20'
                  }`}>
                  <div className="text-base mb-0.5">{l.icon}</div>
                  <div className="text-[9px] font-medium">{l.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white mb-2">Theme</label>
            <div className="space-y-1.5">
              {THEMES.map(th => (
                <button key={th.id} onClick={() => { setTheme(th.id); saveContent() }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
                    theme === th.id ? 'border-white/30 bg-white/[0.05]' : 'border-white/[0.06] hover:border-white/15'
                  }`}
                  style={{ background: theme === th.id ? th.bg + '40' : undefined }}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: th.color }} />
                  <span className="text-xs text-slate-300">{th.label}</span>
                  {theme === th.id && <CheckCircle className="w-3 h-3 text-white ml-auto" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        {/* Generate button */}
        <Button onClick={handleGenerate} disabled={isGenerating} className="w-full" size="lg">
          {isGenerating
            ? <><Loader2 className="w-4 h-4 animate-spin" />Generating slide image…</>
            : hasImage
            ? <><RotateCcw className="w-4 h-4" />Regenerate Slide</>
            : <><Sparkles className="w-4 h-4" />Generate Slide Image</>}
        </Button>
        <p className="text-[10px] text-slate-600 text-center -mt-2">
          Saves content automatically · Generates a 1920×1080 presentation slide
        </p>
      </div>
    </div>
  )
}
