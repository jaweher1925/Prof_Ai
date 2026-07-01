# Feature: AI Image Generation for Visual Designer

**Status**: Spec & Design  
**Priority**: High  
**Complexity**: Medium  
**Timeline**: 1-2 days implementation

---

## Overview

Users want to generate slide background images automatically using Gemini (or OpenAI) based on:
- Scene script text (narration content)
- Scene title
- Module context

Instead of manually uploading an image, users can click **"Generate"** and ProfAI will:
1. Send script + context to Gemini vision API
2. Generate a creative, relevant background image
3. Display it on the slide preview
4. Let user adjust width, shape, position as usual

---

## User Flow

### Current (Manual Upload)
```
Visual Designer
  ↓
Image Panel → Upload button
  ↓
Choose file → Shows image on slide
```

### Proposed (With AI Generation)
```
Visual Designer
  ↓
Image Panel
  ├─ Generate (NEW)
  │  ├─ Click → Shows loading spinner
  │  ├─ Gemini processes scene script
  │  └─ Image appears on slide
  │
  └─ Upload (existing)
     ├─ Choose file
     └─ Shows image on slide
```

---

## Implementation Plan

### Phase 1: Backend — Image Generation Service

**New File**: `api/src/functions/agents/generateSlideImage.ts`

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'

const GEMINI_API = 'https://generativelanguage.googleapis.com'

/**
 * POST /api/generateSlideImage
 * 
 * Takes a scene's script text and generates an AI image suitable for the slide background.
 * Uses Gemini vision to understand the context and create a relevant visual.
 * 
 * Request body:
 * {
 *   scene_id: string,        // Scene to add image to
 *   generate_mode: 'basic' | 'detailed'  // 'basic': quick draft, 'detailed': higher quality
 * }
 * 
 * Response: { success: true, image_url: '...' }
 */
async function generateSlideImageHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as {
      scene_id?: string
      generate_mode?: 'basic' | 'detailed'
    }

    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }

    // Get scene + module to understand context
    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: { module: { include: { project: true } } },
    })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

    const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
    if (!apiKey) {
      return { status: 500, jsonBody: { error: 'Image generation API not configured' } }
    }

    context.log(`Generating slide image for scene ${body.scene_id}`)

    // Build prompt from scene content
    const script = scene.scriptContent || ''
    const title = scene.visualPrompt || ''
    const moduleTitle = scene.module?.title || ''
    
    const prompt = buildImagePrompt({
      scriptText: script,
      sceneTitle: title,
      moduleTitle: moduleTitle,
      mode: body.generate_mode || 'basic',
    })

    // Call Gemini to generate image
    const imageBuffer = await generateImageWithGemini(prompt, apiKey, context)
    
    // Upload to storage
    const imageUrl = await uploadBuffer(imageBuffer, 'png', 'image/png')

    // Update scene with new image
    await prisma.scene.update({
      where: { id: body.scene_id },
      data: {
        slideDeckContent: updateSlideContent(scene.slideDeckContent || '{}', imageUrl),
      },
    })

    context.log(`Generated slide image for scene ${body.scene_id}: ${imageUrl}`)

    return {
      status: 200,
      jsonBody: { success: true, image_url: imageUrl },
    }
  } catch (error: any) {
    context.error('generateSlideImage error:', error)
    return { status: 500, jsonBody: { error: error.message || 'Image generation failed' } }
  }
}

function buildImagePrompt(options: {
  scriptText: string
  sceneTitle: string
  moduleTitle: string
  mode: 'basic' | 'detailed'
}): string {
  const { scriptText, sceneTitle, moduleTitle, mode } = options
  
  const quality = mode === 'detailed'
    ? 'Generate a high-quality, professional, detailed background image.'
    : 'Generate a clean, modern, professional background image.'
  
  const mainTopic = sceneTitle || scriptText.split(/[.!?]/)[0] || 'Educational content'
  
  return `
You are an AI that generates professional educational background images for presentation slides.

Context:
- Module: "${moduleTitle}"
- Slide Topic: "${mainTopic}"
- Narration Preview: "${scriptText.substring(0, 300)}"

${quality}
The image should:
1. Be suitable as a background for a professional educational presentation
2. Reflect the topic: "${mainTopic}"
3. Use professional colors (blues, grays, greens, purples - avoid overly bright colors)
4. Include subtle geometric shapes or patterns
5. Leave space in the center/right for text and avatar overlay
6. Resolution: 1920x1080px (16:9 aspect ratio)
7. Style: Modern, clean, minimalist
8. NOT contain any text, watermarks, or faces

Generate an image that would be appropriate for this slide.
`
}

