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
import {
  Loader2, CheckCircle, Sparkles, RotateCcw, ArrowRight, Video,
  Plus, Trash2, Wand2, Mic, Layers, Play, RotateCw, Move, Image,
  BookOpen, Code, BarChart2, Cpu, Zap, Target, Globe,
  Database, Award, Star, Shield, Eye, EyeOff
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

// ─── Constants ────────────────────────────────────────────────────────────────

const MOTION_STYLES = [
  { id: 'slow-zoom-in', label: 'Slow Zoom',  cls: 'pa-motion-slowzoom' },
  { id: 'zoom-out',     label: 'Zoom Out',   cls: 'pa-motion-zoomout'  },
  { id: 'pan-left',     label: 'Pan Left',   cls: 'pa-motion-panleft'  },
  { id: 'pan-right',    label: 'Pan Right',  cls: 'pa-motion-panright' },
  { id: 'ken-burns',    label: 'Ken Burns',  cls: 'pa-motion-kenburns' },
  { id: 'static',       label: 'Static',     cls: ''                   },
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
const DEFAULT_POSITIONS = {
  'bullets':    { logo:{x:82,y:4}, title:{x:7,y:10}, subtitle:{x:7,y:29}, content:{x:7,y:41}, image:{x:56,y:10} },
  'title-hero': { logo:{x:82,y:4}, title:{x:7,y:22}, subtitle:{x:7,y:48}, content:{x:7,y:68}, image:{x:56,y:12} },
  'two-column': { logo:{x:82,y:4}, title:{x:7,y:6},  subtitle:{x:7,y:20}, content:{x:7,y:32}, image:{x:57,y:6}  },
  'icon-grid':  { logo:{x:82,y:4}, title:{x:7,y:5},  subtitle:{x:7,y:16}, content:{x:7,y:27}, image:{x:57,y:5}  },
  'key-stats':  { logo:{x:82,y:4}, title:{x:7,y:6},  subtitle:{x:7,y:20}, content:{x:7,y:34}, image:{x:57,y:6}  },
  'chart':      { logo:{x:82,y:4}, title:{x:7,y:5},  subtitle:{x:7,y:16}, content:{x:7,y:27}, image:{x:57,y:5}  },
  'definition': { logo:{x:82,y:4}, title:{x:7,y:8},  subtitle:{x:7,y:24}, content:{x:7,y:46}, image:{x:57,y:8}  },
  'quote':      { logo:{x:82,y:4}, title:{x:7,y:8},  subtitle:{x:7,y:68}, content:{x:7,y:24}, image:{x:57,y:8}  },
  'summary':    { logo:{x:82,y:4}, title:{x:7,y:6},  subtitle:{x:7,y:20}, content:{x:7,y:34}, image:{x:57,y:6}  },
}

// Width of each draggable layer (% of slide)
const LAYER_WIDTHS = { logo:10, title:78, subtitle:78, content:86, image:35 }

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
@keyframes pa-slowZoom  { 0%{transform:scale(1)}    100%{transform:scale(1.07)} }
@keyframes pa-zoomOut   { 0%{transform:scale(1.07)} 100%{transform:scale(1)}    }
@keyframes pa-panLeft   { 0%{transform:translateX(2%)}  100%{transform:translateX(-2%)} }
@keyframes pa-panRight  { 0%{transform:translateX(-2%)} 100%{transform:translateX(2%)}  }
@keyframes pa-kenBurns  { 0%{transform:scale(1) translate(0,0)} 100%{transform:scale(1.07) translate(-1.5%,-0.8%)} }
@keyframes pa-barGrow   { from{transform:scaleY(0)} to{transform:scaleY(1)} }

.pa-motion-slowzoom { animation:pa-slowZoom 11s ease-in-out infinite alternate }
.pa-motion-zoomout  { animation:pa-zoomOut  11s ease-in-out infinite alternate }
.pa-motion-panleft  { animation:pa-panLeft  13s linear      infinite alternate }
.pa-motion-panright { animation:pa-panRight 13s linear      infinite alternate }
.pa-motion-kenburns { animation:pa-kenBurns 15s ease-in-out infinite alternate }

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

  useEffect(() => { injectCSS() }, [])

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn:  () => scriptsService.listByProject(project.id),
    enabled:  !!project?.id,
  })

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
          <p className="text-xs text-slate-500 mt-0.5">
            Drag elements on the preview to reposition · 9 layouts · GVSU logo included
          </p>
        </div>
        <button onClick={() => onContinue?.('video')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors">
          <Video className="w-4 h-4" /> Continue to Video <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: scene list */}
        <div className="w-72 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto bg-slate-950/60">
          {scripts.map((script, vi) => (
            <SceneGroupList key={script.id} script={script} videoIndex={vi}
              selectedId={selected?.scene?.id} generating={generating}
              onSelect={(scene) => setSelected({ scene, script })} />
          ))}
        </div>

        {/* Right: editor */}
        <div className="flex-1 overflow-y-auto bg-slate-950">
          {selected ? (
            <SlideEditorBoundary key={selected.scene.id}>
              <SceneEditor scene={selected.scene}
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

// ─── Left: scene group list ───────────────────────────────────────────────────

function SceneGroupList({ script, videoIndex, selectedId, generating, onSelect }) {
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', script.moduleId],
    queryFn:  () => script.moduleId
      ? fetch('/api/modules/' + script.moduleId + '/scenes').then(r => r.json())
      : Promise.resolve([]),
    enabled:  !!script.moduleId,
    refetchInterval: 5000,
  })

  return (
    <div>
      <div className="px-3 py-2.5 sticky top-0 bg-slate-950/90 backdrop-blur-sm border-b border-white/[0.04] z-10">
        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Video {videoIndex + 1}</p>
        <p className="text-xs text-white font-medium truncate">{script.title}</p>
      </div>
      {isLoading
        ? <div className="py-4 flex justify-center"><Spinner size="sm" /></div>
        : scenes.map((scene, i) => {
            const isSel  = selectedId === scene.id
            const hasAst = !!scene.visualAssetUrl
            const isGen  = !!generating[scene.id]
            const parsed = (() => { try { return JSON.parse(scene.slideDeckContent || '{}') } catch { return {} } })()
            const th     = THEMES.find(t => t.id === (parsed.theme || 'light')) || THEMES.find(t => t.id === 'light') || THEMES[0]
            const slideTitle = parsed.title || `Scene ${i + 1}`
            const layoutId   = parsed.layout || 'bullets'
            return (
              <button key={scene.id} onClick={() => onSelect(scene)}
                className={`w-full text-left border-b border-white/[0.03] transition-all ${
                  isSel ? 'bg-indigo-600/10 border-l-2 border-l-indigo-500' : 'hover:bg-white/[0.03]'
                }`}>
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  {/* Mini thumbnail */}
                  <div className="w-14 h-9 rounded-lg overflow-hidden flex-shrink-0 relative border border-white/10"
                    style={{ background: `linear-gradient(135deg, ${th.bg}, ${th.bgGrad})` }}>
                    {hasAst
                      ? <img src={scene.visualAssetUrl} className="w-full h-full object-cover" alt="" />
                      : <>
                          <div className="absolute" style={{ top:'-20%',right:'-15%',width:'55%',aspectRatio:'1',borderRadius:'50%',background:th.accent,opacity:0.12 }} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span style={{ color:th.accent, fontSize:8, opacity:0.7 }}>{LAYOUTS.find(l=>l.id===layoutId)?.icon||'≡'}</span>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 px-1 pb-0.5"
                            style={{ background:`linear-gradient(to top,${th.bg}cc,transparent)` }}>
                            <p style={{ fontSize:4, color:th.text, fontWeight:600, lineHeight:1.3, opacity:0.9 }}>
                              {slideTitle.slice(0,22)}
                            </p>
                          </div>
                        </>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{slideTitle}</p>
                    <p className="text-[10px] text-slate-600">
                      {hasAst ? '✓ Asset ready' : isGen ? 'Generating…' : `Scene ${i+1} · ${LAYOUTS.find(l=>l.id===layoutId)?.label||'Bullets'}`}
                    </p>
                  </div>
                  {isGen    && <Loader2 className="w-3 h-3 text-indigo-400 animate-spin flex-shrink-0" />}
                  {hasAst && !isGen && <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                </div>
              </button>
            )
          })
      }
    </div>
  )
}

// ─── Right: scene editor ──────────────────────────────────────────────────────

function SceneEditor({ scene, isGenerating, onGenerate }) {
  const parsed = (() => { try { return JSON.parse(scene.slideDeckContent || '{}') } catch { return {} } })()

  // Pre-fill bullets from AI blocks — fall back to extracting sentences from the voice script
  const initBullets = (() => {
    const items = parsed.blocks?.[0]?.items
    if (items?.length) return items
    // Derive from scriptContent when AI blocks are missing or empty
    return (scene.scriptContent || '')
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.length > 25 && s.length < 160)
      .slice(0, 5)
      .map(text => ({ text: text.trim(), level: 1 }))
  })()

  const [layout,    setLayout]    = useState(parsed.layout || 'bullets')
  // Theme: if user has previously saved positions they've interacted → keep their choice.
  // Otherwise always start with 'light' (ignore AI-generated dark-navy default).
  const [theme,     setTheme]     = useState(parsed.positions ? (parsed.theme || 'light') : 'light')
  const [title,     setTitle]     = useState(parsed.title     || `Scene ${(scene.orderIndex??0)+1}`)
  const [subtitle,  setSubtitle]  = useState(parsed.subtitle  || '')
  const [bullets,   setBullets]   = useState(initBullets)
  const [motion,    setMotion]    = useState(() => MOTION_STYLES.find(m=>m.id===(scene.textAnimationType||'static')) || MOTION_STYLES[5])
  const [positions,   setPositions]   = useState(() => {
    // Always merge saved positions with layout defaults so every key exists
    const layoutKey = parsed.layout || 'bullets'
    const defaults  = DEFAULT_POSITIONS[layoutKey] || DEFAULT_POSITIONS.bullets
    const saved     = parsed.positions || {}
    return Object.keys(defaults).reduce((acc, k) => ({ ...acc, [k]: saved[k] || defaults[k] }), {})
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
    try {
      await fetch('/api/scenes/' + scene.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slide_deck_content: JSON.stringify({
            title: s.title, subtitle: s.subtitle, layout: s.layout, theme: s.theme,
            blocks: [{ type: 'bullets', items: s.bullets }],
            positions: s.positions, showLogo: s.showLogo,
            imageUrl: s.imageUrl, imageWidth: s.imageWidth, imageShape: s.imageShape,
          }),
          text_animation_type: s.motionId,
        }),
      })
    } catch {}
    finally { setSaving(false) }
  }

  const handleLayoutChange = (newLayout) => {
    setLayout(newLayout)
    // Preserve image position if set, otherwise use default
    const def = DEFAULT_POSITIONS[newLayout] || DEFAULT_POSITIONS.bullets
    setPositions(prev => ({ ...def, image: prev.image || def.image }))
  }

  // File → base64 data URL
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setImageUrl(ev.target.result); setTimeout(saveContent, 50) }
    reader.readAsDataURL(file)
    e.target.value = ''  // allow re-upload of same file
  }

  const handlePositionChange = (key, newPos) => {
    setPositions(prev => ({ ...prev, [key]: { ...prev[key], ...newPos } }))
  }

  const handleGenerate = async () => { await saveContent(); onGenerate(scene.id) }

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

  return (
    <div className="p-6 max-w-3xl">

      {/* ── LIVE DRAGGABLE PREVIEW ───────────────────────────────────────── */}
      <div className="mb-3 relative">
        <EditableSlide
          key={previewKey}
          title={title} subtitle={subtitle} bullets={bullets}
          layout={layout} theme={themeObj} motionCls={motion.cls}
          positions={positions} showLogo={showLogo}
          imageUrl={imageUrl} imageWidth={imageWidth} imageShape={imageShape}
          onPositionChange={handlePositionChange}
          onDragEnd={saveContent}
        />
        {/* Overlay buttons */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
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
      </div>

      {/* Drag hint */}
      <p className="text-[10px] text-slate-600 text-center mb-5 flex items-center justify-center gap-1">
        <Move className="w-3 h-3" /> Hover any element on the slide and drag to reposition it
      </p>

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

      {/* ── MOTION ─────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-white mb-2">Background Motion</p>
        <div className="flex flex-wrap gap-1.5">
          {MOTION_STYLES.map(m => (
            <button key={m.id} onClick={() => { setMotion(m); setPreviewKey(k=>k+1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                motion.id===m.id
                  ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                  : 'bg-slate-800/60 border-white/[0.06] text-slate-400 hover:border-white/20 hover:text-white'
              }`}>{m.label}</button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.06] mb-5" />

      {/* ── CONTENT ────────────────────────────────────────────────────────── */}
      <div className="space-y-5">

        <div>
          <label className="block text-xs font-semibold text-white mb-1.5">
            Slide Title <span className="font-normal text-slate-500">— 5-7 words</span>
          </label>
          <input value={title} onChange={e=>setTitle(e.target.value)} onBlur={saveContent}
            placeholder="Key concept students will learn"
            className="w-full bg-slate-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-white mb-1.5">
            Key Insight <span className="font-normal text-slate-500">— one-line takeaway</span>
          </label>
          <input value={subtitle} onChange={e=>setSubtitle(e.target.value)} onBlur={saveContent}
            placeholder="The main idea students should remember"
            className="w-full bg-slate-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors" />
        </div>

        {/* Bullets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-white">
              Content Points <span className="font-normal text-slate-500">— drives chart / stats / grid too</span>
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

        {/* Layout + Theme */}
        <div className="grid grid-cols-2 gap-5 pt-1">
          <div>
            <p className="text-xs font-semibold text-white mb-2">Layout</p>
            <div className="grid grid-cols-3 gap-1.5">
              {LAYOUTS.map(l => (
                <button key={l.id} onClick={()=>handleLayoutChange(l.id)}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    layout===l.id
                      ?'border-indigo-500/50 bg-indigo-500/10 text-white'
                      :'border-white/[0.06] bg-slate-800/40 text-slate-500 hover:border-white/20 hover:text-slate-300'
                  }`}>
                  <div className="text-sm mb-0.5">{l.icon}</div>
                  <div className="text-[9px] font-medium">{l.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-white mb-2">Theme</p>
            <div className="space-y-1.5">
              {THEMES.map(th => (
                <button key={th.id} onClick={()=>{ setTheme(th.id); saveContent() }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
                    theme===th.id?'border-white/25':'border-white/[0.06] hover:border-white/15'}`}
                  style={{ background: theme===th.id ? th.bg+'60' : undefined }}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background:th.accent }} />
                  <span className="text-xs text-slate-300">{th.label}</span>
                  {theme===th.id && <CheckCircle className="w-3 h-3 text-white ml-auto" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Voice script reference */}
        {scene.scriptContent && (
          <div>
            <button onClick={()=>setShowVoice(v=>!v)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <Mic className="w-3 h-3" /> {showVoice?'Hide':'Show'} voice script reference
            </button>
            {showVoice && (
              <div className="mt-2 p-3 rounded-xl bg-slate-800/30 border border-white/[0.04]">
                <p className="text-[10px] text-blue-400/80 uppercase tracking-widest mb-1 font-semibold">
                  🎙 Voice Script — what the presenter SAYS
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">{scene.scriptContent}</p>
              </div>
            )}
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
          <p className="text-[10px] text-slate-600 text-center mt-1.5">
            Auto-saves · Renders 1920×1080 PNG for video production
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Editable slide canvas (drag-to-reposition) ───────────────────────────────

function EditableSlide({ title, subtitle, bullets, layout, theme, motionCls, positions, showLogo, imageUrl, imageWidth, imageShape, onPositionChange, onDragEnd }) {
  const containerRef  = useRef(null)
  const [activeDrag, setActiveDrag] = useState(null)

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

      {/* ── Draggable: LOGO ─────────────────────────────────────── */}
      {showLogo && (
        <DraggableLayer layerKey="logo" pos={positions.logo} width={LAYER_WIDTHS.logo}
          isActive={activeDrag==='logo'} label="GVSU Logo" onMouseDown={startDrag}>
          <div className="pa-logo">
            <GVSULogoSVG isDark={theme.isDark} />
          </div>
        </DraggableLayer>
      )}

      {/* ── Draggable: IMAGE / FIGURE ────────────────────────────── */}
      {imageUrl && positions.image && (
        <DraggableLayer layerKey="image" pos={positions.image} width={imageWidth}
          isActive={activeDrag==='image'} label="Image" onMouseDown={startDrag}>
          <SlideImage url={imageUrl} shape={imageShape} />
        </DraggableLayer>
      )}

      {/* ── Draggable: TITLE ────────────────────────────────────── */}
      <DraggableLayer layerKey="title" pos={positions.title} width={LAYER_WIDTHS.title}
        isActive={activeDrag==='title'} label="Title" onMouseDown={startDrag}>
        <TitleLayer title={title} layout={layout} theme={theme} />
      </DraggableLayer>

      {/* ── Draggable: SUBTITLE ─────────────────────────────────── */}
      {subtitle && (
        <DraggableLayer layerKey="subtitle" pos={positions.subtitle} width={LAYER_WIDTHS.subtitle}
          isActive={activeDrag==='subtitle'} label="Key Insight" onMouseDown={startDrag}>
          <SubtitleLayer subtitle={subtitle} layout={layout} theme={theme} />
        </DraggableLayer>
      )}

      {/* ── Draggable: CONTENT BLOCK ────────────────────────────── */}
      <DraggableLayer layerKey="content" pos={positions.content} width={LAYER_WIDTHS.content}
        isActive={activeDrag==='content'} label="Content" onMouseDown={startDrag}>
        <ContentLayer layout={layout} bullets={bullets} subtitle={subtitle} theme={theme} />
      </DraggableLayer>

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ height:'0.4%', background:`linear-gradient(to right,${theme.accent},${theme.accent}00 70%)` }} />
    </div>
  )
}

// ─── Draggable layer wrapper ──────────────────────────────────────────────────

function DraggableLayer({ layerKey, pos, width, isActive, label, onMouseDown, children }) {
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
        zIndex: isActive ? 200 : 10,
      }}
    >
      {/* Tooltip label */}
      <div className="pa-drag-label absolute -top-6 left-0 hidden items-center gap-1 bg-blue-500 text-white px-2 py-0.5 rounded text-[8px] font-bold whitespace-nowrap z-50 pointer-events-none shadow-lg">
        <Move style={{ width:8, height:8 }} /> {label}
      </div>
      {/* Selection ring */}
      <div className={`pa-drag-ring absolute inset-0 pointer-events-none rounded transition-all ${
        isActive ? 'outline outline-2 outline-offset-[3px] outline-blue-400 bg-blue-400/5' : ''
      }`} />
      {children}
    </div>
  )
}

