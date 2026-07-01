/**
 * Visual Designer — Storyboard + Visual merged
 *
 * FEATURES
 * ─────────
 * • 9 slide layouts with live animated CSS preview
 * • Clean geometric gradients as background (no photos)
 * • GVSU logo on every slide (draggable, toggle-able)
 * • Figma-style drag-to-move: Logo · Title · Subtitle · Content block
 *   all independently repositionable by clicking & dragging on the preview
 * • "Reset layout" button resets positions to per-layout defaults
 * • AI rewrite (Shorter/Simpler/Expand) with sensible prompts + Reset-to-original
 * • Positions + showLogo saved in slideDeckContent (DB)
 */
import React, { useState, useRef, useEffect, Component } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { mediaService } from '@/services/media'
import {
  Loader2, CheckCircle, Sparkles, RotateCcw, ArrowRight, Video,
  Plus, Trash2, Wand2, Mic, Layers, Play, RotateCw, Move, Image,
  BookOpen, Code, BarChart2, Cpu, Zap, Target, Globe,
  Database, Award, Star, Shield, Eye, EyeOff, Settings, AlertCircle,
  Square, Volume2
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

// ─── Constants ────────────────────────────────────────────────────────────────

// Text Motion — replaces the old "Background Motion" (zoom/pan) picker.
// The background is now always static; instead this controls how the
// narration-synced caption reveals on screen, which is the actually
// attractive/legible effect: text appearing in step with the voiceover.
const MOTION_STYLES = [
  { id: 'word-by-word', label: 'Word by Word', icon: '✦', cls: '', desc: 'Captions reveal one word at a time as the voiceover speaks' },
  { id: 'line-by-line', label: 'Line by Line',  icon: '☰', cls: '', desc: 'Each sentence fades in together as it’s spoken' },
  { id: 'all-at-once',  label: 'All at Once',   icon: '■', cls: '', desc: 'Full caption shown immediately once narration starts' },
]

const LAYOUTS = [
  { id: 'title-hero', label: 'Intro',    icon: '▣' },
  { id: 'bullets',    label: 'Bullets',  icon: '≡' },
  { id: 'two-column', label: '2-Column', icon: '⊟' },
  { id: 'icon-grid',  label: 'Icon Grid',icon: '⊞' },
  { id: 'key-stats',  label: 'Stats',    icon: '↑' },
  { id: 'chart',      label: 'Chart',    icon: '▦' },
  { id: 'definition', label: 'Define',   icon: '📖'},
  { id: 'quote',      label: 'Quote',    icon: '"' },
  { id: 'summary',    label: 'Summary',  icon: '✓' },
]

const THEMES = [
  { id: 'dark-navy',  label: 'Navy',     accent: '#3B82F6', bg: '#020C1B', bgGrad: '#05183A', text: '#E2E8F0', textSub: '#94A3B8', isDark: true  },
  { id: 'ocean',      label: 'Ocean',    accent: '#06B6D4', bg: '#041A2E', bgGrad: '#062638', text: '#E2E8F0', textSub: '#7DD3FC', isDark: true  },
  { id: 'academic',   label: 'Academic', accent: '#10B981', bg: '#061410', bgGrad: '#0C2218', text: '#E2E8F0', textSub: '#6EE7B7', isDark: true  },
  { id: 'light',      label: 'Light',    accent: '#6366F1', bg: '#F8FAFC', bgGrad: '#EEF2FF', text: '#1E293B', textSub: '#475569', isDark: false },
  { id: 'corporate',  label: 'Corp',     accent: '#F59E0B', bg: '#0D1117', bgGrad: '#161B22', text: '#E2E8F0', textSub: '#9CA3AF', isDark: true  },
]

// Default layer positions (% of slide width/height) per layout
// `image` defaults to right side — user drags it wherever they want
// Text layers stop at x+width ≈ 72%, leaving the bottom-right "presenter avatar"
// zone (x:76.5–98.5%, y:60–98%) and the image column clear of overlapping text.
const DEFAULT_POSITIONS = {
  'bullets':    { logo:{x:82,y:4}, title:{x:7,y:10}, subtitle:{x:7,y:29}, content:{x:7,y:41}, image:{x:56,y:10} },
  'title-hero': { logo:{x:82,y:4}, title:{x:10,y:20},subtitle:{x:10,y:46},content:{x:10,y:64},image:{x:56,y:12} },
  'two-column': { logo:{x:82,y:4}, title:{x:7,y:6},  subtitle:{x:7,y:20}, content:{x:7,y:32}, image:{x:57,y:6}  },
  'icon-grid':  { logo:{x:82,y:4}, title:{x:7,y:5},  subtitle:{x:7,y:16}, content:{x:7,y:27}, image:{x:57,y:5}  },
  'key-stats':  { logo:{x:82,y:4}, title:{x:7,y:6},  subtitle:{x:7,y:20}, content:{x:7,y:34}, image:{x:57,y:6}  },
  'chart':      { logo:{x:82,y:4}, title:{x:7,y:5},  subtitle:{x:7,y:16}, content:{x:7,y:27}, image:{x:57,y:5}  },
  'definition': { logo:{x:82,y:4}, title:{x:7,y:8},  subtitle:{x:7,y:24}, content:{x:7,y:46}, image:{x:57,y:8}  },
  'quote':      { logo:{x:82,y:4}, title:{x:12,y:8}, subtitle:{x:12,y:82},content:{x:12,y:22}, image:{x:57,y:8}  },
  'summary':    { logo:{x:82,y:4}, title:{x:7,y:6},  subtitle:{x:7,y:20}, content:{x:7,y:34}, image:{x:57,y:6}  },
}

// Width of each draggable layer (% of slide). Text layers are capped at 65%
// (starting at x≈7-12%) so they never reach the avatar placeholder zone
// (which starts at x≈76.5%) or run underneath the image column.
const LAYER_WIDTHS = { logo:10, title:65, subtitle:65, content:65, image:35 }

const TOPIC_ICONS = [BookOpen, Code, BarChart2, Cpu, Layers, Zap, Target, Globe, Database, Award, Star, Shield]
const pickIcon    = (s='') => TOPIC_ICONS[[...s].reduce((a,c)=>a+c.charCodeAt(0),0) % TOPIC_ICONS.length]
const pickIconAt  = (s='', offset=0) => TOPIC_ICONS[([...s].reduce((a,c)=>a+c.charCodeAt(0),0)+offset*7) % TOPIC_ICONS.length]

// ─── Chart helpers ────────────────────────────────────────────────────────────

const extractChartData = (bullets) => {
  return bullets.slice(0,5).map((b,i)=>{
    const m = b.text.match(/(\d+\.?\d*)/)
    const hasNumber = !!m
    const value = hasNumber ? Math.min(Math.max(parseFloat(m[1]),5),100) : 70  // equal visual height when no data
    const valueLabel = hasNumber
      ? (b.text.includes('%') ? `${Math.round(value)}%` : String(Math.round(value)))
      : null  // no label shown if no real number in bullet
    const label = b.text.replace(/^\d+\.?\d*%?\s*[-:–]?\s*/,'').slice(0,18) || `Item ${i+1}`
    return { label, value, valueLabel, hasNumber }
  })
}

const extractStats = (bullets) => {
  return bullets.slice(0,4).map((b,i)=>{
    const m = b.text.match(/(\d+\.?\d*%?×?x?)/)
    const hasNumber = !!m
    const stat = hasNumber ? m[1] : null  // null = show icon instead
    const label = b.text.replace(/\d+\.?\d*%?×?x?\s*[-:–]?\s*/,'').slice(0,44) || b.text.slice(0,44)
    return { stat, label, hasNumber }
  })
}

// ─── CSS animations ───────────────────────────────────────────────────────────

const SLIDE_CSS = `
@keyframes pa-slideLeft { from{opacity:0;transform:translateX(-24px)} to{opacity:1;transform:translateX(0)} }
@keyframes pa-fadeUp    { from{opacity:0;transform:translateY(14px)}  to{opacity:1;transform:translateY(0)} }
@keyframes pa-fade      { from{opacity:0} to{opacity:1} }
@keyframes pa-scaleIn   { from{opacity:0;transform:scale(0.87)} to{opacity:1;transform:scale(1)} }
@keyframes pa-slowZoom  { 0%{transform:scale(1)}      100%{transform:scale(1.30)} }
@keyframes pa-zoomOut   { 0%{transform:scale(1.30)}   100%{transform:scale(1)}    }
@keyframes pa-panLeft   { 0%{transform:scale(1.15) translateX(7%)}  100%{transform:scale(1.15) translateX(-7%)} }
@keyframes pa-panRight  { 0%{transform:scale(1.15) translateX(-7%)} 100%{transform:scale(1.15) translateX(7%)}  }
@keyframes pa-kenBurns  { 0%{transform:scale(1) translate(2%,2%)} 100%{transform:scale(1.30) translate(-4%,-3%)} }
@keyframes pa-barGrow   { from{transform:scaleY(0)} to{transform:scaleY(1)} }
@keyframes pa-pageIn    { from{opacity:0;transform:translateY(10px) scale(0.992)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes pa-cueIn     { 0%{opacity:0;transform:translateY(8px)} 12%{opacity:1;transform:translateY(0)} 88%{opacity:1} 100%{opacity:0} }

/* Each style gets its own, clearly distinct duration + easing on top of the
   amplitude difference above, so "the same motion at different speeds" can't
   happen to look identical either. Direction is "normal" (not alternate) so
   zoom-IN keeps growing and zoom-OUT keeps shrinking for the whole preview —
   alternate would make in/out and left/right indistinguishable after the
   first half-cycle since they'd both just oscillate between the same values. */
.pa-motion-slowzoom { animation:pa-slowZoom 9s  ease-in-out infinite alternate }
.pa-motion-zoomout  { animation:pa-zoomOut  9s  ease-in-out infinite alternate }
.pa-motion-panleft  { animation:pa-panLeft  10s linear      infinite alternate }
.pa-motion-panright { animation:pa-panRight 10s linear      infinite alternate }
.pa-motion-kenburns { animation:pa-kenBurns 13s ease-in-out infinite alternate }

.pa-title  { animation:pa-slideLeft 0.65s cubic-bezier(.22,.68,0,1.2) both }
.pa-sub    { animation:pa-fadeUp    0.55s 0.22s ease-out both }
.pa-icon   { animation:pa-fade      0.80s 0.10s ease-out both }
.pa-logo   { animation:pa-fade      0.60s 0.05s ease-out both }
.pa-b0     { animation:pa-fadeUp    0.50s 0.38s ease-out both }
.pa-b1     { animation:pa-fadeUp    0.50s 0.52s ease-out both }
.pa-b2     { animation:pa-fadeUp    0.50s 0.66s ease-out both }
.pa-b3     { animation:pa-fadeUp    0.50s 0.80s ease-out both }
.pa-b4     { animation:pa-fadeUp    0.50s 0.94s ease-out both }
.pa-card0  { animation:pa-scaleIn   0.45s 0.30s ease-out both }
.pa-card1  { animation:pa-scaleIn   0.45s 0.45s ease-out both }
.pa-card2  { animation:pa-scaleIn   0.45s 0.60s ease-out both }
.pa-card3  { animation:pa-scaleIn   0.45s 0.75s ease-out both }
.pa-card4  { animation:pa-scaleIn   0.45s 0.90s ease-out both }
.pa-bar    { animation:pa-barGrow   0.60s ease-out both; transform-origin:bottom }

/* Whole-editor page transition — plays once whenever the remounted scene
   editor (keyed by scene.id, see SlideEditorBoundary) appears, so switching
   between scenes feels like a page turn instead of an instant content swap. */
.pa-page-enter { animation:pa-pageIn 0.32s cubic-bezier(.22,.68,0,1.05) both }

/* Storyboard text-cue overlay — fades a key term in, holds it, fades it out.
   Duration is set inline per-cue (animation-duration) to match its
   duration_seconds from the storyboard data. */
.pa-cue { animation:pa-cueIn linear both; }

/* Draggable layer hover ring */
.pa-drag-layer:hover > .pa-drag-ring { outline: 2px solid #60A5FA; outline-offset: 3px; border-radius: 4px; }
.pa-drag-layer:hover > .pa-drag-label { display: flex; }
`
function injectCSS() {
  if (!document.getElementById('pa-css')) {
    const s = document.createElement('style')
    s.id = 'pa-css'; s.textContent = SLIDE_CSS
    document.head.appendChild(s)
  }
}

const FS = (min, vw, max) => `clamp(${min}px,${vw}vw,${max}px)`

// ─── Main Panel ───────────────────────────────────────────────────────────────

// ─── Error boundary — catches any render crash in the slide editor ────────────

class SlideEditorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(err) { return { error: err } }
  componentDidCatch(err, info) { console.error('[VisualDesigner]', err, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <p className="text-white font-medium mb-1">Slide editor error</p>
          <p className="text-slate-500 text-xs mb-4 max-w-xs">{this.state.error?.message || 'Unknown error'}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function VisualDesignerPanel({ project, onUpdate, onContinue }) {
  const queryClient   = useQueryClient()
  const [selected,    setSelected]   = useState(null)
  const [generating,  setGenerating] = useState({})
  // Per-module theme already resolved (chosen via the gate popup, or skipped
  // because the module already has customized content) — moduleId -> themeId.
  const [moduleThemes, setModuleThemes] = useState({})

  useEffect(() => { injectCSS() }, [])

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn:  () => scriptsService.listByProject(project.id),
    enabled:  !!project?.id,
  })

  // Auto-select the first scene of the first module on entry — this is what
  // makes clicking "Continue to Visual Designer" immediately surface the
  // theme picker below, instead of requiring the user to click a scene first.
  const firstModuleId = scripts[0]?.moduleId
  const { data: firstModuleScenes = [] } = useQuery({
    queryKey: ['scenes', firstModuleId],
    queryFn:  () => firstModuleId
      ? fetch('/api/modules/' + firstModuleId + '/scenes').then(r => r.json())
      : Promise.resolve([]),
    enabled:  !!firstModuleId,
  })
  useEffect(() => {
    if (!selected && firstModuleScenes.length && scripts[0]) {
      setSelected({ scene: firstModuleScenes[0], script: scripts[0], totalScenes: firstModuleScenes.length })
    }
  }, [firstModuleScenes, selected, scripts])

  // Does the currently selected scene's module still need the theme gate?
  // Skipped if the module already has customized content (parsed.theme is set
  // in the main scene's slideDeckContent means a real person already chose a
  // theme) — only genuinely fresh modules get prompted, and only once per
  // module per session. Once chosen, the theme persists for the entire module.
  const selectedModuleId = selected?.script?.moduleId
  const selectedParsed = selected ? (() => { try { return JSON.parse(selected.scene.slideDeckContent || '{}') } catch { return {} } })() : {}
  const needsThemeGate = !!selected && !!selectedModuleId
    && !selectedParsed.theme // Theme not yet chosen for this module
    && moduleThemes[selectedModuleId] === undefined

  const resolveModuleTheme = async (themeId) => {
    if (!selectedModuleId || !selected?.scene?.id) return
    setModuleThemes(p => ({ ...p, [selectedModuleId]: themeId }))
    try {
      // Apply the theme to all segments in the scene
      await fetch(`/api/scenes/${selected.scene.id}/apply-theme-to-segments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: themeId }),
      })
      // Refresh scene data to show updated designs
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
    } catch (e) { console.error('Failed to apply theme:', e) }
  }

  const handleGenerate = async (sceneId) => {
    setGenerating(p => ({ ...p, [sceneId]: true }))
    try {
      await agentsService.runGenerateAsset(sceneId)
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      onUpdate?.()
    } catch (e) { console.error('Generate asset error:', e) }
    finally { setGenerating(p => ({ ...p, [sceneId]: false })) }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>
  if (!scripts.length) return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      <Layers className="w-10 h-10 text-slate-700 mb-3" />
      <p className="text-slate-400">Complete the Script stage first.</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" /> Visual Designer
          </h2>
         
        </div>
        <button onClick={() => onContinue?.('video')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors">
          <Sparkles className="w-4 h-4" /> Continue to Video Generation <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: scene list - Clean inline layout */}
        <div className="w-72 flex-shrink-0 border-r border-gray-700 overflow-y-auto bg-slate-950">
          {scripts.map((script, vi) => (
            <SceneGroupList key={script.id} script={script} videoIndex={vi}
              selectedId={selected?.scene?.id} generating={generating}
              onSelect={(scene, totalScenes) => setSelected({ scene, script, totalScenes })}
              onDeleted={(sceneId) => setSelected(prev => prev?.scene?.id === sceneId ? null : prev)} />
          ))}
        </div>

        {/* Right: editor */}
        <div className="flex-1 overflow-y-auto bg-slate-950">
          {needsThemeGate ? (
            <ModuleThemeGate moduleTitle={selected.script.title}
              onChoose={(themeId) => resolveModuleTheme(themeId)} />
          ) : selected ? (
            <SlideEditorBoundary key={selected.scene.id}>
              <SceneEditor scene={selected.scene}
                moduleTitle={selected.script.title} totalScenes={selected.totalScenes || 1}
                defaultTheme={moduleThemes[selectedModuleId] || 'light'}
                voiceId={project?.defaultVoiceId}
                avatarId={project?.defaultAvatarId}
                isGenerating={!!generating[selected.scene.id]} onGenerate={handleGenerate} />
            </SlideEditorBoundary>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/[0.06] flex items-center justify-center mb-4">
                <Layers className="w-7 h-7 text-slate-700" />
              </div>
              <p className="text-white font-medium mb-1">Select a scene</p>
              <p className="text-slate-500 text-sm">Click any scene on the left to design its slide</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Per-module theme gate ────────────────────────────────────────────────────
// Shown once per module, before any of its (fresh, never-customized) scenes
// can be edited — either right after "Continue to Visual Designer" (for the
// first module) or the first time a different module's scene is opened.

function ModuleThemeGate({ moduleTitle, onChoose }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      <div className="w-full max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 mx-auto">
          <Sparkles className="w-6 h-6 text-indigo-400" />
        </div>
        <p className="text-white font-medium mb-1">Choose a theme for this module</p>
        <p className="text-slate-500 text-sm mb-5">
          "{moduleTitle}" — applies to every scene in this module
        </p>
        <div className="space-y-1.5">
          {THEMES.map(th => (
            <button key={th.id} onClick={() => onChoose(th.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded border border-white/[0.10] hover:border-indigo-400/40 hover:bg-white/[0.03] transition-all text-left"
              style={{ background: th.isDark ? 'transparent' : 'rgba(248,250,252,0.05)' }}>
              <div className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20" style={{ background: th.accent }} />
              <span className="text-sm font-medium text-white">{th.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Left: scene group list ───────────────────────────────────────────────────

function SceneGroupList({ script, videoIndex, selectedId, generating, onSelect, onDeleted }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', script.moduleId],
    queryFn:  () => script.moduleId
      ? fetch('/api/modules/' + script.moduleId + '/scenes').then(r => r.json())
      : Promise.resolve([]),
    enabled:  !!script.moduleId,
    refetchInterval: 5000,
  })

  const handleAddScene = async () => {
    if (!script.moduleId || adding) return
    setAdding(true)
    try {
      const res = await fetch('/api/modules/' + script.moduleId + '/scenes', { method: 'POST' })
      if (res.ok) {
        const scene = await res.json()
        await queryClient.invalidateQueries({ queryKey: ['scenes', script.moduleId] })
        onSelect(scene, scenes.length + 1)
      }
    } catch {}
    finally { setAdding(false) }
  }

  const handleDeleteScene = async (e, sceneId) => {
    e.stopPropagation()
    if (!window.confirm('Delete this scene? This cannot be undone.')) return
    try {
      const res = await fetch('/api/scenes/' + sceneId, { method: 'DELETE' })
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['scenes', script.moduleId] })
        onDeleted?.(sceneId)
      }
    } catch {}
  }

  return (
    <div>
      <div className="px-3 py-2 sticky top-0 bg-slate-950 backdrop-blur-sm border-b border-gray-700 z-10">
        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Module {videoIndex + 1}</p>
        <p className="text-xs text-white font-medium truncate mt-0.5">{script.title}</p>
      </div>
      {isLoading
        ? <div className="py-3 flex justify-center"><Spinner size="sm" /></div>
        : scenes.map((scene, i) => {
            const isSel  = selectedId === scene.id
            const hasAst = !!scene.visualAssetUrl
            const isGen  = !!generating[scene.id]
            const parsed = (() => { try { return JSON.parse(scene.slideDeckContent || '{}') } catch { return {} } })()
            const th     = THEMES.find(t => t.id === (parsed.theme || 'light')) || THEMES.find(t => t.id === 'light') || THEMES[0]
            const slideTitle = parsed.title || 'Untitled slide'
            const layoutId   = parsed.layout || 'bullets'
            return (
              <button key={scene.id} onClick={() => onSelect(scene, scenes.length)}
                className={`group w-full text-left border-b border-gray-800 transition-all ${
                  isSel ? 'bg-indigo-500/15 border-l-2 border-l-indigo-500' : 'hover:bg-white/[0.02]'
                }`}>
                <div className="flex items-center gap-2 px-3 py-2">
                  {/* Compact inline layout - 3D styled icon */}
                  <div className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center relative" 
                    style={{ 
                      background: `${th.accent}20`,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                      transform: 'perspective(600px) rotateX(5deg) rotateY(-5deg)',
                      transformStyle: 'preserve-3d',
                    }}>
                    <span style={{ 
                      color: th.accent, 
                      fontSize: 11, 
                      fontWeight: 700,
                      textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      transform: 'translateZ(8px)',
                    }}>
                      {LAYOUTS.find(l=>l.id===layoutId)?.icon||'≡'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{slideTitle}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {hasAst ? '✓ Ready' : isGen ? 'Generating...' : 'Draft'}
                    </p>
                  </div>
                  {isGen && <Loader2 className="w-3 h-3 text-indigo-400 animate-spin flex-shrink-0" />}
                  {hasAst && !isGen && <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                  <div onClick={(e) => handleDeleteScene(e, scene.id)} title="Delete scene"
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all flex-shrink-0 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </div>
                </div>
              </button>
            )
          })
      }
      <button onClick={handleAddScene} disabled={adding}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-slate-500 hover:text-indigo-400 border-b border-white/[0.03] transition-colors disabled:opacity-50">
        {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Add scene
      </button>
    </div>
  )
}

// ─── Right: scene editor ──────────────────────────────────────────────────────

function SceneEditor({ scene, moduleTitle, totalScenes, defaultTheme = 'light', voiceId, avatarId, isGenerating, onGenerate }) {
  // Fetch the avatar list once (cached project-wide via react-query, so this
  // is instant after the first load — see also CastingSettings/AvatarStudioPanel
  // which share the same query key) purely to find the selected avatar's
  // preview thumbnail, so the chosen presenter actually shows up in this
  // live slide preview instead of a generic placeholder icon.
  const { data: avatarsRes } = useQuery({
    queryKey: ['heygen-avatars'],
    queryFn: () => mediaService.listAvatars(),
    enabled: !!avatarId,
    staleTime: 10 * 60 * 1000,
  })
  const selectedAvatar = avatarsRes?.avatars?.find(a => a.avatar_id === avatarId)
  const avatarImageUrl = selectedAvatar?.preview_image_url || null
  const parsed = (() => { try { return JSON.parse(scene.slideDeckContent || '{}') } catch { return {} } })()
  // Storyboard-generated key-term overlays (optional — only present for scenes
  // that went through the storyboard agent). Drives the timed text-cue reveal
  // in both this live preview and the rendered video (see ffmpegVideo.ts).
  const textCues = (() => { try { return JSON.parse(scene.textCues || '[]') } catch { return [] } })()

  // Pre-fill bullets from AI-generated slide blocks — never fall back to voice script
  const initBullets = (() => {
    const items = parsed.blocks?.[0]?.items
    if (items?.length) return items
    // No slide content yet — start empty so user fills in slide-specific content
    return [{ text: '', level: 1 }]
  })()

  const [layout,    setLayout]    = useState(parsed.layout || 'bullets')
  // For fresh scenes (no saved positions = never customized) fall back to the
  // module's theme chosen via the per-module theme gate, not a hardcoded value.
  const [theme,     setTheme]     = useState(parsed.positions ? (parsed.theme || defaultTheme) : defaultTheme)
  const [title,     setTitle]     = useState(parsed.title     || '')
  // Guard against older/legacy slide data that accidentally used the voiceover
  // script as the slide subtitle (the presenter's narration, not on-slide copy) —
  // if the saved subtitle is basically the same text as the scene's voice script,
  // drop it instead of showing the narration directly under the title.
  const initialSubtitle = (() => {
    const raw = parsed.subtitle || ''
    const vs  = (scene.scriptContent || '').trim().toLowerCase()
    const rawNorm = raw.trim().toLowerCase()
    if (raw && vs && rawNorm.length > 30 && (vs.startsWith(rawNorm.slice(0, 40)) || rawNorm.startsWith(vs.slice(0, 40)))) {
      return ''
    }
    return raw
  })()
  const [subtitle,  setSubtitle]  = useState(initialSubtitle)
  const [bullets,   setBullets]   = useState(initBullets)
  const [motion,    setMotion]    = useState(() => MOTION_STYLES.find(m=>m.id===(scene.textAnimationType||'word-by-word')) || MOTION_STYLES[0])
  const [positions,   setPositions]   = useState(() => {
    // Always merge saved positions with layout defaults so every key exists,
    // and merge per-field (not whole-object) so older saved data without a
    // `scale` field still gets the default scale of 1.
    const layoutKey = parsed.layout || 'bullets'
    const defaults  = DEFAULT_POSITIONS[layoutKey] || DEFAULT_POSITIONS.bullets
    const saved     = parsed.positions || {}
    return Object.keys(defaults).reduce((acc, k) => ({
      ...acc,
      [k]: { scale: 1, ...defaults[k], ...(saved[k] || {}) },
    }), {})
  })
  const [showLogo,    setShowLogo]    = useState(parsed.showLogo !== false)
  // Image layer
  const [imageUrl,    setImageUrl]    = useState(parsed.imageUrl    || '')
  const [imageWidth,  setImageWidth]  = useState(parsed.imageWidth  || 36)
  const [imageShape,  setImageShape]  = useState(parsed.imageShape  || 'rounded')
  const [previewKey,  setPreviewKey]  = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [aiLoading,   setAiLoading]   = useState(false)
  const [aiAction,    setAiAction]    = useState(null)
  const [showVoice,   setShowVoice]   = useState(false)
  const [showImgPanel,setShowImgPanel]= useState(!!parsed.imageUrl)
  // Settings panel — edit the voice script text + regenerate audio from here,
  // instead of having to go back to the Voice stage.
  const [showScriptSettings, setShowScriptSettings] = useState(false)
  const [scriptText,         setScriptText]         = useState(scene.scriptContent || '')
  const [savingScript,       setSavingScript]       = useState(false)
  const [regeneratingVoice,  setRegeneratingVoice]  = useState(false)
  const [voiceRegenError,    setVoiceRegenError]    = useState(null)
  const [voiceRegenDone,     setVoiceRegenDone]     = useState(false)

  // Live narration playback (#attractive VD): play the scene's voiceover
  // right on the preview canvas and reveal the script one word at a time,
  // synced to audio progress, instead of dumping the whole caption at once.
  const narrationAudioRef = useRef(null)
  const [narrationPlaying,  setNarrationPlaying]  = useState(false)
  const [narrationProgress, setNarrationProgress] = useState(0) // 0..1
  const scriptWords = (scriptText || '').trim() ? scriptText.trim().split(/\s+/) : []
  // Text Motion mode controls how far ahead of the raw audio progress the
  // reveal jumps: word-by-word reveals exactly proportional to progress,
  // line-by-line snaps forward in sentence-sized chunks, all-at-once shows
  // the full caption the instant narration starts.
  const rawRevealCount = narrationPlaying || narrationProgress > 0
    ? Math.min(scriptWords.length, Math.max(1, Math.ceil(narrationProgress * scriptWords.length)))
    : 0
  const revealedWordCount = (() => {
    if (rawRevealCount === 0) return 0
    if (motion.id === 'all-at-once') return scriptWords.length
    if (motion.id === 'line-by-line') {
      // Snap forward to the end of the current ~8-word "line" chunk.
      const chunk = 8
      return Math.min(scriptWords.length, Math.ceil(rawRevealCount / chunk) * chunk)
    }
    return rawRevealCount // word-by-word
  })()
  const captionPreview = scriptWords.slice(0, revealedWordCount).join(' ')

  const toggleNarration = () => {
    const audio = narrationAudioRef.current
    if (!audio || !scene.ttsAudioUrl) return
    if (narrationPlaying) {
      audio.pause()
      setNarrationPlaying(false)
    } else {
      audio.currentTime = 0
      setNarrationProgress(0)
      audio.play()
      setNarrationPlaying(true)
    }
  }

  useEffect(() => {
    const audio = narrationAudioRef.current
    if (!audio) return
    const onTime = () => setNarrationProgress(audio.currentTime / (audio.duration || 1))
    const onEnded = () => { setNarrationPlaying(false); setNarrationProgress(0) }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnded)
    }
  }, [scene.ttsAudioUrl])

  // Segment mini-timeline (#32) — a scene rendered from segments (welcome
  // scene's hook/content/content/interaction/recap, or one "question" segment
  // per quiz question — see schema.prisma's SceneSegment doc comment) shows
  // each segment as its own editable chip instead of one flat script box.
  const [segments,        setSegments]        = useState(scene.segments || [])
  const [activeSegmentId, setActiveSegmentId]  = useState(null)
  const [segmentDrafts,   setSegmentDrafts]    = useState({}) // id -> draft text while editing
  const [segmentBusy,     setSegmentBusy]      = useState({}) // id -> 'saving' | 'voicing'
  const [segmentError,    setSegmentError]     = useState({}) // id -> error message

  const originalBulletsRef = useRef(initBullets)
  const fileInputRef        = useRef(null)

  // Always-fresh ref so async callbacks see latest state
  const stateRef = useRef({})
  useEffect(() => {
    stateRef.current = { title, subtitle, layout, theme, bullets, positions, showLogo, motionId: motion.id, imageUrl, imageWidth, imageShape }
  })

  const themeObj = THEMES.find(t => t.id === theme) || THEMES[0]

  const saveContent = async () => {
    const s = stateRef.current
    setSaving(true)
    const designJson = JSON.stringify({
      title: s.title, subtitle: s.subtitle, layout: s.layout, theme: s.theme,
      blocks: [{ type: 'bullets', items: s.bullets }],
      positions: s.positions, showLogo: s.showLogo,
      imageUrl: s.imageUrl, imageWidth: s.imageWidth, imageShape: s.imageShape,
    })
    try {
      if (activeSegmentId) {
        // Per-segment design (#38) — saved on the segment itself, NOT on the
        // shared scene.slideDeckContent, so this segment's slide stays its
        // own ("keep it in her own vd not with other vd").
        await agentsService.updateSceneSegment(activeSegmentId, { slide_design: designJson })
        await fetch('/api/scenes/' + scene.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text_animation_type: s.motionId }),
        })
      } else {
        await fetch('/api/scenes/' + scene.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slide_deck_content: designJson, text_animation_type: s.motionId }),
        })
      }
    } catch {}
    finally { setSaving(false) }
  }

  const handleLayoutChange = (newLayout) => {
    setLayout(newLayout)
    // Preserve image position + any custom scale the user set, otherwise use default
    const def = DEFAULT_POSITIONS[newLayout] || DEFAULT_POSITIONS.bullets
    setPositions(prev => Object.keys(def).reduce((acc, k) => ({
      ...acc,
      [k]: k === 'image'
        ? (prev.image || def.image)
        : { ...def[k], scale: prev[k]?.scale || 1 },
    }), {}))
  }

  // File → upload to server and get /api/uploads/... URL
  // (not base64 data URL, since SVG rasterization doesn't handle embedded data URLs well)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageUrl('')  // Clear while uploading
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        setImageUrl(data.url || '')
        setTimeout(saveContent, 50)
      }
    } catch (err) {
      console.error('Image upload failed:', err)
    }
    e.target.value = ''  // allow re-upload of same file
  }

  const handlePositionChange = (key, newPos) => {
    setPositions(prev => ({ ...prev, [key]: { ...prev[key], ...newPos } }))
  }

  // Remove a layer straight from the slide canvas (the small × that appears
  // on hover) instead of only being able to hide/clear it from the side panel.
  const handleDeleteLayer = (key) => {
    switch (key) {
      case 'logo':     setShowLogo(false); break
      case 'image':    setImageUrl(''); break
      case 'title':    setTitle(''); break
      case 'subtitle': setSubtitle(''); break
      case 'content':  setBullets([{ text: '', level: 1 }]); break
      default: return
    }
    setTimeout(saveContent, 0)
  }

  const handleGenerate = async () => { await saveContent(); onGenerate(scene.id) }

  const handleSaveScript = async () => {
    setSavingScript(true)
    try {
      await fetch('/api/scenes/' + scene.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_content: scriptText }),
      })
    } catch {}
    finally { setSavingScript(false) }
  }

  const handleRegenerateVoice = async () => {
    setRegeneratingVoice(true); setVoiceRegenError(null); setVoiceRegenDone(false)
    try {
      await handleSaveScript()
      await agentsService.runGenerateTTS(scene.id, voiceId, scriptText)
      setVoiceRegenDone(true)
    } catch (e) {
      setVoiceRegenError(e?.message || 'Voice regeneration failed')
    } finally {
      setRegeneratingVoice(false)
    }
  }

  const handleAiRewrite = async (action, prompt) => {
    setAiLoading(true); setAiAction(action)
    try {
      const bulletText = bullets.map(b => (b.level===2?'  - ':'- ')+b.text).join('\n')
      const res = await fetch('/api/scenes/' + scene.id + '/ai-rewrite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, prompt, content: bulletText||'No content', title }),
      })
      if (res.ok) { const d = await res.json(); if (d.bullets) setBullets(d.bullets) }
    } catch {}
    finally { setAiLoading(false); setAiAction(null) }
  }

  // ── Per-segment slide design (#38) ────────────────────────────────────────
  // "keep it in her own vd not with other vd": each segment (hook, content,
  // content, interaction, recap) gets its OWN independent slide design
  // instead of sharing the whole scene's one slideDeckContent. A segment's
  // design is read from its own slideDesign JSON field; if it hasn't been
  // designed yet, seed from its existing AI-generated slideTitle/elements so
  // nothing the script generator already produced gets lost.
  const getSegmentDesign = (seg) => {
    if (!seg) return {}
    try {
      const d = JSON.parse(seg.slideDesign || '{}')
      if (d.title || d.subtitle || d.blocks?.length) return d
    } catch {}
    let elements = []
    try { elements = JSON.parse(seg.elements || '[]') } catch {}
    const items = elements.filter(el => el.type === 'bullet' && el.text).map(el => ({ text: el.text, level: 1 }))
    return { title: seg.slideTitle || '', blocks: items.length ? [{ type: 'bullets', items }] : undefined }
  }

  const loadDesignIntoState = (design) => {
    const layoutKey = design.layout || 'bullets'
    setLayout(layoutKey)
    setTheme(design.positions ? (design.theme || defaultTheme) : defaultTheme)
    setTitle(design.title || '')
    setSubtitle(design.subtitle || '')
    const items = design.blocks?.[0]?.items
    setBullets(items?.length ? items : [{ text: '', level: 1 }])
    const defaults = DEFAULT_POSITIONS[layoutKey] || DEFAULT_POSITIONS.bullets
    const saved = design.positions || {}
    setPositions(Object.keys(defaults).reduce((acc, k) => ({
      ...acc,
      [k]: { scale: 1, ...defaults[k], ...(saved[k] || {}) },
    }), {}))
    setShowLogo(design.showLogo !== false)
    setImageUrl(design.imageUrl || '')
    setImageWidth(design.imageWidth || 36)
    setImageShape(design.imageShape || 'rounded')
  }

  // Auto-select the first segment on mount for segmented scenes.
  //
  // Why: renderSceneSegmentsVideo/buildSegmentSlideSvg (ffmpegVideo.ts) ONLY
  // ever reads segment.slideDesign per segment — it never reads
  // scene.slideDeckContent. But the canvas above defaults to editing
  // scene.slideDeckContent whenever no segment chip is selected. That meant
  // a user opening a segmented scene (e.g. the welcome scene's hook/content/
  // content/interaction/recap) and designing the FIRST thing they see,
  // without explicitly clicking a segment chip first, was saving into a
  // field the render pipeline silently ignores — exactly the "generated
  // video doesn't match what I designed" bug, worst on the first segment
  // since that's what's on screen by default. Defaulting to segment 1 means
  // the canvas always edits something that actually ends up in the video.
  useEffect(() => {
    if (segments.length > 0 && !activeSegmentId) {
      const first = segments[0]
      setActiveSegmentId(first.id)
      loadDesignIntoState(getSegmentDesign(first))
      setSegmentDrafts(prev => prev[first.id] !== undefined ? prev : { ...prev, [first.id]: first.text || '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id])

  // ── Segment mini-timeline handlers (#32) ──────────────────────────────────
  const toggleSegment = async (id) => {
    // Persist whatever's currently on the design canvas (scene-level or the
    // previously-active segment's own slide) before switching targets, then
    // load the new target's own saved design into the canvas.
    await saveContent()
    if (activeSegmentId === id) {
      // Re-clicking the active chip used to "deselect" back to editing
      // scene.slideDeckContent — a field the segmented render path never
      // reads, so this silently threw away where the user's edits would go.
      // For segmented scenes there's no such thing as "no segment selected";
      // just leave the current segment active.
      return
    } else {
      setActiveSegmentId(id)
      loadDesignIntoState(getSegmentDesign(segments.find(s => s.id === id)))
    }
    setSegmentDrafts(prev => prev[id] !== undefined ? prev : {
      ...prev,
      [id]: segments.find(s => s.id === id)?.text || '',
    })
  }

  const handleSaveSegmentText = async (id) => {
    const text = segmentDrafts[id]
    if (text === undefined) return
    setSegmentBusy(prev => ({ ...prev, [id]: 'saving' }))
    setSegmentError(prev => ({ ...prev, [id]: null }))
    try {
      await agentsService.updateSceneSegment(id, { text })
      setSegments(prev => prev.map(s => s.id === id ? { ...s, text, ttsAudioUrl: null } : s))
    } catch (e) {
      setSegmentError(prev => ({ ...prev, [id]: e?.message || 'Failed to save segment' }))
    } finally {
      setSegmentBusy(prev => { const next = { ...prev }; delete next[id]; return next })
    }
  }

  const handleRegenerateSegmentVoice = async (id) => {
    setSegmentBusy(prev => ({ ...prev, [id]: 'voicing' }))
    setSegmentError(prev => ({ ...prev, [id]: null }))
    try {
      await handleSaveSegmentText(id)
      const res = await agentsService.runGenerateTTS(scene.id, voiceId, undefined, undefined, id)
      const url = res?.data?.segments?.[0]?.tts_audio_url
      setSegments(prev => prev.map(s => s.id === id ? { ...s, ttsAudioUrl: url || s.ttsAudioUrl } : s))
    } catch (e) {
      setSegmentError(prev => ({ ...prev, [id]: e?.message || 'Voice regeneration failed' }))
    } finally {
      setSegmentBusy(prev => { const next = { ...prev }; delete next[id]; return next })
    }
  }

  return (
    <div className="p-6 max-w-4xl pa-page-enter">
      <div className="grid grid-cols-1 gap-6">
        {/* PREVIEW - Full width on top */}
        <div>
          {/* ── LIVE DRAGGABLE PREVIEW ───────────────────────────────────────── */}
          <div className="mb-3 relative">
            <EditableSlide
              key={previewKey}
              title={title} subtitle={subtitle} bullets={bullets}
              layout={layout} theme={themeObj} motionCls={motion.cls}
              positions={positions} showLogo={showLogo}
              imageUrl={imageUrl} imageWidth={imageWidth} imageShape={imageShape}
              moduleTitle={moduleTitle} sceneIndex={scene.orderIndex ?? 0} totalScenes={totalScenes}
              onPositionChange={handlePositionChange}
              onDragEnd={saveContent}
              textCues={textCues}
              avatarImageUrl={avatarImageUrl}
              onDeleteLayer={handleDeleteLayer}
              segments={parsed.segments}
            />
            {/* Overlay buttons */}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
              {scene.ttsAudioUrl && (
                <button onClick={toggleNarration} title={narrationPlaying ? 'Stop narration' : 'Play narration with synced captions'}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    narrationPlaying ? 'bg-red-500/80 hover:bg-red-500' : 'bg-black/60 hover:bg-black/80'}`}>
                  {narrationPlaying ? <Square className="w-3 h-3 text-white" /> : <Volume2 className="w-3.5 h-3.5 text-white" />}
                </button>
              )}
              <button onClick={() => setPreviewKey(k=>k+1)} title="Replay animations"
                className="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors">
                <Play className="w-3.5 h-3.5 text-white" />
              </button>
              <button onClick={() => { setPositions(DEFAULT_POSITIONS[layout]||DEFAULT_POSITIONS.bullets); saveContent() }}
                title="Reset element positions to layout defaults"
                className="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors">
                <Move className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            {saving && (
              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-[10px] text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
              </div>
            )}

            {/* Synced narration caption — words appear one at a time as the
                voiceover plays, instead of dumping the whole script at once. */}
            {narrationPlaying && scriptWords.length > 0 && (
              <div className="absolute left-1/2 bottom-[6%] -translate-x-1/2 max-w-[88%] pointer-events-none z-20">
                <p className="px-4 py-2 rounded-lg text-sm font-medium text-center leading-relaxed bg-black/65 text-white backdrop-blur-sm">
                  {scriptWords.slice(0, revealedWordCount).map((w, i) => (
                    <span key={i} className={i === revealedWordCount - 1 ? 'text-amber-300' : 'text-white'}>
                      {w}{' '}
                    </span>
                  ))}
                </p>
              </div>
            )}

            {scene.ttsAudioUrl && (
              <audio ref={narrationAudioRef} src={scene.ttsAudioUrl} preload="metadata" className="hidden" />
            )}
          </div>

          {/* Drag hint */}
          <p className="text-[10px] text-slate-600 text-center mb-5 flex items-center justify-center gap-1">
            <Move className="w-3 h-3" /> Hover any element on the slide and drag to reposition it
          </p>
        </div>

        {/* CONTROLS - Full width below preview */}
        <div className="space-y-4">

      {/* ── LOGO TOGGLE ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 p-3 rounded-xl bg-slate-900/40 border border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-5 flex-shrink-0">
            <GVSULogoSVG isDark={themeObj.isDark} />
          </div>
          <div>
            <p className="text-xs font-semibold text-white">GVSU Logo</p>
            <p className="text-[10px] text-slate-500">Drag on slide to reposition</p>
          </div>
        </div>
        <button
          onClick={() => { setShowLogo(v => !v); setTimeout(saveContent, 0) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            showLogo
              ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300'
              : 'bg-slate-800/60 border-white/[0.06] text-slate-500'
          }`}
        >
          {showLogo ? <><Eye className="w-3 h-3" />Visible</> : <><EyeOff className="w-3 h-3" />Hidden</>}
        </button>
      </div>

      {/* ── IMAGE / FIGURE ─────────────────────────────────────────────────── */}
      <div className="mb-4 rounded-xl bg-slate-900/40 border border-white/[0.06] overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setShowImgPanel(v => !v)}
          className="w-full flex items-center justify-between px-3 py-3 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-violet-400" />
            <p className="text-xs font-semibold text-white">Image / Figure</p>
            {imageUrl && <span className="text-[9px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">Added · drag to move</span>}
          </div>
          <span className="text-slate-500 text-xs">{showImgPanel ? '▲' : '▼'}</span>
        </button>

        {showImgPanel && (
          <div className="px-3 pb-3 space-y-3 border-t border-white/[0.04]">
            {/* Upload or URL */}
            <div className="pt-3 flex gap-2">
              <input
                type="text"
                value={imageUrl.startsWith('data:') ? '' : imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                onBlur={saveContent}
                placeholder="Paste image URL…"
                className="flex-1 bg-slate-800/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium border border-white/10 bg-slate-800/60 text-slate-300 hover:border-violet-500/40 hover:text-violet-300 transition-colors"
              >
                Upload
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </div>

            {/* Preview strip */}
            {imageUrl && (
              <div className="flex items-center gap-3">
                <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 bg-slate-800">
                  <img src={imageUrl} alt="" className="w-full h-full object-cover"
                    onError={e => { e.target.src = ''; e.target.style.opacity = '0.3' }} />
                </div>
                <div className="flex-1 space-y-2">
                  {/* Width slider */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500">Width on slide</span>
                      <span className="text-[10px] text-slate-400">{imageWidth}%</span>
                    </div>
                    <input type="range" min="15" max="70" value={imageWidth}
                      onChange={e => setImageWidth(Number(e.target.value))}
                      onMouseUp={saveContent}
                      className="w-full h-1 accent-violet-500 cursor-pointer" />
                  </div>
                  {/* Shape */}
                  <div className="flex gap-1.5">
                    {[['rectangle','Sharp'],['rounded','Rounded'],['circle','Circle']].map(([v,l]) => (
                      <button key={v} onClick={() => { setImageShape(v); saveContent() }}
                        className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
                          imageShape===v
                            ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                            : 'bg-slate-800/60 border-white/[0.06] text-slate-500 hover:border-white/20'
                        }`}>{l}</button>
                    ))}
                    <button onClick={() => { setImageUrl(''); saveContent() }}
                      className="ml-auto px-2 py-1 rounded-md text-[10px] text-slate-600 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── TEXT MOTION ───────────────────────────────────────────────────────
          Replaces the old static-background "Background Motion" zoom/pan
          picker. The background no longer animates — instead this controls
          how the narration-synced caption reveals, which is the attractive
          effect: text appearing in step with the voiceover, not all at once. */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-white mb-1.5">Text Motion</p>
     
        <div className="grid grid-cols-3 gap-1.5">
          {MOTION_STYLES.map(m => (
            <button key={m.id} 
              onClick={() => { 
                setMotion(m)
                saveContent()
                setPreviewKey(k=>k+1) 
              }}
              title={m.desc}
              className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs font-medium border transition-all ${
                motion.id===m.id
                  ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300 shadow-md shadow-indigo-500/20'
                  : 'bg-slate-800/60 border-white/[0.06] text-slate-400 hover:border-white/20 hover:text-white hover:bg-slate-800/80'
              }`}>
              <div className="text-lg">{m.icon}</div>
              <span className="text-[10px] leading-tight text-center">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.06] mb-5" />

      {/* ── CONTENT ────────────────────────────────────────────────────────── */}
      <div className="space-y-5">

        <div>
          <label className="block text-xs font-semibold text-white mb-1.5">
            Slide Title <span className="font-normal text-slate-500"></span>
          </label>
          <input value={title} onChange={e=>setTitle(e.target.value)} onBlur={saveContent}
            placeholder="Key concept students will learn"
            className="w-full bg-slate-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-white mb-1.5">
            Key Insight <span className="font-normal text-slate-500"></span>
          </label>
          <input value={subtitle} onChange={e=>setSubtitle(e.target.value)} onBlur={saveContent}
            placeholder="The main idea students should remember"
            className="w-full bg-slate-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors" />
        </div>

        {/* Bullets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-white">
              Content Points <span className="font-normal text-slate-500"></span>
            </label>
            <div className="flex items-center gap-1.5">
              {[
                { id:'shorten',  label:'Shorter', prompt:'Make each bullet more concise. Keep the full educational meaning — each bullet must remain a complete, meaningful idea of 10-18 words. Do NOT reduce to just 2-3 words.' },
                { id:'simplify', label:'Simpler',  prompt:'Rewrite each bullet using simpler vocabulary that a student can understand. Keep the same meaning and similar length. Avoid jargon.' },
                { id:'expand',   label:'Expand',   prompt:'Enrich each bullet with a concrete example or additional detail. Each bullet should be 15-25 words and help students understand better.' },
              ].map(a => (
                <button key={a.id} onClick={() => handleAiRewrite(a.id, a.prompt)} disabled={aiLoading}
                  className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg border transition-colors ${
                    aiLoading && aiAction===a.id
                      ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                      : 'bg-slate-800/60 border-white/10 text-slate-400 hover:border-indigo-500/30 hover:text-indigo-400'
                  }`}>
                  {aiLoading && aiAction===a.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>}
                  {a.label}
                </button>
              ))}
              <button onClick={() => { setBullets(originalBulletsRef.current); setTimeout(saveContent,0) }}
                disabled={aiLoading} title="Reset to original AI-generated content"
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg border border-white/10 bg-slate-800/60 text-slate-500 hover:text-amber-400 hover:border-amber-500/30 transition-colors">
                <RotateCw className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {bullets.map((b,i) => (
              <div key={i} className="flex items-center gap-2 group">
                <button onClick={() => setBullets(bs=>bs.map((x,idx)=>idx===i?{...x,level:x.level===1?2:1}:x))}
                  className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center flex-shrink-0 transition-colors ${
                    b.level===2?'bg-slate-700 text-slate-400':'bg-indigo-500/20 text-indigo-400'}`}>
                  {b.level===2?'◦':'•'}
                </button>
                <input value={b.text}
                  onChange={e=>setBullets(bs=>bs.map((x,idx)=>idx===i?{...x,text:e.target.value}:x))}
                  onBlur={saveContent}
                  placeholder={b.level===1?'Key fact or concept':'Supporting detail or example'}
                  className={`flex-1 bg-slate-800/40 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500/40 transition-colors ${b.level===2?'text-slate-400 ml-3':'text-white'}`}
                />
                <button onClick={()=>{ setBullets(bs=>bs.filter((_,idx)=>idx!==i)); setTimeout(saveContent,0) }}
                  className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2">
            <button onClick={()=>setBullets(b=>[...b,{text:'',level:1}])}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-400 transition-colors">
              <Plus className="w-3 h-3"/>Add point
            </button>
            <button onClick={()=>setBullets(b=>[...b,{text:'',level:2}])}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors">
              <Plus className="w-3 h-3"/>Add sub-point
            </button>
          </div>
          {(layout==='chart'||layout==='key-stats') && (
            <p className="mt-2 text-[10px] text-amber-400/70 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
              💡 {layout==='chart'
                ? 'Include a number in each point (e.g. "72% pass rate") — bar heights auto-derive from these values.'
                : 'Start each point with the key stat (e.g. "3× faster") — shown large on the card.'}
            </p>
          )}
          {layout==='icon-grid' && (
            <p className="mt-2 text-[10px] text-sky-400/70 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-1.5">
              💡 Each point becomes an icon card. Best with 3-6 short, distinct concepts.
            </p>
          )}
        </div>

        {/* Layout + Theme - Inline horizontal layout */}
        <div className="space-y-2 pt-1">
          <div>
            <p className="text-xs font-semibold text-white mb-1.5">Layout</p>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {LAYOUTS.map(l => (
                <button key={l.id} onClick={()=>handleLayoutChange(l.id)}
                  title={l.label}
                  className={`flex-shrink-0 w-8 h-8 rounded-lg border transition-all flex items-center justify-center ${
                    layout===l.id
                      ?'border-indigo-500 bg-indigo-500/20 text-white shadow-lg shadow-indigo-500/20'
                      :'border-white/[0.10] bg-slate-800/50 text-slate-400 hover:border-white/25 hover:bg-slate-800/80 hover:text-slate-200'
                  }`}
                  style={{
                    transform: layout===l.id ? 'translateZ(4px) perspective(600px)' : 'none',
                    textShadow: layout===l.id ? '0 2px 4px rgba(0,0,0,0.3)' : 'none',
                  }}>
                  <div className="text-sm font-bold">{l.icon}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-white mb-1.5">Theme</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {THEMES.map(th => (
                <button key={th.id} onClick={()=>{ setTheme(th.id); saveContent() }}
                  title={th.label}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all ${
                    theme===th.id?'border-indigo-400 bg-indigo-500/15 shadow-lg shadow-indigo-500/15':'border-white/[0.10] bg-slate-800/50 hover:border-white/25 hover:bg-slate-800/80'}`}>
                  <div className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: th.accent }}/>
                  <span className={`text-xs font-medium whitespace-nowrap ${theme===th.id?'text-white':'text-slate-300'}`}>{th.label}</span>
                  {theme===th.id && <span className="ml-0.5 text-white">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Voice script — view, edit, and regenerate audio without leaving the Visual Designer */}
        <div>
          <div className="flex items-center gap-3">
            <button onClick={()=>setShowVoice(v=>!v)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <Mic className="w-3 h-3" /> {showVoice?'Hide':'Show'} voice script
            </button>
            <button onClick={()=>{ setShowVoice(true); setShowScriptSettings(v=>!v) }}
              title="Edit script & regenerate voice"
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-400 transition-colors">
              <Settings className="w-3 h-3" /> Settings
            </button>
          </div>
          {showVoice && (
            <div className="mt-2 p-3 rounded-xl bg-slate-800/30 border border-white/[0.04]">
              <p className="text-[10px] text-blue-400/80 uppercase tracking-widest mb-1 font-semibold">
                🎙 Voice Script — what the presenter SAYS
              </p>
              {showScriptSettings ? (
                <div>
                  <textarea
                    value={scriptText}
                    onChange={e => setScriptText(e.target.value)}
                    onBlur={handleSaveScript}
                    rows={5}
                    placeholder="What the presenter says during this scene…"
                    className="w-full bg-slate-800/60 border border-white/10 rounded-lg p-2.5 text-xs text-white leading-relaxed resize-none focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={handleRegenerateVoice} disabled={regeneratingVoice || savingScript}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        regeneratingVoice
                          ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 border-transparent text-white'
                      }`}>
                      {regeneratingVoice
                        ? <><Loader2 className="w-3 h-3 animate-spin" />Regenerating…</>
                        : <><RotateCcw className="w-3 h-3" />Regenerate Voice</>}
                    </button>
                    {savingScript && <span className="text-[10px] text-slate-500">Saving…</span>}
                    {voiceRegenDone && !regeneratingVoice && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle className="w-3 h-3" />Voice updated</span>
                    )}
                    {voiceRegenError && (
                      <span className="flex items-center gap-1 text-[10px] text-red-400"><AlertCircle className="w-3 h-3" />{voiceRegenError}</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 leading-relaxed">{scene.scriptContent || 'No script yet — click Settings to add one.'}</p>
              )}
            </div>
          )}
        </div>

        {/* Segments mini-timeline (#32) — only scenes built from SceneSegment
            rows show this (welcome scene's hook/content/.../recap, quiz
            scene's one segment per question). Segment-less scenes keep using
            the flat voice-script box above unchanged. */}
        {segments.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
              <Layers className="w-3 h-3" /> Segments ({segments.length})
            </p>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-2">
              {segments.map((seg, i) => (
                <button key={seg.id} onClick={() => toggleSegment(seg.id)}
                  title={seg.segmentType}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                    activeSegmentId === seg.id
                      ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                      : 'border-white/[0.06] bg-slate-900/40 text-slate-400 hover:border-white/15'
                  }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${seg.ttsAudioUrl ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  {i + 1}. {seg.segmentType}
                </button>
              ))}
            </div>
            {segments.filter(s => s.id === activeSegmentId).map(seg => (
              <div key={seg.id} className="p-3 rounded-xl bg-slate-800/30 border border-white/[0.04]">
              
                {seg.slideTitle && (
                  <p className="text-[10px] text-blue-400/80 uppercase tracking-widest mb-1.5 font-semibold">
                    {seg.slideTitle}
                  </p>
                )}
                <textarea
                  value={segmentDrafts[seg.id] ?? seg.text}
                  onChange={e => setSegmentDrafts(prev => ({ ...prev, [seg.id]: e.target.value }))}
                  onBlur={() => handleSaveSegmentText(seg.id)}
                  rows={4}
                  placeholder="What the presenter says during this segment…"
                  className="w-full bg-slate-800/60 border border-white/10 rounded-lg p-2.5 text-xs text-white leading-relaxed resize-none focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => handleRegenerateSegmentVoice(seg.id)} disabled={!!segmentBusy[seg.id]}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      segmentBusy[seg.id]
                        ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 border-transparent text-white'
                    }`}>
                    {segmentBusy[seg.id] === 'voicing'
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Regenerating…</>
                      : segmentBusy[seg.id] === 'saving'
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Saving…</>
                      : <><RotateCcw className="w-3 h-3" />Regenerate Voice</>}
                  </button>
                  {!segmentBusy[seg.id] && seg.ttsAudioUrl && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle className="w-3 h-3" />Has voice</span>
                  )}
                  {segmentError[seg.id] && (
                    <span className="flex items-center gap-1 text-[10px] text-red-400"><AlertCircle className="w-3 h-3" />{segmentError[seg.id]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Generate */}
        <div className="pt-1">
          <Button onClick={handleGenerate} disabled={isGenerating} className="w-full" size="lg">
            {isGenerating
              ? <><Loader2 className="w-4 h-4 animate-spin"/>Generating slide image…</>
              : scene.visualAssetUrl
              ? <><RotateCcw className="w-4 h-4"/>Regenerate Slide Image</>
              : <><Sparkles className="w-4 h-4"/>Generate Slide Image</>}
          </Button>
        </div>
      </div>
        </div>
      </div>
    </div>
  )
}

// ─── Editable slide canvas (drag-to-reposition) ───────────────────────────────

function EditableSlide({ title, subtitle, bullets, layout, theme, motionCls, positions, showLogo, imageUrl, imageWidth, imageShape, moduleTitle, sceneIndex = 0, totalScenes = 1, onPositionChange, onDragEnd, textCues = [], avatarImageUrl = null, onDeleteLayer, segments = [] }) {
  const containerRef  = useRef(null)
  const [activeDrag, setActiveDrag] = useState(null)
  const [activeResize, setActiveResize] = useState(null)

  const startDrag = (e, key) => {
    e.preventDefault()
    e.stopPropagation()
    if (!positions[key] || !containerRef.current) return  // safety guard
    const rect = containerRef.current.getBoundingClientRect()
    const drag = {
      key,
      startMX: e.clientX, startMY: e.clientY,
      startPX: positions[key].x ?? 0, startPY: positions[key].y ?? 0,
      rectW: rect.width || 1, rectH: rect.height || 1,
    }
    setActiveDrag(key)

    const onMove = (ev) => {
      const dx = ((ev.clientX - drag.startMX) / drag.rectW) * 100
      const dy = ((ev.clientY - drag.startMY) / drag.rectH) * 100
      onPositionChange(key, {
        x: Math.max(0, Math.min(88, drag.startPX + dx)),
        y: Math.max(0, Math.min(85, drag.startPY + dy)),
      })
    }
    const onUp = () => {
      setActiveDrag(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      onDragEnd?.()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Resize a text layer in place — drag the corner handle to scale the text
  // up/down without moving it (separate from startDrag, which moves it).
  const startResize = (e, key) => {
    e.preventDefault()
    e.stopPropagation()
    if (!positions[key] || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const startScale = positions[key].scale ?? 1
    const startMX = e.clientX, startMY = e.clientY
    setActiveResize(key)

    const onMove = (ev) => {
      const dx = (ev.clientX - startMX) / (rect.width || 1)
      const dy = (ev.clientY - startMY) / (rect.height || 1)
      const delta = (dx + dy) / 2 * 2.2 // diagonal drag distance → scale delta
      const next = Math.max(0.5, Math.min(2.2, startScale + delta))
      onPositionChange(key, { scale: next })
    }
    const onUp = () => {
      setActiveResize(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      onDragEnd?.()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl select-none"
      style={{ aspectRatio:'16/9', background:`linear-gradient(135deg,${theme.bg} 0%,${theme.bgGrad} 100%)` }}
    >
      {/* Geometric background (animated) */}
      <div className={`absolute inset-0 ${motionCls}`} style={{ willChange:'transform', transformOrigin:'center center' }}>
        <SlideBackground theme={theme} />
      </div>

      {/* ── Fixed header chrome — mirrors the rendered-video SVG exactly:        ──
          module tag pill (replaces old literal "Scene N" text) + a continuous
          progress bar instead of discrete scene numbering. Not draggable —
          this is auto-positioned chrome in the real render, not a content layer. */}
      <SlideHeaderChrome moduleTitle={moduleTitle} layout={layout} theme={theme}
        sceneIndex={sceneIndex} totalScenes={totalScenes} />

      {/* ── Timed text-cue overlay — key terms from the storyboard data,        ──
          each one fading in/out in turn while it's "on screen", mirroring the
          same timed reveal the render pipeline now bakes into the video. */}
      {textCues.length > 0 && (
        <div className="absolute left-1/2 bottom-[4%] -translate-x-1/2 flex flex-col items-center pointer-events-none z-10">
          {(() => {
            let t = 0.6
            return textCues.slice(0, 5).map((cue, i) => {
              const dur = Math.max(0.8, cue.duration_seconds || 1.5)
              const delay = t
              t += dur + 0.3
              return (
                <span key={i} className="pa-cue absolute px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap"
                  style={{
                    animationDelay: `${delay}s`, animationDuration: `${dur}s`,
                    background: theme.isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)',
                    color: theme.accent, border: `1px solid ${theme.accent}55`,
                  }}>
                  {cue.text}
                </span>
              )
            })
          })()}
        </div>
      )}

      {/* ── Draggable: LOGO ─────────────────────────────────────── */}
      {showLogo && (
        <DraggableLayer layerKey="logo" pos={positions.logo} width={LAYER_WIDTHS.logo}
          isActive={activeDrag==='logo'} label="GVSU Logo" onMouseDown={startDrag}
          onDelete={onDeleteLayer}>
          <div className="pa-logo">
            <GVSULogoSVG isDark={theme.isDark} />
          </div>
        </DraggableLayer>
      )}

      {/* ── Draggable: IMAGE / FIGURE ────────────────────────────── */}
      {imageUrl && positions.image && (
        <DraggableLayer layerKey="image" pos={positions.image} width={imageWidth}
          isActive={activeDrag==='image'} label="Image" onMouseDown={startDrag}
          onDelete={onDeleteLayer}>
          <SlideImage url={imageUrl} shape={imageShape} />
        </DraggableLayer>
      )}

      {/* ── Draggable + Resizable: TITLE ────────────────────────── */}
      <DraggableLayer layerKey="title" pos={positions.title} width={LAYER_WIDTHS.title}
        isActive={activeDrag==='title'} isResizing={activeResize==='title'} label="Title"
        onMouseDown={startDrag} onResizeMouseDown={startResize} onDelete={onDeleteLayer}>
        <TitleLayer title={title} layout={layout} theme={theme} />
      </DraggableLayer>

      {/* ── Draggable + Resizable: SUBTITLE ─────────────────────── */}
      {subtitle && (
        <DraggableLayer layerKey="subtitle" pos={positions.subtitle} width={LAYER_WIDTHS.subtitle}
          isActive={activeDrag==='subtitle'} isResizing={activeResize==='subtitle'} label="Key Insight"
          onMouseDown={startDrag} onResizeMouseDown={startResize} onDelete={onDeleteLayer}>
          <SubtitleLayer subtitle={subtitle} layout={layout} theme={theme} />
        </DraggableLayer>
      )}

      {/* ── Draggable + Resizable: CONTENT BLOCK ─────────────────── */}
      <DraggableLayer layerKey="content" pos={positions.content} width={LAYER_WIDTHS.content}
        isActive={activeDrag==='content'} isResizing={activeResize==='content'} label="Content"
        onMouseDown={startDrag} onResizeMouseDown={startResize} onDelete={onDeleteLayer}>
        <ContentLayer layout={layout} bullets={bullets} subtitle={subtitle} theme={theme} segments={segments} />
      </DraggableLayer>

      {/* Presenter avatar — shows the actually-selected avatar's thumbnail
          (set in Avatar Studio / Casting Settings) in the bottom-right corner,
          so this preview matches who will really appear in the rendered video.
          Falls back to a generic placeholder until an avatar is chosen. */}
      <div
        className="absolute pointer-events-none overflow-hidden"
        style={{
          bottom: '2%', right: '1.5%',
          width: '22%', height: '38%',
          border: avatarImageUrl ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px dashed rgba(255,255,255,0.25)',
          borderRadius: '10px',
          background: avatarImageUrl ? '#0f172a' : 'rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '4%',
          zIndex: 5,
        }}
      >
        {avatarImageUrl ? (
          <img src={avatarImageUrl} alt="Presenter avatar" className="w-full h-full object-cover" />
        ) : (
          <>
            <svg viewBox="0 0 24 24" style={{ width:'18%', opacity:0.35, fill:'none', stroke:'white', strokeWidth:1.5 }}>
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            <span style={{ color:'rgba(255,255,255,0.35)', fontSize:'clamp(5px,0.8vw,9px)', fontWeight:600, textAlign:'center', lineHeight:1.3 }}>
              PRESENTER<br/>AVATAR
            </span>
          </>
        )}
      </div>

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ height:'0.4%', background:`linear-gradient(to right,${theme.accent},${theme.accent}00 70%)` }} />
    </div>
  )
}

// ─── Fixed header chrome (module pill + progress bar) ────────────────────────
// Mirrors generateSceneAsset.ts's buildSlide() header exactly so the editor
// preview matches the actual rendered video instead of just approximating it.

function SlideHeaderChrome({ moduleTitle, layout, theme, sceneIndex, totalScenes }) {
  const isHero = layout === 'title-hero'
  const pct = Math.min(1, (sceneIndex + 1) / Math.max(totalScenes, 1))
  const label = (moduleTitle || '').toUpperCase().slice(0, 40)

  const progressBar = (
    <div className="absolute pointer-events-none" style={{ top: '1.5%', right: '4%', width: '16%' }}>
      <div style={{ height: 4, borderRadius: 2, background: theme.accent, opacity: 0.22 }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, height: 4, borderRadius: 2,
        width: `${pct * 100}%`, background: theme.accent,
        transition: 'width 0.3s ease',
      }} />
    </div>
  )

  if (!label) return progressBar

  return (
    <>
      <div
        className="absolute pointer-events-none flex items-center justify-center"
        style={{
          top: '1.5%', left: isHero ? '50%' : '5%',
          transform: isHero ? 'translateX(-50%)' : 'none',
          padding: '0.6% 1.6%',
          borderRadius: 999,
          background: isHero ? 'transparent' : `${theme.accent}1A`,
          border: isHero ? 'none' : `1px solid ${theme.accent}55`,
        }}
      >
        <span style={{
          color: theme.accent, fontSize: FS(7, 0.95, 13), fontWeight: 700,
          letterSpacing: '0.12em', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>
      {progressBar}
    </>
  )
}

// ─── Draggable layer wrapper ──────────────────────────────────────────────────

function DraggableLayer({ layerKey, pos, width, isActive, isResizing, label, onMouseDown, onResizeMouseDown, onDelete, children }) {
  const scale = pos.scale ?? 1
  const showHandle = !!onResizeMouseDown
  return (
    <div
      className="pa-drag-layer absolute"
      onMouseDown={(e) => onMouseDown(e, layerKey)}
      style={{
        left: `${pos.x}%`,
        top:  `${pos.y}%`,
        width: `${width}%`,
        cursor: isActive ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex: (isActive || isResizing) ? 200 : 10,
      }}
    >
      {/* Tooltip label */}
      <div className="pa-drag-label absolute -top-6 left-0 hidden items-center gap-1 bg-blue-500 text-white px-2 py-0.5 rounded text-[8px] font-bold whitespace-nowrap z-50 pointer-events-none shadow-lg">
        <Move style={{ width:8, height:8 }} /> {label} · drag corner to resize
      </div>
      {/* Selection ring */}
      <div className={`pa-drag-ring absolute inset-0 pointer-events-none rounded transition-all ${
        (isActive || isResizing) ? 'outline outline-2 outline-offset-[3px] outline-blue-400 bg-blue-400/5' : ''
      }`} />
      {/* Scaled content — transform-origin top-left so position (x,y) stays the drag anchor */}
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
      {/* Delete button — top-right corner, removes this layer from the slide */}
      {onDelete && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(layerKey) }}
          title={`Remove ${label}`}
          className="pa-drag-label absolute hidden items-center justify-center rounded-full bg-red-500 hover:bg-red-400 shadow-lg"
          style={{
            width: 14, height: 14,
            right: -7, top: -7,
            cursor: 'pointer',
            display: isActive ? 'flex' : undefined,
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 8, height: 8 }} fill="none" stroke="white" strokeWidth="3">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
      {/* Resize handle — bottom-right corner, drag to scale text in place */}
      {showHandle && (
        <div
          onMouseDown={(e) => onResizeMouseDown(e, layerKey)}
          title="Drag to resize text"
          className="pa-drag-label absolute hidden items-center justify-center rounded-full bg-blue-500 hover:bg-blue-400 shadow-lg"
          style={{
            width: 14, height: 14,
            right: -7, bottom: -7,
            cursor: 'nwse-resize',
            display: isActive || isResizing ? 'flex' : undefined,
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 8, height: 8 }} fill="none" stroke="white" strokeWidth="3">
            <path d="M21 15 15 21M21 8 8 21" />
          </svg>
        </div>
      )}
    </div>
  )
}

// ─── Geometric background SVG ─────────────────────────────────────────────────

function SlideBackground({ theme }) {
  // Shapes are spread across the *whole* frame (not just corners) so zoom/pan/
  // ken-burns motion is clearly visible no matter which part of the slide
  // your eye is on — sparse corner-only decoration made every motion style
  // look almost identical since most of the frame never changed.
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1280 720"
      preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <circle cx="1200" cy="-60" r="380" fill={theme.accent} fillOpacity="0.07" />
      <circle cx="-60"  cy="780" r="300" fill={theme.accent} fillOpacity="0.05" />
      <circle cx="900"  cy="650" r="90"  fill={theme.accent} fillOpacity="0.06" />
      <circle cx="200"  cy="120" r="160" fill={theme.accent} fillOpacity="0.05" />
      <circle cx="640"  cy="380" r="240" fill={theme.accent} fillOpacity="0.035" />
      <line x1="0" y1="680" x2="1280" y2="680" stroke={theme.accent} strokeOpacity="0.10" strokeWidth="1" />
      <line x1="0" y1="40"  x2="1280" y2="40"  stroke={theme.accent} strokeOpacity="0.07" strokeWidth="1" />
      <rect x="0" y="0" width="4"  height="200" fill={theme.accent} fillOpacity="0.70" rx="2" />
      <rect x="0" y="0" width="80" height="2"   fill={theme.accent} fillOpacity="0.35" rx="1" />
      {[0,1,2,3].map(r=>[0,1,2,3].map(c=>(
        <circle key={`tr-${r}-${c}`} cx={980+c*28} cy={50+r*28} r="2" fill={theme.accent} fillOpacity="0.18" />
      )))}
      {[0,1,2].map(r=>[0,1,2,3,4].map(c=>(
        <circle key={`bl-${r}-${c}`} cx={60+c*26} cy={600+r*26} r="2" fill={theme.accent} fillOpacity="0.14" />
      )))}
    </svg>
  )
}

// ─── GVSU Logo ────────────────────────────────────────────────────────────────
// Uses /gvsu-logo.png (the actual circular GV emblem — blue mark on black bg).
//
// Dark slides  → grayscale + max-brightness makes the mark white,
//                mix-blend-mode:screen removes the black background.
// Light slide  → white mark on a GVSU-blue pill (filter:invert removes
//                the black bg inside the blue container).

const GVSU_BLUE = '#0032A0'

function GVSULogoSVG({ isDark = true }) {
  if (isDark) {
    return (
      <img
        src="/gvsu-logo.png"
        alt="GVSU"
        draggable={false}
        style={{
          width: '100%', height: 'auto', display: 'block',
          filter: 'grayscale(1) brightness(20)',
          mixBlendMode: 'screen',
        }}
      />
    )
  }
  // Light theme — white mark inside a GVSU-blue rounded badge
  return (
    <div style={{
      background: GVSU_BLUE,
      borderRadius: '16%',
      padding: '10%',
      lineHeight: 0,
      display: 'block',
    }}>
      <img
        src="/gvsu-logo.png"
        alt="GVSU"
        draggable={false}
        style={{
          width: '100%', height: 'auto', display: 'block',
          filter: 'brightness(0) invert(1)',
        }}
      />
    </div>
  )
}

// ─── Slide image / figure ─────────────────────────────────────────────────────

function SlideImage({ url, shape }) {
  const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? '10%' : '4px'
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="pa-icon"
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
        borderRadius: radius,
        objectFit: 'cover',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
      onError={e => { e.currentTarget.style.opacity = '0.25' }}
    />
  )
}

// ─── Title / subtitle as separate layers ─────────────────────────────────────

function TitleLayer({ title, layout, theme }) {
  const isHero  = layout === 'title-hero'
  const isQuote = layout === 'quote'
  return (
    <h2
      className="pa-title font-bold"
      style={{
        color:      theme.text,
        fontSize:   isHero  ? FS(16,3.2,50) : isQuote ? FS(7,1.0,13) : FS(12,2.4,34),
        fontWeight: isHero  ? 900            : isQuote ? 700           : 700,
        lineHeight: 1.2,
        letterSpacing: isHero ? '-0.01em' : isQuote ? '0.1em' : '-0.005em',
        textTransform: isQuote ? 'uppercase' : 'none',
        textAlign:  (isHero || layout==='quote') ? 'center' : 'left',
        textShadow: theme.isDark ? '0 2px 12px rgba(0,0,0,0.5)' : 'none',
        opacity:    isQuote ? 0.75 : 1,
      }}
    >
      {title}
    </h2>
  )
}

function SubtitleLayer({ subtitle, layout, theme }) {
  const isHero = layout === 'title-hero'
  return (
    <p
      className="pa-sub"
      style={{
        color:      theme.accent,
        fontSize:   isHero ? FS(9,1.4,20) : FS(8,1.15,16),
        fontWeight: 600,
        lineHeight: 1.45,
        textAlign:  (isHero || layout==='quote') ? 'center' : 'left',
        borderLeft: (!isHero && layout!=='quote' && layout!=='summary') ? `2px solid ${theme.accent}` : 'none',
        paddingLeft:(!isHero && layout!=='quote' && layout!=='summary') ? '3%' : 0,
      }}
    >
      {subtitle}
    </p>
  )
}

// ─── Content layer (layout-specific, no title/subtitle) ──────────────────────

function ContentLayer({ layout, bullets, subtitle, theme, segments }) {
  switch (layout) {
    case 'title-hero':  return <TitleHeroContent   theme={theme} />
    case 'bullets':     return <BulletsContent     bullets={bullets} theme={theme} />
    case 'two-column':  return <TwoColumnContent   bullets={bullets} theme={theme} />
    case 'icon-grid':   return <IconGridContent    bullets={bullets} theme={theme} />
    case 'key-stats':   return <KeyStatsContent    bullets={bullets} theme={theme} />
    case 'chart':       return <ChartContent       bullets={bullets} theme={theme} />
    case 'definition':  return <DefinitionContent  bullets={bullets} theme={theme} />
    case 'quote':       return <QuoteContent       bullets={bullets} theme={theme} />
    case 'summary':     return <SummaryContent     bullets={bullets} theme={theme} />
    case 'roadmap':     return <RoadmapContent     segments={segments} theme={theme} />
    default:            return <BulletsContent     bullets={bullets} theme={theme} />
  }
}

// ─── Layout content renderers ─────────────────────────────────────────────────

function TitleHeroContent({ theme }) {
  return (
    <div className="pa-icon flex items-center gap-[2%]">
      <div style={{ width:'6%', height:'2px', borderRadius:1, background:theme.accent }} />
      <div style={{ width:'4%', height:'2px', borderRadius:1, background:theme.accent, opacity:0.5 }} />
    </div>
  )
}

function BulletsContent({ bullets, theme }) {
  const validBullets = bullets.filter(b => b.text)
  const count = validBullets.length || 1
  // Spread bullets to fill available height — more gap when fewer bullets
  const gapPct = count <= 3 ? '3.5%' : count <= 4 ? '2.5%' : '1.6%'
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:gapPct }}>
      {validBullets.slice(0,6).map((b,i) => (
        <div key={i} className={`pa-b${i} flex items-start`} style={{ gap:'2%', marginLeft:b.level===2?'5%':0 }}>
          <div style={{
            flexShrink:0, marginTop:'0.4%',
            width:  b.level===1 ? FS(10,1.5,18) : FS(8,1.1,13),
            height: b.level===1 ? FS(10,1.5,18) : FS(8,1.1,13),
            borderRadius: b.level===1 ? '3px' : '50%',
            background: b.level===1 ? theme.accent : theme.accent+'50',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            {b.level===1 && <span style={{ color:'#fff', fontSize:FS(6,0.8,10), fontWeight:700 }}>▸</span>}
          </div>
          <p style={{
            color:      b.level===2 ? theme.textSub : theme.text,
            fontSize:   b.level===2 ? FS(8,1.15,15) : FS(9,1.35,18),
            fontWeight: b.level===1 ? 600 : 400,
            lineHeight: 1.5,
          }}>
            {b.text}
          </p>
        </div>
      ))}
    </div>
  )
}

function TwoColumnContent({ bullets, theme }) {
  const half = Math.ceil(bullets.length / 2)
  const left = bullets.slice(0, half)
  const right = bullets.slice(half)
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4%' }}>
      <div style={{ borderRadius:6, padding:'4% 3%', background:`${theme.accent}14`, border:`1px solid ${theme.accent}30` }}>
        {left.map((b,i) => (
          <div key={i} className={`pa-b${i} flex items-start mb-[2.5%]`} style={{ gap:'3%' }}>
            <span style={{ color:theme.accent, fontSize:FS(6,0.9,12), flexShrink:0, marginTop:'0.4%', fontWeight:700 }}>▸</span>
            <p style={{ color:theme.text, fontSize:FS(7,1.05,14), lineHeight:1.4, fontWeight:500 }}>{b.text}</p>
          </div>
        ))}
      </div>
      <div style={{ borderRadius:6, padding:'4% 3%', background:`${theme.accent}08`, border:`1px solid ${theme.accent}20` }}>
        {right.map((b,i) => (
          <div key={i} className={`pa-b${half+i} flex items-start mb-[2.5%]`} style={{ gap:'3%' }}>
            <span style={{ color:theme.textSub, fontSize:FS(6,0.9,12), flexShrink:0, marginTop:'0.4%' }}>◦</span>
            <p style={{ color:theme.textSub, fontSize:FS(7,1.05,14), lineHeight:1.4 }}>{b.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function IconGridContent({ bullets, theme }) {
  const items = bullets.slice(0,6)
  const cols  = items.length <= 3 ? items.length : Math.min(3, Math.ceil(items.length/2))
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap:'2%' }}>
      {items.map((b,i) => {
        const Icon = pickIconAt(b.text, i)
        return (
          <div key={i} className={`pa-card${Math.min(i,4)}`} style={{
            borderRadius:6, padding:'4% 3%',
            background: `${theme.accent}${i%2===0?'14':'0C'}`,
            border: `1px solid ${theme.accent}${i%2===0?'35':'20'}`,
            display:'flex', flexDirection:'column', alignItems:'flex-start', gap:'5%',
          }}>
            <div style={{ color:theme.accent, opacity:0.85 }}>
              <Icon style={{ width:FS(12,1.8,24), height:'auto' }} />
            </div>
            <p style={{ color:theme.text, fontSize:FS(6,0.95,13), lineHeight:1.4, fontWeight:500 }}>
              {b.text.length>50 ? b.text.slice(0,50)+'…' : b.text}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function KeyStatsContent({ bullets, theme }) {
  const stats = extractStats(bullets)
  return (
    <div style={{ display:'flex', gap:'3%', alignItems:'stretch' }}>
      {stats.map((s,i) => {
        const Icon = pickIconAt(s.label, i)
        return (
          <div key={i} className={`pa-card${i}`} style={{
            flex:1, borderRadius:8, padding:'4% 3%',
            background: i===0 ? `linear-gradient(135deg,${theme.accent}25,${theme.accent}10)` : `${theme.accent}0D`,
            border: `1px solid ${theme.accent}${i===0?'50':'25'}`, textAlign:'center',
          }}>
            {/* Show real number if it exists, otherwise a topic icon */}
            {s.hasNumber ? (
              <p style={{ color:theme.accent, fontSize:FS(18,3.5,52), fontWeight:800, lineHeight:1, letterSpacing:'-0.02em', marginBottom:'4%' }}>
                {s.stat}
              </p>
            ) : (
              <div style={{ color:theme.accent, display:'flex', justifyContent:'center', marginBottom:'4%' }}>
                <Icon style={{ width:FS(14,2.2,30), height:'auto' }} />
              </div>
            )}
            <p style={{ color:i===0?theme.text:theme.textSub, fontSize:FS(6,0.9,12), lineHeight:1.4, fontWeight:i===0?500:400 }}>
              {s.label.slice(0,45)}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ChartContent({ bullets, theme }) {
  const data   = extractChartData(bullets)
  if (!data.length) return null
  const maxVal = Math.max(...data.map(d=>d.value), 1)
  const chartW = 500, chartH = 180
  const barW   = Math.min(60,(chartW-60)/data.length-10)
  const gap    = (chartW-40-data.length*barW)/(data.length+1)
  return (
    <svg viewBox={`0 0 ${chartW} ${chartH+44}`} style={{ width:'100%', height:'auto', overflow:'visible' }}>
      {[0.25,0.5,0.75,1].map(f=>(
        <g key={f}>
          <line x1="30" y1={chartH-f*chartH*0.85} x2={chartW-10} y2={chartH-f*chartH*0.85}
            stroke={theme.accent} strokeOpacity="0.12" strokeWidth="1" strokeDasharray="4 4" />
          <text x="24" y={chartH-f*chartH*0.85+4} textAnchor="end" fill={theme.textSub} style={{ fontSize:'9px', fontFamily:'sans-serif' }}>
            {Math.round(f*maxVal)}
          </text>
        </g>
      ))}
      <line x1="30" y1={chartH} x2={chartW-10} y2={chartH} stroke={theme.accent} strokeOpacity="0.25" strokeWidth="1.5"/>
      {data.map((d,i)=>{
        const barH = Math.max((d.value/maxVal)*chartH*0.85,4)
        const x    = 40+gap*(i+1)+i*barW
        const isTop = i===data.reduce((mi,dd,ii)=>dd.value>data[mi].value?ii:mi,0)
        return (
          <g key={i}>
            <rect x={x+2} y={chartH-barH+2} width={barW} height={barH} fill="rgba(0,0,0,0.15)" rx="3"/>
            <rect x={x} y={chartH-barH} width={barW} height={barH}
              fill={isTop?theme.accent:theme.accent+'aa'} rx="3"
              className="pa-bar" style={{ animationDelay:`${0.3+i*0.1}s` }}/>
            {d.valueLabel && (
              <text x={x+barW/2} y={chartH-barH-5} textAnchor="middle" fill={theme.accent}
                style={{ fontSize:'9px', fontWeight:700, fontFamily:'sans-serif' }}>{d.valueLabel}</text>
            )}
            <foreignObject x={x-4} y={chartH+6} width={barW+8} height={34}>
              <div xmlns="http://www.w3.org/1999/xhtml"
                style={{ fontSize:'8px', textAlign:'center', color:theme.textSub, lineHeight:1.3, wordBreak:'break-word', fontFamily:'sans-serif' }}>
                {d.label}
              </div>
            </foreignObject>
          </g>
        )
      })}
    </svg>
  )
}

function DefinitionContent({ bullets, theme }) {
  // bullets[0] = definition, rest = examples
  const definition = bullets[0]?.text || ''
  const examples   = bullets.slice(1)
  return (
    <div>
      {definition && (
        <div className="pa-b0 mb-[2%]" style={{
          borderLeft:`3px solid ${theme.accent}`, paddingLeft:'3%',
          paddingTop:'1%', paddingBottom:'1%',
          background:`${theme.accent}10`, borderRadius:'0 6px 6px 0',
        }}>
          <p style={{ color:theme.text, fontSize:FS(8,1.2,17), lineHeight:1.55, fontStyle:'italic' }}>
            {definition}
          </p>
        </div>
      )}
      {examples.length>0 && (
        <>
          <p style={{ color:theme.accent, fontSize:FS(6,0.85,11), fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'1.5%', marginTop:'2%' }}>
            EXAMPLES
          </p>
          {examples.slice(0,3).map((b,i)=>(
            <div key={i} className={`pa-b${i+1} flex items-start`} style={{ gap:'2%', marginBottom:'1%' }}>
              <span style={{ color:theme.accent, fontSize:FS(6,0.9,12), flexShrink:0, marginTop:'0.3%' }}>→</span>
              <p style={{ color:theme.textSub, fontSize:FS(7,1.05,14), lineHeight:1.4 }}>{b.text}</p>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function QuoteContent({ bullets, theme }) {
  const quoteText = bullets[0]?.text || ''
  return (
    <div style={{ textAlign:'center' }}>
      <div className="pa-icon" style={{ color:theme.accent, fontSize:FS(30,5.5,80), lineHeight:0.7, opacity:0.45, marginBottom:'3%', fontFamily:'Georgia,serif' }}>
        "
      </div>
      <p className="pa-title" style={{
        color:theme.text, fontSize:FS(11,2.0,28), lineHeight:1.55,
        fontStyle:'italic', fontWeight:600,
        textShadow: theme.isDark?'0 1px 6px rgba(0,0,0,0.3)':'none',
      }}>
        {quoteText}
      </p>
    </div>
  )
}

function SummaryContent({ bullets, theme }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.8%' }}>
      {bullets.slice(0,5).map((b,i)=>(
        <div key={i} className={`pa-b${i} flex items-center`} style={{ gap:'2.5%' }}>
          <div style={{
            flexShrink:0,
            width:FS(12,1.6,22), height:FS(12,1.6,22),
            borderRadius:'50%', background:`${theme.accent}25`,
            border:`1.5px solid ${theme.accent}`,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <span style={{ color:theme.accent, fontSize:FS(6,0.85,11), fontWeight:800 }}>✓</span>
          </div>
          <p style={{ color:theme.text, fontSize:FS(8,1.2,16), fontWeight:500, lineHeight:1.4 }}>
            {b.text}
          </p>
        </div>
      ))}
    </div>
  )
}

function RoadmapContent({ segments, theme }) {
  if (!segments || segments.length === 0) {
    return <div style={{ color: theme.muted, textAlign: 'center', padding: '2em' }}>No segments configured</div>
  }

  const segmentConfig = {
    hook:        { color: '#06B6D4', icon: '📌', label: 'Hook' },
    content:     { color: '#10B981', icon: '📚', label: 'Content' },
    interaction: { color: '#F59E0B', icon: '💡', label: 'Think' },
    recap:       { color: '#EC4899', icon: '✓', label: 'Recap' },
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '2%', padding: '2%' }}>
      {segments.slice(0, 5).map((seg, i) => {
        const config = segmentConfig[seg.segment_type] || { color: theme.accent, icon: '●', label: 'Step' }
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5em' }}>
            {/* Arrow before circle (except first) */}
            {i > 0 && (
              <div style={{ color: theme.accent, opacity: 0.3, fontSize: '1.2em', marginBottom: '0.3em' }}>→</div>
            )}
            {/* Circle */}
            <div style={{
              width: FS(50, 6, 80),
              height: FS(50, 6, 80),
              borderRadius: '50%',
              background: `${config.color}15`,
              border: `2px solid ${config.color}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: FS(20, 2.8, 36), lineHeight: 1 }}>{config.icon}</span>
            </div>
            {/* Label */}
            <p style={{
              color: config.color,
              fontSize: FS(8, 1.2, 14),
              fontWeight: 700,
              textAlign: 'center',
              margin: 0,
              whiteSpace: 'nowrap',
            }}>
              {seg.slide_title || config.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}

