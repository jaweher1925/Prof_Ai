# Phases 3-7 Implementation Roadmap

## Overview
Phases 1-2 (Library & Scripts) are complete and production-ready. This roadmap outlines the implementation strategy for Phases 3-7 following the Functional Specification Report and 7-stage pipeline architecture.

---

## Phase 3: Voices - Voice Casting & Settings

### Scope
Integrate ElevenLabs voice casting for realistic AI narration with customizable settings.

### Features to Implement
1. **Voice Selection**
   - Browse ElevenLabs voice library
   - Preview voice samples
   - Select voice for module
   - Apply globally or per-module

2. **Voice Settings**
   - Stability slider
   - Similarity boost slider
   - Voice style selector
   - Speech rate/speed adjustment

3. **Preview Functionality**
   - Preview voice on sample script text
   - Listen before committing
   - Adjust settings in real-time

4. **Voice Casting Gate** (Already implemented)
   - First-time popup for avatar + voice selection
   - Casting Settings modal for changes
   - Prevents accidental skipping

### Key Components
- `VoicePanel.jsx` - Main voice casting interface
- `CastingSettings.jsx` - Avatar + Voice selector (already exists)
- `previewTTS.ts` - Voice preview endpoint

### Database Integration
```
Project model updates:
- defaultVoiceId (already exists)
- voiceSettings (JSON: stability, similarity, style, speed)
```

### UI/UX Considerations
- ✅ Clean interface (no verbose text)
- ✅ Dark mode support
- ✅ Real-time preview
- ✅ Settings persist across sessions
- ✅ Can be changed at Casting Settings

### Expected Timeline
Estimate: 2-3 days (voice library integration, preview, settings storage)

---

## Phase 4: Visual Design - Template & WYSIWYG Canvas

### Scope
Provide professional design templates with WYSIWYG editor for customization. Remove rigid 4-segment limits and implement dynamic slide generation.

### Features to Implement
1. **Template Library**
   - Browse design templates
   - Quick preview of each template
   - Select template to apply to all modules
   - Save custom templates

2. **WYSIWYG Canvas**
   - Drag-and-drop slide editor
   - Avatar placeholder (resizable, moveable)
   - Text and image elements
   - Real-time preview

3. **Direct Manipulation**
   - Resize avatar (big/small/normal)
   - Move avatar position
   - Reposition text/images
   - Adjust spacing and layout
   - Direct canvas interaction (no sidebar panels)

4. **Dynamic Slides**
   - Remove 4-segment restriction
   - Generate slides based on content length
   - Auto-scale slides per module
   - No fixed slide count

5. **Image Assets**
   - AI-generated images for slide content
   - Manual scaling (grandir/small/large)
   - Responsive to content area
   - Fit to avatar boundaries

6. **Typography**
   - Remove automated bullet points
   - Group content into focused ideas
   - Nested key points instead of flat lists
   - Clean hierarchy

### Key Components
- `VisualDesignerPanel.jsx` - Main design interface (needs update)
- Template system (new)
- WYSIWYG editor (new or enhanced)
- Avatar canvas component (new)

### Database Integration
```
Scene model:
- avatarPositionX, avatarPositionY (already exists)
- presenterPosition (already exists - "bottom-right" default)

SceneSegment model:
- slideDesign (JSON: full design per segment)
- elements (slide elements with positioning)
```

### UI/UX Considerations
- ✅ Intuitive drag-and-drop interface
- ✅ Visual feedback during manipulation
- ✅ Zoom in/out for fine control
- ✅ Undo/redo for edits
- ✅ Template quick-apply
- ✅ Preview before saving

### Expected Timeline
Estimate: 4-5 days (template system, canvas editor, drag-drop implementation)

---

## Phase 5: Video Editing - Timeline & Motion Graphics

### Scope
Build composition canvas with Remotion-based timeline for professional video assembly. Model after Synthesia experience.

### Features to Implement
1. **Composition Canvas**
   - Presentation slides (left/center)
   - Avatar video (right/center)
   - Combined preview

2. **Timeline Interface**
   - Remotion-based composition
   - Slide transitions visualization
   - Duration per slide
   - Avatar sync markers

3. **Motion & Transitions**
   - Fade in/out transitions
   - Slide animations (entrance/exit)
   - Motion graphics for emphasis
   - Smooth avatar-slide synchronization

4. **Module Merging**
   - Sequential slide compilation
   - Cross-fade between modules
   - Consistent pacing
   - Module boundary markers

5. **Playback Controls**
   - Play/pause timeline
   - Timeline scrubbing
   - Speed adjustment for preview
   - Export preview video

### Key Components
- `VideoPanel.jsx` - Main video editing interface (partially exists)
- Remotion composition builder (new)
- Timeline visualization (new)
- Motion graphics library (new)

### Backend Integration
```
Endpoints needed:
- POST /api/produceScenes - Trigger video composition
- GET /api/scenes/{id} - Get scene with video status
```

### UI/UX Considerations
- ✅ Synthesia-like timeline experience
- ✅ Real-time preview
- ✅ Smooth transitions
- ✅ Visual sync indicators
- ✅ Professional appearance

### Expected Timeline
Estimate: 5-7 days (Remotion setup, timeline, motion graphics, preview)

---

## Phase 6: Avatar Studio - Avatar Rendering & Styling

### Scope
Dedicated isolated layer for HeyGen avatar rendering with customization options. Feature parity with voice casting setup.

### Features to Implement
1. **Avatar Selection**
   - Browse HeyGen avatar library
   - Preview avatars
   - Select avatar for module
   - Apply globally or per-module

