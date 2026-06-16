/** LLM helper — text generation for course pipeline. */
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

const MODEL = process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Call the LLM with automatic retry on rate-limit (429).
 * Groq free tier: 12,000 TPM — waits for the retry-after header then tries again.
 * Retries up to 4 times with exponential back-off.
 */
async function callWithRetry(
  params: Parameters<typeof openai.chat.completions.create>[0],
  retries = 4
): Promise<OpenAI.Chat.ChatCompletion> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await openai.chat.completions.create(params) as OpenAI.Chat.ChatCompletion
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('Rate limit')
      if (isRateLimit && attempt < retries) {
        // Groq returns retry-after in milliseconds or seconds — parse it
        const retryAfterRaw = err?.headers?.['retry-after'] 