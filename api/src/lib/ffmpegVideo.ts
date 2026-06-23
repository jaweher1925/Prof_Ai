/**
 * Local ffmpeg video rendering.
 *
 * Two entry points:
 *  - renderVoiceOnlyVideo: slide image + TTS audio → video, no avatar at all
 *    (used by the "Generate without avatar" option in the Video stage).
 *  - compositeAvatarOverlay: slide image + TTS audio + a HeyGen avatar talking
 *    clip → one video, with the avatar cropped/scaled into the small corner
 *    box the Visual Designer already reserves for it (right:1.5%, bottom:2%,
 *    width:22%, height:38% of the 1280x720 frame — see the "Avatar placeholder"
 *    block in VisualDesignerPanel.jsx). This is the real "with avatar" path:
 *    the slide is the actual video content, the avatar is a small picture-in-
 *    picture presenter, never a full-frame takeover.
 *
 * Requires the `ffmpeg-static` package (bundled ffmpeg binary, no system
 * install needed). Run `npm install` in /api after pulling this change.
 */
import { spawn } from 'child_process'
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
// @ts-ignore — ffmpeg-static has no types; it just exports a path string
import ffmpegPath from 'ffmpeg-static'
import { buildSlide, SlideContent } from './slideRenderer'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

// Output frame size used for every rendered video — must match the 16:9
// 1280x720 frame the Visual Designer's avatar placeholder percentages assume.
const OUT_W = 1280
const OUT_H = 720
const FPS = 25

/**
 * Builds a `-vf`/filter_complex segment that pans/zooms a still slide image
 * (Ken-Burns style) instead of leaving it frozen for the whole scene — this
 * is what scene.textAnimationType (set by storyboardAgent.ts, already shown
 * in the Visual Designer's live preview) drives in the actual rendered video.
 * Returns '' for 'static'/unknown, meaning "no motion, just scale+pad".
 */
function motionFilter(motionType?: string | null): string {
  const s = `s=${OUT_W}x${OUT_H}:fps=${FPS}`
  switch (motionType) {
    case 'slow-zoom-in':
      return `zoompan=z='min(zoom+0.0007,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${s}`
    case 'zoom-out':
      return `zoompan=z='if(eq(on,1),1.3,max(zoom-0.0007,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${s}`
    case 'pan-left':
      return `zoompan=z=1.15:x='if(eq(on,1),iw-iw/zoom,max(x-1.5,0))':y='ih/2-(ih/zoom/2)':d=1:${s}`
    case 'pan-right':
      return `zoompan=z=1.15:x='if(eq(on,1),0,min(x+1.5,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=1:${s}`
    case 'ken-burns':
      return `zoompan=z='min(zoom+0.0006,1.25)':x='if(eq(on,1),0,min(x+1,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=1:${s}`
    default:
      return ''
  }
}

/** scale+pad chain used when there's no motion (static slide, or no image at all). */
function staticScaleFilter(): string {
  return `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2`
}

// ─── Page-entrance + text-cue reveal (render pipeline half of #26) ───────────
//
// The Visual Designer's live preview reveals the slide's title/bullets with a
// staggered fade-up the instant a scene loads. A flat rendered PNG can't do a
// per-element stagger, but it can do the same *kind* of reveal: the whole
// slide fades in over the first half-second of the clip instead of snapping
// straight to full opacity, and — when the scene has storyboard textCues —
// each key term is drawn as a fading caption during its own time window.
// Both are appended to the existing motion/scale filter, never replacing it.

const SCENE_FADE_IN_SECONDS = 0.5

/** `fade=t=in:...` segment that fades the whole frame in at scene start. */
function fadeInFilter(): string {
  return `fade=t=in:st=0:d=${SCENE_FADE_IN_SECONDS}`
}

export interface TextCue { text: string; duration_seconds?: number }

/** Escape a caption string for safe use inside an ffmpeg drawtext filter. */
function escapeDrawtext(str: string): string {
  return String(str)
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '’')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
}

