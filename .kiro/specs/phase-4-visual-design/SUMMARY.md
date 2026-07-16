# Phase 4: Visual Design - Complete Specification Summary

**Created**: July 8, 2026  
**Status**: ✅ Complete and Ready for Implementation  
**Audience**: Product Manager, Engineering Lead, Development Team

---

## Executive Summary

Phase 4 transforms locked voice scripts and audio into visually designed slide compositions. Users select from professional templates, edit slides via an intuitive drag-drop canvas, sync text animations with voice timing, and prepare complete compositions for video generation.

**Phase Goal**: Move from "talking points" to "visual story"

**Deliverable**: Fully designed slide compositions ready for Remotion video export

---

## What This Spec Includes

### 📄 Documents in This Spec

1. **README.md** (This file)
   - Complete architectural overview
   - Database schema design
   - 10 professional templates
   - API endpoint specifications
   - Implementation roadmap (4 sprints)
   - Testing checklist
   - Success criteria

2. **IMPLEMENTATION-GUIDE.md**
   - What's already built (existing components)
   - What needs implementation (priority matrix)
   - Recommended development sequence
   - Technology stack
   - Key decisions to make
   - Next steps for team

3. **SPRINT-1-TASKS.md**
   - Detailed task breakdown (10 tasks)
   - Effort estimates
   - Success criteria per task
   - Definition of Done
   - Blockers & risks
   - Success metrics

---

## Phase 4 Scope

### In Scope ✅

- **Template Library**: 10 professional templates
- **WYSIWYG Canvas**: Drag-drop element editing
- **Text Animations**: Sync captions with voice
- **Timeline UI**: Voice waveform + layer tracks
- **Brand Kit**: One-click style application
- **Smart Layout**: Prevent overlapping elements
- **Remotion Export**: Generate video compositions

### Out of Scope (Phase 5+) ❌

- Avatar rendering (Phase 6)
- Video compilation (Phase 7)
- Advanced motion graphics
- 3D transformations
- Custom animation curves

---

## The 4-Sprint Roadmap

### Sprint 1: MVP (2 weeks)
**Focus**: Core functionality  
✅ Template selection + Apply to all scenes  
✅ Canvas editing + Properties inspector  
✅ Snap-to-grid + Save/load API  
**Deliverable**: Basic working visual designer

### Sprint 2: Timeline & Sync (2 weeks)
**Focus**: Timeline UI + Text animation  
✅ Waveform visualization  
✅ Playback controls + Frame scrubbing  
✅ Text animation modes (word/line/all-at-once)  
✅ Sync text to voice timing  
**Deliverable**: Timeline editing with voice sync

### Sprint 3: Advanced Features (2 weeks)
**Focus**: Smart layout + AI suggestions  
✅ Overlap detection + Auto-reposition  
✅ Brand kit application  
✅ Script content listener  
✅ Accessibility improvements  
**Deliverable**: Polish and advanced workflows

### Sprint 4: Export & Polish (2 weeks)
**Focus**: Remotion integration + testing  
✅ Export to Remotion composition  
✅ Real-time preview rendering  
✅ Performance optimization  
✅ Edge case handling  
✅ Documentation  
**Deliverable**: Production-ready visual designer

---

## What Users Will Do in Phase 4

### User Flow: First Time (Fresh Module)

1. **Arrive at Visual Design**
   - See template gallery (10 options)
   - Click "Modern" template (as example)

2. **Template Applied**
   - All scenes in module get "Modern" layout
   - Layouts auto-generated
   - Can see preview immediately

3. **Edit First Slide**
   - Click first scene in left panel
   - See WYSIWYG canvas with slide
   - Title, subtitle, bullet points visible
   - Avatar placeholder on right

4. **Make Changes**
   - Drag title text left (aligns to grid)
   - Resize bullet box to fit more content
   - Inspector updates position values
   - Canvas updates in real-time

5. **Save Changes**
   - Automatically saved every 500ms
   - Green checkmark shows "Saved"

6. **Sync with Voice**
   - Click "Timeline" tab
   - See voice waveform
   - Play button plays audio
   - Adjust text animation mode
   - Text now syncs to voice timing

7. **Apply Branding**
   - Select brand kit (predefined)
   - One click → All colors/fonts update
   - Logo automatically positioned

8. **Review All Slides**
   - Switch between slides using left panel
   - Each maintains own composition
   - Real-time preview shows animations

9. **Continue to Video**
   - Green checkmark on Phase 4
   - "Continue to Video" button active
   - Clicks through to Phase 5

---

## Architecture Overview

### Component Hierarchy

