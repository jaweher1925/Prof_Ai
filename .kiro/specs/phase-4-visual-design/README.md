# Phase 4: Visual Design - Specification (REVISED)

**Status**: Ready for Implementation  
**Depends On**: Phase 3 (Voice Generation) - COMPLETE ✅  
**Estimated Duration**: 2-3 sprints  

---

## Overview

Phase 4 is the Visual Design layer — users select a template, get a default slide with avatar placeholder, then customize each slide by moving/resizing the avatar, positioning text/images, and editing content directly on the canvas.

**Core Deliverable**: Users get clean, professional slides with draggable avatar placeholder, responsive image sizing, flexible text editing (main point + sub-keypoints), and dynamic slide count based on PDF content.

---

## Prerequisites for Phase 4

### What Must Be Complete Before Starting Phase 4

✅ **Phase 3 Complete:**
- All scripts LOCKED
- All voice audio LOCKED
- Voice URLs stored in database
- Voice durations calculated

✅ **Database Ready:**
- Script records with `voice_locked === true`
- Voice duration data available
- Scene records link to voice audio

✅ **API Ready:**
- `/api/scripts/{id}` returns locked scripts with voice URLs
- `/api/modules/{moduleId}/scenes` returns all scenes

✅ **Frontend Ready:**
- ProjectWorkspace shows Phase 4 (Visual Design) stage
- VisualDesignerPanel component created
- Canvas rendering infrastructure ready

---

## Phase 4 Architecture

### Data Model (New Schema)

```sql
-- Add to scripts table:
visual_status      VARCHAR(50) DEFAULT 'pending'    -- pending|editing|ready|approved|locked
design_template_id VARCHAR(255) NULL                -- Which template used

-- New table: slide_compositions (per scene)
CREATE TABLE slide_compositions (
  id                    VARCHAR(36) PRIMARY KEY,
  scene_id              VARCHAR(36) NOT NULL,
  module_id             VARCHAR(36) NOT NULL,
  template_id           VARCHAR(50) NOT NULL,       -- 'modern', 'minimal', 'corporate', etc.
  
  -- Canvas data (WYSIWYG editor state)
  canvas_elements       JSON,                       -- [{type, x, y, width, height, content, zIndex}]
  layout_type           VARCHAR(50),                -- 'bullets', 'title-hero', 'two-column', etc.
  
  -- Text animation sync
  text_animation_type   VARCHAR(50),                -- 'word-by-word', 'line-by-line', 'all-at-once'
  text_animation_timing JSON,                       -- [{startTime, endTime, text, animation}]
  
  -- Brand & styling
  brand_kit_id          VARCHAR(36) NULL,
  color_palette         JSON,                       -- [{hex, label}]
  font_family           VARCHAR(100),
  
  -- Timeline layers
  layers                JSON,                       -- [{name, elements: [{elementId, startTime, endTime}]}]
  transitions           JSON,                       -- [{type, duration}]
  
  -- Status
  status                VARCHAR(50) DEFAULT 'draft', -- draft|editing|ready|generating
  duration_ms           INT,                        -- Duration in milliseconds
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP ON UPDATE,
  
  FOREIGN KEY (scene_id) REFERENCES scenes(id),
  FOREIGN KEY (module_id) REFERENCES modules(id)
);

-- Template library
CREATE TABLE design_templates (
  id                    VARCHAR(50) PRIMARY KEY,
  name                  VARCHAR(100),
  category              VARCHAR(50),                -- 'modern', 'minimal', 'corporate', etc.
  thumbnail_url         VARCHAR(255),
  description           VARCHAR(255),
  default_layout        VARCHAR(50),                -- 'bullets', 'title-hero', etc.
  default_theme         VARCHAR(50),                -- 'dark-navy', 'ocean', 'light', etc.
  
  -- Template preset positions (% of slide)
  preset_positions      JSON,                       -- {logo: {x, y}, title: {x, y}, ...}
  preset_colors         JSON,                       -- {primary, secondary, accent, text}
  preset_fonts          JSON,                       -- {title, subtitle, body}
  
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Template System

### 10 Professional Templates


1. **Modern** - Clean, minimal, professional
   - Accent color highlights
   - Sans-serif typography
   - White space emphasis

2. **Minimal** - Ultra-clean, distraction-free
   - Single accent color
   - Max 3 text sizes
   - Empty space as design element

3. **Corporate** - Traditional business style
   - Brand colors (blue/gray)
   - Serif + Sans-serif mix
   - Logo prominent

4. **Academic** - Educational/research style
   - Green accents
   - Serif typography
   - Data-forward layout

5. **Ocean** - Creative/tech style
   - Cyan/blue gradient
   - Modern sans-serif
   - Smooth animations

6. **Playful** - Friendly, approachable
   - Bright colors
   - Rounded corners
   - Fun icon placement

7. **Dark** - High contrast, night mode
   - Light text on dark bg
   - Bold accents
   - Moody aesthetic

8. **Gradient** - Modern gradient style
   - Color transitions
   - Layered depth
   - Contemporary feel

9. **Elegant** - Premium, luxury look
   - Gold/bronze accents
   - Serif typography
   - Centered layouts

10. **Vibrant** - Bold, energetic style
    - Saturated colors
    - Dynamic layouts
    - High energy animations

### Template Application Flow

```
User selects template → Apply to all slides → 
Auto-generate layouts for each slide → 
User can customize per-slide → Save
```

---

## Canvas Implementation (Phase 4)

### WYSIWYG Editor Features

**Konva.js-based canvas (2560x1440, 16:9)**

- Drag-drop elements (text, images, shapes, avatars)
- Resize with aspect ratio locking
- Snap-to-grid (16px grid)
- Multi-select support
- Copy/paste layers
- Undo/redo stack
- Real-time preview

### Canvas Layers

```
Background (static or video)
    ↓
