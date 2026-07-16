# Phase 4: Visual Design - REVISED Requirements

**Date**: July 8, 2026  
**Status**: Updated Specification  
**Change**: Simplified scene-based approach with direct avatar/image editing

---

## Key Changes from Original Spec

### ❌ Removed
- Fixed 4-segment structure
- Complex timeline system
- Word-by-word text animation sync
- Per-layout positioning rules
- Segment-based scene management

### ✅ Added
- Scene-based (1 scene = 1 slide)
- Direct canvas editing (drag avatar/images)
- Simple text editing (main point + keypoints)
- Dynamic slide count (matches PDF length)
- Responsive image/avatar sizing

---

## Core User Flow

### 1. Template Selection
```
User arrives at Visual Design
    ↓
Browse template gallery (10 templates)
    ↓
Click template → "Confirm: Apply to all slides?"
    ↓
Template applied to all scenes
    ↓
Each scene gets default layout with:
  - Title text (editable)
  - Avatar placeholder (center-right, draggable, resizable)
  - Content area (text/images, draggable)
```

### 2. Edit Individual Slide

```
Click scene in left panel
    ↓
See slide with:
  ┌─────────────────────────────────┐
  │ TITLE (editable)                │
  │                                 │
  │ • Main Point (editable)         │  ┌──────────┐
  │   - Sub keypoint 1 (editable)   │  │ AVATAR   │
  │   - Sub keypoint 2 (editable)   │  │ AVATAR   │
  │ • Main Point 2                  │  │PLACEHOLDER
  │                                 │  │(draggable)
  │ [Image] (if any - resizable)    │  │(resizable)
  │                                 │  └──────────┘
  └─────────────────────────────────┘

Available actions:
  ✓ Click title → Edit text
  ✓ Click avatar → Drag/Resize
  ✓ Click image → Resize/Move
  ✓ Click bullet → Edit/Add/Delete
```

### 3. Save & Continue
```
Changes auto-saved
    ↓
Green checkmark on slide
    ↓
"Continue to Video" button enabled
```

---

## Detailed Feature Specifications

### Feature 1: Template Selection

**What**: 10 professional templates with default layout

**How**:
- Grid of 10 template options
- Each has: name, preview image, color scheme
- One-click select
- Dialog: "Apply [Template] to all X slides?"
- Template applied in seconds

**Result**:
- All slides get template styling
- Avatar placeholder appears in default position
- All scenes ready for editing

**Existing**: VisualDesignerPanel already has this partially

---

### Feature 2: Default Slide Layout

**Default slide structure**:
```
┌────────────────────────────────────────────────┐
│ Title (from script or "Untitled")              │
│                                                │
│ • Main Point 1                                 │
│   - Sub keypoint 1                             │
│   - Sub keypoint 2                             │
│                                                │
│ [Image placeholder if available]               │
└────────────────────────────────────────────────┘
                                    ┌──────────┐
                                    │ AVATAR   │
                                    │PLACEHOLDER
                                    │(16:9)    │
                                    └──────────┘
```

**Avatar Placeholder**:
- Size: ~25% of slide width
- Position: Right side (x: 70%, y: 50%)
- Aspect ratio: 16:9 (portrait)
- Draggable: User can move anywhere on slide
- Resizable: User can make larger/smaller
- Visual: Semi-transparent box with "Avatar" label

**Text Area**:
- Position: Left 65% of slide
- Content: Title at top, bullets below
- Responsive: Expands if avatar moved

**Image Area**:
- If PDF has images: Auto-positioned below text
- If not: Empty, user can add
- Resizable: User can make larger/smaller
- Responsive: Won't overlap with avatar

---

### Feature 3: Direct Canvas Editing

**Canvas Element Types**:
1. **Title text** (editable, move, resize)
2. **Bullet text** (editable, add/delete lines, move)
3. **Image** (if in content, resize, move)
4. **Avatar placeholder** (move, resize)

**Interactions**:

#### Click to Edit Text
```
Click title → Text box becomes editable
Type new text → Preview updates in real-time
Escape or click outside → Save
```

#### Drag Element
```
Click avatar placeholder → Drag anywhere
Release → Snap to grid (optional)
Canvas updates instantly
Position saved automatically
```

#### Resize Element
```
Hover over element → Show resize handles
Click + drag handle → Element resizes
Maintains aspect ratio (for avatar/images)
Updates canvas in real-time
```

