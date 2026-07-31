/**
 * Visual Designer — Storyboard + Visual merged
 *
 */
import React, { useState, useRef, useEffect, useCallback, Component } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { mediaService } from '@/services/media'
import { projectsService } from '@/services/projects'
import { scenesService } from '@/services/scenes'
import {
  Loader2, CheckCircle, Sparkles, RotateCcw, ArrowRight, Video,
  Plus, Trash2, Wand2, Mic, Layers, Play, RotateCw, Move, Image,
  BookOpen, Code, BarChart2, Cpu, Zap, Target, Globe,
  Database, Award, Star, Shield, Eye, EyeOff, Settings, AlertCircle,
  Square, Volume2, Type, LayoutGrid, Sliders, Check, User, Pencil,
  Ban, Circle as CircleIcon, ChevronDown, Minus, Highlighter, MessageSquare
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import SceneTimelineEditor from '@/components/workspace/SceneTimelineEditor'

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

// Slide themes on GVSU's palette (https://www.gvsu.edu/identity/color-2).
// GVSU Blue leads; Link Blue / Archway / Midnight accent it. Big Lake is
// deliberately unused — it reads green. Each theme gets its own background
// family so the picker reads as real choices. `id`s unchanged so saved
// designs keep resolving.
const THEMES = [
  { id: 'light',      label: 'Light',    accent: '#0032A0', bg: '#FFFFFF', bgGrad: '#F1F5FD', text: '#0B1220', textSub: '#475569', isDark: false },
  { id: 'dark-navy',  label: 'Navy',     accent: '#0ECBF0', bg: '#050A24', bgGrad: '#13155C', text: '#FFFFFF', textSub: '#AFC2E4', isDark: true  },
  { id: 'academic',   label: 'Academic', accent: '#0032A0', bg: '#FBF8F1', bgGrad: '#F2E9D8', text: '#1A1206', textSub: '#5A4A32', isDark: false },
  { id: 'ocean',      label: 'Ocean',    accent: '#0ECBF0', bg: '#04182E', bgGrad: '#0A3358', text: '#FFFFFF', textSub: '#A9CBEC', isDark: true  },
  { id: 'corporate',  label: 'Corp',     accent: '#DEC197', bg: '#0B0B0D', bgGrad: '#1C1A17', text: '#FFFFFF', textSub: '#C4B49A', isDark: true  },
]

// Default layer positions (% of slide width/height) per layout
// `image` defaults to right side — user drags it wherever they want
// Text layers stop at x+width ≈ 72%, leaving the bottom-right "presenter avatar"
// zone (x:76.5–98.5%, y:60–98%) and the image column clear of overlapping text.
//
// Vertical gaps below are sized against TitleLayer/SubtitleLayer's actual
// font metrics (see FS() above): a non-hero title renders up to ~34px, and
// at 1.2 line-height a 2-line wrap (any title over ~30-35 characters, which
// is most real titles) takes up ~17% of the slide's height. Several layouts
// used to leave only an 11-14% gap before the subtitle, which is why a
// longer title would visually run into ("text under text") the subtitle
// below it — same story for subtitle → content with a wrapped 2-line
// subtitle (~9-10% tall). Gaps here now leave ~19% title→subtitle and ~12%
// subtitle→content so a realistic 2-line wrap at either level still clears
// the block below it instead of overlapping it.
const DEFAULT_POSITIONS = {
  'bullets':    { logo:{x:82,y:4}, title:{x:7,y:10}, subtitle:{x:7,y:29}, content:{x:7,y:41}, image:{x:56,y:10} },
  'title-hero': { logo:{x:82,y:4}, title:{x:10,y:20},subtitle:{x:10,y:46},content:{x:10,y:64},image:{x:56,y:12} },
  'two-column': { logo:{x:82,y:4}, title:{x:7,y:6},  subtitle:{x:7,y:25}, content:{x:7,y:37}, image:{x:57,y:6}  },
  'icon-grid':  { logo:{x:82,y:4}, title:{x:7,y:5},  subtitle:{x:7,y:24}, content:{x:7,y:36}, image:{x:57,y:5}  },
  'key-stats':  { logo:{x:82,y:4}, title:{x:7,y:6},  subtitle:{x:7,y:25}, content:{x:7,y:37}, image:{x:57,y:6}  },
  'chart':      { logo:{x:82,y:4}, title:{x:7,y:5},  subtitle:{x:7,y:24}, content:{x:7,y:36}, image:{x:57,y:5}  },
  'definition': { logo:{x:82,y:4}, title:{x:7,y:8},  subtitle:{x:7,y:27}, content:{x:7,y:46}, image:{x:57,y:8}  },
  'quote':      { logo:{x:82,y:4}, title:{x:12,y:8}, subtitle:{x:12,y:82},content:{x:12,y:22}, image:{x:57,y:8}  },
  'summary':    { logo:{x:82,y:4}, title:{x:7,y:6},  subtitle:{x:7,y:25}, content:{x:7,y:37}, image:{x:57,y:6}  },
}

// Width of each draggable layer (% of slide). Text layers are capped at 65%
// (starting at x≈7-12%) so they never reach the avatar placeholder zone
// (which starts at x≈76.5%) or run underneath the image column.
const LAYER_WIDTHS = { logo:16, title:65, subtitle:65, content:65, image:35 }

// Presenter avatar placeholder — position is the CENTER of the box (x/y, %
// of slide) and width is % of slide width, matching exactly what the render
// pipeline reads server-side (api/src/lib/ffmpegVideo.ts extractAvatarPosition
// / overlayAvatarOnVideo) so the box the user drags here is truly WYSIWYG,
// not just a cosmetic preview. Height isn't stored — the backend derives it
// as a 9:16 portrait crop (height = width × 16/9 in output-pixel terms),
// which is why AVATAR_HEIGHT_RATIO below isn't a plain 16:9 — it also folds
// in the 16:9 frame's own width:height ratio to get height-as-%-of-slide.
const AVATAR_HEIGHT_RATIO = 256 / 81 // heightPct = widthPct * this
// Widest the box is ever allowed to get. Because of AVATAR_HEIGHT_RATIO's
// ~3.16x, a width past this makes the box TALLER than the slide itself
// (100% height) — no position could ever contain it without spilling past
// the top and bottom edges. Keeping width at or under this guarantees a
// valid, fully-on-slide y always exists.
const MAX_AVATAR_WIDTH = 31
// Slightly bigger default presenter, tucked into the lower-right but NOT
// jammed into the corner — AVATAR_BORDER_MARGIN below keeps a gap from the
// slide edges so it reads as intentionally placed, not clipped to the border.
const DEFAULT_AVATAR = { x: 84, y: 68, width: 19 }
// Minimum breathing room (% of slide) kept between the avatar box and every
// slide edge, so dragging/resizing can never flush it against the frame.
const AVATAR_BORDER_MARGIN = 3

// Keep the avatar box fully inside the 0–100% slide bounds for whatever its
// current width is — used by both drag and resize so the box (and the
// backend render, which reads these exact numbers) can never place any part
// of the presenter outside the frame. Centers on the affected axis in the
// (deliberately impossible-to-fully-avoid) case where the box is taller than
// the slide, so overflow is at least symmetric instead of one-sided.
function clampAvatarBox(x, y, width) {
  const halfW = width / 2
  const halfH = (width * AVATAR_HEIGHT_RATIO) / 2
  const M = AVATAR_BORDER_MARGIN
  const minX = Math.min(halfW + M, 50), maxX = Math.max(100 - halfW - M, 50)
  const minY = Math.min(halfH + M, 50), maxY = Math.max(100 - halfH - M, 50)
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  }
}

// Instead of resizing the content box when the avatar moves over it, keep
// its FONT SIZE untouched but stop its wrapped lines short of the avatar's
// left edge — a real visual gap, not just "wraps eventually". Content's
// height isn't tracked in state (it's auto-sized by its own text, unlike the
// avatar's fixed aspect ratio), so this treats everything from the content
// box's y-anchor down to the bottom of the slide as "content territory" — a
// conservative check that may narrow the wrap column a little more eagerly
// than strictly necessary, but never lets text render underneath the avatar.
// Returns a style object to spread straight onto the text element: just
// `{ whiteSpace }` when clear, or `{ whiteSpace: 'normal', maxWidth }` (a %
// of the text's OWN box, not the slide) when the avatar is in the way.
const CONTENT_AVOID_GAP = 5 // % of slide kept clear between the two boxes
const MIN_WRAP_WIDTH_CQW = 22 // never narrow the text column below this much of the SLIDE width
// Reflow text around the presenter avatar on WHICHEVER side it currently sits.
// `avatar` = { left, right, bottom } as % of the slide. Returns a style spread
// onto the text element, in cqw units (% of the slide width — the slide is an
// inline-size container), so:
//   • avatar on the RIGHT → text keeps its left edge, ends before the avatar
//   • avatar on the LEFT  → text is pushed to START after the avatar's right
//     edge (marginLeft) and narrowed to fit the remaining room
// Previously this only handled the right-side case, so dragging the avatar to
// the left left the text sitting underneath it, un-reflowed.
function computeWrapStyle(pos, widthPct, avatar, textWrap) {
  const base = { whiteSpace: textWrap ? 'normal' : 'nowrap' }
  if (!pos || !avatar) return base
  if (avatar.bottom <= pos.y) return base            // avatar entirely above this box — no clash
  const boxWidth = widthPct * (pos.scale ?? 1)        // % of slide
  const boxLeft  = pos.x
  const boxRight = pos.x + boxWidth
  const G = CONTENT_AVOID_GAP
  // No horizontal overlap at all → full width, nothing to do.
  if (avatar.left >= boxRight + G || avatar.right <= boxLeft - G) return base

  const avatarCenter = (avatar.left + avatar.right) / 2
  const boxCenter    = (boxLeft + boxRight) / 2

  if (avatarCenter >= boxCenter) {
    // Avatar is on the RIGHT of the text — keep the text's left edge, stop it
    // short of the avatar's left edge.
    const avail = Math.max(MIN_WRAP_WIDTH_CQW, avatar.left - G - boxLeft)
    return { whiteSpace: 'normal', maxWidth: `${avail}cqw` }
  }
  // Avatar is on the LEFT of the text — shift the text to start after the
  // avatar's right edge and narrow it to the remaining room.
  const startX  = avatar.right + G
  const marginL = Math.max(0, startX - boxLeft)
  const avail   = Math.max(MIN_WRAP_WIDTH_CQW, boxRight - startX)
  return { whiteSpace: 'normal', maxWidth: `${avail}cqw`, marginLeft: `${marginL}cqw` }
}

// Load the editable content points out of a saved design, reading BOTH
// representations a design can use:
//   • blocks[0].items          — what the Content Points editor writes
//   • positionedBlocks         — what the backend seed / module reset writes,
//                                and what the slide actually renders from
// The editor used to read only `blocks`, so a freshly-seeded slide showed
// content on the canvas but an EMPTY editor — the user could only ADD points,
// not edit the existing ones. Coalescing both fixes that. Each positioned
// block becomes a level-1 point plus its keyPoints as level-2 sub-points.
function bulletsFromDesign(design) {
  const items = design?.blocks?.[0]?.items
  if (items?.length) return items
  const pb = design?.positionedBlocks
  if (pb?.length) {
    const out = []
    for (const b of pb) {
      if (b?.visible === false) continue
      if (b?.text?.trim()) out.push({ text: b.text, level: 1 })
      for (const kp of b?.keyPoints || []) {
        if (kp?.trim()) out.push({ text: kp, level: 2 })
      }
    }
    if (out.length) return out
  }
  return [{ text: '', level: 1 }]
}