```
VisualDesignerPanel (Main Container)
├── TemplateGallery
│   ├── TemplatePreview × 10
│   └── ApplyButton
├── SceneList (Left Sidebar)
│   ├── SceneGroupHeader
│   ├── SceneButton × N
│   └── AddSceneButton
├── EditorWorkspace (Center)
│   ├── CanvasEditor (Konva.js)
│   │   ├── LayerStack
│   │   │   ├── BackgroundLayer
│   │   │   ├── AvatarLayer
│   │   │   ├── TextLayer
│   │   │   └── ImageLayer
│   │   ├── GridOverlay
│   │   └── SelectionBox
│   ├── Timeline (Optional tab)
│   │   ├── Waveform
│   │   ├── LayerTrack × 4
│   │   ├── Scrubber
│   │   └── PlaybackControls
│   └── ElementInspector (Right)
│       ├── PositionControls
│       ├── SizeControls
│       ├── StyleControls
│       └── AnimationSelector
└── ActionBar (Bottom)
    ├── SaveStatus
    ├── BrandKitSelector
    └── ContinueButton
```

### Data Flow

```
Phase 3 (Locked Voice) ↓
    └─→ Get voice duration & waveform
         ↓
    Scene data ← DB ← SlideComposition
         ↓
    VisualDesignerPanel
    ├─ User selects template
    │  └─→ API: Apply template to module
    │
    ├─ User edits canvas
    │  └─→ API: PATCH composition (debounced)
    │
    ├─ User selects text animation
    │  └─→ API: Update text_animation_type
    │
    └─ User clicks Continue
       └─→ Save final composition
           ↓
       Phase 5 (Video Editing) →
```

---

## Database Schema (Added Fields)

### scripts table
```sql
ALTER TABLE scripts ADD COLUMN visual_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE scripts ADD COLUMN design_template_id VARCHAR(255);
```

### New table: slide_compositions
```sql
CREATE TABLE slide_compositions (
  id VARCHAR(36) PRIMARY KEY,
  scene_id VARCHAR(36) NOT NULL,
  module_id VARCHAR(36) NOT NULL,
  template_id VARCHAR(50) NOT NULL,
  layout_type VARCHAR(50),
  canvas_elements JSON,
  text_animation_type VARCHAR(50) DEFAULT 'word-by-word',
  brand_kit_id VARCHAR(36),
  color_palette JSON,
  font_family VARCHAR(100),
  layers JSON,
  transitions JSON,
  status VARCHAR(50) DEFAULT 'draft',
  duration_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (scene_id) REFERENCES scenes(id),
  FOREIGN KEY (module_id) REFERENCES modules(id)
);
```

---

## 10 Professional Templates

| # | Template | Theme | Font Style | Use Case |
|---|----------|-------|-----------|----------|
| 1 | **Modern** | Light blue on white | Clean sans-serif | Tech/Startup |
| 2 | **Minimal** | Single accent | Simple typography | Educational |
| 3 | **Corporate** | Navy/gray | Professional mix | Business |
| 4 | **Academic** | Green focus | Serif headers | Research/Scholarly |
| 5 | **Ocean** | Cyan gradient | Modern sans | Creative |
| 6 | **Playful** | Bright colors | Rounded fonts | Kids/Fun |
| 7 | **Dark** | High contrast | Bold text | Night mode |
| 8 | **Gradient** | Color fade | Modern | Contemporary |
| 9 | **Elegant** | Gold accents | Serif | Premium |
| 10 | **Vibrant** | Saturated hues | Bold sans | Energy |

---

## Key Features

### Canvas Features
- ✅ Drag-drop elements
- ✅ Resize with aspect ratio lock
- ✅ Snap-to-grid (16px)
- ✅ Multi-select (Ctrl+click)
- ✅ Copy/paste layers
- ✅ Undo/redo (Ctrl+Z/Y)
- ✅ Real-time preview

### Timeline Features
- ✅ Audio waveform visualization
- ✅ Playback controls
- ✅ Layer tracks
- ✅ Frame-accurate scrubbing
- ✅ Visual feedback on hover
- ✅ Element timing adjustment

### Text Animation Features
- ✅ Word-by-word sync
- ✅ Line-by-line sync
- ✅ All-at-once mode
- ✅ Auto-sync to voice duration
- ✅ Manual timing override

### Brand Kit Features
- ✅ One-click apply
- ✅ Global color update
- ✅ Font family update
- ✅ Logo auto-positioning
- ✅ Persist to database

---

## API Endpoints (Phase 4)