2. **Avatar Styling**
   - Appearance options (normal, circle, close-up)
   - Background customization (color, image, none)
   - Clothing/outfit selection
   - Expression/emotion settings

3. **Avatar Settings**
   - Position on screen (left, center, right)
   - Size adjustment
   - Zoom level
   - Camera angle

4. **Rendering Control**
   - Render individual avatars
   - Batch render all avatars
   - Preview before rendering
   - Monitor rendering progress

### Key Components
- `AvatarStudioPanel.jsx` - Avatar customization (partially exists)
- Avatar preview component
- HeyGen integration

### Database Integration
```
Project model (already exists):
- defaultAvatarId
- avatarStyle ("normal" | "circle" | "closeUp")
- avatarBackground (JSON: {type, value})

Scene model:
- avatarPositionX, avatarPositionY
- avatarVideoUrl
```

### Backend Integration
```
Endpoints needed:
- POST /api/generateHeyGenAvatar - Trigger avatar render
- POST /api/pollHeyGenVideo - Check render status
- GET /api/modules/{id} - Get rendering progress
```

### UI/UX Considerations
- ✅ Avatar preview before render
- ✅ Progress indication
- ✅ Batch rendering capability
- ✅ Style customization options
- ✅ Easy one-click avatar change

### Expected Timeline
Estimate: 2-3 days (avatar selection, styling options, preview, rendering)

---

## Phase 7: Final Video - Compilation & Export

### Scope
Merge all components (presentation + motion + avatar) into final synchronized video ready for download.

### Features to Implement
1. **Pipeline Convergence**
   - Combine Presentation Layout (Phase 4)
   - Add Motion/Timeline (Phase 5)
   - Overlay Rendered Avatar (Phase 6)
   - Sync all components

2. **Video Compilation**
   - Module-by-module assembly
   - Seamless transitions between modules
   - Audio sync verification
   - Quality verification

3. **Export Options**
   - MP4 download
   - HD resolution (1080p)
   - Quality settings
   - Batch export all modules

4. **Status Tracking**
   - Compilation progress
   - Module-by-module status
   - Error detection and reporting
   - Retry failed compilations

### Key Components
- `VideoPanel.jsx` - Final video output (update)
- Compilation orchestrator
- Export service

### Backend Integration
```
Endpoints needed:
- POST /api/mergeModuleVideo - Trigger final compilation
- GET /api/modules/{id}/full_video_url - Get final video
- POST /api/projects/{id}/export - Export all videos
```

### UI/UX Considerations
- ✅ Clear progress indicators
- ✅ Download link on completion
- ✅ Multiple export format options
- ✅ Batch operations
- ✅ Quality preview before download

### Expected Timeline
Estimate: 3-4 days (compilation logic, export formatting, quality control)

---

## Implementation Order

### Recommended Sequence
```
1. Phase 3 (Voices) - 2-3 days
   └─ Core voice casting integration

2. Phase 4 (Visual Design) - 4-5 days
   └─ Template system + WYSIWYG editor

3. Phase 6 (Avatar Studio) - 2-3 days
   └─ Avatar customization (builds on Voice casting UI)

4. Phase 5 (Video Editing) - 5-7 days
   └─ Timeline and motion (depends on avatars + slides)

5. Phase 7 (Final Video) - 3-4 days
   └─ Compilation and export (final integration)
```

**Total Estimate**: 16-22 development days

---

## Shared Patterns & Architecture

### Component Structure
All phases follow this pattern:
```
PhaseName
├── Panel.jsx (main UI)
├── Editor/Customizer.jsx (detailed editing)
├── Preview.jsx (live preview)
└── Status/Progress.jsx (feedback)
```

### State Management
- React Query for API calls
- Local state for UI interactions
- QueryClient invalidation on changes
- Optimistic updates where applicable

### Dark Mode
- Consistent dark mode using transparent patterns
- `dark:bg-white/[0.02]` pattern throughout
- No grey backgrounds in dark mode
- Green indicators for completion

### Error Handling
- User-friendly error messages
- Retry buttons for failed operations
- Error boundaries for safety
- Loading states for async operations

---

## Testing Strategy

Each phase should include:
- ✅ Upload/selection functionality
- ✅ Settings persistence
- ✅ Preview accuracy
- ✅ Dark mode styling
- ✅ Error recovery
- ✅ Mobile responsiveness
- ✅ Performance benchmarks

---

## Database Migrations

As new features are added, create migrations:
```
Naming: YYYYMMDDHHMMSS_description
Location: api/prisma/migrations/
Apply: npx prisma migrate deploy
```

---

## API Consistency

All endpoints follow pattern:
```
POST /api/{agent}Agent          - Trigger async operation
GET  /api/{resource}/{id}       - Get resource state
PATCH /api/{resource}/{id}      - Update resource
DELETE /api/{resource}/{id}     - Delete resource
```

---

## Documentation Requirements

For each phase:
1. Implementation guide (like PHASE-2-SCRIPTS-GUIDE.md)
2. API documentation
3. Database schema changes
4. UI component inventory
5. Testing checklist

---

## Success Criteria

Each phase is complete when:
- ✅ All features implemented
- ✅ Both builds passing (0 errors)
- ✅ Dark mode fully supported
- ✅ No verbose UI text
- ✅ HITL gates enforced where applicable
- ✅ Error handling complete
- ✅ Documentation created
- ✅ Testing checklist passed

---

## Ready for Implementation

All foundation work is complete:
- ✅ Database migrations applied
- ✅ Menu structure finalized
- ✅ HITL framework established
- ✅ UI patterns standardized
- ✅ Build pipeline clean

Start with Phase 3 whenever ready!