Avatar placeholder (position/size)
    ↓
Text overlays (title, subtitle, bullets)
    ↓
Image layer (positioned on right/custom)
    ↓
Branding (logo, watermark)
```

### Element Properties Inspector

```
Selected Element Properties:
├─ Type (text, image, avatar, shape)
├─ Position (x, y)
├─ Size (width, height, aspect ratio lock)
├─ Style (font, color, shadow, rotation)
├─ Animations (none, fade, slide, zoom)
└─ Timeline (start time, end time)
```

---

## Timeline Implementation

### Timeline UI Components

```
Timeline Scrubber
├─ Waveform display (from voice audio)
├─ Play/pause controls
├─ Frame-accurate scrubbing
└─ Duration display

Timeline Layers
├─ Background layer track
├─ Avatar layer track
├─ Text overlay track
└─ Transition track

Layer Elements
├─ Drag to adjust timing
├─ Resize to adjust duration
├─ Click to select & edit
└─ Right-click for context menu
```

### Text Animation Sync

Three animation modes:

1. **Word-by-Word** - Text reveals one word at voice timing
   - Parse script into words
   - Match word duration from voice
   - Sync reveal animation

2. **Line-by-Line** - Full sentence reveals on its start time
   - Parse script into sentences
   - Fade in on sentence start
   - Hold until next sentence

3. **All-at-Once** - Full text shown immediately
   - No animation complexity
   - Simplest option
   - Best for quick content

---

## API Endpoints for Phase 4

### Create Slide Composition

```
POST /api/scenes/{sceneId}/composition
Body: {
  "template_id": "modern",
  "layout_type": "bullets",
  "title": "Main Title",
  "subtitle": "Subtitle",
  "elements": [...]
}

Response: {
  "id": "composition-uuid",
  "status": "draft",
  "canvas_elements": [...],
  "created_at": "2026-07-08T..."
}
```

### Update Canvas Elements

```
PATCH /api/compositions/{id}
Body: {
  "canvas_elements": [
    {
      "id": "elem-1",
      "type": "text",
      "x": 10,
      "y": 20,
      "width": 300,
      "height": 100,
      "content": "Title text",
      "zIndex": 1
    }
  ]
}
```

### Apply Text Animation

```
POST /api/compositions/{id}/text-animation
Body: {
  "animation_type": "word-by-word",
  "sync_to_voice": true,
  "timing": [...]
}
```

### Apply Brand Kit

```
POST /api/compositions/{id}/apply-brand
Body: {
  "brand_kit_id": "branding-uuid"
}

Response: Updates all elements with brand colors/fonts
```

### Apply Template

```
POST /api/modules/{moduleId}/apply-template
Body: {
  "template_id": "modern"
}

