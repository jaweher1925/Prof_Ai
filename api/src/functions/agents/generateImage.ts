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
      const body = (await req.json()) as { prompt?: string }
      const prompt = body?.prompt?.trim()
      if (!prompt) return { status: 400, jsonBody: { error: 'prompt is required' } }
      if (prompt.length > 2000) {
        return { status: 400, jsonBody: { error: 'Prompt too long (max 2000 characters)' } }
      }

      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        return { status: 500, jsonBody: { error: 'Image generation not configured (missing API key)' } }
      }

      // Nudge the model toward slide-friendly output without overriding the
      // user's own description.
      const fullPrompt =
        `${prompt}\n\n` +
        `Style requirements: clean, high-quality illustration suitable for an ` +
        `educational presentation slide. No watermarks, no text overlays unless ` +
        `explicitly requested.`

      ctx.log(`[generate-image] "${prompt.slice(0, 80)}" via ${DEFAULT_MODEL}`)

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

      const mime = imagePart.inlineData.mimeType || 'image/png'
      const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png'
      const buffer = Buffer.from(imagePart.inlineData.data, 'base64')
      const file_url = await uploadBuffer(buffer, ext, mime)

      ctx.log(`[generate-image] saved ${buffer.length} bytes → ${file_url}`)
      return { status: 200, jsonBody: { file_url } }
    } catch (e: any) {
      ctx.error('[generate-image] error:', e)
      return { status: 500, jsonBody: { error: e?.message ?? 'Image generation failed' } }
    }
  },
})
