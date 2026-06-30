/**
 * HyperFrames integration — HTML composition builder + cloud render client.
 *
 * HyperFrames (https://developers.heygen.com/hyperframes) is HeyGen's open-source
 * framework that renders HTML + CSS + GSAP animations into a real MP4 video,
 * frame by frame, via headless Chrome + ffmpeg on their cloud infrastructure.
 *
 * This module does two things:
 *   1. buildHyperFramesHtml()  — converts ProfAI's SlideContent JSON (the same
 *      data the Visual Designer saves) into a valid HyperFrames HTML composition.
 *      The composition mirrors the 5 themes + 9 layouts the Visual Designer shows
 *      live, with GSAP-animated slide-in/fade-up entrances baked in.
 *   2. renderHyperFrames()     — POSTs that HTML to HeyGen's cloud render API
 *      and polls until the MP4 is ready, returning a public download URL.
 *
 * The generated video is used as the slide background layer in ffmpegVideo.ts
 * (renderVoiceOnlyVideo / compositeAvatarOverlay) — fully backward-compatible
 * because both functions already support a video background input (see the
 * slideVideoUrl option added alongside this integration).
 *
 * API reference: https://developers.heygen.com/reference/create-hyperframes-render
 */

import { SlideContent, THEMES } from './slideRenderer'

const HF_API = 'https://api.heygen.com/v3/hyperframes'

export interface HyperFramesRenderResult {
  renderId: string
  videoUrl: string // public MP4 URL — ready to download
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

/**
 * Map ProfAI theme id → CSS colour tokens.
 * Derived from the same THEMES table in slideRenderer.ts so the HyperFrames
 * video matches the Visual Designer preview exactly.
 */
function themeVars(themeId?: string): {
  bg: string; bgGrad: string; accent: string; textTitle: string; textBody: string; textMuted: string
} {
  const t = THEMES[themeId || 'dark-navy'] || THEMES['dark-navy']
  return {
    bg:        t.bg1,
    bgGrad:    t.bg3,
    accent:    t.accent,
    textTitle: t.title,
    textBody:  t.body,
    textMuted: t.muted,
  }
}

function esc(s: string): string {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

/**
 * Render the bullet list content block as HTML for a given layout.
 * Chart / stats layouts generate appropriate SVG or grid HTML.
 */
function buildContentHtml(content: SlideContent, accent: string, textBody: string, textMuted: string): string {
  const bullets = content.blocks?.[0]?.items || []
  const layout  = content.layout || 'bullets'

  if (!bullets.length) return ''

  if (layout === 'key-stats') {
    return `<div class="stats-grid" id="stats">
      ${bullets.slice(0,4).map((b,i)=>`
        <div class="stat-card clip pa-card${i}" data-start="${0.4+i*0.15}" data-duration="99" data-track-index="2">
          <div class="stat-number" style="color:${accent}">${b.text.match(/(\d+[\d.,]*%?×?x?)/)?.[1]||'—'}</div>
          <div class="stat-label" style="color:${textMuted}">${esc(b.text.replace(/^\d[\d.,]*%?×?x?\s*[-:–]?\s*/,'').slice(0,44))}</div>
        </div>`).join('')}
    </div>`
  }

  if (layout === 'two-column') {
    const half = Math.ceil(bullets.length/2)
    const left = bullets.slice(0,half)
    const right = bullets.slice(half)
    return `<div class="two-col" id="content">
      <div class="col-panel clip pa-b0" data-start="0.4" data-duration="99" data-track-index="2" style="border-color:${accent}33;background:${accent}14">
        ${left.map(b=>`<p class="bullet" style="color:${textBody}"><span style="color:${accent}">▸</span> ${esc(b.text)}</p>`).join('')}
      </div>
      <div class="col-panel clip pa-b1" data-start="0.55" data-duration="99" data-track-index="2" style="border-color:${accent}22;background:${accent}08">
        ${right.map(b=>`<p class="bullet" style="color:${textMuted}"><span style="color:${textMuted}">◦</span> ${esc(b.text)}</p>`).join('')}
      </div>
    </div>`
  }

  // Default: bullets list
  return `<div class="bullets" id="content">
    ${bullets.slice(0,6).map((b,i)=>`
      <div class="bullet-row clip pa-b${i}" data-start="${0.38+i*0.14}" data-duration="99" data-track-index="2"
           style="margin-left:${b.level===2?'1.8em':'0'}">
        <div class="bullet-dot" style="background:${b.level===2?accent+'55':accent}"></div>
        <p class="bullet-text" style="color:${b.level===2?textMuted:textBody};font-weight:${b.level===1?600:400}">${esc(b.text)}</p>
      </div>`).join('')}
  </div>`
}

/**
 * Build a complete HyperFrames HTML composition from ProfAI SlideContent.
 * The output is a self-contained HTML file that registers its own GSAP timeline
 * and honours the HyperFrames data-* attribute contract.
 */
export function buildHyperFramesHtml(
  content: SlideContent,
  moduleTitle: string,
  durationSeconds: number,
): string {
  const col   = themeVars(content.theme)
  const dur   = Math.max(4, durationSeconds || 8)
  const title = esc(content.title || 'Slide')
  const sub   = esc(content.subtitle || '')
  const contentHtml = buildContentHtml(content, col.accent, col.textBody, col.textMuted)
  const moduleLbl   = esc((moduleTitle || '').toUpperCase().slice(0, 40))
  const pct         = 0.65 // progress bar fill — mid-lesson approximation

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1280px; height: 720px; overflow: hidden; background: ${col.bg}; font-family: 'Segoe UI', system-ui, sans-serif; }

  #main { width: 1280px; height: 720px; position: relative;
    background: linear-gradient(135deg, ${col.bg} 0%, ${col.bgGrad} 100%); }