#### Add/Edit Bullet Points
```
Click bullet section → Shows editor
Current format: • Main Point
                  - Sub keypoint 1
                  - Sub keypoint 2

User can:
  ✓ Edit existing text
  ✓ Add new • bullet
  ✓ Add new - sub-keypoint
  ✓ Delete line
  ✓ Re-order (drag/drop bullets)

No forced format - user chooses structure
```

---

### Feature 4: Image Handling

**Image Insertion**:
- Auto-detected from PDF content
- Displayed in slide if available
- User can hide/show image checkbox

**Image Resizing**:
- Click image → Resize handles appear
- Drag handle → Image resizes
- Maintain aspect ratio (default)
- Can make larger or smaller
- Won't overlap with avatar (guide lines shown)

**Image Positioning**:
- Default: Below text, left side
- User can drag anywhere
- Won't go behind avatar placeholder zone

---

### Feature 5: Avatar Placeholder Management

**Default State**:
- Semi-transparent box, ~25% of slide width
- Position: Right side (x:70%, y:50%)
- Label: "Avatar Placeholder"
- Z-index: Top layer

**User Interactions**:

#### Move Avatar
```
Click avatar → Shows move cursor
Drag anywhere on slide
Position updated in real-time
Auto-saved
```

#### Resize Avatar
```
Hover over avatar → Resize handles appear
Drag corner/edge → Avatar resizes
Maintains 16:9 aspect ratio
Can make smaller (min 15% slide width)
Can make larger (max 50% slide width)
Auto-saved
```

#### Preview Avatar Content
- When exporting to video, actual avatar will appear here
- User sees it as placeholder during design

---

### Feature 6: Responsive Content Positioning

**Smart Layout Algorithm**:
1. Avatar position defined (x, y, width)
2. Text automatically wraps around avatar
3. Images positioned to avoid avatar
4. No overlapping content

**Visual Guides**:
- Grid lines (16px snap)
- Avatar boundary (light blue outline)
- Safe content zone (left 65%)
- Alignment guides (snap to edges)

---

### Feature 7: Text Editing

**Text Types**:

1. **Title** (one per slide)
   - Click to edit
   - Plain text, any length
   - Auto-wrap to fit

2. **Content Bullets**
   - Main points: "• Text"
   - Sub-keypoints: "- Text"
   - Click to edit individual line
   - Add/delete/reorder lines

3. **No Forced Format**
   - User decides structure
   - One main point? Fine.
   - Multiple sub-keypoints? Fine.
   - Just text? Fine.
   - Empty? That's ok too.

---

## Data Model (Simplified)

### SlideComposition (per scene)

```prisma
model SlideComposition {
  id              String    @id @default(cuid())
  sceneId         String    @unique
  templateId      String    @default("modern")
  
  // Layout/positioning
  title           String?   @default("")
  contentBullets  Json      @default("[]") // [{type: 'main'|'sub', text: '...'}]
  imageUrl        String?   @default(null) // Auto-detected from PDF or user-added
  
  // Avatar placeholder
  avatarX         Float     @default(70)  // % of slide width
  avatarY         Float     @default(50)  // % of slide height
  avatarWidth     Float     @default(25)  // % of slide width
  avatarHeight    Float?    // Auto-calculated from width (16:9)
  
  // Images (if multiple)
  images          Json      @default("[]") // [{url, x, y, width}]
  
  // Status
  status          String    @default("draft") // draft|ready
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  scene           Scene     @relation(fields: [sceneId], references: [id])
}
```

---

## API Endpoints (Simplified)

### Get Slide Composition
```
GET /api/scenes/{sceneId}/composition

Response:
{
  "id": "comp-uuid",
  "sceneId": "scene-uuid",
  "templateId": "modern",
  "title": "Introduction to AI",
  "contentBullets": [
    { "type": "main", "text": "What is AI?" },
    { "type": "sub", "text": "Definition and scope" },
    { "type": "main", "text": "Why it matters" }
  ],
  "imageUrl": "https://...",
  "avatarX": 70,
  "avatarY": 50,
  "avatarWidth": 25,
  "images": []
}
```

### Save Slide Composition
```
PATCH /api/scenes/{sceneId}/composition

Request:
{
  "title": "New Title",
  "contentBullets": [...],
  "avatarX": 65,
  "avatarY": 45,
  "avatarWidth": 28,
  "images": [...]
}
```

