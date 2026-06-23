/** LLM helper — text generation for course pipeline. */
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey:  process.env.OPENAI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
})

const MODEL = process.env.OPENAI_MODEL || 'gemini-2.5-flash'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Call the LLM with automatic retry on rate-limit (429).
 * Reads retry-after header and waits, then retries.
 * Backs off exponentially up to 4 retries.
 */
async function callWithRetry(
  params: Parameters<typeof openai.chat.completions.create>[0],
  retries = 4
): Promise<OpenAI.Chat.ChatCompletion> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await openai.chat.completions.create(params) as OpenAI.Chat.ChatCompletion
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('Rate limit')

      if (isRateLimit && attempt < retries) {
        const raw = err?.headers?.['retry-after'] ?? err?.response?.headers?.['retry-after']
        // retry-after in seconds; values < 10 are seconds, larger values are ms
        const waitMs = raw
          ? parseFloat(raw) * (parseFloat(raw) < 10 ? 1000 : 1)
          : Math.min(3000 * 2 ** attempt, 30000)
        console.warn(`[LLM] Rate limit — waiting ${Math.round(waitMs / 1000)}s (retry ${attempt + 1}/${retries})`)
        await sleep(waitMs + 200)
        continue
      }
      throw err
    }
  }
  throw new Error('LLM call failed after maximum retries')
}

/** Strip ```json fences and other wrapping the model sometimes adds despite json_object mode. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return fenced ? fenced[1] : text
}

/** Common, safe-to-apply repairs for near-valid JSON the model occasionally emits. */
function repairJson(text: string): string {
  return text
    // trailing commas before a closing bracket/brace
    .replace(/,(\s*[\]}])/g, '$1')
    // smart quotes that sneak into otherwise-valid JSON strings
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
}

/** Parse JSON with a couple of forgiving fallbacks before giving up. */
function parseJsonLenient<T>(raw: string): T {
  const text = stripCodeFence(raw).trim()
  try {
    return JSON.parse(text) as T
  } catch (firstErr) {
    try {
      return JSON.parse(repairJson(text)) as T
    } catch {
      // Surface the original error with a snippet of the offending text for debugging.
      const err = firstErr as SyntaxError
      const posMatch = err.message.match(/position (\d+)/)
      const pos = posMatch ? parseInt(posMatch[1], 10) : 0
      const snippet = text.slice(Math.max(0, pos - 80), pos + 80)
      throw new Error(`${err.message} — near: ...${snippet}...`)
    }
  }
}

export async function generateJson<T = unknown>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 16384
): Promise<T> {
  let lastErr: unknown

  // Up to 2 attempts total — LLM JSON output is occasionally malformed (truncation,
  // stray trailing commas, smart quotes); a fresh sample often comes back clean.
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await callWithRetry({
      model:                MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      response_format:      { type: 'json_object' },
      temperature:          0.2,
      max_completion_tokens: maxTokens,
    })

    const text = completion.choices[0]?.message?.content
    if (!text) {
      lastErr = new Error('Empty LLM response')
      continue
    }

    try {
      return parseJsonLenient<T>(text)
    } catch (err) {
      console.warn(`[LLM] generateJson parse failed (attempt ${attempt + 1}/2): ${(err as Error).message}`)
      lastErr = err
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('LLM returned invalid JSON')
}

export async function generateText(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const completion = await callWithRetry({
    model:    MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    temperature: 0.5,
  })
  return completion.choices[0]?.message?.content || ''
}