// Read-only slide preview for Video Editing's playback. Renders through the
// SAME EditableSlide + constants that Visual Design uses, so the play preview
// looks IDENTICAL to the real design (not a separate reconstruction). Content
// points are revealed one at a time as playback advances (revealCount = how
// many points should be visible at the current playback time).
export function SlidePlaybackPreview({ design, revealCount = null, avatarImageUrl = null, useAvatar = true }) {
  const parsed = design || {}
  const layout = parsed.layout || 'bullets'
  const themeObj = THEMES.find(t => t.id === (parsed.theme || 'light')) || THEMES[0]
  const motion = MOTION_STYLES.find(m => m.id === parsed.motionId) || MOTION_STYLES[0]
  const allBullets = bulletsFromDesign(parsed)
  const bullets = typeof revealCount === 'number'
    ? allBullets.slice(0, Math.max(0, revealCount))
    : allBullets
  const defaults = DEFAULT_POSITIONS[layout] || DEFAULT_POSITIONS.bullets
  const saved = parsed.positions || {}
  const positions = Object.keys(defaults).reduce((acc, k) => ({
    ...acc, [k]: { scale: 1, ...defaults[k], ...(saved[k] || {}) },
  }), {})
  const avatarWidth = Math.min(parsed.avatarWidth ?? DEFAULT_AVATAR.width, MAX_AVATAR_WIDTH)
  const noop = () => {}
  return (
    <EditableSlide
      title={parsed.title || ''}
      subtitle={parsed.subtitle || ''}
      bullets={bullets}
      layout={layout}
      theme={themeObj}
      motionCls={motion.cls}
      positions={positions}
      showLogo={parsed.showLogo !== false}
      imageUrl={parsed.imageUrl || ''}
      imageWidth={parsed.imageWidth || 36}
      imageShape={parsed.imageShape || 'rounded'}
      textWrap={parsed.textWrap === true}
      moduleTitle={''}
      sceneIndex={0}
      totalScenes={1}
      onPositionChange={noop}
      onDragEnd={noop}
      textCues={[]}
      avatarImageUrl={useAvatar ? avatarImageUrl : null}
      avatarX={parsed.avatarX ?? DEFAULT_AVATAR.x}
      avatarY={parsed.avatarY ?? DEFAULT_AVATAR.y}
      avatarWidth={avatarWidth}
      onDeleteLayer={noop}
      segments={[]}
      annotations={Array.isArray(parsed.annotations) ? parsed.annotations : []}
      onAnnotationChange={noop}
      onAnnotationDragEnd={noop}
      onAnnotationDelete={noop}
    />
  )
}

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
.pa-drag-layer:hover > .pa-drag-ring { outline: 2px solid #4975D4; outline-offset: 3px; border-radius: 4px; }
.pa-drag-layer:hover > .pa-drag-label { display: flex; }
`
function injectCSS() {
  if (!document.getElementById('pa-css')) {
    const s = document.createElement('style')
    s.id = 'pa-css'; s.textContent = SLIDE_CSS
    document.head.appendChild(s)
  }
}

// Font sizing is container-relative (cqw = % of the slide canvas width, via
// container-type:inline-size on the canvas) instead of viewport-relative, so
// text scales WITH the slide when the editor grows/shrinks — and the saved
// video snapshot looks identical at any window size.
// Calibration: with the old viewport-based sizing, text almost always sat at
// its `max` px cap on the ~850px-wide canvas — so `max/850` IS the intended
// proportion of the slide. max×0.118cqw reproduces that exact look at 850px
// and scales it proportionally on bigger/smaller canvases.
const FS = (min, _vw, max) => `clamp(${min}px,${(max * 0.118).toFixed(2)}cqw,${Math.round(max * 2.2)}px)`

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
            <span className="text-red-500 dark:text-red-400 text-xl">!</span>
          </div>
          <p className="text-slate-900 dark:text-white font-medium mb-1">Slide editor error</p>
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
  // First-time presenter avatar gate — see AvatarGatePopup above.
  //
  // Requirement: prompt to choose an avatar the FIRST time this project's
  // Visual Design opens (i.e. arriving from the Voice stage), and only that
  // once. `manualAvatarPicker` reopens it anytime via "Edit Avatar".
  //
  // One-time behavior is enforced with a persisted per-project flag: the auto
  // gate fires once, immediately stamps the flag, and never auto-opens again —
  // whether the user picks, skips, or just closes it. Entering Visual Design
  // again won't re-nag.
  const [manualAvatarPicker, setManualAvatarPicker] = useState(false)
  const [autoAvatarGate,    setAutoAvatarGate]    = useState(false)
  const avatarPromptedKey = project?.id ? `pa-vd-avatar-prompted-${project.id}` : null

  // The avatar picker should offer only presenters that MATCH the voice chosen
  // in the Voice stage — a female voice → female avatars, a male voice → male
  // avatars. Resolve the selected voice's gender here and hand it to the
  // popup so it filters automatically instead of asking the user to pick a
  // gender by hand.
  const { data: voicesData } = useQuery({
    queryKey: ['elevenlabs-voices'],
    queryFn: () => mediaService.listVoices(),
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    initialData: () => mediaService.cachedVoices(),
    initialDataUpdatedAt: 0,
    enabled: !!project?.defaultVoiceId,
  })
  const voiceGender = normGender(
    voicesData?.voices?.find(v => v.voice_id === project?.defaultVoiceId)?.labels?.gender
  )

  useEffect(() => {
    if (!avatarPromptedKey || typeof localStorage === 'undefined') return
    if (localStorage.getItem(avatarPromptedKey)) return          // already prompted once
    if (project?.defaultAvatarId) return                          // avatar already chosen — nothing to prompt
    setAutoAvatarGate(true)
    localStorage.setItem(avatarPromptedKey, '1')                 // make it strictly one-time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarPromptedKey, project?.defaultAvatarId])

  const showAvatarGate = manualAvatarPicker || autoAvatarGate

  const handleChooseAvatar = async (avatarId) => {
    if (!project?.id) return
    try {
      await projectsService.update(project.id, { default_avatar_id: avatarId })
      onUpdate?.()
    } catch (e) { console.error('Failed to save presenter avatar:', e) }
    setManualAvatarPicker(false)
    setAutoAvatarGate(false)
  }
  const handleSkipAvatarGate = () => {
    setAutoAvatarGate(false)   // the one-time flag is already stamped
  }

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
      ? fetch('/api/modules/' + firstModuleId + '/scenes').then(r => r.ok ? r.json() : Promise.reject(r.statusText))
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
      // This gate's own copy says the theme "applies to every scene in this
      // module" — but apply-theme-to-segments is scoped to ONE scene, so
      // calling it with just the auto-selected first scene (as this used to
      // do) only themed that scene; every other scene in the module silently
      // kept its old theme (and old, now-mismatched slide images) until
      // someone opened each one and picked a theme by hand. Fetch every scene
      // in the module and apply to all of them so the promise in the gate's
      // copy is actually true.
      const scenesRes = await fetch(`/api/modules/${selectedModuleId}/scenes`)
      const moduleScenes = scenesRes.ok ? await scenesRes.json() : [selected.scene]
      await Promise.all(moduleScenes.map(s =>
        fetch(`/api/scenes/${s.id}/apply-theme-to-segments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: themeId }),
        }).catch(() => {})
      ))
      // Refresh scene data to show updated designs
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
    } catch (e) { console.error('Failed to apply theme:', e) }
  }

  const handleGenerate = async (sceneId, segmentId) => {
    setGenerating(p => ({ ...p, [sceneId]: true }))
    try {
      // Return the response (has visual_asset_url) so SceneEditor can show
      // the freshly generated image right away instead of the user having to
      // leave this screen to see whether anything actually changed.
      // segmentId matters for scenes built from multiple parts (hook/content/
      // content/recap) — without it the backend always regenerates the
      // FIRST segment's slide, no matter which part is actually being edited.
      const result = await agentsService.runGenerateAsset(sceneId, segmentId)
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      onUpdate?.()
      return result
    } catch (e) {
      console.error('Generate asset error:', e)
      throw e
    }
    finally { setGenerating(p => ({ ...p, [sceneId]: false })) }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>
  if (!scripts.length) return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      <Layers className="w-10 h-10 text-slate-700 mb-3" />
      <p className="text-slate-500 dark:text-slate-400">Complete the Script stage first.</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.06] flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> Visual Designer
          </h2>
         
        </div>
        <button onClick={() => onContinue?.('final-video')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors">
          <Sparkles className="w-4 h-4" /> Continue to Final Video <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: scene list - Clean inline layout */}
        <div className="w-56 flex-shrink-0 border-r border-slate-200 dark:border-gray-700 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          {scripts.map((script, vi) => (
            <SceneGroupList key={script.id} script={script} videoIndex={vi}
              selectedId={selected?.scene?.id} selectedSegmentId={selected?.segmentId} generating={generating}
              onSelect={(scene, totalScenes, segmentId) => setSelected({ scene, script, totalScenes, segmentId })}
              onDeleted={(sceneId) => setSelected(prev => prev?.scene?.id === sceneId ? null : prev)} />
          ))}
        </div>

        {/* Right: editor */}
        <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950">
          {needsThemeGate ? (
            <ModuleThemeGate moduleTitle={selected.script.title}
              onChoose={(themeId) => resolveModuleTheme(themeId)} />
          ) : selected ? (
            <SlideEditorBoundary key={selected.scene.id}>
            <SceneEditor scene={selected.scene}
                moduleId={selected.script.moduleId}
                moduleTitle={selected.script.title} totalScenes={selected.totalScenes || 1}
                defaultTheme={moduleThemes[selectedModuleId] || 'light'}
                voiceId={project?.defaultVoiceId}
                avatarId={project?.defaultAvatarId}
                avatarStyle={project?.avatarStyle}
                avatarBackground={project?.avatarBackground}
                onSaveAvatarSettings={(patch) => projectsService.update(project.id, patch).then(() => onUpdate?.())}
                onEditAvatar={() => setManualAvatarPicker(true)}
                initialSegmentId={selected.segmentId}
                isGenerating={!!generating[selected.scene.id]} onGenerate={handleGenerate} />
            </SlideEditorBoundary>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] flex items-center justify-center mb-4">
                <Layers className="w-7 h-7 text-slate-700" />
              </div>
              <p className="text-slate-900 dark:text-white font-medium mb-1">Select a scene</p>
              <p className="text-slate-500 text-sm">Click any scene on the left to design its slide</p>
            </div>
          )}
        </div>
      </div>

      {showAvatarGate && (
        <AvatarGatePopup
          voiceGender={voiceGender}
          onChoose={handleChooseAvatar}
          onSkip={() => { handleSkipAvatarGate(); setManualAvatarPicker(false) }}
          onClose={() => { setManualAvatarPicker(false); setAutoAvatarGate(false) }}
        />
      )}
    </div>
  )
}

// ─── First-time presenter avatar gate ─────────────────────────────────────────
// Shown once per PROJECT (gated on project.defaultAvatarId being unset, same
// pattern as ModuleThemeGate below but project-wide instead of per-module) —
// the very first time Visual Design is opened. Two steps: pick a gender, then
// pick a specific avatar photo within that gender. Once chosen, it's saved to
// project.defaultAvatarId, which persists the choice server-side — so leaving
// and coming back (even a fresh page load) never re-shows it, same as any
// other already-set project setting. Reopenable anytime after that via the
// "Edit Avatar" button in the Layout & Theme tab's Presenter Avatar card.
const DEFAULT_AVATAR_ID = 'Daisy-inskirt-20220818' // HeyGen's free default avatar — always available
function normGender(raw) {
  const g = (raw || '').toString().toLowerCase()
  if (g.startsWith('m')) return 'male'
  if (g.startsWith('f')) return 'female'
  return null
}

// "Motion Engine" — HeyGen's own avatar_style param.
const MOTION_ENGINES = [
  { id: 'normal',  label: 'Standard',  desc: 'Natural framing & motion' },
  { id: 'closeUp', label: 'Close Up',  desc: 'Tighter, face-forward crop' },
]

const BACKGROUND_PRESETS = [
  { value: '#1E293B', label: 'Slate' },
  { value: '#020C1B', label: 'Midnight' },
  { value: '#3B2F1E', label: 'Espresso' },
  { value: '#1E3A2F', label: 'Forest' },
  { value: '#3B1E2E', label: 'Wine' },
  { value: '#0F1F3D', label: 'Navy' },
]

function safeParseJson(str, fallback) {
  if (!str) return fallback
  try { return { ...fallback, ...JSON.parse(str) } } catch { return fallback }
}