### Core Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/scenes/{sceneId}/composition` | Fetch composition |
| POST | `/api/scenes/{sceneId}/composition` | Create composition |
| PATCH | `/api/compositions/{id}` | Update canvas elements |
| POST | `/api/compositions/{id}/text-animation` | Set animation sync |
| POST | `/api/modules/{moduleId}/apply-template` | Apply to all scenes |
| POST | `/api/compositions/{id}/apply-brand` | Apply brand kit |
| GET | `/api/templates` | List all templates |
| POST | `/api/compositions/{id}/export-remotion` | Generate Remotion composition |

---

## Success Criteria for Phase 4

✅ **Functionality**
- User can select from 10 templates
- Apply template generates layouts for all slides
- WYSIWYG canvas allows full element editing
- Snap-to-grid keeps elements aligned
- Timeline displays voice waveform
- Text syncs to voice timing
- Brand kit applies automatically
- Composition exports to Remotion

✅ **Performance**
- Canvas renders at 60fps
- Auto-save completes in <500ms
- Page loads in <3s
- No memory leaks on extended editing

✅ **Quality**
- 0 critical bugs
- >80% test coverage
- 0 TypeScript errors
- Accessibility baseline met (WCAG 2.1 AA)

✅ **Documentation**
- Code comments on complex logic
- API docs complete
- User guide created
- Architecture documented

---

## Integration with Other Phases

### Depends On (Phase 3)
- ✅ Locked voice scripts
- ✅ Voice audio URLs
- ✅ Voice durations

### Enables (Phase 5)
- ✅ Complete compositions
- ✅ Timeline data
- ✅ Animation timings
- ✅ Branding info

---

## Effort & Timeline

| Component | Effort | Timeline |
|-----------|--------|----------|
| Sprint 1 (MVP) | 8 weeks equiv | 2 weeks (4 devs) |
| Sprint 2 (Timeline) | 6 weeks equiv | 2 weeks (3 devs) |
| Sprint 3 (Advanced) | 6 weeks equiv | 2 weeks (3 devs) |
| Sprint 4 (Export) | 6 weeks equiv | 2 weeks (3 devs) |
| **Total** | **26 weeks** | **8 weeks (parallel)** |

---

## Risk Assessment

### High Risk 🔴
- Canvas performance with 100+ elements
- Concurrent saves causing conflicts

### Medium Risk 🟡
- Template preview design timeline
- Audio waveform computation

### Low Risk 🟢
- UI tweaks
- Minor API changes

---

## Team Assignments (Recommended)

### Sprint 1
- **Backend**: 1 dev (API + DB schema)
- **Frontend**: 2 devs (Canvas + Template UI)
- **QA**: 1 dev (Testing)

### Sprints 2-4
- **Backend**: 1 dev (Remaining API + export)
- **Frontend**: 2 devs (Timeline + advanced features)
- **QA**: 1 dev (Testing + performance)

---

## Next Steps

1. ✅ **Review this spec** with team (1-2 hours)
2. 📋 **Prioritize decisions** (architecture review)
3. 🎟️ **Create Jira tickets** (from SPRINT-1-TASKS.md)
4. 👥 **Assign team members** (per sprint)
5. 🚀 **Sprint kickoff** (Monday next week)

---

## Questions to Address in Kickoff

1. **Template customization**: Can users create custom templates?
2. **Locking strategy**: Lock template per-module or allow per-scene override?
3. **Avatar placement**: Fixed zones or fully draggable?
4. **Export format**: Only Remotion or also MP4?
5. **Timeline depth**: How many parallel animation tracks?

---

## Supporting Documents

- 📄 `README.md` - Full specification
- 📋 `IMPLEMENTATION-GUIDE.md` - Development strategy
- ✅ `SPRINT-1-TASKS.md` - Detailed task breakdown
- 🎯 `SUMMARY.md` - This document

---

## Contact & Approval

**Spec Owner**: [Product/Engineering Lead]  
**Created**: July 8, 2026  
**Status**: ✅ Ready for implementation  
**Approval**: Required before sprint start

---

## Appendix: Technology Decisions

### Canvas Library: Konva.js ✓
- Pros: Excellent for drawing, animation support, React-friendly
- Cons: Learning curve, file size
- Alternative: Fabric.js (more mature, less React-friendly)

### Timeline Library: Custom React Components ✓
- Pros: Full control, no external dependency bloat
- Cons: More development time
- Alternative: react-timeline-editor (less flexible)

### Waveform: Web Audio API ✓
- Pros: Native browser support, real-time
- Cons: Compute intensive
- Alternative: Pre-compute on backend (server load)

### Export: Remotion ✓
- Pros: Perfect for video composition, React-based
- Cons: Rendering can be slow
- Alternative: FFmpeg (more complex setup)

---

**End of Specification Summary**

This document is complete and approved for team distribution.