/**
 * Builds a chained drawtext filter that shows each text cue, one at a time,
 * as a fading lower-third caption — sequenced back-to-back starting ~0.6s
 * into the clip (after the page fade-in above). No-ops (returns '') if there
 * are no cues, so scenes without storyboard data render exactly as before.
 */
function textCueFilter(cues?: TextCue[] | null): string {
  if (!cues?.length) return ''
  const FADE = 0.25
  let t = 0.6
  const parts: string[] = []
  for (const cue of cues.slice(0, 5)) {
    const text = (cue.text || '').trim()
    if (!text) continue
    const dur = Math.max(0.8, cue.duration_seconds || 1.5)
    const start = t
    const end = t + dur
    const alphaExpr =
      `if(lt(t,${start}),0,` +
      `if(lt(t,${(start + FADE).toFixed(2)}),(t-${start})/${FADE},` +
      `if(lt(t,${(end - FADE).toFixed(2)}),1,` +
      `if(lt(t,${end.toFixed(2)}),(${end.toFixed(2)}-t)/${FADE},0))))`
    parts.push(
      `drawtext=text='${escapeDrawtext(text)}':fontcolor=white:fontsize=42:` +
      `box=1:boxcolor=black@0.55:boxborderw=18:` +
      `x=(w-text_w)/2:y=h-220:alpha='${alphaExpr}'`
    )
    t = end + 0.3
  }
  return parts.join(',')
}

function localPathFromUploadUrl(url?: string | null): string | null {
  if (!url) return null
  const match = url.match(/\/api\/uploads\/([^/?]+)/)
  if (!match) return null
  const path = join(UPLOAD_DIR, match[1])
  return existsSync(path) ? path : null
}

/**
 * Safety net: ffmpeg's built-in decoders can't read SVG. If generateSceneAsset.ts's
 * own SVG→PNG conversion ever fails (e.g. sharp missing on a given host, or a future
 * regression), slide images would otherwise silently fall back to a flat solid-color
 * background here — which is exactly the "voice only, no scene shown" bug. Instead,
 * if we're handed an .svg, rasterize it to a temp .png with sharp right before handing
 * it to ffmpeg, so the actual slide always ends up in the video regardless of what
 * happened upstream.
 *
 * Returns the original path unchanged for already-raster images, or null if the
 * path doesn't exist / can't be rasterized (caller falls back to solid color).
 */
