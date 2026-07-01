# Future Features & Enhancements

**Date**: July 1, 2026  
**Status**: Feature Planning

---

## Feature 1: Avatar Display in Visual Designer ✅ IDENTIFIED

### Issue
Avatar preview not showing in Visual Designer preview panel (shows "PRESENTER AVATAR" placeholder text)

### Root Cause
- Avatar image URL not being loaded or displayed
- Either: avatarId not set in project, or avatar query failing, or preview_image_url missing from API

### Solution
1. Verify avatar is selected in Avatar Studio
2. Check HeyGen API returns `preview_image_url` 
3. Debug avatar query in React DevTools
4. Ensure image URL is accessible

### Implementation
```jsx
// Currently in VisualDesignerPanel.jsx line ~475-482
const { data: avatarsRes } = useQuery({
  queryKey: ['heygen-avatars'],
  queryFn: () => mediaService.listAvatars(),
  enabled: !!avatarId,
  staleTime: 10 * 60 * 1000,
})
const selectedAvatar = avatarsRes?.avatars?.find(a => a.avatar_id === avatarId)
const avatarImageUrl = selectedAvatar?.preview_image_url || null
```

### Files to Check
- `src/services/media.js` - `listAvatars()` method
- `src/components/workspace/VisualDesignerPanel.jsx` - Lines 475-1510

---

## Feature 2: Image Quality Improvement 📊 IDENTIFIED

### Issue
Uploaded images don't render at good quality in generated videos

### Root Causes
1. Base64 data URLs (partially fixed - now using server upload)
2. Sharp rasterization quality settings (95% - could be improved)
3. FFmpeg encoding settings (stillimage tuning may need adjustment)
4. Image doesn't fill the slide space (positioning/sizing issue)

### Solutions

#### A. Improve Sharp Rasterization Quality
```typescript
// Current: api/src/lib/ffmpegVideo.ts line ~152
const pngBuffer: Buffer = await sharp(svgBuffer)
  .png({ quality: 95 })
  .toBuffer()

// Improved:
const pngBuffer: Buffer = await sharp(svgBuffer)
  .png({ quality: 100, progressive: false })  // Lossless
  .toBuffer()
```

#### B. Optimize FFmpeg Encoding
```typescript
// Current: api/src/lib/ffmpegVideo.ts line ~282
await runFfmpeg([
  '-c:v', 'libx264',
  '-tune', 'stillimage',
  '-crf', '23',  // Add this for quality control (lower = better, 0-51)
  ...
])
```

#### C. Improve Image Sizing in SVG
```typescript
// api/src/lib/slideRenderer.ts line ~346
// Currently: imgW = Math.min(90, slide.imageWidth || 36)  // % of width
// Make sure image fills available space better
```

### Implementation Priority
1. Use `png({ quality: 100 })` for lossless
2. Add `-crf 18` to FFmpeg (high quality)
3. Adjust image sizing to fill more of slide

### Files to Modify
- `api/src/lib/ffmpegVideo.ts` - Sharp quality settings
- `api/src/lib/slideRenderer.ts` - Image sizing
- `api/src/lib/ffmpegVideo.ts` - FFmpeg encoding params

---

## Feature 3: Welcome Scene Visual Roadmap Design 🎨 HIGH PRIORITY

### Issue
Welcome scene (hook → content → content → interaction → recap) currently generates as plain text slides

### Desired Output
Visual architecture roadmap with:
- 5 circles/modules arranged in sequence
- Each shows segment type (hook, content, content, interaction, recap)
- Brief text description in each circle
- Connected with arrows or lines
- Professional, educational design
- Appears as the FIRST slide before entering module details

### Current State
Welcome scene is generated with 5 text segments. Visual Designer shows them as plain text bullets.

### Desired Implementation

#### Option A: New Welcome Slide Layout
Create new layout type: `'roadmap'` or `'visual-flow'`

```typescript
// In slideRenderer.ts, add new layout:
case 'roadmap':
  contentSvg = renderRoadmap(blocks, t, moduleTitle, segments)
  break

function renderRoadmap(blocks, theme, moduleTitle, segments) {
  // segments = [
  //   { type: 'hook', text: 'Hook: ...' },
  //   { type: 'content', text: 'Content 1: ...' },
  //   { type: 'content', text: 'Content 2: ...' },
  //   { type: 'interaction', text: 'Interaction: ...' },
  //   { type: 'recap', text: 'Recap: ...' }
  // ]
  
  // Generate SVG with 5 circles in a row/flow
  // Each circle gets: segment type, icon, brief text
  // Connected with arrows
  // Professional gradient styling
}
```

#### Option B: Update Script Generator
Modify `scriptGeneratorAgent.ts` to generate welcome scene with special slide design:

```typescript
// In welcome_scene generation, set slide_content with layout: 'roadmap'
{
  title: "Welcome to " + moduleTitle,
  layout: "roadmap",  // NEW
  theme: "dark-navy",
  blocks: [
    {
      type: "flow-steps",  // NEW
      steps: [
        { label: "Hook", text: "Grab attention", icon: "📌" },
        { label: "Content", text: "First concept", icon: "📚" },
        { label: "Content", text: "Second concept", icon: "📚" },
        { label: "Think", text: "Reflection point", icon: "💡" },
        { label: "Summary", text: "Key takeaways", icon: "✓" }
      ]
    }
  ]
}
```

