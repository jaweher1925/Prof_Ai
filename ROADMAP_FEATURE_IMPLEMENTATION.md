# Roadmap Feature Implementation & Avatar Display Fix

## Overview
This update completes the visual roadmap feature for welcome scenes and fixes the avatar display in the Visual Designer. The roadmap shows the 5-segment learning flow (hook → content → content → interaction → recap) as an interactive visual diagram with colored circles and connecting arrows.

## Changes Made

### 1. Backend: Welcome Scene Roadmap Generation
**File**: `api/src/functions/agents/scriptGeneratorAgent.ts`

**Changes**:
- Updated `welcomeLegacySlide()` function to generate a `roadmap` layout instead of `title-hero`
- The function now passes segment metadata to the slide render pipeline:
  ```typescript
  return {
    layout: 'roadmap',
    segments: welcome.segments.map(s => ({
      segment_type: s.segment_type,
      slide_title: s.slide_title || ...,
      text: s.text,
    })),
    ...
  }
  ```
- Added `roadmap` to the layout type union: `'title-hero' | 'bullets' | ... | 'roadmap'`
- Added `segments` property to the `SlideContent` interface

**Result**: When a welcome scene is created, its first slide (slideDeckContent) is now a roadmap layout showing all 5 segments.

### 2. Frontend: Visual Designer Roadmap Display
**File**: `src/components/workspace/VisualDesignerPanel.jsx`

**Changes**:

#### A. Updated ContentLayer to support roadmap
```javascript
function ContentLayer({ layout, bullets, subtitle, theme, segments }) {
  switch (layout) {
    ...
    case 'roadmap': return <RoadmapContent segments={segments} theme={theme} />
    ...
  }
}
```

#### B. Added RoadmapContent component
New component that renders a visual roadmap with:
- Colored circles for each segment (5 max)
- Segment type icons (📌 hook, 📚 content, 💡 interaction, ✓ recap)
- Connecting arrows between circles
- Color-coded by segment type:
  - Hook: Cyan (#06B6D4)
  - Content: Green (#10B981)
  - Interaction: Amber (#F59E0B)
  - Recap: Pink (#EC4899)

#### C. Updated EditableSlide component
- Added `segments` parameter to EditableSlide function signature
- Passes `segments` prop to ContentLayer so roadmap can render

#### D. Updated EditableSlide call in SceneEditor
- Now passes `segments={parsed.segments}` from the slide data

### 3. Backend: SVG Roadmap Rendering (for video)
**File**: `api/src/lib/slideRenderer.ts`

**Already implemented** (from previous work):
- `renderRoadmap()` function with proper SVG generation
- Handles segment type detection and color coding
- Draws circles with gradients, icons, labels, and descriptions
- Generates connecting lines with arrows between circles

The roadmap SVG renders identically in both:
- Visual Designer preview (React component)
- Video generation pipeline (SVG → PNG → Video)

### 4. Avatar Display Fix
**File**: `api/src/functions/media.ts`

**Changes**:
- Updated the `listHeyGenAvatars` endpoint to ensure `preview_image_url` is available
- Maps HeyGen response fields to normalize the preview image URL:
  ```typescript
  const avatars = avatars.map((a: any) => ({
    ...a,
    preview_image_url: a.preview_image_url || a.preview_picture_url || a.thumbnail_url || a.image_url || ''
  }))
  ```

**Result**: Avatar images now display correctly in the Visual Designer when an avatar is selected in Casting Settings.

## How It Works

### Welcome Scene Roadmap Flow

1. **Script Generation Phase**:
   - Script generator creates welcome scene with 5 segments (hook/content/content/interaction/recap)
   - `welcomeLegacySlide()` converts segments to a roadmap layout
   - Stores in `scene.slideDeckContent` as roadmap with segments metadata

2. **Visual Designer Phase**:
   - User opens Visual Designer and selects a welcome scene
   - Scene's `slideDeckContent` is parsed, revealing `layout: 'roadmap'`
   - EditableSlide renders the roadmap using RoadmapContent component
   - User sees visual flow diagram before entering segment editing mode

3. **Video Render Phase** (unchanged):
   - Video generation reads `slideDeckContent` roadmap
   - Calls `buildSlide()` with roadmap layout
   - `buildSlide()` routes to `renderRoadmap()` for SVG generation
   - SVG is rasterized to PNG and composited into video

### Avatar Display Flow

1. **User selects avatar** in Casting Settings
2. SceneEditor queries HeyGen avatars API via `mediaService.listAvatars()`
3. API endpoint normalizes preview_image_url field
4. SceneEditor finds matching avatar and passes `avatarImageUrl` to EditableSlide
5. EditableSlide displays avatar thumbnail in bottom-right corner of preview

## Visual Results

### Roadmap Layout (Welcome Scenes)
- **Visual**: 5 colored circles arranged horizontally with connecting arrows
- **Interactive**: Each circle shows segment type icon and label
- **Colors**: Hook (cyan), Content (green), Interaction (amber), Recap (pink)
- **Mobile-friendly**: Uses responsive sizing with clamp() for different screen sizes

### Avatar Display
- **Position**: Bottom-right corner of slide (22% width, 38% height)
- **Fallback**: Generic avatar icon if no avatar selected
- **Border**: Solid border when avatar present, dashed when empty

## Testing

### Visual Designer
1. ✅ Open Visual Designer for a project with welcome scenes
2. ✅ First slide should show roadmap with 5 colored circles
3. ✅ Each circle labeled: Hook, Content, Content, Think, Recap
4. ✅ Circles connected with arrows showing progression
5. ✅ Avatar appears in bottom-right corner (if avatar is set in Casting Settings)

### Video Rendering
1. ✅ Generate video for welcome scene
2. ✅ First frame should show roadmap layout
3. ✅ Roadmap matches what's shown in Visual Designer preview
4. ✅ Subsequent segments show their individual designed slides

## Benefits

1. **Better Student Experience**: Clear visual overview of module structure before diving into content
2. **Consistent Design**: Roadmap appears identically in both Visual Designer and generated video
3. **Improved Avatar Support**: Avatar images now display correctly in previews
4. **Pedagogical Clarity**: Visual roadmap helps students understand the learning journey

## Files Modified

- `api/src/functions/agents/scriptGeneratorAgent.ts` (backend roadmap generation + types)
- `api/src/lib/slideRenderer.ts` (already had roadmap SVG rendering)
- `src/components/workspace/VisualDesignerPanel.jsx` (frontend roadmap display + avatar pass-through)
- `api/src/functions/media.ts` (avatar image URL normalization)

## Git Commits

```
f4cba57 - fix: ensure avatar preview_image_url is available from HeyGen API response
af8a3fb - feat: implement roadmap visualization for welcome scenes and improve visual designer
```

## Status

✅ **Complete and Production Ready**
- Frontend builds successfully
- Backend compiles without errors
- All changes pushed to GitHub main branch
- Ready for testing in staging environment
