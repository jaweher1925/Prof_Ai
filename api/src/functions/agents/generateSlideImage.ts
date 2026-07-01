/**
 * POST /api/generateSlideImage
 *
 * Generates educational SVG diagrams using Gemini.
 * Gemini describes what diagram should be shown, then we generate the SVG.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'
import sharp from 'sharp'

async function generateSlideImageHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { 
      scene_id?: string
      custom_prompt?: string
    }
    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }

    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: { module: true },
    })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { status: 500, jsonBody: { error: 'Image generation not configured' } }
    }

    context.log(`Generating educational diagram for scene ${body.scene_id}`)

    // Get script content
    const scriptText = scene.scriptContent || ''
    const moduleTitle = scene.module?.title || 'Educational content'

    // Use Gemini to generate diagram structure
    const diagramDescription = await generateDiagramWithGemini(
      apiKey,
      scriptText,
      moduleTitle,
      body.custom_prompt,
      context
    )

    // Generate SVG based on description
    const svgString = generateEducationalSVG(diagramDescription)

    // Convert SVG to PNG using sharp
    const imageBuffer = await sharp(Buffer.from(svgString))
      .png()
      .toBuffer()

    // Upload to storage
    const savedUrl = await uploadBuffer(imageBuffer, 'png', 'image/png')

    // Update scene
    const currentContent = (() => {
      try {
        return JSON.parse(scene.slideDeckContent || '{}')
      } catch {
        return {}
      }
    })()

    await prisma.scene.update({
      where: { id: body.scene_id },
      data: {
        slideDeckContent: JSON.stringify({
          ...currentContent,
          imageUrl: savedUrl,
          imageWidth: currentContent.imageWidth || 36,
          imageShape: currentContent.imageShape || 'rounded',
        }),
      },
    })

    context.log(`Successfully generated diagram for scene ${body.scene_id}`)

    return {
      status: 200,
      jsonBody: { success: true, image_url: savedUrl },
    }
  } catch (error: any) {
    context.error('generateSlideImage error:', error)
    return { status: 500, jsonBody: { error: error.message || 'Image generation failed' } }
  }
}

async function generateDiagramWithGemini(
  apiKey: string,
  scriptText: string,
  moduleTitle: string,
  customPrompt: string | undefined,
  context: InvocationContext
): Promise<any> {
  let prompt = customPrompt

  if (!prompt) {
    const firstSentence = scriptText.split(/[.!?]/)[0] || ''
    const contentKeywords = extractKeywords(scriptText)
    
    prompt = `You are an expert educational content designer creating diagrams for students.

TEACHING CONTENT:
─────────────────
Title: "${firstSentence}"
Module: ${moduleTitle}
Script: ${scriptText.substring(0, 500)}
${contentKeywords.length > 0 ? `Key Concepts: ${contentKeywords.join(', ')}` : ''}

TASK:
─────
Create a clear, educational diagram structure that:
1. Helps students understand the main concepts
2. Shows relationships between ideas
3. Uses 3-5 distinct elements maximum
4. Has a logical flow that makes sense for learning

RESPONSE FORMAT - RESPOND ONLY WITH VALID JSON (no markdown, no extra text):
───────────────────────────────────────────────────────────────────────────
{
  "title": "Brief, descriptive title of the diagram (5-10 words)",
  "type": "flowchart | hierarchy | cycle | comparison | process",
  "elements": [
    {"label": "Element 1 (5 words max)", "color": "#3B82F6"},
    {"label": "Element 2 (5 words max)", "color": "#10B981"},
    {"label": "Element 3 (5 words max)", "color": "#F59E0B"}
  ],
  "connections": [
    {"from": "Element 1", "to": "Element 2", "label": "action or relationship"},
    {"from": "Element 2", "to": "Element 3", "label": "action or relationship"}
  ]
}

IMPORTANT:
- Each element label should be 3-5 words, not full sentences
- Colors should be educational and distinct (use #3B82F6, #10B981, #F59E0B, #EC4899, #8B5CF6)
- Relationships should be clear and directional
- Make it easy for a student to understand at a glance`
  }

  try {
    context.log(`API Key present: ${!!apiKey}`)
    context.log(`Script text length: ${scriptText.length}`)
    context.log(`Module title: ${moduleTitle}`)
    context.log(`Custom prompt: ${customPrompt ? 'provided' : 'none'}`)
    
    // Use gemini-2.5-flash model which supports more stable responses
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            temperature: 0.8, 
            maxOutputTokens: 2000,
            topP: 0.95,
            topK: 64,
          },
        }),
      }
    )

    context.log(`Gemini response status: ${geminiResponse.status}`)

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json()
      context.error('Gemini API error response:', JSON.stringify(errorData))
      throw new Error(`Gemini error (${geminiResponse.status}): ${JSON.stringify((errorData as any).error || errorData)}`)
    }

    const data = (await geminiResponse.json()) as any
    context.log(`Gemini response candidates: ${data.candidates?.length || 0}`)

    if (!data.candidates || data.candidates.length === 0) {
      context.error('No candidates in Gemini response')
      throw new Error('Empty candidates from Gemini API')
    }

    const responseText = data.candidates[0]?.content?.parts?.[0]?.text || ''

    context.log(`Gemini response text length: ${responseText.length}`)
    context.log(`Gemini response (first 300 chars): ${responseText.substring(0, 300)}`)

    if (!responseText) {
      context.error('Empty text response from Gemini')
      throw new Error('Empty text response from Gemini API')
    }

    // Extract JSON from response - handle markdown code blocks and raw JSON
    let jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/)
    if (!jsonMatch) {
      jsonMatch = responseText.match(/```\n?([\s\S]*?)\n?```/)
    }
    if (!jsonMatch) {
      jsonMatch = responseText.match(/\{[\s\S]*\}/)
    }
    
    if (!jsonMatch) {
      context.log('No JSON found in response, using fallback')
      context.log('Full response was:', responseText)
      throw new Error('Could not parse JSON from Gemini')
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0]
    context.log(`Extracted JSON (first 200 chars): ${jsonStr.substring(0, 200)}`)
    
    const diagramDescription = JSON.parse(jsonStr)
    context.log(`Successfully parsed diagram with ${diagramDescription.elements?.length || 0} elements`)
    return diagramDescription
  } catch (error: any) {
    context.error('Gemini generation error:', error.message)
    context.error('Error stack:', error.stack)
    
    // Enhanced fallback diagram with variety based on script content
    const firstSentence = scriptText.split(/[.!?]/)[0] || 'Educational Content'
    const wordCount = scriptText.split(/\s+/).length
    
    // Create unique diagrams based on content characteristics
    let fallbackElements = [
      { label: 'Introduction', color: '#3B82F6' },
      { label: 'Main Concept', color: '#10B981' },
      { label: 'Application', color: '#F59E0B' },
    ]
    
    if (wordCount > 100) {
      fallbackElements.push({ label: 'Analysis', color: '#EC4899' })
    }
    
    if (scriptText.toLowerCase().includes('example')) {
      fallbackElements.push({ label: 'Example', color: '#8B5CF6' })
    }

    return {
      title: firstSentence.substring(0, 50),
      type: 'flowchart',
      elements: fallbackElements,
      connections: fallbackElements.length > 2 ? [
        { from: fallbackElements[0].label, to: fallbackElements[1].label, label: 'leads to' },
        { from: fallbackElements[1].label, to: fallbackElements[2].label, label: 'produces' },
      ] : [],
    }
  }
}

/**
 * Extract key concepts from script text for diagram context
 */
