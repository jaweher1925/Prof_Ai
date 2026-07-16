# Phase 4: Visual Design - REVISED (Simplified)

**Status**: ✅ Spec Updated  
**Date**: July 8, 2026  
**Changes**: Removed segments, added direct avatar/image editing, flexible text format

---

## What Changed

### ❌ Out: Complexity
- **Removed**: Fixed 4-segment structure
- **Removed**: Complex timeline system
- **Removed**: Word-by-word animation sync
- **Removed**: Forced layout positions
- **Removed**: Nested segment management

### ✅ In: Simplicity
- **Added**: Scene-based (1 scene = 1 slide)
- **Added**: Direct canvas editing (drag avatar/images)
- **Added**: Simple text editing (no forced format)
- **Added**: Dynamic slide count (matches PDF)
- **Added**: Responsive positioning

---

## How It Works

### Step 1: Choose Template
```
Browse 10 templates
Click template
Confirm: "Apply Modern to all slides?"
All scenes get template styling + avatar placeholder
```

### Step 2: Edit Each Slide
```
Default slide layout:
┌─────────────────────────────────────┐
│ Title (click to edit)                │
│                                     │
│ • Main Point (click to edit)        │ ┌──────────┐
│   - Sub keypoint (click to edit)    │ │ AVATAR   │
│ • Another Point                     │ │ (Drag/   │
│                                     │ │  Resize) │
│ [Image] (if in PDF, click resize)   │ └──────────┘
│                                     │
└─────────────────────────────────────┘

Available actions:
  • Click title → Edit text
  • Click bullet → Edit/add/delete
  • Drag avatar → Move anywhere
  • Resize avatar → Corner handles
  • Drag image → Move/resize
```

### Step 3: Save & Continue
```
Auto-saves every 500ms
Green checkmark = Saved
"Continue" button enabled
```

---

## Key Features

### ✅ Avatar Placeholder
- **Draggable**: Click + drag anywhere on slide
- **Resizable**: Drag corner handles
- **Aspect Ratio**: Maintains 16:9 (portrait)
- **Size**: 15% - 50% of slide width
- **Position**: Defaults to right (70%, 50%), user can move

### ✅ Title Text
- **Click to Edit**: Single click = edit mode
- **Any Length**: Auto-wraps
- **No Format**: Just plain text

### ✅ Bullet Points
- **Main Points**: • symbol
- **Sub-keypoints**: - symbol
- **Flexible Format**: User decides structure
  - One bullet? Ok.
  - Five bullets? Ok.
  - Mixed • and -? Ok.

### ✅ Images
- **Auto-detected**: From PDF content if available
- **Resizable**: Drag handles to resize
- **Responsive**: Won't overlap avatar
- **Repositionable**: User can move around

### ✅ Smart Layout
- **Grid**: 16px snap-to-grid
- **Guides**: Show safe content zones
- **No Overlap**: Avatar + text/images positioned smartly
- **Responsive**: Content adjusts to avatar position

---

## Technical Implementation

### Database
```sql
table: slide_compositions
├── sceneId (unique link to scene)
├── templateId (which template)
├── title (slide title text)
├── contentBullets (JSON array of bullets)
├── imageUrl (auto-detected from PDF or user-added)
├── avatarX (% of slide width) ← NEW
├── avatarY (% of slide height) ← NEW
├── avatarWidth (% of slide width) ← NEW
└── timestamps (created_at, updated_at)
```

### API Endpoints (Simple)
```
GET /api/scenes/{sceneId}/composition
  → Returns all composition data

PATCH /api/scenes/{sceneId}/composition
  → Save any/all fields

POST /api/modules/{moduleId}/apply-template
  → Apply template to all scenes
```

### Components
```
VisualDesignerPanel
├── TemplateGallery (10 templates)
├── SceneList (scenes in module)
└── CanvasEditor
    ├── Slide background
    ├── Title text (editable)
    ├── Bullet list (editable)
    ├── Images (resizable)
    └── Avatar placeholder (draggable + resizable)
```

---

## Effort & Timeline

| Phase | Duration | What |
|-------|----------|------|
| **Week 1** | 5 days | Foundation: Avatar placeholder, drag/resize, title/bullet editing |
| **Week 2** | 5 days | Polish: Templates, images, auto-save, export |
| **Total** | 2 weeks | Production-ready visual designer |

---

## Scene vs Segment (Important Change)

