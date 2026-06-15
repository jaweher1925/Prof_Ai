/**
 * LLM helper — uses standard OpenAI API (api.openai.com).
 * When you get Azure OpenAI later, just set USE_AZURE=true in your env
 * and add the AZURE_OPENAI_* variables. The interface stays the same.
 */
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // No baseURL override = uses https://api.openai.com/v1 (standard OpenAI)
})

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o'

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
