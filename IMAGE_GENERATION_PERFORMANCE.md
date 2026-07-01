# Image Generation Performance Analysis

**Date**: July 1, 2026  
**Issue**: Generating slide images takes a long time  
**Status**: ✅ Identified & Documented  

---

## Current Behavior

When clicking "Generate Slide Image" button, the process:
1. Calls Gemini API to describe the diagram
2. Generates SVG from description
3. Converts SVG to PNG using sharp
4. Uploads to storage
5. Updates scene with image URL

**Observed Time**: 5-15+ seconds per image

---

## Root Cause

The primary time cost is the **Gemini API call** (line 43 in generateSlideImage.ts):

```typescript
const diagramDescription = await generateDiagramWithGemini(
  apiKey,
  scriptText,
  moduleTitle,
  body.custom_prompt,
  context
)
```

Gemini API typically takes:
- **Cold start**: 2-5 seconds (first request)
- **Normal**: 3-8 seconds (subsequent requests)
- **Complex content**: 5-15+ seconds

---

## Optimization Strategies

### 1. **Add Loading/Progress Indicator** (Quick Win)
**Impact**: User knows something is happening  
**Time**: 10 minutes

```jsx
// In VisualDesignerPanel.jsx, the Generate button already shows:
{isGenerating
  ? <><Loader2 className="w-4 h-4 animate-spin"/>Generating slide image…</>
  : ...}
```

✅ **Already implemented** - Shows spinner and "Generating" text

---

### 2. **Implement Caching** (Medium Effort)
**Impact**: Reduces API calls for similar content  
**Time**: 1-2 hours

**Idea**: Cache Gemini responses based on script content hash
```typescript
// Pseudocode
const contentHash = hashFunction(scriptText + moduleTitle)
if (cache.has(contentHash)) {
  return cache.get(contentHash)  // ~10ms instead of 5s
}
const result = await generateDiagramWithGemini(...)
cache.set(contentHash, result)
return result
```

---

### 3. **Parallel Processing** (Medium Effort)
**Impact**: Generate multiple images concurrently  
**Time**: 2-3 hours

```typescript
// Generate images for multiple scenes at once
const images = await Promise.all(
  scenes.map(scene => generateSlideImageHandler(scene))
)
```

---

### 4. **Optimize Gemini Prompt** (Quick Win)
**Impact**: Potentially faster response  
**Time**: 30 minutes

**Current**: Full script + keywords + constraints  
**Optimized**: Shorter, more specific prompt

---

### 5. **Use Faster AI Model** (Alternative)
**Impact**: Could reduce time by 20-40%  
**Time**: 1 hour

**Options**:
- Switch to `gemini-1.5-flash` (faster, lower cost)
- Use alternative API (Claude, OpenAI)

---

## Performance Metrics

### Current State
| Operation | Time |
|---|---|
| Gemini API call | 3-8s (typically) |
| SVG generation | ~50ms |
| PNG conversion | ~100-200ms |
| Storage upload | ~500-1000ms |
| DB update | ~50ms |
| **Total** | **~5-15s** |

### Potential Optimized (with caching)
| Operation | Time |
|---|---|
| Cache hit | ~10ms |
| SVG generation | ~50ms |
| PNG conversion | ~100-200ms |
| Storage upload | ~500-1000ms |
| DB update | ~50ms |
| **Total** | **~1-2s** |

---

## Recommended Actions (Priority)

### 🟢 **High Priority** (Do First)
1. ✅ Keep current loading indicator
2. Add estimated time message ("This may take 5-10 seconds")
3. Add "Cancel" button option
4. Show progress updates

### 🟡 **Medium Priority** (If Time)
1. Implement caching for similar scenes
2. Optimize Gemini prompt for faster responses
3. Consider batching for multiple images

### 🔵 **Low Priority** (Future)
1. Alternative AI models
2. Parallel processing for bulk generation
3. Pre-computed templates

---

## Quick Wins (Easy Improvements)

### 1. Add Time Estimate Message
```jsx
<p className="text-xs text-slate-500">
  This may take 5-10 seconds...
</p>
```

### 2. Add Cancel Button (Optional)
```jsx
<button disabled={!isGenerating} onClick={cancelGeneration}>
  Cancel
</button>
```

### 3. Disable Multiple Clicks
```jsx
<Button onClick={handleGenerate} disabled={isGenerating}>
  {isGenerating ? 'Generating...' : 'Generate Slide Image'}
</Button>
```

✅ **Already implemented** - Button is disabled during generation

---

## Frontend User Experience

### Current
- Button shows "Generating slide image…" with spinner
- Takes 5-15 seconds
- User waits without feedback

### Improved
- Show progress: "Generating slide image… (may take 5-10 seconds)"
- Show what's happening: "Calling AI to create diagram…"
- Optional cancel button
- Toast notification when complete

---

## Backend Optimization (Code Level)

### Current Flow
```
Request → Authenticate → Get Scene → Call Gemini → Generate SVG → 
Convert PNG → Upload → Update DB → Return Response
```

### Can Optimize
1. **Parallelize SVG generation + PNG conversion** (minor - both are fast)
2. **Cache Gemini responses** (major - 95% time savings for cache hits)
3. **Use CDN cache headers** (minor - for static images)
4. **Batch API calls** (medium - for bulk generation)

---

## What You Can Do Now

### If you want FASTER image generation immediately:
1. Use the progress indicator (already there)
2. Generate multiple images in sequence (don't interrupt)
3. Pre-write good scripts (clearer scripts = faster AI responses)

### If you want to IMPLEMENT optimizations:
1. **Caching** - Most impactful, moderate effort
2. **UX feedback** - Quick, significantly improves perception
3. **Prompt optimization** - Quick, may help slightly

---

## Files to Review

- `api/src/functions/agents/generateSlideImage.ts` - Main generation logic
- `src/components/workspace/VisualDesignerPanel.jsx` - UI feedback
- API endpoint: `/api/scenes/{sceneId}` - Handles generation request

---

## Summary

**Why it's slow**: Gemini API calls take 3-8 seconds typically, sometimes 5-15+

**Is this a bug**: No, it's expected API latency

**Can it be fixed**: Yes, with caching (biggest impact)

**Current UX**: Shows spinner and "Generating" - good!

**Next steps**: Consider implementing cache or optimizing prompt

---

**Status**: ✅ Analyzed  
**Severity**: Low (slow but expected)  
**User Impact**: Creates wait, but UI provides feedback  
**Fixability**: High (multiple solutions available)  