async function generateImageWithGemini(
  prompt: string,
  apiKey: string,
  context: InvocationContext
): Promise<Buffer> {
  // Using OpenAI DALL-E API (faster) — can also use Google's Imagen or Gemini
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1920x1080',
      quality: 'standard',  // 'hd' for higher quality but costs 2x
      style: 'natural',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Image API error: ${error}`)
  }

  const data = await response.json() as any
  const imageUrl = data.data?.[0]?.url

  if (!imageUrl) throw new Error('No image URL returned')

  // Download the image
  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) throw new Error('Failed to download generated image')

  return Buffer.from(await imageRes.arrayBuffer())
}

function updateSlideContent(existing: string, imageUrl: string): string {
  try {
    const parsed = JSON.parse(existing)
    return JSON.stringify({
      ...parsed,
      imageUrl,
      imageWidth: parsed.imageWidth || 36,
      imageShape: parsed.imageShape || 'rounded',
    })
  } catch {
    return JSON.stringify({
      imageUrl,
      imageWidth: 36,
      imageShape: 'rounded',
    })
  }
}

app.http('generateSlideImage', {
  methods: ['POST'],
  route: 'generateSlideImage',
  authLevel: 'anonymous',
  handler: generateSlideImageHandler,
})
```

---

### Phase 2: Service Layer — Frontend

**File**: `src/services/agents.js`

Add to existing agentsService:

```typescript
export const agentsService = {
  // ... existing methods ...
  
  /**
   * Generate AI image for slide background
   */
  async generateSlideImage(sceneId: string, mode: 'basic' | 'detailed' = 'basic') {
    return apiClient.post('/api/generateSlideImage', {
      scene_id: sceneId,
      generate_mode: mode,
    })
  },
}
```

---

### Phase 3: UI Component — Image Panel Update

**File**: `src/components/workspace/VisualDesignerPanel.jsx`

**Lines 1010-1050** — Update the Image/Figure section:

```jsx
{/* ── IMAGE / FIGURE ─────────────────────────────────────────────────────── */}
<div className="mb-4 rounded-xl bg-slate-900/40 border border-white/[0.06] overflow-hidden">
  {/* Header */}
  <button
    onClick={() => setShowImgPanel(v => !v)}
    className="w-full flex items-center justify-between px-3 py-3 hover:bg-white/[0.02] transition-colors"
  >
    <div className="flex items-center gap-2">
      <Image className="w-4 h-4 text-violet-400" />
      <p className="text-xs font-semibold text-white">Image / Figure</p>
      {imageUrl && <span className="text-[9px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">Added · drag to move</span>}
    </div>
    <span className="text-slate-500 text-xs">{showImgPanel ? '▲' : '▼'}</span>
  </button>

  {showImgPanel && (
    <div className="px-3 pb-3 space-y-3 border-t border-white/[0.04]">
      
      {/* Generate or Upload Options */}
      <div className="pt-3 flex gap-2">
        {/* GENERATE BUTTON (NEW) */}
        <button
          onClick={handleGenerateImage}
          disabled={aiLoading || !scriptText.trim()}
          title={!scriptText.trim() ? 'Add script text first' : 'Generate background image from AI'}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed
            border-violet-500/40 bg-violet-600/15 text-violet-300 hover:bg-violet-600/25 hover:border-violet-500/60"
        >
          {aiLoading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              <span>Generate</span>
            </>
          )}
        </button>

        {/* OR DIVIDER */}
        <div className="flex items-center px-2">
          <div className="w-px h-4 bg-slate-700" />
          <span className="text-[9px] text-slate-600 px-1">or</span>
          <div className="w-px h-4 bg-slate-700" />
        </div>

        {/* UPLOAD BUTTON (existing) */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium border border-white/10 bg-slate-800/60 text-slate-300 hover:border-violet-500/40 hover:text-violet-300 transition-colors"
        >
          Upload
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* Quality Option */}
      {aiLoading && (
        <div className="text-[10px] text-slate-500 text-center py-2">
          🎨 Generating image from your script...
        </div>
      )}

      {/* Preview strip (existing code, unchanged) */}
      {imageUrl && (
        <div className="flex items-center gap-3">
          {/* ... existing preview code ... */}
        </div>
      )}
    </div>
  )}
</div>
```

**Add State**:

```jsx
const [aiLoading, setAiLoading] = useState(false)
const [aiError, setAiError] = useState(null)
```

**Add Handler**:

```jsx
const handleGenerateImage = async () => {
  if (!scriptText.trim()) {
    setAiError('Add script text first')
    return
  }

  setAiLoading(true)
  setAiError(null)

  try {
    const result = await agentsService.generateSlideImage(scene.id, 'basic')
    if (result.image_url) {
      setImageUrl(result.image_url)
      setTimeout(saveContent, 50)
    }
  } catch (error: any) {
    setAiError(error.message || 'Failed to generate image')
    console.error('AI image generation error:', error)
  } finally {
    setAiLoading(false)
  }
}
```

---

## Cost Breakdown

### API Costs (Monthly for 1,000 videos)

| Provider | Model | Cost per Image | 1,000 imgs/mo | Notes |
|----------|-------|----------------|---------------|-------|
| **OpenAI** | DALL-E 3 | $0.04 (standard) | $40 | Fast, quality |
| **OpenAI** | DALL-E 3 | $0.08 (HD) | $80 | Higher quality |
| **Google** | Imagen 3 | $0.006 | $6 | Cheapest |
| **Stability** | StableDiffusion XL | $0.006 | $6 | Good quality |

**Recommendation**: Start with **DALL-E 3 standard ($0.04)** for balance of quality and cost.

---

## Implementation Steps

### Week 1: Backend Setup
- [ ] Create `generateSlideImage.ts` agent function
- [ ] Implement image generation logic (DALL-E API call)
- [ ] Test with sample scenes
- [ ] Verify image storage & URLs

### Week 2: Frontend Integration
- [ ] Update `agentsService.generateSlideImage()`
- [ ] Add UI button in Image Panel
- [ ] Add loading states & error handling
- [ ] Test end-to-end (script → AI → image → slide)

### Week 3: Polish & Launch
- [ ] Add user feedback (success toast)
- [ ] Add quality/mode selection (optional)
- [ ] Document in help docs
- [ ] Monitor API costs

---

## Success Criteria

✅ User can click "Generate" in Image Panel  
✅ Scene script is sent to Gemini/DALL-E  
✅ Image appears on slide within 5 seconds  
✅ User can adjust size, shape, position  
✅ Image persists when regenerating video  
✅ Cost < $50/month for 1,000 users  

---

## Future Enhancements

1. **Multiple image variations** — Show 3 options, let user pick favorite
2. **Image style selector** — Photorealistic, abstract, minimalist, etc.
3. **Custom image prompt** — User provides additional context
4. **HD mode toggle** — Higher quality with cost tradeoff
5. **Batch generation** — Generate images for all scenes in module at once

---

## Rollback Plan

If AI image generation fails:
1. System gracefully falls back to "Upload" mode
2. User can still manually upload image
3. Error message explains what happened
4. No data loss (script/scene unaffected)

---

## Security & Rate Limiting

- [ ] Rate limit: 10 images per user per hour
- [ ] API key stored in `.env` (never in code)
- [ ] Image generation logged for cost tracking
- [ ] Reject prompts with inappropriate keywords
- [ ] Cache images for 7 days (avoid duplicate API calls)

---

## Documentation

Add to help docs:
```markdown
### Generate Slide Background Images

In the Visual Designer's Image Panel, click **Generate** to automatically 
create a background image using AI.

The AI analyzes your scene's script and creates a professional, relevant 
background suited for your presentation theme.

**How it works**:
1. Your script text is sent to Gemini/DALL-E
2. AI generates a 1920x1080 background image
3. Image appears on your slide
4. Adjust size, shape, and position as needed

**Cost**: $0.04 per generated image

**Tips**:
- Write descriptive scripts for better results
- AI works best with clear, focused topics
- You can always upload a custom image instead
```

---

## Notes for Team

- Use Gemini instead of DALL-E if cost is a factor ($0.006 vs $0.04)
- OpenAI DALL-E 3 produces higher quality, more consistent results
- Images are stored permanently (not re-generated on video rebuild)
- Consider caching to avoid duplicate generations for same script
- Monitor costs closely in first month