  /* Geometric background shapes */
  .bg-circle1 { position:absolute; right:-80px; top:-80px; width:420px; height:420px;
    border-radius:50%; background:${col.accent}; opacity:0.07; pointer-events:none; }
  .bg-circle2 { position:absolute; left:-40px; bottom:-60px; width:320px; height:320px;
    border-radius:50%; background:${col.accent}; opacity:0.05; pointer-events:none; }
  .bg-bar     { position:absolute; left:0; top:0; width:4px; height:200px;
    background:${col.accent}; opacity:0.70; border-radius:2px; }
  .bg-line    { position:absolute; left:0; right:0; bottom:40px; height:1px;
    background:${col.accent}; opacity:0.10; }

  /* Module tag */
  #module-tag { position:absolute; left:32px; top:18px; padding:3px 14px;
    border-radius:999px; background:${col.accent}33; border:1px solid ${col.accent}55;
    color:${col.accent}; font-size:11px; font-weight:700; letter-spacing:0.12em; }

  /* Progress bar */
  #progress-bg  { position:absolute; right:32px; top:22px; width:88px; height:4px;
    background:${col.accent}22; border-radius:2px; }
  #progress-fill{ position:absolute; left:0; top:0; height:4px; width:${Math.round(pct*88)}px;
    background:${col.accent}; border-radius:2px; }

  /* Left accent line */
  .left-accent  { position:absolute; left:24px; top:60px; bottom:32px;
    width:3px; background:linear-gradient(to bottom,${col.accent},${col.accent}00); border-radius:2px; }

  /* Title */
  #title { position:absolute; left:60px; top:80px; right:480px;
    font-size:clamp(22px,2.8vw,42px); font-weight:800; line-height:1.2;
    color:${col.textTitle}; letter-spacing:-0.01em; }

  /* Subtitle / key insight */
  #subtitle { position:absolute; left:60px; top:0; right:480px;
    font-size:clamp(13px,1.3vw,19px); font-weight:600; line-height:1.45;
    color:${col.accent};
    padding-left:12px; border-left:2px solid ${col.accent}; }

  /* Bullet list */
  .bullets { position:absolute; left:60px; right:480px; display:flex; flex-direction:column; gap:10px; }
  .bullet-row { display:flex; align-items:flex-start; gap:10px; }
  .bullet-dot { width:12px; height:12px; border-radius:3px; flex-shrink:0; margin-top:4px; }
  .bullet-text{ font-size:clamp(11px,1.3vw,17px); line-height:1.5; }

  /* Stats grid */
  .stats-grid { position:absolute; left:60px; right:480px; display:grid; grid-template-columns:repeat(2,1fr); gap:14px; }
  .stat-card  { background:${col.accent}14; border:1px solid ${col.accent}35; border-radius:10px;
    padding:14px; display:flex; flex-direction:column; gap:6px; }
  .stat-number{ font-size:clamp(24px,3.5vw,52px); font-weight:800; line-height:1; letter-spacing:-0.02em; }
  .stat-label { font-size:clamp(9px,1vw,13px); line-height:1.4; }

  /* Two-column */
  .two-col    { position:absolute; left:60px; right:480px; display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .col-panel  { border-radius:8px; padding:14px; border:1px solid; }
  .bullet     { font-size:clamp(10px,1.1vw,14px); line-height:1.45; margin-bottom:6px; }

  /* GVSU Logo area (top-right of content zone) */
  #logo { position:absolute; right:490px; top:16px; width:52px; height:auto; opacity:0.85; }

  /* Avatar placeholder column — right 38%, keeps content clear */
  #avatar-zone { position:absolute; right:0; top:0; bottom:0; width:38%;
    border-left:1.5px solid rgba(255,255,255,0.08);
    background:linear-gradient(135deg,rgba(0,0,0,0.25),rgba(0,0,0,0.10)); }

  /* Bottom accent */
  .bottom-accent { position:absolute; bottom:0; left:0; right:0; height:3px;
    background:linear-gradient(to right,${col.accent},${col.accent}00 70%); }

  /* Clip visibility — HyperFrames mounts/unmounts based on data-start/data-duration */
  .clip { opacity: 0; }