Response: Applies template to all scenes in module
```

---

## Implementation Tasks

### Task 1: Template Gallery & Selection

**Component**: `TemplateSelector`

```jsx
<TemplateSelector 
  templates={templates}
  onSelect={(templateId) => applyTemplate(templateId)}
  previews={true}
/>
```

Features:
- Grid layout of 10 templates
- Thumbnail preview
- Apply button
- Apply to all scenes toggle
- Description tooltip

---

### Task 2: WYSIWYG Canvas (Konva.js)

**Component**: `Canvas`

```jsx
<Canvas 
  width={2560}
  height={1440}
  elements={elements}
  onDragEnd={(elementId, newPos) => updateElement(...)}
  onResize={(elementId, newSize) => updateElement(...)}
  onSelect={(elementId) => setSelected(elementId)
/>
```

Features:
- Drag-drop with visual feedback
- Snap-to-grid (16px)
- Resize with guides
- Multi-select (Ctrl+click)
- Undo/redo (Ctrl+Z)
- Copy/paste (Ctrl+C/V)

---

### Task 3: Timeline Component

**Component**: `Timeline`

```jsx
<Timeline 
  duration={durationMs}
  waveform={audioWaveformData}
  layers={layers}
  currentTime={currentTimeMs}
  onTimeChange={(newTime) => seek(newTime)}
  onElementDrag={(elementId, newTiming) => updateTiming(...)}
/>
```

Features:
- Audio waveform display
- Playback controls
- Layer tracks
- Frame-accurate scrubbing
- Visual feedback on hover

---

### Task 4: Script Content Sync

**Listener**: When script content changes

```javascript
useEffect(() => {
  if (scriptChanged) {
    // Extract keypoints from updated script
    const keypoints = parseKeypoints(updatedScript)
    
    // Update slide composition
    updateComposition({
      title: keypoints[0]?.main_idea,
      bullets: keypoints.map(kp => kp.sub_points),
      duration: calculateDuration(keypoints)
    })
  }
}, [script])
```

---

### Task 5: Brand Kit Application

**Service**: `applyBrandKit(composition, brandKitId)`

```javascript
const applyBrandKit = async (compositionId, brandKitId) => {
  const kit = await getBrandKit(brandKitId)
  
  // Update all text elements
  composition.elements.forEach(el => {
    if (el.type === 'text') {
      el.fontFamily = kit.fontFamily
      el.color = kit.textColor
      el.fontSize = kit.fontSize
    }
  })
  
  // Update background
  composition.background = kit.primaryColor
  
  // Add logo
  composition.elements.push({
    type: 'image',
    url: kit.logoUrl,
    x: 82, y: 4, width: 16, height: 10
  })
  
  // Save
  await updateComposition(composition)
}
```

---

## Implementation Roadmap

### Sprint 1: MVP (Template Selection + Basic Canvas)

- [ ] Design template gallery UI
- [ ] Implement template selection
- [ ] Create Konva.js canvas component
- [ ] Add drag-drop functionality
- [ ] Implement snap-to-grid
- [ ] Create element properties inspector
- [ ] Save canvas state to database

**Success**: User can select template, drag elements on canvas, properties update in real-time

---

### Sprint 2: Timeline + Text Animation

- [ ] Implement timeline UI
- [ ] Waveform visualization
- [ ] Playback controls
- [ ] Timeline layer tracks
- [ ] Text animation selector
- [ ] Word-by-word sync
- [ ] Line-by-line sync

**Success**: User can see timeline with voice, toggle text animation modes, preview animations

---

### Sprint 3: Advanced Features

- [ ] Brand kit application system
- [ ] Smart layout detection (no overlaps)
- [ ] Layout suggestions (AI)
- [ ] Contrast checking
- [ ] Multi-select editing
- [ ] Copy/paste elements
- [ ] Undo/redo stack

**Success**: User can apply branding, get AI layout suggestions, check contrast

---

### Sprint 4: Polish & Export

- [ ] Remotion export integration
- [ ] Real-time Remotion preview
- [ ] Performance optimization
- [ ] Error handling
- [ ] Edge cases
- [ ] Browser compatibility
- [ ] Accessibility improvements

**Success**: Complete compositions export cleanly to Remotion, all builds pass

---

## Database Schema (Prisma)

```prisma
model SlideComposition {
  id              String   @id @default(cuid())
  sceneId         String
  moduleId        String
  templateId      String
  
  // Canvas
  canvasElements  Json     @default("[]")
  layoutType      String?
  
  // Text animation
  textAnimationType String? @default("word-by-word")
  textAnimationTiming Json? @default("[]")
  
  // Branding
  brandKitId      String?
  colorPalette    Json?
  fontFamily      String?
  
  // Timeline
  layers          Json     @default("[]")
  transitions     Json     @default("[]")
  
  // Status
  status          String   @default("draft")
  durationMs      Int?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  scene   Scene   @relation(fields: [sceneId], references: [id])
  module  Module  @relation(fields: [moduleId], references: [id])
}
```

---

## Testing Checklist

- [ ] Select template, all scenes get layout
- [ ] Drag element on canvas, position updates
- [ ] Resize element with aspect ratio lock
- [ ] Snap-to-grid aligns perfectly
- [ ] Multi-select works (Ctrl+click)
- [ ] Copy/paste creates duplicate
- [ ] Undo/redo functions
- [ ] Timeline shows voice waveform
- [ ] Play button plays audio
- [ ] Scrub timeline, frame updates
- [ ] Text animation toggles work
- [ ] Word-by-word syncs to voice
- [ ] Apply brand kit updates all elements
- [ ] Script content sync updates slide
- [ ] Save composition to database
- [ ] Load composition on return
- [ ] Export to Remotion works
- [ ] Real-time Remotion preview renders

---

## Integration Points

### With Phase 3 (Voice Generation)
- Consumes locked voice audio
- Uses voice duration for timeline
- Links scenes to voice URLs
- Audio waveform for sync reference

### With Phase 5 (Video Editing)
- Passes completed compositions
- Canvas state → video layers
- Timeline → Remotion composition
- Animations → motion graphics

### With Brand Kit System
- Apply brand colors/fonts
- Logo placement
- Consistent styling across module

---

## Success Criteria for Phase 4

✅ **When Phase 4 is Complete:**

1. User can select from 10 professional templates
2. Apply template generates layouts for all slides
3. WYSIWYG canvas allows drag-drop element editing
4. Snap-to-grid keeps elements perfectly aligned
5. Timeline displays voice waveform
6. Text animation syncs with voice timing
7. Script content changes update slide automatically
8. Brand kit applies with one click
9. Completed composition exports to Remotion
10. Phase 5 unlocks when Phase 4 complete
11. Real-time preview shows animations
12. No overlapping elements (smart layout)
13. All builds pass, no type errors
14. Ready for video generation

---

## Technology Stack

- **Canvas**: Konva.js (React wrapper)
- **Timeline**: Custom React component
- **Audio**: Web Audio API for waveform
- **Export**: Remotion (composition generation)
- **State**: React hooks + React Query
- **Styling**: Tailwind CSS

---

## Performance Considerations

1. **Canvas Rendering**: Use Konva.js caching for performance
2. **Waveform**: Pre-compute audio waveform, cache result
3. **Timeline**: Virtualize very long timelines
4. **Real-time Preview**: Debounce canvas updates
5. **Remotion Export**: Batch processing, background jobs

---

## Common Pitfalls to Avoid

1. **No snap-to-grid** → Elements misaligned
2. **Overlapping text/images** → Layout conflicts
3. **Text sync not tied to voice** → Animations don't match audio
4. **No undo/redo** → User frustration
5. **Brand kit overwrites user edits** → Manual work lost
6. **Timeline not synced to canvas** → Preview mismatches
7. **Export fails on edge cases** → Incomplete video

---

## References & Resources

### External Libraries
- [Konva.js Docs](https://konvajs.org/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Remotion Docs](https://remotion.dev/)

### Design Inspiration
- Synthesia slide designs
- Descript layout system
- Canva templates

---

## Contact & Questions

For Phase 4 implementation:
1. Review this spec completely
2. Check Phase 3 completion report
3. Reference VisualDesignerPanel.jsx
4. Review canvas component patterns
5. Ask about specific technical decisions

---

**Created**: July 8, 2026  
**Status**: Ready for implementation  
**Next Phase**: Phase 5 Video Editing & Composition

**Spec Document**: Complete and comprehensive  
**Ready for**: Development kickoff
