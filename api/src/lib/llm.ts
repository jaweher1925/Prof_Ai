/** LLM helper — text generation for course pipeline. */
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

const MODEL = process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile'

export async function generateJson<T = unknown>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  })

  const text = completion.choices[0]?.message?.content
  if (!text) throw new Error('Empty LLM response')
  return JSON.parse(text) as T
}

export async function generateText(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
  })
  return completion.choices[0]?.message?.content || ''
}
