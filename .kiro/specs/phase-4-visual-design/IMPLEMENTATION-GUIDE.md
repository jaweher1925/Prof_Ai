# Phase 4 Implementation Quick Start

## Current Status

✅ **Spec Created**: Phase 4 Visual Design specification is complete  
✅ **VisualDesignerPanel Exists**: Component structure in place  
🔄 **Status**: Ready for Sprint Planning & Task Breakdown

---

## What's Already Built

The codebase already has a **partially implemented** Visual Designer:

- ✅ Template theme system (THEMES array with 5 themes)
- ✅ Layout types (LAYOUTS array with 9 layout options)
- ✅ Canvas component using Konva.js
- ✅ Scene editor with slide preview
- ✅ Drag-drop element positioning
- ✅ Text animation control
- ✅ Module theme gate (first-time template selection)

**Location**: `src/components/workspace/VisualDesignerPanel.jsx`

---

## What Needs Implementation

### Priority 1 (Core Functionality)

1. **Template Library Complete**
   - Currently: 5 themes (dark-navy, ocean, academic, light, corporate)
   - Need: 10 complete professional templates with previews
   - Effort: 1-2 days

2. **API Integration**
   - Fetch slide compositions from DB
   - Save canvas state after edits
   - Store text animation timing
   - Effort: 2-3 days

3. **Timeline Component**
   - Waveform visualization (using Web Audio API)
   - Layer tracks (background, avatar, text)
   - Playback controls
   - Effort: 2-3 days

4. **Text Animation Sync**
   - Word-by-word timing
   - Line-by-line timing
   - Connect to voice audio waveform
   - Effort: 2 days

---

### Priority 2 (Advanced Features)

5. **Brand Kit Application**
   - One-click apply to all elements
   - Persist to database
   - Effort: 1 day

6. **Smart Layout Detection**
   - Prevent overlapping elements
   - Auto-suggest positioning
   - Effort: 2 days

7. **Script Content Sync**
   - Listen to script changes
   - Update slide automatically
   - Re-calculate layout
   - Effort: 1-2 days

---

### Priority 3 (Polish)

8. **AI Layout Suggestions**
   - Generate better positioning
   - Test contrast ratios
   - Effort: 2-3 days

9. **Remotion Export**
   - Generate Remotion composition
   - Real-time preview
   - Effort: 2-3 days

10. **Performance & Testing**
    - Optimize canvas rendering
    - Edge case handling
    - Browser compatibility
    - Effort: 2-3 days

---

## Recommended Implementation Order

### Week 1-2: Core (Template + API)
1. Complete template library (10 templates)
2. API: GET/PATCH slide compositions
3. Save/load flows

### Week 3-4: Timeline & Sync
1. Timeline UI component
2. Waveform visualization
3. Text animation sync with voice

### Week 5: Brand & Smart Layout
1. Brand kit application
2. Overlap detection
3. Auto-positioning

### Week 6: Polish & Export
1. Script sync listener
2. Remotion export
3. Testing & bug fixes

---

## Starting Point: Code Review

**Current Implementation Location**:
```
src/components/workspace/VisualDesignerPanel.jsx (2200+ lines)
├── VisualDesignerPanel (main component)
├── SceneGroupList (left sidebar)
├── SceneEditor (center editor)
├── EditableSlide (canvas preview)
├── SlideEditorBoundary (error boundary)
└── Layout components (TitleLayer, BulletsContent, etc.)
```

**Key Functions to Extend**:
- `EditableSlide` - The main canvas component
- `SceneEditor` - The editor wrapper
- Timeline components - Need to create new

---

## Database Changes Needed

Add to Prisma schema (`prisma/schema.prisma`):

```prisma
model SlideComposition {
  id              String    @id @default(cuid())
  sceneId         String
  templateId      String    @default("modern")
  layoutType      String?   @default("bullets")
  
  // Canvas elements
  canvasElements  Json      @default("[]")
  
  // Text animation
  textAnimationType String? @default("word-by-word")
  
  // Status
  status          String    @default("draft")
  durationMs      Int?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  scene           Scene     @relation(fields: [sceneId], references: [id])
}
```

---

## API Endpoints to Create

**Backend Functions** (in `api/src/functions`):

1. `GET /api/scenes/{sceneId}/composition` - Fetch composition
2. `POST /api/scenes/{sceneId}/composition` - Create composition
3. `PATCH /api/compositions/{id}` - Update canvas elements
4. `POST /api/compositions/{id}/text-animation` - Set animation sync
5. `POST /api/modules/{moduleId}/apply-template` - Apply template to all scenes
6. `POST /api/compositions/{id}/apply-brand` - Apply brand kit

---

## How to Approach

### Option A: Incremental (Recommended)
1. Start with **Save/Load API** (allow editing to persist)
2. Add **Timeline Component** (separate from canvas)
3. Implement **Text Animation Sync** (voice-based timing)
4. Then add advanced features

**Pros**: Early testing, incremental features  
**Cons**: Might need refactoring

### Option B: Feature-Complete Then Integrate
1. Build all UI components first (canvas, timeline, inspector)
2. Add API calls when ready
3. Full integration at end

**Pros**: Clean integration  
**Cons**: Long before first working version

---

## Testing Strategy

1. **Unit Tests**: Canvas operations (drag, resize, snap)
2. **Integration Tests**: API + component interaction
3. **E2E Tests**: Full workflow (select template → edit → save)
4. **Manual Testing**: Voice sync, timeline scrubbing, animations

---

## Key Decisions to Make

1. **Canvas Library**: Stick with Konva.js or switch?
   - Current: Konva.js (good choice)
   - Alternative: Fabric.js

2. **Timeline Library**: Build custom or use existing?
   - Current: Custom components needed
   - Options: react-timeline-editor, custom

3. **Waveform**: Generate real-time or cache?
   - Recommend: Cache after first generation (pre-compute)

4. **Export Format**: Only Remotion or also MP4/WebM?
   - Start with: Remotion composition
   - Future: Export to MP4

---

## Success Metrics

Phase 4 is complete when:

✅ All 10 templates selectable  
✅ Canvas drag-drop works smoothly  
✅ Timeline shows audio waveform  
✅ Text syncs to voice timing  
✅ Brand kit applies automatically  
✅ Composition exports to Remotion  
✅ No overlapping elements  
✅ Performance is smooth (60fps canvas)  

---

## Next Steps

1. **Review this spec** with the team
2. **Prioritize features** (what first?)
3. **Create tickets** for each task
4. **Assign developers** to parallel streams
5. **Set sprint goals** (1-2 week sprints)
6. **Start with API integration** first

---

## Questions to Answer Before Starting

1. Should we support **custom templates** (user-created)?
2. Should we allow **per-scene template override** or lock to module?
3. Should text animations be **editable per-word** or preset modes only?
4. Should we **auto-generate** slide content or require manual?
5. Should **avatar positioning** be locked or fully draggable?

---

**Created**: July 8, 2026  
**Ready for**: Team review & sprint planning