async function ensureRasterImage(imagePath: string | null): Promise<string | null> {
  if (!imagePath) return null
  if (/\.(png|jpe?g|webp)$/i.test(imagePath)) return imagePath
  if (!/\.svg$/i.test(imagePath)) return null

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp')
    const svgBuffer = readFileSync(imagePath)
    const pngBuffer: Buffer = await sharp(svgBuffer).png().toBuffer()
    const tmpPngPath = join(UPLOAD_DIR, `${randomUUID()}_slide.png`)
    writeFileSync(tmpPngPath, pngBuffer)
    return tmpPngPath
  } catch (err: any) {
    console.warn(`ensureRasterImage: failed to rasterize SVG slide (${imagePath}) — falling back to solid color. ${err?.message}`)
    return null
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args)
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`))
    })
  })
}

export async function renderVoiceOnlyVideo(opts: {
  audioUrl: string
  imageUrl?: string | null
  backgroundColor?: string
  textAnimationType?: string | null
  textCues?: TextCue[] | null
}): Promise<string> {
  const audioPath = localPathFromUploadUrl(opts.audioUrl)
  if (!audioPath) throw new Error('Could not locate the audio file on disk for this scene.')

  const rawImagePath = localPathFromUploadUrl(opts.imageUrl)
  // ffmpeg's built-in decoders don't handle SVG — rasterize it via sharp first
  // (see ensureRasterImage) rather than silently dropping to a blank background.
  const imagePath = await ensureRasterImage(rawImagePath)
  const useImage = !!imagePath
  const rasterizedTmp = imagePath && imagePath !== rawImagePath ? imagePath : null

  const outName = `${randomUUID()}.mp4`
  const outPath = join(UPLOAD_DIR, outName)

  const motion = motionFilter(opts.textAnimationType)
  const base = motion || staticScaleFilter()
  const cueChain = textCueFilter(opts.textCues)
  // text-reveal: whole-frame fade-in always; key-term captions only if present.
  const vfWithCues = [base, fadeInFilter(), cueChain].filter(Boolean).join(',')
  const vfSafe     = [base, fadeInFilter()].filter(Boolean).join(',')

  const buildArgs = (vf: string) => useImage
    ? [
        '-y',
        '-loop', '1', '-i', imagePath as string,
        '-i', audioPath,
        '-c:v', 'libx264', '-tune', 'stillimage',
        '-c:a', 'aac', '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-vf', vf,
        '-shortest',
        outPath,
      ]
    : [
        '-y',
        '-f', 'lavfi', '-i', `color=c=${opts.backgroundColor || '0x1E293B'}:s=${OUT_W}x${OUT_H}:r=24`,
        '-i', audioPath,
        '-c:v', 'libx264',
        '-c:a', 'aac', '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-vf', vf,
        '-shortest',
        outPath,
      ]

  try {
    try {
      await runFfmpeg(buildArgs(vfWithCues))
    } catch (cueErr: any) {
      // Drawtext can fail if the host has no usable font (fontconfig missing,
      // etc.) — fall back to the cue-free render rather than losing the scene.
      if (cueChain) {
        console.warn(`renderVoiceOnlyVideo: text-cue overlay failed, retrying without it — ${cueErr?.message}`)
        await runFfmpeg(buildArgs(vfSafe))
      } else {
        throw cueErr
      }
    }
  } finally {
    if (rasterizedTmp) { try { unlinkSync(rasterizedTmp) } catch { /* best-effort cleanup */ } }
  }
  return `/api/uploads/${outName}`
}

/**
 * Merge a HeyGen avatar talking-head clip into the corner of the actual slide
 * video. The slide (Visual Designer output) is the real video content; the
 * avatar is cropped to the reserved box's aspect ratio and laid on top as a
 * small picture-in-picture, bottom-right.
 *
 * avatarVideoUrl is a remote HeyGen-hosted URL — it's downloaded to a local
 * temp file first since the overlay filter needs a seekable local input.
 */
export async function compositeAvatarOverlay(opts: {
  audioUrl: string
  avatarVideoUrl: string
  slideImageUrl?: string | null
  backgroundColor?: string
  textAnimationType?: string | null
  textCues?: TextCue[] | null
  // Avatar Studio "Layout" + "Radius" controls (#37 HeyGen-style restyle).
  // "circle" crops the presenter PiP into a circle (radius 0-100 = % of the
  // box's half-width used as the circle's radius; 100 = full circle).
  // "original" (default) keeps the existing plain rectangular PiP box.
  avatarLayout?: 'original' | 'circle' | null
  avatarRadius?: number | null
}): Promise<string> {
  const audioPath = localPathFromUploadUrl(opts.audioUrl)
  if (!audioPath) throw new Error('Could not locate the audio file on disk for this scene.')

  const rawImagePath = localPathFromUploadUrl(opts.slideImageUrl)
  const imagePath = await ensureRasterImage(rawImagePath)
  const useImage = !!imagePath
  const rasterizedTmp = imagePath && imagePath !== rawImagePath ? imagePath : null

  const avatarRes = await fetch(opts.avatarVideoUrl)
  if (!avatarRes.ok) throw new Error(`Failed to download avatar clip (${avatarRes.status})`)
  const avatarBuf = Buffer.from(await avatarRes.arrayBuffer())
  const avatarTmpPath = join(UPLOAD_DIR, `${randomUUID()}_avatar_src.mp4`)
  writeFileSync(avatarTmpPath, avatarBuf)

  const outName = `${randomUUID()}.mp4`
  const outPath = join(UPLOAD_DIR, outName)

  // Reserved presenter box — right:1.5%, bottom:2%, width:22%, height:38% of frame.
  const boxW = Math.round(OUT_W * 0.22)
  const boxH = Math.round(OUT_H * 0.38)
  const marginR = Math.round(OUT_W * 0.015)
  const marginB = Math.round(OUT_H * 0.02)

  const bgInputArgs = useImage
    ? ['-loop', '1', '-i', imagePath as string]
    : ['-f', 'lavfi', '-i', `color=c=${opts.backgroundColor || '0x1E293B'}:s=${OUT_W}x${OUT_H}:r=24`]

  // Motion only makes visual sense on a real slide image — panning/zooming a
  // flat solid-color background is pointless and just wastes render time.
  const bgFilter = (useImage && motionFilter(opts.textAnimationType)) || staticScaleFilter()
  const cueChain = textCueFilter(opts.textCues)

  // Circle layout: crop the PiP to a square first, then punch a circular
  // alpha hole out of it via geq so only pixels within `radius` of the
  // square's center stay opaque — everything outside is transparent and
  // shows the slide behind it. radius is 0-100 (% of half the square's
  // side); 100 = the circle just touches the square's edges.
  const useCircle = opts.avatarLayout === 'circle'
  const pipSize = Math.min(boxW, boxH)
  const radiusPct = Math.min(Math.max(opts.avatarRadius ?? 100, 0), 100)
  const radiusPx = Math.round((pipSize / 2) * (radiusPct / 100))
  const avaFilter = useCircle
    ? `scale=${pipSize}:${pipSize}:force_original_aspect_ratio=increase,crop=${pipSize}:${pipSize},format=yuva420p,` +
      `geq=lum='lum(X,Y)':a='if(lte(pow(X-${pipSize / 2},2)+pow(Y-${pipSize / 2},2),pow(${radiusPx},2)),255,0)'`
    : `scale=${boxW}:${boxH}:force_original_aspect_ratio=increase,crop=${boxW}:${boxH}`

  // text-reveal: fade the slide in, then (optionally) overlay timed key-term
  // captions, all on the background before the avatar PiP is laid on top.
  const buildFilter = (withCues: boolean) =>
    `[0:v]${[bgFilter, fadeInFilter(), withCues ? cueChain : ''].filter(Boolean).join(',')}[bg];` +
    `[1:v]${avaFilter}[ava];` +
    `[bg][ava]overlay=W-w-${marginR}:H-h-${marginB}:shortest=1[outv]`

  const buildArgs = (filter: string) => [
    '-y',
    ...bgInputArgs,
    '-i', avatarTmpPath,
    '-i', audioPath,
    '-filter_complex', filter,
    '-map', '[outv]',
    '-map', '2:a',
    '-c:v', 'libx264',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    outPath,
  ]

  try {
    try {
      await runFfmpeg(buildArgs(buildFilter(true)))
    } catch (cueErr: any) {
      if (cueChain) {
        console.warn(`compositeAvatarOverlay: text-cue overlay failed, retrying without it — ${cueErr?.message}`)
        await runFfmpeg(buildArgs(buildFilter(false)))
      } else {
        throw cueErr
      }
    }
  } finally {
    try { unlinkSync(avatarTmpPath) } catch { /* best-effort cleanup */ }
    if (rasterizedTmp) { try { unlinkSync(rasterizedTmp) } catch { /* best-effort cleanup */ } }
  }

  return `/api/uploads/${outName}`
}

/**
 * Resolve a scene's avatarVideoUrl (an "/api/uploads/xyz.mp4" path) to the
 * local file on disk. Returns null for anything that isn't a real rendered
 * video yet (missing, or still a "heygen:<id>" job-id placeholder).
 */
export function localVideoPathFromUploadUrl(url?: string | null): string | null {
  if (!url || url.startsWith('heygen:')) return null
  return localPathFromUploadUrl(url)
}

/** Probe a video file's duration in seconds by parsing ffmpeg's own stderr
 *  banner (no ffprobe binary is bundled with ffmpeg-static, so this avoids
 *  needing a second dependency just to read a duration). */
function getDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, ['-i', path])
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)))
    proc.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (!m) return reject(new Error(`Could not determine duration of ${path}`))
      resolve(parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]))
    })
  })
}

const CROSSFADE_SECONDS = 0.6

/**
 * Concatenate a module's scene videos (already in their final order) into one
 * full module video, with a short crossfade between each scene instead of a
 * hard cut — so the merged module video doesn't feel like a slideshow of
 * separate clips stitched together. Falls back to a plain hard-cut concat
 * (faster, no re-encode) if duration probing or the crossfade chain fails
 * for any reason, so merging never breaks outright.
 */
export async function concatVideos(localPaths: string[]): Promise<string> {
  if (!localPaths.length) throw new Error('No scene videos to merge.')

  const outName = `${randomUUID()}_module.mp4`
  const outPath = join(UPLOAD_DIR, outName)

  if (localPaths.length > 1) {
    try {
      return await concatWithCrossfade(localPaths, outPath, outName)
    } catch (xfadeErr: any) {
      console.warn(`concatVideos: crossfade merge failed, falling back to hard-cut concat — ${xfadeErr?.message}`)
    }
  }

  return concatHardCut(localPaths, outPath, outName)
}

async function concatWithCrossfade(localPaths: string[], outPath: string, outName: string): Promise<string> {
  const durations = await Promise.all(localPaths.map(getDuration))

  const inputArgs = localPaths.flatMap((p) => ['-i', p])
  const xf = CROSSFADE_SECONDS

  let videoChain = ''
  let audioChain = ''
  let prevV = '0:v'
  let prevA = '0:a'
  let cumDuration = durations[0]

  for (let i = 1; i < localPaths.length; i++) {
    const outV = i === localPaths.length - 1 ? 'outv' : `v${i}`
    const outA = i === localPaths.length - 1 ? 'outa' : `a${i}`
    const offset = Math.max(cumDuration - xf, 0)
    videoChain += `[${prevV}][${i}:v]xfade=transition=fade:duration=${xf}:offset=${offset.toFixed(3)}[${outV}];`
    audioChain += `[${prevA}][${i}:a]acrossfade=d=${xf}[${outA}];`
    prevV = outV
    prevA = outA
    cumDuration = cumDuration + durations[i] - xf
  }

  const filter = videoChain + audioChain
  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex', filter,
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p',
    outPath,
  ]

  await runFfmpeg(args)
  return `/api/uploads/${outName}`
}

// ─── Segment-level rendering (#32) ───────────────────────────────────────────
//
// A scene can be made of one or more ordered SceneSegment rows instead of a
// single script/slide pair (see schema.prisma's SceneSegment doc comment and
// generateTTS.ts). Each segment already has its own ttsAudioUrl (one
// ElevenLabs call per segment); this section renders each segment to its own
// slide+audio clip, then stitches them together with concatVideos() above
// into the scene's single avatarVideoUrl — voice-only only for now, same as
// renderVoiceOnlyVideo. Avatar-overlay-per-segment can reuse the same pattern
// later if needed, but isn't wired yet.

export interface RenderableSegment {
  id: string
  text: string
  slideTitle?: string | null
  elements?: string | null // JSON SlideElement[] — see scriptGeneratorAgent.ts
  // Per-segment Visual Designer slide design (#38) — JSON string, same shape
  // as Scene.slideDeckContent / slideRenderer.ts's SlideContent. "{}" or
  // missing means this segment hasn't been individually designed yet.
  slideDesign?: string | null
  ttsAudioUrl?: string | null
}

interface SlideElement {
  type?: string
  text?: string
}

const SEGMENT_SLIDE_THEME = {
  bg1: '#020C1B', bg2: '#0A1628', bg3: '#0F1F3D',
  accent: '#3B82F6', accentLight: '#3B82F620',
  title: '#F8FAFC', body: '#CBD5E1', muted: '#64748B',
}

function escSvg(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function wrapSvgText(text: string, max: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim()
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 2)
}

/**
 * Slide for a single segment.
 *
 * If the segment has its own saved Visual Designer slide design (#38 —
 * segment.slideDesign, set via the per-segment design UI in
 * VisualDesignerPanel.jsx), render it with the SAME themed renderer
 * (slideRenderer.ts's buildSlide) used everywhere else in the app — this is
 * what makes the rendered video actually match what was designed instead of
 * silently falling back to a different, simplified look.
 *
 * Otherwise (segment never individually designed — slideDesign is "{}" or
 * absent), fall back to the original minimal "title + bullets" render below,
 * so old segments / scenes that predate #38 keep working exactly as before.
 */
function buildSegmentSlideSvg(segment: RenderableSegment, moduleTitle = '', segIndex = 0, segTotal = 1): string {
  let design: SlideContent = {}
  try { design = JSON.parse(segment.slideDesign || '{}') } catch { /* malformed JSON — use fallback render */ }
  if (design.title || design.subtitle || design.blocks?.length) {
    return buildSlide(design, moduleTitle, segIndex, segTotal)
  }
  return buildLegacySegmentSlideSvg(segment)
}

function buildLegacySegmentSlideSvg(segment: RenderableSegment): string {
  const W = 1920, H = 1080
  const t = SEGMENT_SLIDE_THEME
  const title = escSvg((segment.slideTitle || '').slice(0, 90))

  let elements: SlideElement[] = []
  try { elements = JSON.parse(segment.elements || '[]') } catch { /* malformed JSON — render title only */ }
  const bullets = elements.filter(el => el.type === 'bullet' && el.text)

  let contentSvg = ''
  let y = title ? 460 : 360
  for (const b of bullets.slice(0, 6)) {
    const lines = wrapSvgText(escSvg(b.text || ''), 65)
    contentSvg += `<circle cx="108" cy="${y - 8}" r="6" fill="${t.accent}"/>`
    for (let i = 0; i < lines.length; i++) {
      contentSvg += `<text x="130" y="${y + i * 42}" font-family="Arial,sans-serif" font-size="36" fill="${t.body}">${lines[i]}</text>`
    }
    y += lines.length > 1 ? 115 : 88
    if (y > 990) break
  }

  // No structured elements at all (e.g. a plain narration-only segment).
  // This used to fall back to rendering segment.text — the spoken voice
  // script — directly on screen, which is what put the full narration on
  // the welcome scene's slide. The voice script is meant to be heard, not
  // read; when there's no title/bullets we now just show the decorative
  // background + branding instead of dumping the narration as text.

  const titleLines = wrapSvgText(title, 42)
  const titleSvg = titleLines.map((line, i) =>
    `<text x="100" y="${200 + i * 78}" font-family="Arial,sans-serif" font-size="64" fill="${t.title}" font-weight="700" letter-spacing="-1">${line}</text>`
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${t.bg1}"/>
    <stop offset="60%" stop-color="${t.bg2}"/>
    <stop offset="100%" stop-color="${t.bg3}"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect x="0" y="0" width="${W}" height="6" fill="${t.accent}"/>
${title ? `<rect x="100" y="380" width="900" height="2" fill="${t.accent}" opacity="0.4" rx="1"/>` : ''}
${titleSvg}
${contentSvg}
<text x="100" y="${H - 40}" font-family="Arial,sans-serif" font-size="16" fill="${t.muted}" letter-spacing="2" font-weight="600" opacity="0.6">PROFAI STUDIO</text>
</svg>`
}