function AvatarGatePopup({ onChoose, onSkip, onClose, voiceGender = null }) {
  // Pre-select the gender to match the chosen voice, so the picker jumps
  // straight to matching avatars (female voice → female presenters, etc.)
  // instead of asking the user to pick a gender the voice already implies.
  const [gender, setGender] = useState(voiceGender) // null | 'male' | 'female'
  const [saving, setSaving] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['heygen-avatars'],
    queryFn:  () => mediaService.listAvatars(),
    staleTime: 30 * 60 * 1000,
    // Without this, react-query evicts the cached list ~5 min after the last
    // component reading it unmounts (its default gcTime) — so leaving this
    // scene for something else and coming back later forced a full re-fetch
    // (visible as the presenter photo blanking out for a moment). Keeping it
    // resident for the whole session means it's only ever fetched once.
    gcTime: 24 * 60 * 60 * 1000,
    initialData: () => mediaService.cachedAvatars(),
    initialDataUpdatedAt: 0,
    retry: 1,
  })
  const avatars = data?.avatars || []
  const filtered = gender ? avatars.filter(a => normGender(a.gender) === gender) : []

  const pick = async (avatarId) => {
    setSaving(true)
    await onChoose(avatarId)
    setSaving(false)
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-6 pt-16">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="relative p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 mx-auto">
            <User className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
          </div>

          {!gender ? (
            <>
              <p className="text-slate-900 dark:text-white font-medium mb-1">Choose your presenter</p>
              <p className="text-slate-500 text-sm mb-5">
                Pick the avatar that presents every scene in this project. You can change it anytime.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setGender('female')}
                  className="p-5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all">
                  <User className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Female</p>
                </button>
                <button onClick={() => setGender('male')}
                  className="p-5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all">
                  <User className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Male</p>
                </button>
              </div>
              <button onClick={onSkip} className="mt-5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                Skip for now — I'll set this up later
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-900 dark:text-white font-medium mb-1 capitalize">Pick a {gender} presenter</p>
              <p className="text-slate-500 text-sm mb-1">
                {voiceGender && gender === voiceGender
                  ? `Matched to your ${voiceGender} voice. Applies to every scene — change it anytime from Layout & Theme.`
                  : 'Applies to every scene — change it anytime from Layout & Theme.'}
              </p>
              {/* Let the user override the voice-matched gender if they really
                  want the opposite (rare, but shouldn't be a dead end). */}
              <button onClick={() => setGender(gender === 'female' ? 'male' : 'female')}
                className="text-xs text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 mb-4 transition-colors">
                Show {gender === 'female' ? 'male' : 'female'} presenters instead
              </button>
              {isLoading || saving ? (
                <div className="py-10 flex justify-center"><Spinner size="sm" /></div>
              ) : (
                <div className="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
                  {gender === 'female' && (
                    <button onClick={() => pick(DEFAULT_AVATAR_ID)}
                      className="relative aspect-square rounded-xl border-2 border-slate-200 dark:border-white/10 hover:border-indigo-400 overflow-hidden flex flex-col items-center justify-center gap-1 bg-slate-100 dark:bg-slate-800/60 transition-colors">
                      <User className="w-6 h-6 text-slate-400" />
                      <span className="text-[10px] text-slate-500">Daisy (default)</span>
                    </button>
                  )}
                  {filtered.map((a, idx) => (
                    <button key={`${a.avatar_id}-${idx}`} onClick={() => pick(a.avatar_id)} title={a.avatar_name}
                      className="relative aspect-square rounded-xl border-2 border-slate-200 dark:border-white/10 hover:border-indigo-400 overflow-hidden transition-colors">
                      {a.preview_image_url
                        ? <img src={a.preview_image_url} className="w-full h-full object-cover" alt={a.avatar_name} />
                        : <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><User className="w-6 h-6 text-slate-400" /></div>}
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5">
                        <span className="text-[9px] text-white truncate block">{a.avatar_name}</span>
                      </div>
                    </button>
                  ))}
                  {!filtered.length && gender !== 'female' && (
                    <p className="col-span-3 text-xs text-slate-400 py-6">
                      No {gender} avatars found in your HeyGen account — use the free default, or pick one later from Layout &amp; Theme → Edit Avatar.
                    </p>
                  )}
                </div>
              )}
              <button onClick={() => setGender(null)} className="mt-4 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                ← Back
              </button>
            </>
          )}

          {onClose && (
            <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg leading-none">×</button>
          )}
        </div>
      </div>
    </div>,
    document.body
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
          <Sparkles className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
        </div>
        <p className="text-slate-900 dark:text-white font-medium mb-1">Choose a theme for this module</p>
        <p className="text-slate-500 text-sm mb-5">
          "{moduleTitle}" — applies to every scene in this module
        </p>
        <div className="space-y-1.5">
          {THEMES.map(th => (
            <button key={th.id} onClick={() => onChoose(th.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded border border-slate-200 dark:border-white/[0.10] hover:border-indigo-400/40 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all text-left"
              style={{ background: th.isDark ? 'transparent' : 'rgba(248,250,252,0.05)' }}>
              <div className="w-3 h-3 rounded-full flex-shrink-0 border border-slate-300 dark:border-white/20" style={{ background: th.accent }} />
              <span className="text-sm font-medium text-slate-900 dark:text-white">{th.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Left: scene group list ───────────────────────────────────────────────────

function SceneGroupList({ script, videoIndex, selectedId, selectedSegmentId, generating, onSelect, onDeleted }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', script.moduleId],
    queryFn:  () => script.moduleId
      ? fetch('/api/modules/' + script.moduleId + '/scenes').then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      : Promise.resolve([]),
    enabled:  !!script.moduleId,
    // Only poll while scene assets are being generated — not forever.
    refetchInterval: (query) =>
      query.state.data?.some?.(s => s.status === 'assets_generating' || s.status === 'rendering') ? 5000 : false,
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
    if (!window.confirm('Delete this scene completely?\n\nIts script, voice, slide design and any generated video are removed — it will not appear in the Script, Voice or Video steps. This cannot be undone.')) return
    try {
      const res = await fetch('/api/scenes/' + sceneId, { method: 'DELETE' })
      if (res.ok) {
        // Refresh scenes AND scripts — the scene is now gone from the module's
        // Script.sections too, so the Script stage must reflect that.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['scenes', script.moduleId] }),
          queryClient.invalidateQueries({ queryKey: ['scenes'] }),
          queryClient.invalidateQueries({ queryKey: ['scripts'] }),
        ])
        onDeleted?.(sceneId)
      }
    } catch {}
  }

  const [resettingSceneId, setResettingSceneId] = useState(null)
  const handleResetSceneDesign = async (e, sceneId) => {
    e.stopPropagation()
    if (!window.confirm('Reset this scene\'s design?\n\nEach of its parts is rebuilt from scratch from its own script (your manual layout tweaks and generated image/video for THIS scene are cleared). Scripts and voices are kept.')) return
    setResettingSceneId(sceneId)
    try {
      await scenesService.resetDesign(sceneId)
      await queryClient.invalidateQueries({ queryKey: ['scenes'] })
    } catch (err) {
      console.error('Failed to reset scene design:', err)
    } finally {
      setResettingSceneId(null)
    }
  }

  const hasSelected = scenes.some(s => s.id === selectedId)
  // Each module is its own collapsible card so the list isn't one long scroll.
  // Default: the module that holds the currently-selected scene (or the first
  // module) starts open, the rest collapsed. After that the toggle is fully
  // manual — even the module you're editing can be collapsed (was previously
  // forced open by hasSelected, so Module 1 could never be closed).
  const [collapsed, setCollapsed] = useState(!hasSelected && videoIndex !== 0)
  const open = !collapsed

  return (
    <div className="mx-2 my-2 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
      <button onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest">Module {videoIndex + 1}</p>
          <p className="text-xs text-slate-900 dark:text-white font-medium truncate mt-0.5">{script.title}</p>
        </div>
      </button>
      {open && (<>
      {isLoading
        ? <div className="py-3 flex justify-center"><Spinner size="sm" /></div>
        // Each narrated part (hook/content/content/recap, or one per quiz
        // question) gets its OWN row here — the client wants the menu itself
        // to be the navigation between parts, not a picker nested inside the
        // editor (see the now-removed "Segments (N)" pill row in the
        // Narration & Motion tab). A scene with just one segment still shows
        // as a single row, same as before.
        // Sequential number shown on every row (hook/content/content/recap
        // each get their own row per #97's flattening, so the numbering
        // counts rows across ALL scenes, not just top-level scenes — that's
        // what actually lines up with what the user sees/clicks in the menu.
        : (() => { let rowNumber = 0; return scenes.flatMap((scene) => {
            const hasAst = !!scene.visualAssetUrl
            // "Generated" means an actual rendered scene video exists — NOT
            // just a saved design snapshot (which now gets written
            // automatically on every save, so it can't stand in for "the user
            // generated this"). Only a real avatarVideoUrl (past the pending
            // `heygen:` sentinel) earns the green ✓.
            const sceneGenerated = !!scene.avatarVideoUrl && !scene.avatarVideoUrl.startsWith('heygen:')
            const isGen  = !!generating[scene.id]
            const parsed = (() => { try { return JSON.parse(scene.slideDeckContent || '{}') } catch { return {} } })()
            const sceneTheme = parsed.theme || 'light'
            const sceneLayoutId = parsed.layout || 'bullets'
            const sceneTitle = parsed.title || 'Untitled slide'
            const rows = (scene.segments && scene.segments.length > 0) ? scene.segments : [null]
            return rows.map((seg, si) => {
              rowNumber += 1
              const displayNumber = rowNumber
              const segDesign = seg ? (() => { try { return JSON.parse(seg.slideDesign || '{}') } catch { return {} } })() : {}
              const rowTitle   = seg ? (segDesign.title || seg.slideTitle || sceneTitle) : sceneTitle
              const rowLayoutId = segDesign.layout || sceneLayoutId
              const th = THEMES.find(t => t.id === (segDesign.theme || sceneTheme)) || THEMES.find(t => t.id === 'light') || THEMES[0]
              const rowReady = seg ? !!seg.visualAssetUrl : hasAst
              // Approval is PER PART — read from this row's own design so the
              // green ✓ shows only on parts the user actually approved, never
              // spilling onto the scene's other parts.
              const rowApproved = seg ? !!segDesign.approvedAt : !!scene.approvedAt
              const isSel = selectedId === scene.id && (seg ? selectedSegmentId === seg.id : !selectedSegmentId)
              return (
                <button key={seg ? seg.id : scene.id} onClick={() => onSelect(scene, scenes.length, seg?.id)}
                  className={`group w-full text-left border-b border-slate-100 dark:border-gray-800 transition-all ${
                    isSel ? 'bg-indigo-500/15 border-l-2 border-l-indigo-500' : 'hover:bg-slate-100 dark:hover:bg-white/[0.02]'
                  }`}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    {/* Sequential number — lines up with what's actually
                        clickable/navigable in this menu (each segment row). */}
                    <span className="w-4 flex-shrink-0 text-center text-[10px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                      {displayNumber}
                    </span>
                    {/* Compact layout swatch — smaller and flatter than the
                        old chunky 3D tile so the menu row reads as a list
                        item, not a stack of big buttons. */}
                    <div className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center relative border border-black/5 dark:border-white/10"
                      style={{ background: `${th.accent}18` }}>
                      <span style={{ color: th.accent, fontSize: 10, fontWeight: 700 }}>
                        {LAYOUTS.find(l=>l.id===rowLayoutId)?.icon||'≡'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{rowTitle}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {rowApproved ? '✓ Approved' : sceneGenerated ? 'Generated' : isGen ? 'Generating...' : rowReady ? 'Designed' : 'Draft'}
                      </p>
                    </div>
                    {isGen && <Loader2 className="w-3 h-3 text-indigo-500 dark:text-indigo-400 animate-spin flex-shrink-0" />}
                    {/* Green ✓ only when THIS part has been APPROVED by the user —
                        that's the signal it's locked for the next steps. Other
                        parts of the same scene are unaffected. */}
                    {rowApproved && !isGen && <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />}
                    {/* Per-scene actions — reset design & delete. Only on the
                        scene's first row so they aren't misread as per-part.
                        Reset rebuilds THIS scene's design from its script. */}
                    {si === 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div onClick={(e) => handleResetSceneDesign(e, scene.id)} title="Reset this scene's design (rebuild from its script)"
                          className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all cursor-pointer">
                          {resettingSceneId === scene.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RotateCcw className="w-3.5 h-3.5" />}
                        </div>
                        <div onClick={(e) => handleDeleteScene(e, scene.id)} title={rows.length > 1 ? 'Delete scene (all parts)' : 'Delete scene'}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-600 hover:text-red-400 transition-all cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              )
            })
          }) })()
      }
      <button onClick={handleAddScene} disabled={adding}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 border-b border-slate-100 dark:border-white/[0.03] transition-colors disabled:opacity-50">
        {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Add scene
      </button>
      </>)}
    </div>
  )
}

// ─── Right: scene editor ──────────────────────────────────────────────────────

function SceneEditor({ scene, moduleId, moduleTitle, totalScenes, defaultTheme = 'light', voiceId, avatarId, avatarStyle, avatarBackground, onSaveAvatarSettings, onEditAvatar, initialSegmentId, isGenerating, onGenerate }) {
  // Fetch the avatar list once (cached project-wide via react-query, so this
  // is instant after the first load — see also CastingSettings
  // which share the same query key) purely to find the selected avatar's
  // preview thumbnail, so the chosen presenter actually shows up in this
  // live slide preview instead of a generic placeholder icon.
  const { data: avatarsRes } = useQuery({
    queryKey: ['heygen-avatars'],
    queryFn: () => mediaService.listAvatars(),
    enabled: !!avatarId,
    staleTime: 10 * 60 * 1000,
    // Same reasoning as AvatarGatePopup's identical query above — keep it
    // cached for the whole session so switching scenes/segments (which
    // remounts this component) never re-shows a blank presenter box while
    // it re-fetches something it already had.
    gcTime: 24 * 60 * 60 * 1000,
    // Paint the last-known avatar list from localStorage instantly on a fresh
    // app launch, then revalidate — so the presenter photo isn't blank for the
    // ~6s the HeyGen fetch takes on a cold reopen.
    initialData: () => mediaService.cachedAvatars(),
    initialDataUpdatedAt: 0,
  })
  const selectedAvatar = avatarsRes?.avatars?.find(a => a.avatar_id === avatarId)
  const avatarImageUrl = selectedAvatar?.preview_image_url || null
  // Needed so a save can refresh the parent scene list's cache — otherwise
  // navigating to another scene and back remounts this editor from the STALE
  // cached scene (its pre-edit design), and the user's work looks reverted to
  // the default layout. See the invalidate call at the end of saveContent.
  const editorQueryClient = useQueryClient()

  // Avatar background / layout / motion-engine — project-level HeyGen render
  // settings (the avatar styling controls). Local state seeded
  // from the project, saved on change via onSaveAvatarSettings.
  const [motionEngine, setMotionEngine] = useState(avatarStyle || 'normal')
  const [avatarBg, setAvatarBg] = useState(() => safeParseJson(avatarBackground, { type: 'color', value: '#1E293B', layout: 'original', radius: 100 }))
  const [avatarSettingsSaving, setAvatarSettingsSaving] = useState(false)
  useEffect(() => {
    setMotionEngine(avatarStyle || 'normal')
    setAvatarBg(safeParseJson(avatarBackground, { type: 'color', value: '#1E293B', layout: 'original', radius: 100 }))
  }, [avatarStyle, avatarBackground])
  const isCircleAvatarBg = avatarBg.layout === 'circle'
  const avatarBgRadiusPx = Math.round(((avatarBg.radius ?? 100) / 100) * 120)
  const saveAvatarSettings = async (nextStyle, nextBg) => {
    if (!onSaveAvatarSettings) return
    setAvatarSettingsSaving(true)
    try {
      await onSaveAvatarSettings({ avatar_style: nextStyle, avatar_background: nextBg })
    } finally {
      setAvatarSettingsSaving(false)
    }
  }
  const parsed = (() => { try { return JSON.parse(scene.slideDeckContent || '{}') } catch { return {} } })()
  // Storyboard-generated key-term overlays (optional — only present for scenes
  // that went through the storyboard agent). Drives the timed text-cue reveal
  // in both this live preview and the rendered video (see ffmpegVideo.ts).
  const textCues = (() => { try { return JSON.parse(scene.textCues || '[]') } catch { return [] } })()

  // Pre-fill bullets from AI-generated slide blocks — never fall back to voice
  // script. A design can hold its content in EITHER `blocks[0].items` (what the
  // editor writes) OR `positionedBlocks` (what the backend seed / reset writes
  // and what the slide actually renders from). Reading only `blocks` meant a
  // freshly-seeded slide showed content on the canvas but the Content Points
  // editor came up empty — so existing points couldn't be EDITED, only new
  // ones added. bulletsFromDesign coalesces both so the editor always loads the
  // real content.
  const initBullets = bulletsFromDesign(parsed)

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
  // Title/content text no longer force-wraps to a second line by default
  // (nowrap — short text stays one line, long text overflows). This lets
  // the user flip that back to normal wrapping per-slide when they'd rather
  // have long text wrap than spill past the box edge.
  const [textWrap,    setTextWrap]    = useState(parsed.textWrap === true)
  // Decorative annotation layers the user can drop on the slide (divider line,
  // highlight box, callout/comment, marker). Because the video render reuses
  // the WYSIWYG snapshot of the slide canvas, these show up in the exported
  // video automatically — no backend render change needed. Each: { id, type,
  // x, y, w, text, color }.
  const [annotations, setAnnotations] = useState(Array.isArray(parsed.annotations) ? parsed.annotations : [])
  const addAnnotation = (type) => {
    const id = `an_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const base = { id, type, x: 34, y: 44, color: themeObj.accent }
    const el =
      type === 'line'      ? { ...base, w: 30, y: 50 }
      : type === 'highlight' ? { ...base, w: 26, h: 8 }
      : type === 'callout'   ? { ...base, w: 22, text: 'Note' }
      : /* marker */          { ...base, text: '★' }
    setAnnotations(a => [...a, el])
    setTimeout(saveContent, 0)
  }
  const updateAnnotation = (id, patch) => setAnnotations(a => a.map(x => x.id === id ? { ...x, ...patch } : x))
  const removeAnnotation = (id) => { setAnnotations(a => a.filter(x => x.id !== id)); setTimeout(saveContent, 0) }
  // Image layer
  const [imageUrl,    setImageUrl]    = useState(parsed.imageUrl    || '')
  const [imageWidth,  setImageWidth]  = useState(parsed.imageWidth  || 36)
  const [imageShape,  setImageShape]  = useState(parsed.imageShape  || 'rounded')
  // Presenter avatar — was a fixed, non-interactive placeholder before; now a
  // real draggable+resizable layer like the others. avatarX/avatarY/avatarWidth
  // are saved straight into the slide design JSON under those exact field
  // names because the render pipeline already reads them (it just never had
  // anything to read, since nothing wrote them until now).
  // Clamp whatever was saved (or the default) through clampAvatarBox — older
  // scenes saved before this bounds fix existed may have an x/y/width
  // combination that would spill past the slide edges otherwise.
  const [avatarWidth, setAvatarWidth] = useState(Math.min(parsed.avatarWidth ?? DEFAULT_AVATAR.width, MAX_AVATAR_WIDTH))
  const [avatarX,     setAvatarX]     = useState(() => clampAvatarBox(parsed.avatarX ?? DEFAULT_AVATAR.x, parsed.avatarY ?? DEFAULT_AVATAR.y, Math.min(parsed.avatarWidth ?? DEFAULT_AVATAR.width, MAX_AVATAR_WIDTH)).x)
  const [avatarY,     setAvatarY]     = useState(() => clampAvatarBox(parsed.avatarX ?? DEFAULT_AVATAR.x, parsed.avatarY ?? DEFAULT_AVATAR.y, Math.min(parsed.avatarWidth ?? DEFAULT_AVATAR.width, MAX_AVATAR_WIDTH)).y)
  const [previewKey,  setPreviewKey]  = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [aiLoading,   setAiLoading]   = useState(false)
  const [aiAction,    setAiAction]    = useState(null)
  // Which control tab is showing — replaces the old single long scrolling
  // stack of sections (Logo/Image/Motion/Content/Layout/Theme/Segments all
  // stacked one after another) with four grouped tabs, so the panel reads as
  // organized categories instead of one big wall of controls.
  const [activeTab,   setActiveTab]   = useState('text')
  // Video Editing tab (folded in from the old standalone stage) — playback +
  // element timing lifted from the embedded timeline so the play preview
  // reveals content points at their set times.
  const [vePlaying,      setVePlaying]      = useState(false)
  const [vePlaybackTime, setVePlaybackTime] = useState(0)
  const [veData,         setVeData]         = useState({ composition: null, elements: [] })
  // The timeline element the user last clicked — the top preview jumps to that
  // moment so the picked point is shown on the slide.
  const [veSelected,     setVeSelected]     = useState(null)
  // "Preview before generate" — shows the freshly generated slide image right
  // here after clicking Generate/Regenerate, instead of the user having to
  // leave Visual Design (e.g. to Video Editing) to find out whether it
  // actually matches what they designed.
  const [generatePreviewUrl, setGeneratePreviewUrl] = useState(null)
  const [generateFailedMsg,  setGenerateFailedMsg]  = useState(null)

  // Segment mini-timeline (#32) — a scene rendered from segments (welcome
  // scene's hook/content/content/interaction/recap, or one "question" segment
  // per quiz question — see schema.prisma's SceneSegment doc comment) shows
  // each segment as its own editable chip instead of one flat script box.
  // Declared before the narration block below because narration playback
  // needs to know which segment is active to play THAT segment's own audio.
  const [segments,        setSegments]        = useState(scene.segments || [])
  const [activeSegmentId, setActiveSegmentId]  = useState(null)
  const [segmentDrafts,   setSegmentDrafts]    = useState({}) // id -> draft text while editing
  const [segmentBusy,     setSegmentBusy]      = useState({}) // id -> 'saving' | 'voicing'
  const [segmentError,    setSegmentError]     = useState({}) // id -> error message

  // Live narration playback (#attractive VD): play the scene's voiceover
  // right on the preview canvas and reveal the script one word at a time,
  // synced to audio progress, instead of dumping the whole caption at once.
  // Each segment (hook/content/content/recap) has its OWN narration text +
  // its OWN ttsAudioUrl (SceneSegment.ttsAudioUrl) — previously this always
  // read scene.ttsAudioUrl/scene.scriptContent regardless of which segment
  // was selected, so every segment's Preview played the same (first/legacy)
  // audio. Resolve the active segment's own audio + text when one is active,
  // falling back to the scene-level fields only for non-segmented scenes.
  const activeSegment = activeSegmentId ? segments.find(s => s.id === activeSegmentId) : null
  // Legacy/back-compat wrinkle: Scene.ttsAudioUrl is a mirror of the FIRST
  // segment's clip (see generateTTS.ts), and some older scenes had their
  // segment row created retroactively without ever backfilling that row's
  // own ttsAudioUrl — so the audio genuinely exists (voice was generated,
  // Scene.ttsAudioUrl has it), it's just not copied onto the segment. Only
  // fall back to the scene-level field for the PRIMARY segment (the only
  // one, or orderIndex 0) — falling back for a later part (2nd/3rd content,
  // recap) would silently play the first segment's audio again, which is
  // the exact bug this was fixed for.
  const isPrimarySegment = !!activeSegment && (segments.length === 1 || activeSegment.orderIndex === 0)
  const narrationAudioUrl = activeSegment
    ? (activeSegment.ttsAudioUrl || (isPrimarySegment ? scene.ttsAudioUrl : null))
    : scene.ttsAudioUrl
  const narrationScriptText = activeSegment ? (activeSegment.text || '') : (scene.scriptContent || '')
  const narrationAudioRef = useRef(null)
  const [narrationPlaying,  setNarrationPlaying]  = useState(false)
  const [narrationProgress, setNarrationProgress] = useState(0) // 0..1
  const scriptWords = narrationScriptText.trim() ? narrationScriptText.trim().split(/\s+/) : []
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
    if (!audio || !narrationAudioUrl) return
    if (narrationPlaying) {
      audio.pause()
      setNarrationPlaying(false)
    } else {
      audio.currentTime = 0
      setNarrationProgress(0)
      audio.play()
      setNarrationPlaying(true)
      // Restart the slide's entrance animations in lockstep with narration —
      // this used to be a separate "Replay animations" icon; folded in here
      // so a single Preview button plays both together.
      setPreviewKey(k => k + 1)
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
  }, [narrationAudioUrl])

  // Switching which segment is active (clicking a different row in the
  // menu) must stop any in-flight playback for the PREVIOUS segment's audio
  // — otherwise the old <audio> element keeps playing while the UI now
  // points at a different segment's script/captions.
  useEffect(() => {
    const audio = narrationAudioRef.current
    if (audio) audio.pause()
    setNarrationPlaying(false)
    setNarrationProgress(0)
  }, [activeSegmentId])

  // Speaking avatar video (#5) — renders this scene's slide(s) + narration
  // into one video with the project's chosen HeyGen avatar lip-synced to the
  // voice. Starts from whatever the scene already has (including a pending
  // 'heygen:<id>' sentinel left by a job that was still rendering last time
  // this scene was open — resumed via the effect below instead of silently
  // treated as "no video yet", which would submit a duplicate job).
  const [avatarVideoUrl,  setAvatarVideoUrl]  = useState(scene.avatarVideoUrl || null)
  // Approval lock — PER SEGMENT/part (stored on each part's own slideDesign),
  // so approving one part never spills onto the scene's other parts. When set,
  // that part's green ✓ shows in the menu and it's frozen for the next steps
  // (won't be regenerated). Cleared on any edit. Kept in sync with the active
  // part by loadDesignIntoState.
  const [approvedAt, setApprovedAt] = useState(parsed.approvedAt || null)
  const [approving, setApproving] = useState(false)
  const [avatarGenerating, setAvatarGenerating] = useState(false)
  const [avatarGenError,  setAvatarGenError]  = useState(null)
  // A render can "succeed" (video_url comes back, status completed) while
  // the avatar overlay itself silently failed and the backend fell back to
  // a voice-only clip — previously that had NO visible signal anywhere, so
  // the user just got a video with no avatar and no idea why (reported as
  // "no avatar in the vd"). The backend now returns avatar_warning in that
  // case; surface it here as a dismissible note instead of pretending the
  // render came out exactly as requested.
  const [avatarWarning,  setAvatarWarning]    = useState(null)
  const [showAvatarVideoModal, setShowAvatarVideoModal] = useState(false)
  // Tracks whether the design has been edited (position dragged, theme
  // changed, content edited, etc. — anything that goes through saveContent)
  // SINCE the current avatarVideoUrl was rendered. The rendered video never
  // auto-updates on its own; without this, clicking Preview after making
  // edits silently plays a video that no longer matches what's on the
  // canvas, which is exactly the "click play, it's not the same" bug.
  // Session-local only (resets on reload) since there's no cheap way to
  // compare against a persisted render timestamp.
  const [designDirtySinceVideo, setDesignDirtySinceVideo] = useState(false)
  const avatarPollTimeoutRef = useRef(null)
  const avatarResumeAttemptedRef = useRef(false)
  // Set right before an explicit generate/regenerate triggered by the Play
  // button, so the video modal opens itself automatically once the render
  // finishes — click once, wait, watch, no second click needed. NOT set by
  // the background resume-on-mount poll below, so reopening a scene that's
  // still rendering from a previous visit doesn't unexpectedly pop a modal
  // the user never asked for just now.
  const autoOpenVideoModalRef = useRef(false)
  const hasRealAvatarVideo = !!avatarVideoUrl && !avatarVideoUrl.startsWith('heygen:')

  const originalBulletsRef = useRef(initBullets)
  const fileInputRef        = useRef(null)

  // Last known-good WYSIWYG snapshot for whichever segment is currently
  // active — see saveContent below. captureSlideSnapshot can fail (most
  // likely when the presenter avatar photo is on the canvas: it's an <img>
  // hotlinked straight to HeyGen's external CDN with no CORS guarantee,
  // which taints the canvas html-to-image draws from). Without this ref, a
  // single failed capture would silently erase a previously-successful
  // snapshot, permanently downgrading this segment's rendered video to the
  // much more basic server-side SVG fallback — reported as "the vd just
  // shows the default design."
  const lastRenderedSlideUrlRef = useRef(parsed.renderedSlideUrl || null)
  // Per-segment edit history for "Undo" (go back to a previous edit). Each
  // saved design snapshot is pushed here; undo pops one and restores it.
  const undoStackRef = useRef([])
  const baselineDesignRef = useRef(null)  // last-persisted design JSON
  const undoingRef = useRef(false)
  const [canUndo, setCanUndo] = useState(false)

  // Always-fresh ref so async callbacks see latest state
  const stateRef = useRef({})
  useEffect(() => {
    stateRef.current = { title, subtitle, layout, theme, bullets, positions, showLogo, motionId: motion.id, imageUrl, imageWidth, imageShape, textWrap, avatarX, avatarY, avatarWidth, annotations }
  })

  const themeObj = THEMES.find(t => t.id === theme) || THEMES[0]

  // WYSIWYG snapshot (#39) — capture the EXACT slide the user sees in the
  // editor as a 1920×1080 PNG and upload it. The video renderer uses this
  // image directly, so the video is pixel-identical to the editor. Editing
  // chrome (drag rings/labels, avatar placeholder, timed cue overlay) is
  // filtered out of the capture.
  const captureSlideSnapshot = async () => {
    try {
      const node = document.querySelector('[data-slide-canvas]')
      if (!node) return null
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(node, {
        // html-to-image multiplies canvasWidth × pixelRatio — keep ratio at 1
        // so the output is EXACTLY 1920×1080 (odd dimensions break libx264)
        canvasWidth: 1920,
        canvasHeight: 1080,
        pixelRatio: 1,
        // Skip webfont embedding — the slide uses system fonts, and font
        // collection is by far the slowest part of the capture
        skipFonts: true,
        // Square off the editor's rounded corners so the video has no
        // transparent corner notches
        style: { borderRadius: '0', border: 'none' },
        filter: (el) => {
          const cls = el.classList
          if (!cls) return true
          return !(
            cls.contains('pa-avatar-zone') ||
            cls.contains('pa-cue-layer')   ||
            cls.contains('pa-drag-label')  ||
            cls.contains('pa-drag-ring')
          )
        },
      })
      const blob = await (await fetch(dataUrl)).blob()
      const formData = new FormData()
      formData.append('file', new File([blob], 'slide-snapshot.png', { type: 'image/png' }))
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) return null
      const data = await res.json()
      return data.file_url || data.url || null
    } catch (err) {
      console.warn('[VisualDesigner] Slide snapshot failed, video will use fallback renderer:', err)
      return null
    }
  }

  const saveContent = async (opts = {}) => {
    const s = stateRef.current
    setSaving(true)
    // Approval is PER PART, saved on this part's own design. Approving keeps
    // the flag; any ordinary edit-save (no approve flag) drops it — so editing
    // an approved part un-approves it, and other parts are never touched.
    const nextApprovedAt = opts.approve ? new Date().toISOString() : null
    // Every save is a design edit — if a speaking avatar video already
    // exists, it was rendered from whatever the design looked like BEFORE
    // this save, so it's now out of date. Flip the flag the Preview button
    // checks so it regenerates instead of silently showing stale content.
    if (hasRealAvatarVideo) setDesignDirtySinceVideo(true)
    // Snapshot what's on screen RIGHT NOW — this is what the video will show.
    // If it fails, fall back to the last snapshot that DID succeed instead of
    // saving no snapshot at all — see lastRenderedSlideUrlRef above for why.
    const capturedSlideUrl = await captureSlideSnapshot()
    const renderedSlideUrl = capturedSlideUrl || lastRenderedSlideUrlRef.current
    if (capturedSlideUrl) lastRenderedSlideUrlRef.current = capturedSlideUrl
    else if (!capturedSlideUrl) {
      console.warn('[VisualDesigner] Slide snapshot capture failed — reusing last known-good snapshot instead of falling back to the generic renderer.')
    }
    const designJson = JSON.stringify({
      title: s.title, subtitle: s.subtitle, layout: s.layout, theme: s.theme,
      blocks: [{ type: 'bullets', items: s.bullets }],
      positions: s.positions, showLogo: s.showLogo,
      imageUrl: s.imageUrl, imageWidth: s.imageWidth, imageShape: s.imageShape,
      textWrap: s.textWrap,
      motionId: s.motionId,
      // Presenter avatar box — CENTER x/y + width, % of slide. These exact
      // field names are what api/src/lib/ffmpegVideo.ts's extractAvatarPosition
      // reads to place the real HeyGen avatar video overlay, so saving them
      // here is what makes the drag/resize in the editor actually affect the
      // rendered video instead of just being a local-only preview tweak.
      avatarX: s.avatarX, avatarY: s.avatarY, avatarWidth: s.avatarWidth,
      annotations: s.annotations || [],
      ...(renderedSlideUrl ? { renderedSlideUrl } : {}),
      ...(nextApprovedAt ? { approvedAt: nextApprovedAt } : {}),
    })
    // Push the PREVIOUS persisted design onto the undo stack so "Undo" can step
    // back to it. Skip while an undo itself is applying, and skip no-op saves.
    if (!undoingRef.current && baselineDesignRef.current && baselineDesignRef.current !== designJson) {
      undoStackRef.current.push(baselineDesignRef.current)
      if (undoStackRef.current.length > 40) undoStackRef.current.shift()
      setCanUndo(true)
    }
    baselineDesignRef.current = designJson
    // The WYSIWYG snapshot IS the finished slide image, so save it straight to
    // visualAssetUrl too — this marks the scene "ready" the moment it's
    // designed, with no separate/slow "generate slide image" step. Only set it
    // when we actually have a snapshot (fresh or last-good); never blank a
    // previously-ready asset just because one capture failed.
    const readyAssetUrl = renderedSlideUrl || null
    // ALWAYS save to a specific segment when this scene has any. Falling
    // through to the scene-level `slide_deck_content` below writes a field
    // that EVERY segment falls back to when its own slideDesign is thin — so
    // one part's edit would surface on all its siblings ("3 first scenes …
    // the same design, if I change one it changes all of them"). activeSegmentId
    // can legitimately be null for a moment on mount (the segment-select effect
    // hasn't run yet), which is exactly when an early auto-save would corrupt
    // the shared field. Resolve the primary segment in that window instead.
    const targetSegmentId = activeSegmentId
      || (segments.length
            ? (segments.find(sg => sg.orderIndex === 0) || segments[0]).id
            : null)
    // Only the scene's FIRST part mirrors onto scene-level fields.
    const targetIsPrimary = segments.length
      ? targetSegmentId === (segments.find(sg => sg.orderIndex === 0) || segments[0]).id
      : true
    try {
      if (targetSegmentId) {
        // Per-segment design (#38) — saved on the segment itself, NOT on the
        // shared scene.slideDeckContent, so this segment's slide stays its
        // own ("keep it in her own vd not with other vd").
        await agentsService.updateSceneSegment(targetSegmentId, {
          slide_design: designJson,
          ...(readyAssetUrl ? { visual_asset_url: readyAssetUrl } : {}),
        })
        // Keep the LOCAL segments list in sync with what was just saved —
        // otherwise clicking back to this segment reloads the stale design
        // from mount time and the user's edits appear lost (and the next
        // auto-save overwrites the real design with the stale one).
        setSegments(prev => prev.map(seg =>
          seg.id === targetSegmentId ? { ...seg, slideDesign: designJson, ...(readyAssetUrl ? { visualAssetUrl: readyAssetUrl } : {}) } : seg
        ))
        await fetch('/api/scenes/' + scene.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text_animation_type: s.motionId,
            // Mirror the primary (first) segment's snapshot onto the scene-level
            // visualAssetUrl too — that's the field Video Editing's module gate
            // and storyboard read directly.
            ...(readyAssetUrl && targetIsPrimary ? { visual_asset_url: readyAssetUrl } : {}),
            // Editing a GENERATED scene invalidates its rendered video, so drop
            // it → the menu's green ✓ clears until the user regenerates. Only
            // when a real (non-pending) video exists, so an in-flight render's
            // heygen: sentinel isn't clobbered.
            ...(hasRealAvatarVideo ? { avatar_video_url: null } : {}),
            // Mirror approval onto the scene ONLY when it's a single-part scene
            // (the part IS the scene). Multi-part scenes keep approval purely
            // per-part so approving one part never marks the others.
            ...(targetIsPrimary && segments.length <= 1 ? { approved_at: nextApprovedAt } : {}),
          }),
        })
      } else {
        await fetch('/api/scenes/' + scene.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slide_deck_content: designJson,
            text_animation_type: s.motionId,
            ...(readyAssetUrl ? { visual_asset_url: readyAssetUrl } : {}),
            ...(hasRealAvatarVideo ? { avatar_video_url: null } : {}),
            approved_at: nextApprovedAt,
          }),
        })
      }
      // Reflect the invalidation locally so the editor's own "generated" state
      // (and the rewatch button) updates immediately, not just after refetch.
      if (hasRealAvatarVideo) setAvatarVideoUrl(null)
      // The menu tick reads each part's own slideDesign (kept in step by the
      // setSegments call above), so approving/un-approving shows immediately.
      setApprovedAt(nextApprovedAt)
      // Refresh the scene-list query cache so the freshly-saved design is what
      // the parent hands back when this scene is re-selected later — without
      // this the remount reads the stale pre-edit scene and the design snaps
      // back to the default position ("go back can't see my design").
      if (moduleId) editorQueryClient.invalidateQueries({ queryKey: ['scenes', moduleId] })
    } catch {}
    finally { setSaving(false) }
  }

  // Approve / lock THIS part. Saves the current design with the approval flag
  // (so what's locked is exactly what's on screen) — green ✓ on this part's row
  // in the menu, frozen for the next steps. Toggling again un-approves it. Only
  // this part is affected; siblings keep their own approval state.
  const handleApprove = async () => {
    if (approving) return
    setApproving(true)
    try {
      await saveContent({ approve: !approvedAt })
    } catch (e) {
      console.error('Approve failed', e)
    } finally {
      setApproving(false)
    }
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

  // Waits for a freshly-set image URL to actually finish loading in the
  // browser before letting the caller proceed to saveContent/snapshot. A
  // bare setTimeout(saveContent, 50) fires WAY before a fresh network image
  // (just generated/uploaded, never cached) has actually downloaded — the
  // WYSIWYG snapshot captured at that point embeds a still-loading/broken
  // image instead of the real one, so the saved design (and thus the
  // rendered video) ends up missing exactly the custom image the user just
  // added — the "vd shows the default design" symptom. Resolves either way
  // (including on error) so a broken image URL can't hang the save forever.
  const waitForImageLoad = (url, timeoutMs = 8000) => new Promise((resolve) => {
    if (!url) { resolve(); return }
    const img = new window.Image()
    const done = () => resolve()
    img.onload = done
    img.onerror = done
    setTimeout(done, timeoutMs)
    img.src = url
  })

  // File → upload to server and get /api/uploads/... URL
  // ── AI image generation ───────────────────────────────────────────────
  // Describe an image and have it generated, as an alternative to uploading
  // one. Diagram-style types are asked for on a flat magenta backdrop which
  // the server keys out to real transparency (see api/src/lib/chromaKey.ts),
  // because the model can't emit a true alpha channel — asking it for a
  // "transparent background" just makes it draw a checkerboard.
  const [genPrompt,    setGenPrompt]    = useState('')
  const [genImageType, setGenImageType] = useState('illustration')
  const [genLoading,   setGenLoading]   = useState(false)
  const [genError,     setGenError]     = useState(null)

  const handleGenerateImage = async () => {
    const prompt = genPrompt.trim()
    if (!prompt || genLoading) return
    setGenLoading(true); setGenError(null)
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageType: genImageType }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Image generation failed')
      const url = data.file_url || data.url
      if (!url) throw new Error('No image was returned')
      setImageUrl(url)
      // Wait for the fresh URL to actually load before snapshotting, or the
      // WYSIWYG capture embeds a still-loading image.
      await waitForImageLoad(url)
      saveContent()
    } catch (err) {
      setGenError(err?.message || 'Image generation failed')
    } finally {
      setGenLoading(false)
    }
  }

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
        // BUGFIX: /api/upload returns { file_url }, not { url } — this was why
        // uploaded images never stuck to the design
        const uploadedUrl = data.file_url || data.url || ''
        setImageUrl(uploadedUrl)
        await waitForImageLoad(uploadedUrl)
        saveContent()
      }
    } catch (err) {
      console.error('Image upload failed:', err)
    }
    e.target.value = ''  // allow re-upload of same file
  }

  const handlePositionChange = (key, newPos) => {
    // Avatar isn't a member of `positions` — it's saved as its own top-level
    // avatarX/avatarY/avatarWidth (see saveContent) because that's the exact
    // shape api/src/lib/ffmpegVideo.ts's extractAvatarPosition expects.
    if (key === 'avatar') {
      if (newPos.x !== undefined) setAvatarX(newPos.x)
      if (newPos.y !== undefined) setAvatarY(newPos.y)
      if (newPos.width !== undefined) setAvatarWidth(newPos.width)
      return
    }
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

  const handleGenerate = async () => {
    await saveContent()
    setGenerateFailedMsg(null)
    try {
      const result = await onGenerate(scene.id, activeSegmentId)
      if (result?.visual_asset_url) setGeneratePreviewUrl(result.visual_asset_url)
    } catch (e) {
      setGenerateFailedMsg(e?.message || 'Slide generation failed')
    }
  }

  // Rebuild the ENTIRE slide content (title + key insight + content points)
  // from the voice script, so what students read matches what they hear.
  // For segmented scenes uses the active segment's script text.
  const handleRebuildFromScript = async () => {
    setAiLoading(true); setAiAction('rebuild')
    try {
      const scriptText = activeSegmentId
        ? (segmentDrafts[activeSegmentId] ?? segments.find(s => s.id === activeSegmentId)?.text ?? '')
        : (scene.scriptContent || '')
      const res = await fetch('/api/scenes/' + scene.id + '/rebuild-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_text: scriptText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Rebuild failed')
      setTitle(data.title || '')
      setSubtitle(data.subtitle || '')
      if (data.bullets?.length) {
        const bulletsClean = data.bullets.map(b => ({ text: b.text || '', level: b.level === 2 ? 2 : 1 }))
        setBullets(bulletsClean)
        originalBulletsRef.current = bulletsClean
      }
      setTimeout(saveContent, 50)
    } catch (e) {
      console.error('Rebuild from script failed:', e)
      alert(e.message || 'Rebuild from script failed')
    } finally {
      setAiLoading(false); setAiAction(null)
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
  // nothing the script generator already producess gets lost . 
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
    setBullets(bulletsFromDesign(design))
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
    setTextWrap(design.textWrap === true)
    setAnnotations(Array.isArray(design.annotations) ? design.annotations : [])
    {
      const w = Math.min(design.avatarWidth ?? DEFAULT_AVATAR.width, MAX_AVATAR_WIDTH)
      const { x, y } = clampAvatarBox(design.avatarX ?? DEFAULT_AVATAR.x, design.avatarY ?? DEFAULT_AVATAR.y, w)
      setAvatarX(x); setAvatarY(y); setAvatarWidth(w)
    }
    // Restore motion type from saved design
    if (design.motionId) {
      const motionObj = MOTION_STYLES.find(m => m.id === design.motionId)
      if (motionObj) setMotion(motionObj)
    }
    // This design's own last-known-good snapshot (if any) — otherwise a
    // capture failure right after switching segments would fall back to
    // whichever OTHER segment's snapshot happened to be in the ref, rather
    // than this segment's own (or none, correctly, if it never had one).
    lastRenderedSlideUrlRef.current = design.renderedSlideUrl || null
    // Reflect THIS part's own approval state on the Approve button.
    setApprovedAt(design.approvedAt || null)
    // Switching to a different design starts a fresh undo history for it —
    // but NOT when an undo is what triggered this load.
    if (!undoingRef.current) {
      undoStackRef.current = []
      baselineDesignRef.current = null
      setCanUndo(false)
    }
  }

  // Go back to the previous edit — pop the last design off the undo stack,
  // persist it directly (avoids the setState→save timing gap), and refresh the
  // editor to show it.
  const handleUndo = async () => {
    const prev = undoStackRef.current.pop()
    if (!prev) { setCanUndo(false); return }
    undoingRef.current = true
    try {
      const targetSegmentId = activeSegmentId
        || (segments.length ? (segments.find(sg => sg.orderIndex === 0) || segments[0]).id : null)
      if (targetSegmentId) {
        await agentsService.updateSceneSegment(targetSegmentId, { slide_design: prev })
        setSegments(prevSegs => prevSegs.map(seg => seg.id === targetSegmentId ? { ...seg, slideDesign: prev } : seg))
      } else {
        await fetch('/api/scenes/' + scene.id, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slide_deck_content: prev }),
        })
      }
      loadDesignIntoState(JSON.parse(prev))   // undoingRef guards the history reset
      baselineDesignRef.current = prev
      if (moduleId) editorQueryClient.invalidateQueries({ queryKey: ['scenes', moduleId] })
    } catch (e) {
      console.error('Undo failed:', e)
    } finally {
      undoingRef.current = false
      setCanUndo(undoStackRef.current.length > 0)
      setPreviewKey(k => k + 1)
    }
  }

  // Which segment is "active" is now driven from OUTSIDE this component —
  // each part (hook/content/content/recap) is its own row in the left menu
  // (see SceneGroupList), so clicking a different row re-runs this with a
  // new initialSegmentId even while scene.id stays the same. Falls back to
  // the first segment on initial mount / if the requested one isn't found.
  useEffect(() => {
    if (!segments.length) return
    const wanted = (initialSegmentId && segments.some(s => s.id === initialSegmentId))
      ? initialSegmentId
      : segments[0].id
    if (wanted === activeSegmentId) return
    const switchTo = async () => {
      // Persist whatever's on the canvas for the segment we're leaving
      // before loading the new one's design, same as the old pill-click did.
      if (activeSegmentId) await saveContent()
      const target = segments.find(s => s.id === wanted)
      setActiveSegmentId(wanted)
      loadDesignIntoState(getSegmentDesign(target))
      setSegmentDrafts(prev => prev[wanted] !== undefined ? prev : { ...prev, [wanted]: target?.text || '' })
    }
    switchTo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, initialSegmentId, segments.length])

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
      // apiClient's response interceptor already unwraps axios's `res.data` to
      // return the JSON body directly (see src/api/apiClient.js) — `res` here
      // IS that body, so `res.data.segments` was always undefined and this
      // never actually picked up the fresh audio URL, even though the backend
      // had regenerated it fine. That's the "Regenerate Voice not working"
      // bug: the button worked server-side, its result was just thrown away.
      const url = res?.segments?.[0]?.tts_audio_url
      setSegments(prev => prev.map(s => s.id === id ? { ...s, ttsAudioUrl: url || s.ttsAudioUrl } : s))
    } catch (e) {
      setSegmentError(prev => ({ ...prev, [id]: e?.message || 'Voice regeneration failed' }))
    } finally {
      setSegmentBusy(prev => { const next = { ...prev }; delete next[id]; return next })
    }
  }

  // ── Speaking avatar video ──────────────────────────────────────────────────
  // Renders this scene into one video (slide(s) + narration) with the
  // project's chosen HeyGen avatar lip-synced to the voice. The backend job
  // is async: generateHeyGenAvatar either finishes immediately (voice-only,
  // or the avatar clip was already cached) or returns a video_id to poll.
  const pollAvatarVideo = useCallback((videoId, attempt = 0) => {
    if (attempt > 180) { // ~15 minutes at 5s intervals
      setAvatarGenerating(false)
      setAvatarGenError('Video generation timed out — try again in a few minutes.')
      return
    }
    agentsService.pollHeyGen(videoId, scene.id).then((status) => {
      if (status?.status === 'failed') {
        setAvatarGenerating(false)
        setAvatarGenError('HeyGen reported the render failed — try again.')
        return
      }
      if (!status?.completed) {
        avatarPollTimeoutRef.current = setTimeout(() => pollAvatarVideo(videoId, attempt + 1), 5000)
        return
      }
      setAvatarGenerating(false)
      setAvatarVideoUrl(status.video_url)
      setAvatarWarning(status.avatar_warning || null)
      // Fresh render — it now matches whatever the design looked like when
      // this job was submitted, so clear the staleness flag.
      setDesignDirtySinceVideo(false)
      // If this render was kicked off by clicking Play, open the result
      // automatically — one click, no need to click Play again just to
      // watch what it just finished generating.
      if (autoOpenVideoModalRef.current) {
        autoOpenVideoModalRef.current = false
        setShowAvatarVideoModal(true)
      }
    }).catch((e) => {
      setAvatarGenerating(false)
      setAvatarGenError(e?.message || 'Failed while checking render status')
      autoOpenVideoModalRef.current = false
    })
  }, [scene.id])

  const handleGenerateAvatarVideo = useCallback(async () => {
    // Same legacy-data wrinkle as narrationAudioUrl above: a segment's OWN
    // ttsAudioUrl can be null even though voice was genuinely generated, if
    // its row was created retroactively and only Scene.ttsAudioUrl (which
    // mirrors the first segment) ever got backfilled. Checking
    // segment.ttsAudioUrl alone here was blocking real, already-voiced
    // scenes with "Generate voice audio first" — resolve each segment's
    // audio the same way before deciding anything is actually missing.
    // Visual Design renders ONE part at a time (each menu row is its own
    // scene here), so only that part's audio needs to exist — requiring every
    // sibling's audio blocked rendering a part that was perfectly ready.
    const missingAudio = activeSegment
      ? !(activeSegment.ttsAudioUrl || (isPrimarySegment ? scene.ttsAudioUrl : null))
      : (segments.length
          ? segments.some((s, i) => !(s.ttsAudioUrl || ((i === 0 || segments.length === 1) ? scene.ttsAudioUrl : null)))
          : !scene.ttsAudioUrl)
    if (missingAudio) {
      setAvatarGenError('Generate voice audio for this scene first (Voice stage) before rendering the speaking avatar.')
      return
    }
    autoOpenVideoModalRef.current = true
    setAvatarGenerating(true)
    setAvatarGenError(null)
    setAvatarWarning(null)
    try {
      // Always persist the latest on-screen design FIRST — otherwise a very
      // recent edit (drag, theme change, text tweak) hasn't hit the DB yet
      // and HeyGen/ffmpeg would render from stale data, reproducing the
      // "regenerate still doesn't match my design" bug.
      await saveContent()
      // activeSegmentId scopes this to the single part being designed.
      const result = await agentsService.runHeyGenAvatar(scene.id, avatarId, voiceId, true, activeSegmentId)
      if (result?.video_id) {
        pollAvatarVideo(result.video_id, 0)
      } else if (result?.video_url) {
        setAvatarGenerating(false)
        setAvatarVideoUrl(result.video_url)
        setAvatarWarning(result.avatar_warning || null)
        setDesignDirtySinceVideo(false)
        if (autoOpenVideoModalRef.current) {
          autoOpenVideoModalRef.current = false
          setShowAvatarVideoModal(true)
        }
      } else {
        throw new Error('No video job was started')
      }
    } catch (e) {
      setAvatarGenerating(false)
      setAvatarGenError(e?.message || 'Failed to start avatar video generation')
      autoOpenVideoModalRef.current = false
    }
    // activeSegmentId / activeSegment / isPrimarySegment are read above to
    // scope the render to the part being designed — without them here the
    // callback would close over a stale segment and render the wrong one.
  }, [scene.id, scene.ttsAudioUrl, segments, avatarId, voiceId, pollAvatarVideo,
      activeSegmentId, activeSegment, isPrimarySegment])

  // Resume polling on mount if this scene was left mid-render — CanvasEditor-
  // style components remount per scene, so local state alone can't remember
  // "a job is already in flight"; the server-side 'heygen:<id>' sentinel can.
  // Without this, revisiting a rendering scene would submit a duplicate job.
  useEffect(() => {
    if (avatarResumeAttemptedRef.current) return
    avatarResumeAttemptedRef.current = true
    if (scene.avatarVideoUrl?.startsWith('heygen:')) {
      setAvatarGenerating(true)
      pollAvatarVideo(scene.avatarVideoUrl.slice('heygen:'.length), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    if (avatarPollTimeoutRef.current) clearTimeout(avatarPollTimeoutRef.current)
  }, [])

  // Whether THIS slide (the active segment's, or the scene's own if there
  // are no segments) already has a rendered AI image — drives the Generate
  // vs. Regenerate button below.
  const hasVisualAsset = activeSegment ? !!activeSegment.visualAssetUrl : !!scene.visualAssetUrl

  // Four grouped tabs replace the old single long scrolling stack of
  // sections (Logo/Image/Motion/Content/Layout/Theme/Segments one after
  // another) — same underlying state/handlers, just organized so the panel
  // reads as clear categories instead of one big wall of controls.
  const tabs = [
    { id: 'text',       label: 'Type & Content',    icon: Type },
    { id: 'aesthetics', label: 'Layout & Theme',    icon: LayoutGrid },
    { id: 'media',      label: 'AI Media & Upload', icon: Image },
    { id: 'avatar',     label: 'Avatar',            icon: User },
    { id: 'motion',     label: 'Narration & Motion',icon: Sliders },
    { id: 'videoedit',  label: 'Video Editing',     icon: Video },
  ]

  // The design currently on the canvas, in the shape SlidePlaybackPreview reads
  // — so the Video Editing tab's play preview is the SAME design being edited.
  const liveDesign = {
    title, subtitle, layout, theme,
    blocks: [{ type: 'bullets', items: bullets }],
    positions, showLogo, imageUrl, imageWidth, imageShape, textWrap,
    motionId: motion.id, avatarX, avatarY, avatarWidth,
    annotations: annotations || [],
  }
  // The preview acts as the play surface when PLAYING, or when a timeline point
  // is SELECTED (jump to that point's moment). Which time drives the reveal:
  const vePreviewActive = activeTab === 'videoedit' && (vePlaying || !!veSelected)
  const vePreviewTime = vePlaying ? vePlaybackTime : (veSelected?.startTime ?? 0)
  // How many content points should be visible at that time.
  const veRevealCount = vePreviewActive
    ? (veData.elements || []).filter(e => e.type === 'content' && (e.startTime ?? 0) <= vePreviewTime).length
    : null

  return (
    <div className="p-6 w-full max-w-6xl mx-auto pa-page-enter space-y-5">
      {/* ── LIVE DRAGGABLE PREVIEW ───────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3 text-[10px] font-mono text-slate-400 dark:text-slate-500 tracking-wider">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${narrationPlaying ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span>{narrationPlaying ? 'PLAYING NARRATION' : 'PREVIEW'}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Preview + Reset controls — moved OUT of the slide canvas
                entirely (this toolbar row sits above it, not overlaid on top
                of it) so they never sit on top of the slide's own content
                (the GVSU logo, avatar, text, etc.) no matter where those are
                positioned or dragged to. */}
            <div className="flex items-center gap-1.5 normal-case tracking-normal">
              {/* Preview design — silent, fast: just replays the slide's own
                  entrance animations in sync with the narration audio. Split
                  back out from the speaking-avatar button below since they're
                  different-weight actions (instant vs. a multi-minute render)
                  and combining them made it unclear which one a click would
                  trigger. */}
              {narrationAudioUrl && (
                <button onClick={toggleNarration}
                  title={narrationPlaying ? 'Stop preview' : 'Preview: play narration with synced captions + animations'}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    narrationPlaying ? 'bg-red-500/15 text-red-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400'}`}>
                  {narrationPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3.5 h-3.5" />}
                </button>
              )}
              {/* Speaking avatar video — watches the last render, regenerates
                  it if the design changed since, or generates the first one.
                  Disabled until a presenter avatar is chosen (Avatar tab). */}
              {(scene.ttsAudioUrl || hasRealAvatarVideo) && (
                <button
                  disabled={avatarGenerating || (!avatarId && !hasRealAvatarVideo)}
                  onClick={() => {
                    if (avatarGenerating) return
                    if (hasRealAvatarVideo) {
                      // The rendered video only ever reflects the design as
                      // it was at the moment it was generated. If anything
                      // has been dragged/edited since (position, theme,
                      // content, avatar), that video is stale — regenerate
                      // instead of silently playing something that no longer
                      // matches what's on the canvas. This is the fix for
                      // "I click play and it's not the same as what I built."
                      if (designDirtySinceVideo) { handleGenerateAvatarVideo(); return }
                      setShowAvatarVideoModal(true)
                      return
                    }
                    if (avatarId) handleGenerateAvatarVideo()
                  }}
                  title={
                    avatarGenerating ? 'Generating speaking avatar video — this can take a few minutes…'
                    : avatarGenError ? `Speaking avatar video failed: ${avatarGenError}`
                    : hasRealAvatarVideo && designDirtySinceVideo ? 'Your design changed since this video was rendered — click to regenerate it'
                    : hasRealAvatarVideo ? 'Watch speaking avatar video'
                    : avatarId ? 'Generate speaking avatar video — lip-synced to your narration'
                    : 'Choose a presenter avatar first (Avatar tab)'
                  }
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                    avatarGenError
                      ? 'bg-red-500/15 text-red-500'
                      : hasRealAvatarVideo && designDirtySinceVideo
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400'}`}>
                  {avatarGenerating
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : avatarGenError
                    ? <AlertCircle className="w-3.5 h-3.5" />
                    : hasRealAvatarVideo && designDirtySinceVideo
                    ? <RotateCcw className="w-3.5 h-3.5" />
                    : hasRealAvatarVideo
                    ? <Video className="w-3.5 h-3.5" />
                    : <Sparkles className="w-3.5 h-3.5" />}
                </button>
              )}
              {/* The old "Generate slide image" button was removed — the
                  editor now captures a pixel-perfect WYSIWYG snapshot on every
                  save (see saveContent) and writes it straight to
                  visualAssetUrl, so the slide is "ready" the moment it's
                  designed. No separate, slow generate step to click. */}
              {/* Undo — go back to the previous edit of this slide. */}
              <button onClick={handleUndo} disabled={!canUndo}
                title={canUndo ? 'Undo — go back to the previous edit' : 'Nothing to undo'}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => {
                  setPositions(DEFAULT_POSITIONS[layout]||DEFAULT_POSITIONS.bullets)
                  setAvatarX(DEFAULT_AVATAR.x); setAvatarY(DEFAULT_AVATAR.y); setAvatarWidth(DEFAULT_AVATAR.width)
                  saveContent()
                }}
                title="Reset element positions (including the avatar) to layout defaults"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center transition-colors">
                <Move className="w-3.5 h-3.5" />
              </button>
              {/* Approve / lock this scene. When the slide (+ avatar) looks
                  right, the user approves it — green ✓ in the menu, frozen for
                  the next steps, no need to regenerate. Click again to reopen. */}
              <button onClick={handleApprove} disabled={approving}
                title={approvedAt
                  ? 'Approved — locked for the next steps. Click to reopen for editing.'
                  : 'Approve this scene — locks the design so it stays as-is and won\'t be regenerated'}
                className={`h-7 pl-2 pr-2.5 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                  approvedAt
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
                {approving
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <CheckCircle className="w-3.5 h-3.5" />}
                {approvedAt ? 'Approved' : 'Approve'}
              </button>
            </div>
          </div>
        </div>

        {/* Visible (not just hover-tooltip) note for when a video finishes
            "successfully" but the avatar itself silently didn't make it in —
            previously the only signal was a small colored icon, easy to miss
            entirely, which is why this could look like "no avatar in the
            vd" with zero explanation. */}
        {avatarWarning && (
          <div className="flex items-start gap-1.5 mb-3 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 flex-1">{avatarWarning}</p>
            <button onClick={() => setAvatarWarning(null)} className="text-amber-500/70 hover:text-amber-700 dark:hover:text-amber-300 text-sm leading-none flex-shrink-0">×</button>
          </div>
        )}

        <div className="relative">
          {/* On the Video Editing tab, this single top preview becomes the play
              surface — while playing, or when you click a point on the timeline
              (it jumps to that moment and shows that point). So there's only ONE
              preview (no duplicate below). */}
          {vePreviewActive ? (
            <div className="w-full aspect-video rounded-xl overflow-hidden border-2 border-slate-300 dark:border-slate-600 shadow-lg">
              <SlidePlaybackPreview
                design={liveDesign}
                revealCount={veRevealCount}
                avatarImageUrl={avatarImageUrl}
                useAvatar={!!avatarImageUrl}
              />
            </div>
          ) : (
          <EditableSlide
            key={previewKey}
            title={title} subtitle={subtitle} bullets={bullets}
            layout={layout} theme={themeObj} motionCls={motion.cls}
            positions={positions} showLogo={showLogo}
            imageUrl={imageUrl} imageWidth={imageWidth} imageShape={imageShape}
            textWrap={textWrap}
            moduleTitle={moduleTitle} sceneIndex={scene.orderIndex ?? 0} totalScenes={totalScenes}
            onPositionChange={handlePositionChange}
            onDragEnd={saveContent}
            textCues={textCues}
            avatarImageUrl={avatarImageUrl}
            avatarX={avatarX} avatarY={avatarY} avatarWidth={avatarWidth}
            onDeleteLayer={handleDeleteLayer}
            segments={parsed.segments}
            annotations={annotations}
            onAnnotationChange={updateAnnotation}
            onAnnotationDragEnd={saveContent}
            onAnnotationDelete={removeAnnotation}
          />
          )}
          {saving && (
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-[10px] text-slate-300">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </div>
          )}

          {/* The synced word-by-word narration caption (a bottom overlay that
              revealed the script as it played) has been removed per request
              — the slide no longer shows any subtitle/caption text while
              previewing narration. */}

          {narrationAudioUrl && (
            <audio ref={narrationAudioRef} src={narrationAudioUrl} preload="metadata" className="hidden" />
          )}
        </div>

        {/* Add elements — kept UNDER the slide (not overlaying it) so nothing
            covers the design. Click one → it drops onto the slide → drag it
            where you want. "Sub-title" adds a subtitle line under the title. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 pr-0.5">Add element:</span>
          <button onClick={() => addAnnotation('line')} title="Add a divider line"
            className="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1">
            <Minus className="w-3.5 h-3.5" /> Line
          </button>
          <button onClick={() => addAnnotation('highlight')} title="Add a resizable highlight box"
            className="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1">
            <Highlighter className="w-3.5 h-3.5" /> Highlight
          </button>
          <button onClick={() => addAnnotation('callout')} title="Add a callout / comment"
            className="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" /> Callout
          </button>
          <button onClick={() => addAnnotation('marker')} title="Add a marker / icon"
            className="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1">
            <Star className="w-3.5 h-3.5" /> Marker
          </button>
          {!subtitle?.trim() && (
            <button onClick={() => { setSubtitle('Subtitle'); setTimeout(saveContent, 0) }}
              title="Add a subtitle line under the title"
              className="px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1">
              <Type className="w-3.5 h-3.5" /> Sub-title
            </button>
          )}
        </div>
      </div>

      {/* ── TABBED CONTROL PANEL ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] rounded-2xl overflow-hidden shadow-lg">
        <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-slate-900/60 p-2 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                  active
                    ? 'bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/20'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.03] border-transparent'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="p-5">
          {/* TAB: Type & Content */}
          {activeTab === 'text' && (
            <div className="space-y-5">

              <div>
                <label className="block text-xs font-semibold text-slate-900 dark:text-white mb-1.5">
                  Slide Title <span className="font-normal text-slate-500">(optional - leave blank for untitled intro)</span>
                </label>
                <input value={title} onChange={e=>setTitle(e.target.value)} onBlur={saveContent}
                  placeholder="Key concept students will learn"
                  className="w-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors" />
              </div>

              {/* Key Insight (subtitle) input removed — subtitle is no longer
                  shown on the slide at all (see EditableSlide below), so
                  editing it here had nothing to affect. The `subtitle` state/
                  save plumbing is left in place untouched for old scenes that
                  already have a saved value, it's just not surfaced in the UI
                  or rendered anymore. */}

              {/* Bullets */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-900 dark:text-white">Content Points</label>
                  <div className="flex items-center gap-1.5">
                    {[
                      { id:'shorten',  label:'Shorter', prompt:'Make each bullet more concise. Keep the full educational meaning — each bullet must remain a complete, meaningful idea of 10-18 words. Do NOT reduce to just 2-3 words.' },
                      { id:'simplify', label:'Simpler',  prompt:'Rewrite each bullet using simpler vocabulary that a student can understand. Keep the same meaning and similar length. Avoid jargon.' },
                      { id:'expand',   label:'Expand',   prompt:'Enrich each bullet with a concrete example or additional detail. Each bullet should be 15-25 words and help students understand better.' },
                    ].map(a => (
                      <button key={a.id} onClick={() => handleAiRewrite(a.id, a.prompt)} disabled={aiLoading}
                        className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg border transition-colors ${
                          aiLoading && aiAction===a.id
                            ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-500 dark:text-indigo-400'
                            : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-indigo-500/30 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}>
                        {aiLoading && aiAction===a.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>}
                        {a.label}
                      </button>
                    ))}
                    <button onClick={() => { setBullets(originalBulletsRef.current); setTimeout(saveContent,0) }}
                      disabled={aiLoading} title="Reset to original AI-generated content"
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800/60 text-slate-500 hover:text-amber-400 hover:border-amber-500/30 transition-colors">
                      <RotateCw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {bullets.map((b,i) => (
                    <div key={i} className="flex items-center gap-2 group">
                      <button onClick={() => setBullets(bs=>bs.map((x,idx)=>idx===i?{...x,level:x.level===1?2:1}:x))}
                        className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center flex-shrink-0 transition-colors ${
                          b.level===2?'bg-slate-700 text-slate-400':'bg-indigo-500/20 text-indigo-500 dark:text-indigo-400'}`}>
                        {b.level===2?'◦':'•'}
                      </button>
                      <input value={b.text}
                        onChange={e=>setBullets(bs=>bs.map((x,idx)=>idx===i?{...x,text:e.target.value}:x))}
                        onBlur={saveContent}
                        placeholder={b.level===1?'Key fact or concept':'Supporting detail or example'}
                        className={`flex-1 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/[0.06] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500/40 transition-colors ${b.level===2?'text-slate-500 dark:text-slate-400 ml-3':'text-slate-900 dark:text-white'}`}
                      />
                      <button onClick={()=>{ setBullets(bs=>bs.filter((_,idx)=>idx!==i)); setTimeout(saveContent,0) }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-600 hover:text-red-400 transition-all flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-2">
                  <button onClick={()=>setBullets(b=>[...b,{text:'',level:1}])}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    <Plus className="w-3 h-3"/>Add point
                  </button>
                  <button onClick={()=>setBullets(b=>[...b,{text:'',level:2}])}
                    className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">
                    <Plus className="w-3 h-3"/>Add sub-point
                  </button>
                </div>
                {(layout==='chart'||layout==='key-stats') && (
                  <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-400/70 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                    💡 {layout==='chart'
                      ? 'Include a number in each point (e.g. "72% pass rate") — bar heights auto-derive from these values.'
                      : 'Start each point with the key stat (e.g. "3× faster") — shown large on the card.'}
                  </p>
                )}
                {layout==='icon-grid' && (
                  <p className="mt-2 text-[10px] text-sky-700 dark:text-sky-400/70 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-1.5">
                    💡 Each point becomes an icon card. Best with 3-6 short, distinct concepts.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB: Layout & Theme */}
          {activeTab === 'aesthetics' && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Layout</p>
                <div className="flex flex-wrap gap-1.5">
                  {LAYOUTS.map(l => (
                    <button key={l.id} onClick={()=>handleLayoutChange(l.id)}
                      title={l.label}
                      className={`w-9 h-9 rounded-lg border transition-all flex items-center justify-center ${
                        layout===l.id
                          ?'border-indigo-500 bg-indigo-500/20 text-indigo-700 dark:text-white shadow-md shadow-indigo-500/20'
                          :'border-slate-200 dark:border-white/[0.10] bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/25 hover:bg-slate-200 dark:hover:bg-slate-800/80 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}>
                      <div className="text-sm font-bold">{l.icon}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Theme</p>
                <div className="flex flex-wrap gap-2">
                  {THEMES.map(th => (
                    <button key={th.id} onClick={async () => {
                      setTheme(th.id)
                      // Apply the theme (and clear every segment's now-stale
                      // WYSIWYG snapshot + generated slide image — see
                      // applyThemeToSegments in scenes.ts) BEFORE re-saving
                      // this segment below. Order matters: apply-theme clears
                      // renderedSlideUrl/visualAssetUrl on EVERY segment
                      // unconditionally, including this one — so saving first
                      // would just have its fresh new-theme snapshot wiped out
                      // a moment later. Applying first and saving last means
                      // the segment being edited ends up with the freshest,
                      // correctly-themed snapshot instead of no snapshot at
                      // all until the next unrelated edit.
                      if (segments && segments.length > 0) {
                        try {
                          const themeRes = await fetch(`/api/scenes/${scene.id}/apply-theme-to-segments`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ theme: th.id }),
                          })
                          if (themeRes.ok) {
                            // Reload this specific scene to get updated segment designs
                            const moduleScenesRes = await fetch(`/api/modules/${moduleId}/scenes`)
                            if (moduleScenesRes.ok) {
                              const allScenes = await moduleScenesRes.json()
                              const updatedScene = allScenes.find(s => s.id === scene.id)
                              if (updatedScene?.segments) {
                                setSegments(updatedScene.segments)
                                if (activeSegmentId) {
                                  const activeSegment = updatedScene.segments.find(s => s.id === activeSegmentId)
                                  if (activeSegment) loadDesignIntoState(getSegmentDesign(activeSegment))
                                }
                              }
                            }
                          }
                        } catch (e) { console.error('Failed to apply theme to segments:', e) }
                      }
                      // Now capture + persist a fresh snapshot for THIS
                      // segment with the new theme actually applied — runs
                      // last so apply-theme-to-segments above can't clobber it.
                      await saveContent()
                      setPreviewKey(k => k + 1)
                    }}
                      title={th.label}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all ${
                        theme===th.id?'border-indigo-400 bg-indigo-500/15 shadow-md shadow-indigo-500/15':'border-slate-200 dark:border-white/[0.10] bg-slate-100 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-white/25 hover:bg-slate-200 dark:hover:bg-slate-800/80'}`}>
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-white/30" style={{ backgroundColor: th.accent }}/>
                      <span className={`text-xs font-medium whitespace-nowrap ${theme===th.id?'text-slate-900 dark:text-white':'text-slate-600 dark:text-slate-300'}`}>{th.label}</span>
                      {theme===th.id && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-5 flex-shrink-0">
                    <GVSULogoSVG isDark={themeObj.isDark} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">GVSU Logo</p>
                    <p className="text-[10px] text-slate-500">Drag on slide to reposition</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowLogo(v => !v); setTimeout(saveContent, 0) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    showLogo
                      ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
                      : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-white/[0.06] text-slate-500'
                  }`}
                >
                  {showLogo ? <><Eye className="w-3 h-3" />Visible</> : <><EyeOff className="w-3 h-3" />Hidden</>}
                </button>
              </div>

              {/* Presenter avatar's on-canvas size/position is now edited
                  from the Avatar tab (Zoom/Size slider there, or drag it
                  directly on the slide/its corner above) — no separate card
                  duplicated here anymore. */}

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06]">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Text Wrapping</p>
                  <p className="text-[10px] text-slate-500">
                    {textWrap ? 'Long title/points wrap to a new line.' : 'Title/points stay one line and overflow if too long.'}
                  </p>
                </div>
                <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.06]">
                  <button
                    onClick={() => { setTextWrap(false); setTimeout(saveContent, 0) }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      !textWrap ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}>
                    One line
                  </button>
                  <button
                    onClick={() => { setTextWrap(true); setTimeout(saveContent, 0) }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      textWrap ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}>
                    Wrap
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: AI Media & Upload */}
          {activeTab === 'media' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={imageUrl.startsWith('data:') ? '' : imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    onBlur={saveContent}
                    placeholder="Paste image URL…"
                    className="flex-1 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:border-violet-500/40 hover:text-violet-500 dark:hover:text-violet-300 transition-colors"
                  >
                    Upload
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </div>

                {/* Or generate one instead of uploading */}
                <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06] space-y-2">
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Or describe an image to generate
                  </p>
                  <textarea
                    value={genPrompt}
                    onChange={e => setGenPrompt(e.target.value)}
                    placeholder="e.g. a clean architecture diagram of a client–server system"
                    rows={3}
                    className="w-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:border-violet-500/50 transition-colors"
                  />
                  <div className="flex gap-2">
                    <select
                      value={genImageType}
                      onChange={e => setGenImageType(e.target.value)}
                      title="Diagram-style types get a transparent background so they sit on the slide instead of looking like a pasted rectangle"
                      className="flex-1 min-w-0 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/50 transition-colors"
                    >
                      <option value="illustration">Illustration</option>
                      <option value="photo">Photo</option>
                      <option value="diagram">Diagram (transparent)</option>
                      <option value="schema">Schema (transparent)</option>
                      <option value="architecture">Architecture (transparent)</option>
                      <option value="flowchart">Flowchart (transparent)</option>
                    </select>
                    <button
                      onClick={handleGenerateImage}
                      disabled={genLoading || !genPrompt.trim()}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                    >
                      {genLoading
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                        : <><Sparkles className="w-3.5 h-3.5" />{imageUrl ? 'Regenerate' : 'Generate'}</>}
                    </button>
                  </div>
                  {genError && (
                    <p className="text-[11px] text-red-500 dark:text-red-400">{genError}</p>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-200 dark:border-white/[0.04]">
                {imageUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800">
                        <img src={imageUrl} alt="" className="w-full h-full object-cover"
                          onError={e => { e.target.src = ''; e.target.style.opacity = '0.3' }} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">Image added</p>
                        <p className="text-[10px] text-slate-500">Drag on the slide preview to reposition</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-slate-500">Width on slide</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{imageWidth}%</span>
                      </div>
                      <input type="range" min="15" max="70" value={imageWidth}
                        onChange={e => setImageWidth(Number(e.target.value))}
                        onMouseUp={saveContent}
                        className="w-full h-1 accent-violet-500 cursor-pointer" />
                    </div>
                    <div className="flex gap-1.5">
                      {[['rectangle','Sharp'],['rounded','Rounded'],['circle','Circle']].map(([v,l]) => (
                        <button key={v} onClick={() => { setImageShape(v); saveContent() }}
                          className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
                            imageShape===v
                              ? 'bg-violet-600/20 border-violet-500/40 text-violet-700 dark:text-violet-300'
                              : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-white/[0.06] text-slate-500 hover:border-slate-300 dark:hover:border-white/20'
                          }`}>{l}</button>
                      ))}
                      <button onClick={() => { setImageUrl(''); saveContent() }}
                        className="ml-auto px-2 py-1 rounded-md text-[10px] text-slate-400 dark:text-slate-600 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all">
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-slate-200 dark:border-white/[0.06] rounded-lg">
                    <Image className="w-8 h-8 text-slate-400 dark:text-slate-600 mb-2" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">No image added yet</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-600 max-w-xs mt-1">Add a figure or diagram to make this slide more visual.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Avatar — WHICH presenter is chosen (gender + specific
              avatar). Split out from Layout & Theme's Presenter Avatar card,
              which now only handles the on-canvas size/position of whichever
              avatar is chosen here. */}
          {activeTab === 'avatar' && (
            <div className="max-w-2xl space-y-3">
              {/* Identity + on-canvas zoom share one compact row instead of
                  two separate cards — this is the same real estate the old
                  Presenter Avatar card (now removed from Layout & Theme) and
                  the identity card used to take up on their own. */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06]">
                <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  {avatarImageUrl
                    ? <img src={avatarImageUrl} className="w-full h-full object-cover" alt="" />
                    : <User className="w-5 h-5 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {selectedAvatar?.avatar_name || (avatarId ? avatarId : 'No presenter chosen yet')}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize truncate">
                    {normGender(selectedAvatar?.gender) ? `${normGender(selectedAvatar.gender)} presenter` : 'Applies to every scene in this project'}
                  </p>
                </div>
                <button
                  onClick={onEditAvatar}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> {avatarId ? 'Change' : 'Choose'}
                </button>
              </div>

              {/* Two-column grid instead of one long single column — puts
                  the two-state controls (zoom + motion engine) side by side
                  since neither needs full width, then background + layout
                  below where the swatches/toggle actually need the room. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">Zoom / Size</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{Math.round(avatarWidth)}%</span>
                      <button
                        onClick={() => { setAvatarX(DEFAULT_AVATAR.x); setAvatarY(DEFAULT_AVATAR.y); setAvatarWidth(DEFAULT_AVATAR.width); saveContent() }}
                        title="Reset position &amp; size to defaults"
                        className="text-[10px] text-slate-400 dark:text-slate-600 hover:text-amber-500 transition-colors">
                        Reset
                      </button>
                    </div>
                  </div>
                  <input type="range" min="10" max={MAX_AVATAR_WIDTH} value={avatarWidth}
                    onChange={e => {
                      const next = Number(e.target.value)
                      // Growing the box can push its (unchanged) center off
                      // the slide once it's bigger — re-clamp x/y too.
                      const { x, y } = clampAvatarBox(avatarX, avatarY, next)
                      setAvatarWidth(next); setAvatarX(x); setAvatarY(y)
                    }}
                    onMouseUp={saveContent}
                    className="w-full h-1 accent-indigo-500 cursor-pointer" />
                  <p className="text-[10px] text-slate-500 mt-1">Drag directly on the slide to reposition.</p>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40">
                  <label className="block text-xs font-semibold text-slate-900 dark:text-white mb-1.5">Motion Engine</label>
                  <div className="relative">
                    <select
                      value={motionEngine}
                      onChange={e => { const v = e.target.value; setMotionEngine(v); saveAvatarSettings(v, avatarBg) }}
                      className="w-full appearance-none px-2.5 py-2 pr-8 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500/40"
                    >
                      {MOTION_ENGINES.map(m => <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>)}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {avatarSettingsSaving && (
                    <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</p>
                  )}
                </div>
              </div>

              {/* Background + Layout share one card (previously two,
                  separated by their own full-width headers/borders) —
                  Layout's Original/Circle toggle sits right under the
                  background swatches instead of in its own block below. */}
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-900 dark:text-white">Avatar Background</label>
                  <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.06]">
                    <button
                      onClick={() => { const next = { ...avatarBg, layout: 'original' }; setAvatarBg(next); saveAvatarSettings(motionEngine, next) }}
                      title="Original box"
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                        !isCircleAvatarBg ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Square className="w-3 h-3" /> Box
                    </button>
                    <button
                      onClick={() => { const next = { ...avatarBg, layout: 'circle', radius: avatarBg.radius ?? 100 }; setAvatarBg(next); saveAvatarSettings(motionEngine, next) }}
                      title="Circle crop"
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                        isCircleAvatarBg ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <CircleIcon className="w-3 h-3" /> Circle
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`relative w-9 h-9 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${
                      avatarBg.type === 'color' ? 'border-indigo-500' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
                    }`}
                    style={avatarBg.type === 'color' ? { backgroundColor: avatarBg.value } : {}}
                    title="Custom color"
                  >
                    <input
                      type="color"
                      value={avatarBg.value || '#1E293B'}
                      onChange={e => { const next = { ...avatarBg, type: 'color', value: e.target.value }; setAvatarBg(next); saveAvatarSettings(motionEngine, next) }}
                      className="opacity-0 w-0 h-0 absolute"
                    />
                    <Pencil className={`w-3.5 h-3.5 ${avatarBg.type === 'color' ? 'text-white' : 'text-slate-400'}`} />
                    {avatarBg.type === 'color' && <CheckCircle className="w-3 h-3 text-white absolute -top-1 -right-1" />}
                  </label>

                  <button
                    onClick={() => { const next = { ...avatarBg, type: 'transparent', value: null }; setAvatarBg(next); saveAvatarSettings(motionEngine, next) }}
                    title="Remove background"
                    className={`relative w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all bg-slate-100 dark:bg-slate-800/60 ${
                      avatarBg.type === 'transparent' ? 'border-indigo-500' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
                    }`}
                  >
                    <Ban className="w-3.5 h-3.5 text-slate-400" />
                    {avatarBg.type === 'transparent' && <CheckCircle className="w-3 h-3 text-indigo-500 absolute -top-1 -right-1" />}
                  </button>

                  <div className="w-px h-6 bg-slate-200 dark:bg-white/10" />

                  {BACKGROUND_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => { const next = { ...avatarBg, type: 'color', value: p.value }; setAvatarBg(next); saveAvatarSettings(motionEngine, next) }}
                      title={p.label}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        avatarBg.value === p.value ? 'border-indigo-400 scale-110' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
                      }`}
                      style={{ backgroundColor: p.value }}
                    />
                  ))}
                </div>

                {isCircleAvatarBg && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-white/[0.06]">
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500">Radius</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{avatarBgRadiusPx}px</span>
                    </div>
                    <input type="range" min="20" max="100" step="1" value={avatarBg.radius ?? 100}
                      onChange={e => setAvatarBg(b => ({ ...b, radius: Number(e.target.value) }))}
                      onMouseUp={e => saveAvatarSettings(motionEngine, { ...avatarBg, radius: Number(e.target.value) })}
                      className="w-full h-1 accent-indigo-500 cursor-pointer" />
                  </div>
                )}
              </div>

              <p className="text-[11px] text-slate-400 dark:text-slate-600">
                Background, layout and motion engine apply when the speaking-avatar video is (re)generated.
              </p>
            </div>
          )}

          {/* TAB: Narration & Motion */}
          {activeTab === 'motion' && (
            <div className="space-y-5">
              {/* ── TEXT MOTION ────────────────────────────────────────────────
                  Replaces the old static-background "Background Motion" zoom/
                  pan picker. The background no longer animates — instead this
                  controls how the narration-synced caption reveals, which is
                  the attractive effect: text appearing in step with the
                  voiceover, not all at once. */}
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white mb-1.5">Text Motion</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">How captions reveal in step with the narration.</p>
                <div className="grid grid-cols-3 gap-1.5 max-w-md">
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
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-700 dark:text-indigo-300 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20 hover:text-slate-900 dark:hover:text-white'
                      }`}>
                      <div className="text-lg">{m.icon}</div>
                      <span className="text-[10px] leading-tight text-center">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06] max-w-md">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                  <span className="text-xs text-slate-600 dark:text-slate-300">Preview narration audio</span>
                </div>
                {narrationAudioUrl ? (
                  <button onClick={toggleNarration}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold transition-colors">
                    {narrationPlaying ? <><Square className="w-3 h-3" /> Stop</> : <><Play className="w-3 h-3" /> Play</>}
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">No audio generated</span>
                )}
              </div>

              {/* Speaking Avatar Video generation/watch now lives as compact
                  icon buttons in the top-right overlay on the preview canvas
                  above (see "Overlay buttons") — handleGenerateAvatarVideo,
                  avatarGenerating/avatarGenError state, and the
                  showAvatarVideoModal video modal are unchanged, just
                  triggered from there instead of this card. */}

              {/* Segments mini-timeline (#32) — only scenes built from
                  SceneSegment rows show this (welcome scene's hook/content/
                  .../recap, quiz scene's one segment per question).
                  Segment-less scenes just don't show this block. */}
              {/* Which segment is active is now chosen from the left menu
                  (each part is its own row there — see SceneGroupList), so
                  this just shows/edits whichever one is currently active,
                  without its own separate picker. */}
              {segments.length > 0 && (
                <div>
                  {segments.filter(s => s.id === activeSegmentId).map(seg => (
                    <div key={seg.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-white/[0.04]">
                      {seg.slideTitle && (
                        <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80 uppercase tracking-widest mb-1.5 font-semibold">
                          {seg.slideTitle}
                        </p>
                      )}
                      <textarea
                        value={segmentDrafts[seg.id] ?? seg.text}
                        onChange={e => setSegmentDrafts(prev => ({ ...prev, [seg.id]: e.target.value }))}
                        onBlur={() => handleSaveSegmentText(seg.id)}
                        rows={4}
                        placeholder="What the presenter says during this segment…"
                        className="w-full bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white leading-relaxed resize-none focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <button onClick={() => handleRegenerateSegmentVoice(seg.id)} disabled={!!segmentBusy[seg.id]}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            segmentBusy[seg.id]
                              ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-500 dark:text-indigo-400 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-500 border-transparent text-white'
                          }`}>
                          {segmentBusy[seg.id] === 'voicing'
                            ? <><Loader2 className="w-3 h-3 animate-spin" />Regenerating…</>
                            : segmentBusy[seg.id] === 'saving'
                            ? <><Loader2 className="w-3 h-3 animate-spin" />Saving…</>
                            : <><RotateCcw className="w-3 h-3" />Regenerate Voice</>}
                        </button>
                        {!segmentBusy[seg.id] && seg.ttsAudioUrl && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400"><CheckCircle className="w-3 h-3" />Has voice</span>
                        )}
                        {segmentError[seg.id] && (
                          <span className="flex items-center gap-1 text-[10px] text-red-500 dark:text-red-400"><AlertCircle className="w-3 h-3" />{segmentError[seg.id]}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'videoedit' && (
            <div className="space-y-4">
              {/* Remotion timeline — voice bar + per-point element timing. The
                  preview lives at the TOP of the page (one preview only). */}
              <SceneTimelineEditor
                scene={{ ...scene, segments }}
                hidePreview
                useAvatar={!!avatarImageUrl}
                avatarImageUrl={avatarImageUrl}
                onPlayingChange={setVePlaying}
                onTick={setVePlaybackTime}
                onTimelineReady={setVeData}
                onElementSelect={setVeSelected}
                onUpdate={() => {}}
              />

              {/* ── Animation ────────────────────────────────────────────────
                  How each point/caption enters as the narration reaches it. */}
              <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                <p className="text-xs font-semibold text-slate-900 dark:text-white mb-1">Animation</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">How each point appears in step with the voice.</p>
                <div className="grid grid-cols-3 gap-1.5 max-w-md">
                  {MOTION_STYLES.map(m => (
                    <button key={m.id}
                      onClick={() => { setMotion(m); saveContent(); setPreviewKey(k=>k+1) }}
                      title={m.desc}
                      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs font-medium border transition-all ${
                        motion.id===m.id
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-700 dark:text-indigo-300 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20 hover:text-slate-900 dark:hover:text-white'
                      }`}>
                      <div className="text-lg">{m.icon}</div>
                      <span className="text-[10px] leading-tight text-center">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generate Slide Image is the icon button in the top-right overlay on
          the preview canvas above (see the Sparkles/RotateCcw button next to
          Preview and Speaking Avatar Video) — handleGenerate/
          generateFailedMsg are declared above and used there. The preview
          modal below is still how the result gets shown. */}

      {/* Preview modal — shown both for "view current" (thumbnail above) and
          automatically right after a fresh generate finishes, so there's
          always a way to actually see the result without leaving this page. */}
      {/* Both modals below are rendered through a portal straight into
          <body>, not in normal document flow here. Reason: this component
          tree sits inside several animated wrapper elements (page-transition
          motion.divs etc.) further up the app, and ANY ancestor with a CSS
          transform makes `position: fixed` descendants position relative to
          THAT ancestor instead of the actual browser viewport — so the
          popup could appear scrolled down the page instead of pinned in
          place, and jump when the wrapper animates. A portal escapes that
          entirely. Also anchored to the TOP of the viewport (items-start +
          top padding) rather than vertically centered, so it always opens
          exactly where the user is already looking instead of the middle of
          however tall the page happens to be. */}
      {generatePreviewUrl && createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-6 pt-16" onClick={() => setGeneratePreviewUrl(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Generated Slide Image</p>
              <button onClick={() => setGeneratePreviewUrl(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg leading-none">×</button>
            </div>
            <img src={generatePreviewUrl} alt="Generated slide preview" className="w-full h-auto" />
          </div>
        </div>,
        document.body
      )}

      {/* Speaking avatar video modal — see portal note above. */}
      {showAvatarVideoModal && hasRealAvatarVideo && createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-6 pt-16" onClick={() => setShowAvatarVideoModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Speaking Avatar Video</p>
              <button onClick={() => setShowAvatarVideoModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg leading-none">×</button>
            </div>
            <video src={avatarVideoUrl} controls autoPlay className="w-full h-auto bg-black" />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Editable slide canvas (drag-to-reposition) ───────────────────────────────

function EditableSlide({ title, subtitle, bullets, layout, theme, motionCls, positions, showLogo, imageUrl, imageWidth, imageShape, textWrap = false, moduleTitle, sceneIndex = 0, totalScenes = 1, onPositionChange, onDragEnd, textCues = [], avatarImageUrl = null, avatarX = DEFAULT_AVATAR.x, avatarY = DEFAULT_AVATAR.y, avatarWidth = DEFAULT_AVATAR.width, onDeleteLayer, segments = [], annotations = [], onAnnotationChange, onAnnotationDragEnd, onAnnotationDelete }) {
  const containerRef  = useRef(null)
  const [activeDrag, setActiveDrag] = useState(null)
  const [activeResize, setActiveResize] = useState(null)

  // Drag any annotation (line / highlight / callout / marker) by its top-left,
  // storing x/y as % of the slide so it lands in the same spot in the video.
  const startAnnotationDrag = (e, an) => {
    e.preventDefault(); e.stopPropagation()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const startMX = e.clientX, startMY = e.clientY
    const startX = an.x ?? 34, startY = an.y ?? 44
    const onMove = (ev) => {
      const dx = ((ev.clientX - startMX) / (rect.width || 1)) * 100
      const dy = ((ev.clientY - startMY) / (rect.height || 1)) * 100
      onAnnotationChange?.(an.id, {
        x: Math.max(0, Math.min(98, startX + dx)),
        y: Math.max(0, Math.min(96, startY + dy)),
      })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      onAnnotationDragEnd?.()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Resize a line/highlight annotation by dragging its bottom-right handle —
  // width for both, plus height for the highlight box. Values are % of slide.
  const startAnnotationResize = (e, an) => {
    e.preventDefault(); e.stopPropagation()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const startMX = e.clientX, startMY = e.clientY
    const startW = an.w ?? 26, startH = an.h ?? 8
    const onMove = (ev) => {
      // Both width and highlight height are expressed in cqw (% of slide
      // WIDTH), so measure both deltas against the slide width.
      const dw = ((ev.clientX - startMX) / (rect.width || 1)) * 100
      const dh = ((ev.clientY - startMY) / (rect.width || 1)) * 100
      const patch = { w: Math.max(4, Math.min(90, startW + dw)) }
      if (an.type === 'highlight') patch.h = Math.max(2, Math.min(50, startH + dh))
      onAnnotationChange?.(an.id, patch)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      onAnnotationDragEnd?.()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Wherever the avatar currently sits, keep title/content's font size
  // exactly as-is but wrap their lines short of the avatar's edge — a real
  // gap, not just eventual wrapping. Recomputed every render (not just
  // while dragging), so it also applies right after loading a scene whose
  // saved avatar position already happens to overlap its text.
  // Full avatar box (% of slide) so text can reflow around EITHER side.
  const avatarBox = {
    left:   avatarX - avatarWidth / 2,
    right:  avatarX + avatarWidth / 2,
    bottom: avatarY + (avatarWidth * AVATAR_HEIGHT_RATIO) / 2,
  }
  const titleWrapStyle   = computeWrapStyle(positions.title,   LAYER_WIDTHS.title,   avatarBox, textWrap)
  const contentWrapStyle = computeWrapStyle(positions.content, LAYER_WIDTHS.content, avatarBox, textWrap)

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

  // Drag the presenter avatar box — separate from startDrag above because
  // the avatar isn't stored in `positions` (it's CENTER-based avatarX/avatarY,
  // not the top-left x/y the other layers use — see DEFAULT_AVATAR's comment).
  const startAvatarDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const startMX = e.clientX, startMY = e.clientY
    const startX = avatarX, startY = avatarY
    setActiveDrag('avatar')

    const onMove = (ev) => {
      const dx = ((ev.clientX - startMX) / (rect.width || 1)) * 100
      const dy = ((ev.clientY - startMY) / (rect.height || 1)) * 100
      // Clamp against the CURRENT width so the whole box — not just its
      // center point — always stays on the slide, however big it is.
      onPositionChange('avatar', clampAvatarBox(startX + dx, startY + dy, avatarWidth))
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

  // Resize the avatar box — drag the corner handle to change avatarWidth
  // directly (unlike text layers, which scale in place via `scale`).
  const startAvatarResize = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const startMX = e.clientX
    const startWidth = avatarWidth
    const startX = avatarX, startY = avatarY
    setActiveResize('avatar')

    const onMove = (ev) => {
      const dx = ((ev.clientX - startMX) / (rect.width || 1)) * 100
      const next = Math.max(10, Math.min(MAX_AVATAR_WIDTH, startWidth + dx))
      // Growing the box can push its (unchanged) center past the edge once
      // it's bigger — re-clamp x/y for the NEW width on every step too.
      const { x, y } = clampAvatarBox(startX, startY, next)
      onPositionChange('avatar', { width: next, x, y })
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
      data-slide-canvas
      className="relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-white/[0.08] shadow-2xl select-none"
      style={{ aspectRatio:'16/9', containerType:'inline-size', background:`linear-gradient(135deg,${theme.bg} 0%,${theme.bgGrad} 100%)` }}
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
        <div className="pa-cue-layer absolute left-1/2 bottom-[4%] -translate-x-1/2 flex flex-col items-center pointer-events-none z-10">
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

      {/* ── Draggable + Resizable: IMAGE / FIGURE ────────────────── */}
      {imageUrl && positions.image && (
        <DraggableLayer layerKey="image" pos={positions.image} width={imageWidth}
          isActive={activeDrag==='image'} isResizing={activeResize==='image'} label="Image"
          onMouseDown={startDrag} onResizeMouseDown={startResize} onDelete={onDeleteLayer}>
          <SlideImage url={imageUrl} shape={imageShape} />
        </DraggableLayer>
      )}

      {/* ── Draggable + Resizable: TITLE ────────────────────────── */}
      <DraggableLayer layerKey="title" pos={positions.title} width={LAYER_WIDTHS.title}
        isActive={activeDrag==='title'} isResizing={activeResize==='title'} label="Title"
        onMouseDown={startDrag} onResizeMouseDown={startResize} onDelete={onDeleteLayer}>
        <TitleLayer title={title} layout={layout} theme={theme} wrapStyle={titleWrapStyle} />
      </DraggableLayer>

      {/* Subtitle (Key Insight) no longer shown on the slide — removed per
          request. Layout data still has a subtitle slot (positions.subtitle)
          but nothing renders into it now. */}

      {/* ── Draggable + Resizable: CONTENT BLOCK ─────────────────── */}
      <DraggableLayer layerKey="content" pos={positions.content} width={LAYER_WIDTHS.content}
        isActive={activeDrag==='content'} isResizing={activeResize==='content'} label="Content"
        onMouseDown={startDrag} onResizeMouseDown={startResize} onDelete={onDeleteLayer}>
        <ContentLayer layout={layout} bullets={bullets} subtitle={subtitle} theme={theme} segments={segments} wrapStyle={contentWrapStyle} />
      </DraggableLayer>

      {/* ── Draggable + Resizable: PRESENTER AVATAR ────────────────
          Shows the actually-selected avatar's thumbnail (set in Avatar
          Studio / Casting Settings) so this preview matches who'll really
          appear in the rendered video. Falls back to a generic placeholder
          until an avatar is chosen. Position/size are now real, saved state
          (avatarX/avatarY/avatarWidth) instead of a fixed corner box that
          couldn't be moved — dragging or resizing here changes the actual
          HeyGen avatar overlay position in the final render too, since
          api/src/lib/ffmpegVideo.ts's extractAvatarPosition reads these
          exact fields. */}
      {(() => {
        const boxW = avatarWidth
        const boxH = avatarWidth * AVATAR_HEIGHT_RATIO
        const left = avatarX - boxW / 2
        const top = avatarY - boxH / 2
        const isActive = activeDrag === 'avatar'
        const isResizing = activeResize === 'avatar'
        return (
          <div
            className="pa-drag-layer pa-avatar-zone absolute overflow-hidden"
            onMouseDown={startAvatarDrag}
            style={{
              left: `${left}%`, top: `${top}%`,
              width: `${boxW}%`, height: `${boxH}%`,
              border: avatarImageUrl ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px dashed rgba(255,255,255,0.25)',
              borderRadius: '10px',
              background: avatarImageUrl ? '#0f172a' : 'rgba(0,0,0,0.18)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '4%',
              cursor: isActive ? 'grabbing' : 'grab',
              userSelect: 'none',
              zIndex: (isActive || isResizing) ? 200 : 5,
            }}
          >
            {/* Tooltip label */}
            <div className="pa-drag-label absolute -top-6 left-0 hidden items-center gap-1 bg-blue-500 text-white px-2 py-0.5 rounded text-[8px] font-bold whitespace-nowrap z-50 pointer-events-none shadow-lg">
              <Move style={{ width:8, height:8 }} /> Presenter Avatar · drag corner to resize
            </div>
            {/* Selection ring */}
            <div className={`pa-drag-ring absolute inset-0 pointer-events-none rounded transition-all ${
              (isActive || isResizing) ? 'outline outline-2 outline-offset-[3px] outline-blue-400 bg-blue-400/5' : ''
            }`} />
            {avatarImageUrl ? (
              <img src={avatarImageUrl} alt="Presenter avatar" className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <>
                <svg viewBox="0 0 24 24" style={{ width:'18%', opacity:0.35, fill:'none', stroke:'white', strokeWidth:1.5 }}>
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
                <span style={{ color:'rgba(255,255,255,0.35)', fontSize:'clamp(5px,1.06cqw,14px)', fontWeight:600, textAlign:'center', lineHeight:1.3 }}>
                  PRESENTER<br/>AVATAR
                </span>
              </>
            )}
            {/* Resize handle — bottom-right corner, drag to change avatarWidth */}
            <div
              onMouseDown={startAvatarResize}
              title="Drag to resize avatar box"
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
          </div>
        )
      })()}

      {/* Decorative annotations (divider line / highlight / callout / marker).
          Absolutely positioned by % so they map 1:1 into the rendered video via
          the WYSIWYG snapshot. Each is draggable; the little × removes it. */}
      {annotations.map((an) => {
        const accent = an.color || theme.accent
        const common = {
          position: 'absolute', left: `${an.x ?? 34}%`, top: `${an.y ?? 44}%`,
          cursor: 'grab', userSelect: 'none', zIndex: 40,
        }
        return (
          <div key={an.id} className="pa-annotation group" style={common}
            onMouseDown={(e) => startAnnotationDrag(e, an)}>
            {/* Remove control — excluded from the snapshot (pa-drag-label is
                filtered out of captureSlideSnapshot), so it never bakes in. */}
            <button
              onClick={(e) => { e.stopPropagation(); onAnnotationDelete?.(an.id) }}
              onMouseDown={(e) => e.stopPropagation()}
              className="pa-drag-label absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] leading-none shadow z-50">×</button>

            {an.type === 'line' && (
              <div style={{ width: `${(an.w ?? 30)}cqw`, height: 3, borderRadius: 2, background: accent }} />
            )}
            {an.type === 'highlight' && (
              <div style={{ width: `${(an.w ?? 26)}cqw`, height: `${(an.h ?? 8)}cqw`, borderRadius: 6, background: accent, opacity: 0.28 }} />
            )}
            {/* Resize handle for line/highlight (excluded from the video
                snapshot via pa-drag-label). */}
            {(an.type === 'line' || an.type === 'highlight') && (
              <div
                onMouseDown={(e) => startAnnotationResize(e, an)}
                title="Drag to resize"
                className="pa-drag-label absolute hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-500 hover:bg-indigo-400 shadow z-50"
                style={{ right: -7, bottom: -7, cursor: 'nwse-resize' }}>
                <svg viewBox="0 0 24 24" style={{ width: 8, height: 8 }} fill="none" stroke="white" strokeWidth="3">
                  <path d="M21 15 15 21M21 8 8 21" />
                </svg>
              </div>
            )}
            {an.type === 'marker' && (
              <span style={{ color: accent, fontSize: 26, lineHeight: 1, textShadow: '0 1px 3px rgba(0,0,0,0.35)' }}>{an.text || '★'}</span>
            )}
            {an.type === 'callout' && (
              <div style={{
                background: theme.isDark ? 'rgba(15,23,42,0.92)' : '#ffffff',
                border: `1.5px solid ${accent}`, borderRadius: 8,
                padding: '5px 9px', maxWidth: 220, boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              }}>
                <input
                  value={an.text || ''}
                  onChange={(e) => onAnnotationChange?.(an.id, { text: e.target.value })}
                  onBlur={() => onAnnotationDragEnd?.()}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder="Comment…"
                  className="bg-transparent border-none outline-none text-[13px] font-medium"
                  style={{ color: theme.text, width: `${Math.max(60, (an.text?.length || 4) * 8)}px` }}
                />
              </div>
            )}
          </div>
        )
      })}

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
    // Dark themes: invert FIRST so the PNG's white background becomes black —
    // then screen-blend makes black fully transparent on the dark slide, and
    // only the (now light) logo mark shows. The old grayscale+brightness(20)
    // pushed EVERYTHING to white, which is what rendered a solid white box.
    return (
      <img
        src="/gvsu-logo.png"
        alt="GVSU"
        draggable={false}
        style={{
          width: '100%', height: 'auto', display: 'block',
          filter: 'invert(1) grayscale(1) brightness(1.7)',
          mixBlendMode: 'screen',
        }}
      />
    )
  }
  // Light theme: multiply-blend makes the PNG's white background invisible on
  // light slides while keeping the logo's real brand colors
  return (
    <img
      src="/gvsu-logo.png"
      alt="GVSU"
      draggable={false}
      style={{
        width: '100%', height: 'auto', display: 'block',
        mixBlendMode: 'multiply',
      }}
    />
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

function TitleLayer({ title, layout, theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
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
        // By default, never force-wrap to a second line — if it fits, it's
        // one line; if too long, it overflows past the box edge instead of
        // wrapping. Toggleable per-slide (Layout & Theme tab), and also
        // auto-engaged (with a maxWidth so a real gap appears) whenever the
        // avatar is currently over this box — see computeWrapStyle.
        ...wrapStyle,
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

function ContentLayer({ layout, bullets, subtitle, theme, segments, wrapStyle = { whiteSpace: 'nowrap' } }) {
  switch (layout) {
    case 'title-hero':  return <TitleHeroContent   bullets={bullets} theme={theme} wrapStyle={wrapStyle} />
    case 'bullets':     return <BulletsContent     bullets={bullets} theme={theme} wrapStyle={wrapStyle} />
    case 'two-column':  return <TwoColumnContent   bullets={bullets} theme={theme} wrapStyle={wrapStyle} />
    case 'icon-grid':   return <IconGridContent    bullets={bullets} theme={theme} wrapStyle={wrapStyle} />
    case 'key-stats':   return <KeyStatsContent    bullets={bullets} theme={theme} wrapStyle={wrapStyle} />
    case 'chart':       return <ChartContent       bullets={bullets} theme={theme} />
    case 'definition':  return <DefinitionContent  bullets={bullets} theme={theme} wrapStyle={wrapStyle} />
    case 'quote':       return <QuoteContent       bullets={bullets} theme={theme} wrapStyle={wrapStyle} />
    case 'summary':     return <SummaryContent     bullets={bullets} theme={theme} wrapStyle={wrapStyle} />
    case 'roadmap':     return <RoadmapContent     segments={segments} theme={theme} wrapStyle={wrapStyle} />
    default:            return <BulletsContent     bullets={bullets} theme={theme} wrapStyle={wrapStyle} />
  }
}

// ─── Layout content renderers ─────────────────────────────────────────────────

function TitleHeroContent({ bullets = [], theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
  // Intro (title-hero) slides are a centered title/subtitle by default, but the
  // user can add content points too — render them here (centered to match the
  // hero style) so "Add point" actually shows on the intro layout instead of
  // being silently dropped. When there are no points, just the accent flourish.
  const validBullets = bullets.filter(b => b.text)
  return (
    <div className="flex flex-col items-center gap-[3%]">
      <div className="pa-icon flex items-center gap-[2%]">
        <div style={{ width:'6%', height:'2px', borderRadius:1, background:theme.accent }} />
        <div style={{ width:'4%', height:'2px', borderRadius:1, background:theme.accent, opacity:0.5 }} />
      </div>
      {validBullets.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'1.8%', maxWidth:'90%' }}>
          {validBullets.slice(0, 6).map((b, i) => (
            <p key={i} className={`pa-b${i}`} style={{
              color:      b.level===2 ? theme.textSub : theme.text,
              fontSize:   b.level===2 ? FS(7,1.05,14) : FS(8,1.25,17),
              fontWeight: b.level===1 ? 600 : 400,
              lineHeight: 1.5,
              textAlign: 'center',
              minWidth: 0,
              ...wrapStyle,
            }}>{b.text}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function BulletsContent({ bullets, theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
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
            // Flex items default to min-width:auto, which stops them from
            // ever shrinking below their unwrapped content width — that
            // silently defeats whiteSpace:'normal'. flex+minWidth:0 lets
            // this actually wrap within the row instead of overflowing.
            flex: 1, minWidth: 0,
            ...wrapStyle,
          }}>
            {b.text}
          </p>
        </div>
      ))}
    </div>
  )
}

function TwoColumnContent({ bullets, theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
  const half = Math.ceil(bullets.length / 2)
  const left = bullets.slice(0, half)
  const right = bullets.slice(half)
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4%' }}>
      <div style={{ borderRadius:6, padding:'4% 3%', background:`${theme.accent}14`, border:`1px solid ${theme.accent}30` }}>
        {left.map((b,i) => (
          <div key={i} className={`pa-b${i} flex items-start mb-[2.5%]`} style={{ gap:'3%' }}>
            <span style={{ color:theme.accent, fontSize:FS(6,0.9,12), flexShrink:0, marginTop:'0.4%', fontWeight:700 }}>▸</span>
            <p style={{ color:theme.text, fontSize:FS(7,1.05,14), lineHeight:1.4, fontWeight:500, flex:1, minWidth:0, ...wrapStyle }}>{b.text}</p>
          </div>
        ))}
      </div>
      <div style={{ borderRadius:6, padding:'4% 3%', background:`${theme.accent}08`, border:`1px solid ${theme.accent}20` }}>
        {right.map((b,i) => (
          <div key={i} className={`pa-b${half+i} flex items-start mb-[2.5%]`} style={{ gap:'3%' }}>
            <span style={{ color:theme.textSub, fontSize:FS(6,0.9,12), flexShrink:0, marginTop:'0.4%' }}>◦</span>
            <p style={{ color:theme.textSub, fontSize:FS(7,1.05,14), lineHeight:1.4, flex:1, minWidth:0, ...wrapStyle }}>{b.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function IconGridContent({ bullets, theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
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
            <p style={{
              color:theme.text, fontSize:FS(6,0.95,13), lineHeight:1.4, fontWeight:500,
              // This card is a COLUMN flex with alignItems:'flex-start', which
              // shrink-wraps children to their content width by default —
              // same wrapping-blocked effect as the row-flex min-width issue
              // elsewhere, just via the cross-axis instead. alignSelf:stretch
              // makes it take the full card width so it can actually wrap.
              alignSelf: 'stretch', minWidth: 0,
              ...wrapStyle,
            }}>
              {b.text.length>50 ? b.text.slice(0,50)+'…' : b.text}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function KeyStatsContent({ bullets, theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
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
            <p style={{ color:i===0?theme.text:theme.textSub, fontSize:FS(6,0.9,12), lineHeight:1.4, fontWeight:i===0?500:400, ...wrapStyle }}>
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

function DefinitionContent({ bullets, theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
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
          <p style={{ color:theme.text, fontSize:FS(8,1.2,17), lineHeight:1.55, fontStyle:'italic', ...wrapStyle }}>
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
              <p style={{ color:theme.textSub, fontSize:FS(7,1.05,14), lineHeight:1.4, flex:1, minWidth:0, ...wrapStyle }}>{b.text}</p>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function QuoteContent({ bullets, theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
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
        ...wrapStyle,
      }}>
        {quoteText}
      </p>
    </div>
  )
}

function SummaryContent({ bullets, theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
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
          <p style={{ color:theme.text, fontSize:FS(8,1.2,16), fontWeight:500, lineHeight:1.4, flex:1, minWidth:0, ...wrapStyle }}>
            {b.text}
          </p>
        </div>
      ))}
    </div>
  )
}

function RoadmapContent({ segments, theme, wrapStyle = { whiteSpace: 'nowrap' } }) {
  if (!segments || segments.length === 0) {
    return <div style={{ color: theme.muted, textAlign: 'center', padding: '2em' }}>No segments configured</div>
  }

  const segmentConfig = {
    hook:        { color: '#0ECBF0', icon: '📌', label: 'Hook' },
    content:     { color: '#4975D4', icon: '📚', label: 'Content' },
    interaction: { color: '#DEC197', icon: '💡', label: 'Think' },
    recap:       { color: '#BA6F4C', icon: '✓', label: 'Recap' },
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
              // Column flex + alignItems:'center' shrink-wraps children to
              // their content width by default, same wrapping-blocked issue
              // as elsewhere — stretch so there's an actual width to wrap
              // against when textWrap is on.
              alignSelf: 'stretch', minWidth: 0,
              ...wrapStyle,
            }}>
              {seg.slide_title || config.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}