### Old Structure (❌)
```
Module
  └─ Script
      └─ Scene 1
          ├─ Segment 1
          ├─ Segment 2
          ├─ Segment 3
          └─ Segment 4
      └─ Scene 2
          ├─ Segment 1
          ├─ Segment 2
          ├─ Segment 3
          └─ Segment 4
```
**Problem**: Fixed 4 segments, nested complexity

### New Structure (✅)
```
Module
  └─ Script
      ├─ Scene 1 → Slide 1
      ├─ Scene 2 → Slide 2
      ├─ Scene 3 → Slide 3
      ├─ Scene 4 → Slide 4
      └─ Scene 5 → Slide 5 (if needed)
```
**Benefit**: Flat structure, dynamic count, matches PDF naturally

---

## Text Format (User Decides)

### Before (❌ Forced)
```
Every slide MUST have:
- Title
- Subtitle
- Exactly 3-5 bullets
- Icon positioning
- Image area
```

### Now (✅ Natural)
```
User can have:
- Just title? ✓
- Title + bullets? ✓
- Title + one sentence? ✓
- Bullets formatted however? ✓

Examples:
1. Title: "What is AI?"
   • Definition
   - Technical aspect
   • Business impact

2. Title: "Key Points"
   • Point 1
   • Point 2
   • Point 3
   • Point 4
   • Point 5

3. Title: "Summary"
   Just the facts here.
```

---

## Image Handling (Responsive)

### What Happens
1. **Auto-detect**: Images in PDF → Shown on slide
2. **Resizable**: Click image → Drag handles → Resize
3. **Smart Layout**: Image won't go behind avatar placeholder
4. **User Control**: Can move/resize/hide as needed

### Example
```
If avatar moved to left side:
┌──────────────────────────────┐
│ Title                        │
│ • Bullet                     │
│ [Avatar Placeholder]         │ ← Moved to left
│ • Another                    │
│                              │
│        [IMAGE] ← Moves down  │
└──────────────────────────────┘
```

---

## Success Criteria (Simple)

✅ User selects template → applies to all slides  
✅ Avatar placeholder visible (semi-transparent box)  
✅ Drag avatar → moves anywhere on slide  
✅ Resize avatar → corner handles, 16:9 aspect ratio  
✅ Click title → edit text  
✅ Click bullet → add/edit/delete bullets  
✅ Click image → resize/move  
✅ Changes auto-save every 500ms  
✅ No data loss on refresh  
✅ Works smoothly (60fps canvas)  

---

## Files to Review

In `.kiro/specs/phase-4-visual-design/`:

1. **REVISED-REQUIREMENTS.md** ← Read this first (5 min)
   - Full user flows
   - Feature details
   - Data model

2. **SPRINT-1-REVISED-TASKS.md** ← For developers (20 min)
   - 10 tasks
   - Code examples
   - Success criteria
   - 2-week timeline

3. **README.md** (Original - for context)

---

## Getting Started

### For Product/Design
→ Read **REVISED-REQUIREMENTS.md**
- Understand user flows
- See default layouts
- Review features

### For Engineers
→ Read **SPRINT-1-REVISED-TASKS.md**
- Task breakdowns
- Code examples
- What to build

### For Management
→ This document (5 min)
- What changed
- Timeline: 2 weeks
- Key features

---

## Next Steps

1. ✅ Review spec (this document)
2. 📋 Create Jira tickets from tasks
3. 👥 Assign team (1 backend, 1 frontend)
4. 🚀 Sprint kickoff (next Monday)

---

## Questions Answered

**Q**: Why remove segments?  
**A**: Simpler structure, less nesting, easier to manage

**Q**: How many slides per module?  
**A**: Dynamic - whatever the PDF needs (2, 5, 10, etc.)

**Q**: Can I edit avatar position?  
**A**: Yes - drag it anywhere, resize it, user has full control

**Q**: What if PDF has no images?  
**A**: Image area is optional, user can add images manually

**Q**: How is text formatted?  
**A**: User decides - no forced structure

**Q**: What about animations/timing?  
**A**: Removed from Phase 4 - handle separately later if needed

---

## Bottom Line

**Old Approach**: Complex, fixed structure, many constraints  
**New Approach**: Simple, flexible, user-focused

**Timeline**: 2 weeks  
**Complexity**: Low  
**User Experience**: Clean & intuitive

---

**Status**: ✅ Specification Complete & Ready to Build  
**Next**: Sprint planning with team