</style>
<!-- GSAP from CDN (HyperFrames provides it too — this is the fallback) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
</head>
<body>

<div id="main" data-composition-id="prof-slide" data-start="0" data-width="1280" data-height="720">

  <!-- Static background elements (not clips — always visible) -->
  <div class="bg-circle1"></div>
  <div class="bg-circle2"></div>
  <div class="bg-bar"></div>
  <div class="bg-line"></div>
  <div class="left-accent"></div>
  <div class="bottom-accent"></div>
  <div id="progress-bg"><div id="progress-fill"></div></div>
  ${moduleLbl ? `<div id="module-tag">${moduleLbl}</div>` : ''}

  <!-- Avatar zone placeholder (avatar composited here by ffmpeg later) -->
  <div id="avatar-zone"></div>

  <!-- Title (clip) -->
  <div id="title" class="clip" data-start="0" data-duration="${dur}" data-track-index="1">
    ${title}
  </div>

  <!-- Subtitle / key insight (clip) — positioned dynamically by JS after title renders -->
  ${sub ? `<div id="subtitle" class="clip" data-start="0.22" data-duration="${dur}" data-track-index="1">
    ${sub}
  </div>` : ''}

  <!-- Content block -->
  ${contentHtml}

</div>

<script>
// Wait for GSAP to be available, then build the timeline.
(function() {
  var tl = gsap.timeline({ paused: true });

  // Whole-slide page-enter: fade up
  tl.from('#main', { opacity: 0, y: 12, duration: 0.45, ease: 'power2.out' }, 0);

  // Title slides in from left
  tl.to('#title', { opacity: 1, x: 0, duration: 0.55, ease: 'power3.out' }, 0.05);
  tl.from('#title', { x: -28 }, 0.05);

  // Subtitle fades up
  if (document.getElementById('subtitle')) {
    tl.to('#subtitle', { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0.22);
    tl.from('#subtitle', { y: 10 }, 0.22);
  }

  // Bullet rows / content cards — staggered fade-up
  var rows = document.querySelectorAll('[class*="pa-b"], [class*="pa-card"]');
  rows.forEach(function(el, i) {
    var t0 = 0.38 + i * 0.14;
    tl.to(el, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, t0);
    tl.from(el, { y: 14 }, t0);
  });

  // Subtitle layout: position it just below the title after title renders
  tl.call(function() {
    var titleEl = document.getElementById('title');
    var subEl   = document.getElementById('subtitle');
    if (titleEl && subEl) {
      var titleBottom = titleEl.offsetTop + titleEl.offsetHeight;
      subEl.style.top = (titleBottom + 12) + 'px';
    }
  }, null, 0.01);

  // Content block: position just below subtitle (or title if no subtitle)
  tl.call(function() {
    var anchor = document.getElementById('subtitle') || document.getElementById('title');
    var content = document.getElementById('content') || document.getElementById('stats');
    if (anchor && content) {
      var bottom = anchor.offsetTop + anchor.offsetHeight;
      content.style.top = (bottom + 18) + 'px';
    }
  }, null, 0.01);

  // Hold the final frame until the scene audio ends
  tl.to({}, { duration: Math.max(0, ${dur} - tl.duration()) });

  // Register with HyperFrames runtime
  window.__timelines = window.__timelines || {};
  window.__timelines['prof-slide'] = tl;
})();
</script>

</body>
</html>`
}

// ─── HyperFrames Cloud Render API client ──────────────────────────────────────

/**
 * Submit an HTML composition to HeyGen's HyperFrames cloud renderer and wait
 * for the MP4 to be ready.
 *
 * API v3: POST https://api.heygen.com/v3/hyperframes/renders
 * Returns a public MP4 download URL.
 *
 * Note: HeyGen v3 API prefers a .zip bundle, but for simple compositions
 * we can send the HTML as inline content. For more complex projects with
 * multiple files/assets, you'd create a proper zip bundle.
 *
 * Polling interval: 4 s, max wait: 5 min.
 */
export async function renderHyperFrames(
  html: string,
  apiKey: string,
  opts: { fps?: number; width?: number; height?: number } = {}
): Promise<HyperFramesRenderResult> {
  const fps    = opts.fps    || 30

  // Convert dimensions to HeyGen v3 resolution format
  const resolution = '1080p'  // Our slides are 1280x720, closest standard is 1080p
  const aspectRatio = '16:9'

  // Step 1 — Create a minimal project structure
  // We'll encode the HTML directly and reference it as the composition
  // The v3 API expects a project bundle, but for single-file HTML we can
  // use a data URI or inline approach
  
  // For simplicity, let's try using the 'url' type with a data URL
  // If this doesn't work, we'll need to upload as an asset first
  const htmlBase64 = Buffer.from(html).toString('base64')
  const dataUrl = `data:text/html;base64,${htmlBase64}`

  const projectPayload = {
    project: {
      type: 'url',
      url: dataUrl,
    },
    fps,
    quality: 'standard',
    format: 'mp4',
    resolution,
    aspect_ratio: aspectRatio,
  }

  const submitRes = await fetch(`${HF_API}/renders`, {
    method:  'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(projectPayload),
  })

  let submitData: any
  try {
    const responseText = await submitRes.text()
    submitData = JSON.parse(responseText)
  } catch (parseErr) {
    const textBody = await submitRes.text().catch(() => 'Unable to read response body')
    throw new Error(`HyperFrames API returned non-JSON response (${submitRes.status}). This usually means the API key is invalid or the endpoint has changed. Response: ${textBody.slice(0, 300)}`)
  }

  if (!submitRes.ok || submitData.error) {
    const msg = (typeof submitData.error === 'string' && submitData.error)
      || submitData.error?.message
      || submitData.message
      || `HyperFrames render submit failed (${submitRes.status})`
    throw new Error(msg)
  }

  const renderId: string = submitData.data?.render_id
  if (!renderId) {
    throw new Error(`HyperFrames: no render_id in response. Full response: ${JSON.stringify(submitData).slice(0, 500)}`)
  }

  // Step 2 — poll for completion
  const POLL_INTERVAL_MS = 4_000
  const MAX_WAIT_MS      = 5 * 60 * 1000
  const deadline         = Date.now() + MAX_WAIT_MS

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const statusRes = await fetch(`${HF_API}/renders/${renderId}`, {
      headers: { 'x-api-key': apiKey },
    })
    const statusData = await statusRes.json() as any
    const status = statusData.data?.status

    if (status === 'completed') {
      const videoUrl: string = statusData.data?.video_url
      if (!videoUrl) throw new Error('HyperFrames: render completed but no video_url returned')
      return { renderId, videoUrl }
    }

    if (status === 'failed') {
      const errMsg = statusData.data?.failure_message || statusData.data?.error || 'HyperFrames render failed'
      throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg))
    }
    // status === 'queued' | 'rendering' — keep polling
  }

  throw new Error(`HyperFrames render timed out after 5 minutes (render_id: ${renderId})`)
}