// ─── Geometric background SVG ─────────────────────────────────────────────────

function SlideBackground({ theme }) {
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1280 720"
      preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <circle cx="1200" cy="-60" r="380" fill={theme.accent} fillOpacity="0.07" />
      <circle cx="-60"  cy="780" r="300" fill={theme.accent} fillOpacity="0.05" />
      <circle cx="900"  cy="650" r="90"  fill={theme.accent} fillOpacity="0.06" />
      <line x1="0" y1="680" x2="1280" y2="680" stroke={theme.accent} strokeOpacity="0.10" strokeWidth="1" />
      <rect x="0" y="0" width="4"  height="200" fill={theme.accent} fillOpacity="0.70" rx="2" />
      <rect x="0" y="0" width="80" height="2"   fill={theme.accent} fillOpacity="0.35" rx="1" />
      {[0,1,2,3].map(r=>[0,1,2,3].map(c=>(
        <circle key={`${r}-${c}`} cx={980+c*28} cy={50+r*28} r="2" fill={theme.accent} fillOpacity="0.18" />
      )))}
    </svg>
  )
}

// ─── GVSU Logo ────────────────────────────────────────────────────────────────
// Pure inline SVG — no background, no box, no image file needed.
//   Dark slides  → white  (#FFFFFF)
//   Light slide  → GVSU blue (#0032A0)