/** Persists a segment's slide SVG to disk and returns its `/api/uploads/...`
 *  URL. Written as .svg, not rasterized here — renderVoiceOnlyVideo's own
 *  ensureRasterImage() already converts SVG→PNG via sharp right before
 *  handing the frame to ffmpeg, so there's no need to duplicate that step. */
function writeSegmentSlideSvg(svg: string): string {
  const name = `${randomUUID()}_segment.svg`
  writeFileSync(join(UPLOAD_DIR, name), svg, 'utf-8')
  return `/api/uploads/${name}`
}

/**
 * Renders every segment of a scene to its own slide+audio clip (reusing
 * renderVoiceOnlyVideo per segment) and concatenates them (via concatVideos)
 * into one video — this is the scene's avatarVideoUrl when the scene has
 * segments. Each segment MUST already have ttsAudioUrl set (run generateTTS
 * first); throws naming the first segment missing audio otherwise so the
 * caller can surface a clear error instead of a silent partial render.
 */
export async function renderSceneSegmentsVideo(opts: {
  segments: RenderableSegment[]
  textAnimationType?: string | null
  // Used only as decorative context (module tag pill) when a segment has its
  // own slideDesign and gets rendered via the rich buildSlide() renderer.
  moduleTitle?: string | null
}): Promise<string> {
  if (!opts.segments.length) throw new Error('No segments to render.')

  const missing = opts.segments.find(s => !s.ttsAudioUrl)
  if (missing) throw new Error(`Segment ${missing.id} has no narration audio yet — run TTS generation first.`)

  const clipUrls: string[] = []
  const clipPaths: string[] = []
  const tmpSvgPaths: string[] = []
  const segTotal = opts.segments.length

  try {
    for (let segIndex = 0; segIndex < opts.segments.length; segIndex++) {
      const seg = opts.segments[segIndex]
      const svg = buildSegmentSlideSvg(seg, opts.moduleTitle || '', segIndex, segTotal)
      const imageUrl = writeSegmentSlideSvg(svg)
      const svgLocalPath = localPathFromUploadUrl(imageUrl)
      if (svgLocalPath) tmpSvgPaths.push(svgLocalPath)

      const clipUrl = await renderVoiceOnlyVideo({
        audioUrl: seg.ttsAudioUrl as string,
        imageUrl,
        textAnimationType: opts.textAnimationType,
      })
      const clipLocalPath = localPathFromUploadUrl(clipUrl)
      if (!clipLocalPath) throw new Error(`Rendered clip for segment ${seg.id} could not be located on disk.`)
      clipUrls.push(clipUrl)
      clipPaths.push(clipLocalPath)
    }
  } finally {
    for (const p of tmpSvgPaths) { try { unlinkSync(p) } catch { /* best-effort cleanup */ } }
  }

  return clipPaths.length === 1 ? clipUrls[0] : concatVideos(clipPaths)
}