### Apply Template
```
POST /api/modules/{moduleId}/apply-template

Request:
{ "templateId": "ocean" }

Response:
Applies template to all scenes in module
Each scene gets default avatar position + styling
```

---

## Component Architecture

### VisualDesignerPanel (Updated)
```
VisualDesignerPanel
├── TemplateGallery
│   ├── TemplatePreview × 10
│   └── ApplyButton
├── SceneList (Left)
│   ├── SceneButton × N scenes
│   └── AddSceneButton (if needed)
└── EditorWorkspace (Main)
    ├── CanvasEditor (Konva.js)
    │   ├── SlideBackground
    │   ├── TextElements (title, bullets)
    │   ├── ImageElement (if any)
    │   ├── AvatarPlaceholder (draggable, resizable)
    │   └── GridOverlay
    ├── TextEditor Panel (when text selected)
    │   ├── TitleInput
    │   └── BulletListEditor
    └── ActionBar
        ├── SaveStatus
        └── ContinueButton
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Update database schema (avatar positions)
- [ ] Create GET/PATCH composition API
- [ ] Create CanvasEditor component
- [ ] Render avatar placeholder (draggable, resizable)
- [ ] Test drag/resize interactions

**Deliverable**: Canvas with moveable avatar placeholder

---

### Phase 2: Content Editing (Week 2)
- [ ] Title text editing
- [ ] Bullet text editing (add/remove/reorder)
- [ ] Image insertion/resizing
- [ ] Auto-positioning algorithm
- [ ] Save/load compositions

**Deliverable**: Full editing with text + images

---

### Phase 3: Polish & Export (Week 3)
- [ ] Template styling system
- [ ] Responsive layout
- [ ] Error handling
- [ ] Performance optimization
- [ ] Remotion export

**Deliverable**: Production-ready visual designer

---

## Scene vs Segment

### Old Model (❌ Remove)
```
1 Module → 1 Script → N Scenes
Each Scene → 4 Segments
Problem: Fixed structure, many nested levels
```

### New Model (✅ Keep)
```
1 Module → 1 Script → N Scenes (dynamic)
Each Scene → 1 Slide
Simple, flat, flexible
```

**Result**: Simpler component tree, easier to manage, matches PDF naturally

---

## Slide Count

**How many slides?**
- Not fixed at 4
- Based on PDF content + user choice
- Could be 2, 5, 10, or more
- User can add/delete slides as needed

**How it works**:
1. PDF uploaded → Scripts generated (1 script = multiple scenes)
2. Each scene gets default slide
3. User can add more slides or delete unused ones
4. Templates apply to all current slides

---

## Text Format (Flexible)

### Old (❌ Forced)
```
Every slide must have:
- Title
- Subtitle
- 3-5 bullets (must be formatted this way)
- Image area
```

### New (✅ Natural)
```
User decides:
- Just a title? Fine.
- Title + one bullet? Fine.
- Title + 5 bullets? Fine.
- No title? Fine.

Format bullets how you want:
• Main point
• Another point
- Sub-explanation
• More stuff
```

**Result**: Flexibility, no forced structure

---

## Image Handling

**Auto-detection**:
- Images in PDF content → Extract and show on slide
- User can hide/show via checkbox
- User can resize by dragging handle

**Responsive**:
- Image won't overlap avatar placeholder
- If avatar moved over image area, image pushes down
- Smart layout keeps things organized

---

## Success Criteria

✅ User can select template  
✅ Template applies to all slides  
✅ Default slide layout renders  
✅ Avatar placeholder is draggable  
✅ Avatar placeholder is resizable  
✅ Avatar maintains 16:9 aspect ratio  
✅ User can edit title text  
✅ User can edit/add/delete bullets  
✅ User can resize images  
✅ Images don't overlap avatar  
✅ Content auto-positions correctly  
✅ All changes auto-save  
✅ Export to video works  
✅ No fixed 4-slide limit  
✅ Slides match PDF length naturally  

---

## Technology Stack

- **Canvas**: Konva.js (drag, resize, layers)
- **Inputs**: React for text editing
- **Data**: Prisma ORM + Azure Database
- **Export**: Remotion (composition)
- **Styling**: Tailwind CSS

---

## Timeline

**Week 1**: Foundation (avatar, drag/resize)  
**Week 2**: Content editing (text, images)  
**Week 3**: Polish & export  

**Total**: 3 weeks (faster than original 4-sprint plan)

---

**Status**: Ready for sprint planning  
**Approach**: Simpler, more flexible, user-focused