const GVSU_BLUE = '#0032A0'

function GVSULogoSVG({ isDark = true }) {
  const c = isDark ? '#FFFFFF' : GVSU_BLUE
  return (
    <svg
      viewBox="0 0 260 260"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {/* G ring — nearly full circle, ~70° gap on the lower-right */}
      <path d="M 214,74 A 101,101 0 1,0 214,186"
        fill="none" stroke={c} strokeWidth="25" strokeLinecap="round" />
      {/* G crossbar */}
      <line x1="231" y1="130" x2="175" y2="130"
        stroke={c} strokeWidth="25" strokeLinecap="round" />
      {/* Bold V chevron */}
      <path d="M 64,80 L 130,178 L 196,80 L 174,80 L 130,154 L 86,80 Z"
        fill={c} />
    </svg>
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

function ContentLayer({ layout, bullets, subtitle, theme }) {
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
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.3%' }}>
      {bullets.slice(0,6).map((b,i) => (
        <div key={i} className={`pa-b${i} flex items-start`} style={{ gap:'2%', marginLeft:b.level===2?'4%':0 }}>
          <div style={{
            flexShrink:0, marginTop:'0.3%',
            width:  b.level===1 ? FS(9,1.3,16) : FS(7,1.0,12),
            height: b.level===1 ? FS(9,1.3,16) : FS(7,1.0,12),
            borderRadius: b.level===1 ? '3px' : '50%',
            background: b.level===1 ? theme.accent : theme.accent+'50',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            {b.level===1 && <span style={{ color:'#fff', fontSize:FS(5,0.7,9), fontWeight:700 }}>▸</span>}
          </div>
          <p style={{
            color:      b.level===2 ? theme.textSub : theme.text,
            fontSize:   b.level===2 ? FS(7,1.05,14) : FS(8,1.2,16),
            fontWeight: b.level===1 ? 500 : 400,
            lineHeight: 1.45,
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
          <p style={{ color:theme.accent, fontSize:FS(6,0.85,11), fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'1.5%', ma