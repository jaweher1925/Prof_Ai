/**
 * POST /api/generate-image
 *
 * Generates an image from a user prompt using Gemini's native image
 * generation ("nano banana"), saves it through the same storage helper the
 * regular upload flow uses, and returns { file_url } — so the Visual
 * Designer can treat a generated image exactly like an uploaded one.
 *
 * Body:    { prompt: string }
 * Returns: { file_url: "/api/uploads/<uuid>.png" }
 *
 * Uses OPENAI_API_KEY (the Gemini key, same as lib/llm.ts). Model can be
 * overridden with GEMINI_IMAGE_MODEL.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'
import { chromaKeyToTransparent, CHROMA_KEY_HEX } from '../../lib/chromaKey'

const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'
// Older preview model kept as a fallback in case the account doesn't have
// access to the GA image model yet.
const FALLBACK_MODEL = 'gemini-2.0-flash-preview-image-generation'

interface GeminiPart {
  text?: string
  inlineData?: { mimeType?: string; data?: string }
}

async function callGeminiImage(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ ok: boolean; status: number; parts?: GeminiPart[]; error?: string }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    },
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, error: text.slice(0, 500) }
  }

  const json = (await res.json()) as any
  const parts: GeminiPart[] = json?.candidates?.[0]?.content?.parts ?? []
  return { ok: true, status: res.status, parts }
}

app.http('generateImage', {
  methods: ['POST'],
  route: 'generate-image',
  authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

    try {
      const body = (await req.json()) as { prompt?: string; imageType?: string }
      const prompt = body?.prompt?.trim()
      if (!prompt) return { status: 400, jsonBody: { error: 'prompt is required' } }
      if (prompt.length > 2000) {
        return { status: 400, jsonBody: { error: 'Prompt too long (max 2000 characters)' } }
      }

      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        return { status: 500, jsonBody: { error: 'Image generation not configured (missing API key)' } }
      }

      // Diagrams/schemas/architecture figures get overlaid directly on the
      // slide's own themed background, so a rectangular opaque illustration
      // looks like a sticker slapped on top. The frontend now lets the user
      // pick the type explicitly (imageType) so detection isn't a guess —
      // fall back to sniffing the prompt text for callers that don't send it.
      const KNOWN_DIAGRAM_TYPES = ['schema', 'diagram', 'architecture', 'flowchart', 'system design', 'wireframe']
      const explicitType = body?.imageType?.trim().toLowerCase()
      const isDiagramLike = explicitType
        ? KNOWN_DIAGRAM_TYPES.includes(explicitType)
        : /\b(schema|diagram|architecture|flowchart|flow chart|system design|wireframe)\b/i.test(prompt)

      // Nudge the model toward slide-friendly output without overriding the
      // user's own description.
      //
      // IMPORTANT: Gemini's image models don't actually output a real alpha
      // channel — asking for "a transparent background" just makes the
      // model DRAW a checkerboard pattern (the standard editor convention
      // for depicting transparency) as literal opaque pixels, which then
      // shows up baked into the slide instead of real transparency. Instead,
      // ask for a solid, flat chroma-key backdrop color the model can render
      // accurately and consistently, then key it out to real alpha ourselves
      // afterward (see chromaKeyToTransparent below).
      const diagramTypeLabel = (explicitType && KNOWN_DIAGRAM_TYPES.includes(explicitType)) ? explicitType : 'diagram'
      const fullPrompt = isDiagramLike
        ? `${prompt}\n\n` +
          `Style requirements: clean, high-quality technical ${diagramTypeLabel} illustration ` +
          `suitable for an educational presentation slide. Render ONLY the ${diagramTypeLabel} ` +
          `elements (boxes, arrows, labels, icons) — and fill the ENTIRE background evenly with ` +
          `a single, solid, flat chroma-key color: bright magenta ${CHROMA_KEY_HEX} (RGB 255,0,255). ` +
          `The magenta must cover 100% of the background with no gradient, no shading, no texture, ` +
          `and no drop shadow behind the whole image. Do NOT use this magenta color anywhere in the ` +
          `${diagramTypeLabel} elements themselves (boxes, text, icons, arrows) — it must appear ` +
          `ONLY as the flat backdrop, since it will be removed programmatically afterward. ` +
          `No watermarks, no text overlays unless explicitly requested.`
        : `${prompt}\n\n` +
          `Style requirements: clean, high-quality illustration suitable for an ` +
          `educational presentation slide. No watermarks, no text overlays unless ` +
          `explicitly requested.`

      ctx.log(`[generate-image] "${prompt.slice(0, 80)}" via ${DEFAULT_MODEL}${isDiagramLike ? ' (chroma-key diagram)' : ''}`)

      let result = await callGeminiImage(apiKey, DEFAULT_MODEL, fullPrompt)
      if (!result.ok && (result.status === 404 || result.status === 400)) {
        ctx.warn(`[generate-image] ${DEFAULT_MODEL} unavailable (${result.status}), trying ${FALLBACK_MODEL}`)
        result = await callGeminiImage(apiKey, FALLBACK_MODEL, fullPrompt)
      }

      if (!result.ok) {
        ctx.error(`[generate-image] Gemini error ${result.status}: ${result.error}`)
        const friendly =
          result.status === 429
            ? 'Rate limit reached — wait a moment and try again'
            : 'Image generation failed — try rephrasing your prompt'
        return { status: 502, jsonBody: { error: friendly } }
      }

      const imagePart = result.parts?.find(p => p.inlineData?.data)
      if (!imagePart?.inlineData?.data) {
        // Model replied with text only (e.g. refused the prompt)
        const textReply = result.parts?.find(p => p.text)?.text?.slice(0, 200)
        return {
          status: 422,
          jsonBody: { error: textReply || 'The model did not return an image — try a different prompt' },
        }
      }

      let mime = imagePart.inlineData.mimeType || 'image/png'
      let ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png'
      let outMime = mime
      let buffer: Buffer = Buffer.from(imagePart.inlineData.data, 'base64')

      // Key out the magenta backdrop for diagram-like images so what actually
      // gets stored/overlaid on the slide has real transparency instead of a
      // flat magenta (or checkerboard) rectangle.
      //
      // transparencyApplied (2026-08-17, "i generate img in media and click
      // transparent but it is not" / "i don't want to have pixclt png bg i
      // need it transparent") — this used to catch a chroma-key failure,
      // log a warning ONLY the server ever sees, and silently upload the
      // raw un-keyed image as if everything succeeded. Two distinct failure
      // modes turned up: (1) chroma-key itself throwing (environment/sharp
      // issue), and (2) Gemini simply not following the "solid magenta"
      // instruction and drawing its own checkerboard instead — a
      // probabilistic model-compliance miss, not a deterministic bug, which
      // chromaKeyToTransparent now detects and throws on too (see
      // chromaKey.ts's border-sample check). Since #2 is probabilistic, a
      // fresh generation attempt often just succeeds on its own — so retry
      // the WHOLE generation (not just the removal step; re-keying the same
      // non-magenta image would just fail again) up to MAX_ATTEMPTS times
      // before giving up and reporting failure to the frontend.
      let transparencyApplied = false
      if (isDiagramLike) {
        const MAX_ATTEMPTS = 3
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            buffer = await chromaKeyToTransparent(buffer)
            ext = 'png'
            outMime = 'image/png'
            transparencyApplied = true
            break
          } catch (e: any) {
            ctx.error(`[generate-image] chroma-key attempt ${attempt}/${MAX_ATTEMPTS} failed: ${e?.stack || e?.message || e}`)
            if (attempt === MAX_ATTEMPTS) break

            // Generate a FRESH image for the next attempt — re-running
            // chroma-key on the same buffer would just fail identically
            // (the model already ignored the instruction once); a new
            // independent generation gives it another chance to comply.
            let retry = await callGeminiImage(apiKey, DEFAULT_MODEL, fullPrompt)
            if (!retry.ok) retry = await callGeminiImage(apiKey, FALLBACK_MODEL, fullPrompt)
            const retryPart = retry.ok ? retry.parts?.find(p => p.inlineData?.data) : undefined
            if (!retryPart?.inlineData?.data) {
              ctx.warn(`[generate-image] retry ${attempt} produced no usable image, stopping retries`)
              break
            }
            mime = retryPart.inlineData.mimeType || mime
            buffer = Buffer.from(retryPart.inlineData.data, 'base64')
          }
        }
      }

      const file_url = await uploadBuffer(buffer, ext, outMime)

      ctx.log(`[generate-image] saved ${buffer.length} bytes → ${file_url}`)
      return {
        status: 200,
        jsonBody: {
          file_url,
          // Only meaningful when isDiagramLike — a non-diagram illustration
          // was never supposed to have a transparent backdrop, so the
          // frontend should only warn when this is explicitly false.
          transparencyApplied: isDiagramLike ? transparencyApplied : null,
        },
      }
    } catch (e: any) {
      ctx.error('[generate-image] error:', e)
      return { status: 500, jsonBody: { error: e?.message ?? 'Image generation failed' } }
    }
  },
})