#### Option C: Create Welcome Scene Segment Slides Programmatically

Modify the script generator to create pre-designed slides for each welcome segment:

```typescript
// Each segment in welcome scene gets auto-designed slide:

// Segment 0 - Hook:
segment.slideDesign = JSON.stringify({
  layout: "title-hero",
  theme: "ocean",
  title: "Hook Title",
  subtitle: "First segment: Grab attention",
  blocks: [{
    type: "bullets",
    items: [{ text: hook_description, level: 1 }]
  }]
})

// Segment 1-2 - Content:
segment.slideDesign = JSON.stringify({
  layout: "bullets",
  theme: "academic",
  title: "Content Point",
  blocks: [{
    type: "bullets",
    items: [{ text: content_text, level: 1 }, ...]
  }]
})

// Segment 3 - Interaction:
segment.slideDesign = JSON.stringify({
  layout: "definition",
  theme: "corporate",
  title: "Think About This",
  blocks: [{...}]
})

// Segment 4 - Recap:
segment.slideDesign = JSON.stringify({
  layout: "summary",
  theme: "dark-navy",
  title: "Key Takeaways",
  blocks: [{...}]
})
```

### Recommended Approach: **Option C (Simplest)**

Modify `scriptGeneratorAgent.ts` to auto-generate appropriate `slideDesign` for each welcome segment based on its type.

**Benefits**:
- Uses existing layouts (title-hero, bullets, definition, summary)
- Different themes per segment for visual variety
- Automatically applied - no UI changes needed
- Matches rest of system architecture

### Implementation Steps

1. **Modify scriptGeneratorAgent.ts** (~line 480-510)
   - After creating each welcome segment, assign auto-designed `slideDesign`
   - Map segment_type to appropriate layout + theme

2. **Create helper function**:
```typescript
function buildWelcomeSegmentDesign(segment: GeneratedSegment): SlideContent {
  const designs: Record<SegmentType, SlideContent> = {
    hook: {
      layout: 'title-hero',
      theme: 'ocean',
      title: 'Hook: ' + segment.slide_title,
      blocks: [{
        type: 'bullets',
        items: segment.elements
          .filter(el => el.type === 'bullet')
          .map(el => ({ text: el.text, level: 1 }))
      }]
    },
    content: {
      layout: 'bullets',
      theme: segment.segment_type === 'content' ? 'academic' : 'light',
      title: segment.slide_title,
      blocks: [{
        type: 'bullets',
        items: segment.elements
          .filter(el => el.type === 'bullet')
          .map((el, i) => ({ text: el.text, level: i === 0 ? 1 : 2 }))
      }]
    },
    interaction: {
      layout: 'definition',
      theme: 'corporate',
      title: '💡 ' + segment.slide_title,
      blocks: [{
        type: 'bullets',
        items: [{ text: segment.text, level: 1 }]
      }]
    },
    recap: {
      layout: 'summary',
      theme: 'dark-navy',
      title: '✓ ' + segment.slide_title,
      blocks: [{
        type: 'bullets',
        items: segment.elements
          .filter(el => el.type === 'bullet')
          .map(el => ({ text: el.text, level: 1 }))
      }]
    }
  }
  return designs[segment.segment_type] || {}
}
```

3. **Update welcome scene creation** (~line 510):
```typescript
for (let i = 0; i < welcome.segments.length; i++) {
  const seg = welcome.segments[i]
  const designedSlide = buildWelcomeSegmentDesign(seg)  // NEW
  
  await prisma.sceneSegment.create({
    data: {
      sceneId: welcomeScene.id,
      orderIndex: i,
      segmentType: seg.segment_type,
      text: seg.text,
      slideTitle: seg.slide_title,
      elements: JSON.stringify(seg.elements ?? []),
      imagePrompt: seg.image_prompt,
      animation: seg.animation,
      slideDesign: JSON.stringify(designedSlide),  // NEW - AUTO-DESIGNED
    },
  })
}
```

### Files to Modify
- `api/src/functions/agents/scriptGeneratorAgent.ts` - Add auto-design function and use it

### Testing Steps
1. Create new module via Librarian agent
2. Generate script via Script Generator
3. Open Visual Designer
4. Check welcome scene (first scene)
5. Verify each segment has its own designed slide with appropriate layout + theme
6. Generate video - slides should match the designs

---

## Priority Summary

| Feature | Priority | Effort | Impact |
|---------|----------|--------|--------|
| Avatar display fix | High | Low | Shows presenters in preview |
| Image quality | Medium | Low | Better video quality |
| Welcome roadmap design | High | Medium | Much better first impression |

---

## Next Session Tasks

1. **Debug avatar display** - Check API response, verify avatarImageUrl is set
2. **Improve image quality** - Update Sharp quality + FFmpeg settings
3. **Auto-design welcome slides** - Implement in scriptGeneratorAgent.ts

All changes should maintain backward compatibility with existing scenes.