function extractKeywords(text: string): string[] {
  if (!text) return []
  
  // Common educational keywords to look for
  const keywords = [
    'definition', 'process', 'step', 'example', 'method', 'approach',
    'theory', 'concept', 'principle', 'formula', 'equation', 'law',
    'pattern', 'structure', 'system', 'component', 'element',
  ]
  
  const found: string[] = []
  
  keywords.forEach(keyword => {
    if (text.toLowerCase().includes(keyword) && !found.includes(keyword)) {
      found.push(keyword)
    }
  })
  
  return found.slice(0, 5)
}

function generateEducationalSVG(description: any): string {
  const width = 1024
  const height = 768
  const padding = 80

  const colors = {
    primary: '#1E40AF',
    text: '#1F2937',
    bg: '#FFFFFF',
    line: '#9CA3AF',
  }

  let elements = description.elements || []
  const connections = description.connections || []
  const title = description.title || 'Diagram'

  // Position elements in a grid
  const cols = Math.ceil(Math.sqrt(Math.max(elements.length, 1)))
  const rows = Math.ceil(elements.length / cols)
  const cellWidth = (width - padding * 2) / Math.max(cols, 1)
  const cellHeight = (height - padding * 2 - 80) / Math.max(rows, 1)

  const elementMap: any = {}
  elements.forEach((el: any, i: number) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    elementMap[el.label] = {
      x: padding + col * cellWidth + cellWidth / 2,
      y: padding + 80 + row * cellHeight + cellHeight / 2,
      ...el,
    }
  })

  // Build SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="${colors.line}" />
    </marker>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${colors.bg}" stroke="#E5E7EB" stroke-width="1" />

  <!-- Title -->
  <text x="${width / 2}" y="50" font-size="28" font-weight="bold" fill="${colors.primary}" text-anchor="middle">${title}</text>`

  // Draw connections
  connections.forEach((conn: any) => {
    const from = elementMap[conn.from]
    const to = elementMap[conn.to]
    if (from && to) {
      svg += `\n  <path d="M ${from.x} ${from.y} L ${to.x} ${to.y}" stroke="${colors.line}" stroke-width="2" fill="none" marker-end="url(#arrowhead)" />`
    }
  })

  // Draw elements
  Object.values(elementMap).forEach((el: any) => {
    const boxWidth = 140
    const boxHeight = 80
    const color = el.color || '#3B82F6'

    svg += `\n  <rect x="${el.x - boxWidth / 2}" y="${el.y - boxHeight / 2}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="${color}" opacity="0.9" stroke="${color}" stroke-width="2" />`
    svg += `\n  <text x="${el.x}" y="${el.y}" font-size="14" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${el.label}</text>`
  })

  svg += '\n</svg>'
  return svg
}

app.http('generateSlideImage', {
  methods: ['POST'],
  route: 'generateSlideImage',
  authLevel: 'anonymous',
  handler: generateSlideImageHandler,
})