async function concatHardCut(localPaths: string[], outPath: string, outName: string): Promise<string> {
  const listPath = join(UPLOAD_DIR, `${randomUUID()}_concat_list.txt`)
  const listContents = localPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')
  writeFileSync(listPath, listContents)

  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath]

  try {
    await runFfmpeg(args)
  } catch (copyErr) {
    // Stream-copy concat fails if any clip's stream parameters drift —
    // fall back to a re-encoding concat via filter graph, which is slower
    // but tolerant of minor mismatches between scene videos.
    const inputArgs = localPaths.flatMap((p) => ['-i', p])
    const filterParts = localPaths.map((_, i) => `[${i}:v:0][${i}:a:0]`).join('')
    const filter = `${filterParts}concat=n=${localPaths.length}:v=1:a=1[outv][outa]`
    const reencodeArgs = [
      '-y',
      ...inputArgs,
      '-filter_complex', filter,
      '-map', '[outv]', '-map', '[outa]',
      '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p',
      outPath,
    ]
    try {
      await runFfmpeg(reencodeArgs)
    } finally {
      try { unlinkSync(listPath) } catch { /* best-effort cleanup */ }
    }
    return `/api/uploads/${outName}`
  }

  try { unlinkSync(listPath) } catch { /* best-effort cleanup */ }
  return `/api/uploads/${outName}`
}
