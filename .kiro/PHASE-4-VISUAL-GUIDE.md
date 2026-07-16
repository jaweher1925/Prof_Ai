# Phase 4: Visual Design - Visual Guide & Examples

**Purpose**: Show exactly what users will see and interact with

---

## User Interface Flow

### Screen 1: Template Selection

```
╔═══════════════════════════════════════════════════════════════╗
║  4. Visual Design                                    Continue ► │
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Choose a template for your slides                          ║
║                                                               ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    ║
║  │ Modern   │  │ Minimal  │  │Corporate │  │ Academic │    ║
║  │  #3B82   │  │ #FFFFFF  │  │ #1E40AF  │  │ #10B981  │    ║
║  └──────────┘  └──────────┘  └──────────┘  └──────────┘    ║
║                                                               ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    ║
║  │ Ocean    │  │ Playful  │  │  Dark    │  │ Gradient │    ║
║  │ #06B6D4  │  │ #EC4899  │  │ #000000  │  │ Rainbow  │    ║
║  └──────────┘  └──────────┘  └──────────┘  └──────────┘    ║
║                                                               ║
║  ┌──────────┐  ┌──────────┐                                 ║
║  │ Elegant  │  │ Vibrant  │                                 ║
║  │ #F59E0B  │  │ #FF6B6B  │                                 ║
║  └──────────┘  └──────────┘                                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

User clicks "Modern" template
  ↓
Dialog appears:
  "Apply 'Modern' template to all 5 slides in this module?"
  [Cancel] [Confirm]
  ↓
User clicks "Confirm"
  ↓
All slides updated with Modern styling
Progress bar shows: "Applying template... 3/5 complete"
```

### Screen 2: Slide Editing (Main Canvas)

```
╔════════════════════════════════════════════════════════════════════╗
║  Scene List          │ Canvas Editor                              ║
╠════════════════════════════════════════════════════════════════════╣
║                      │                                             ║
║ [1] Intro ✓          │  ╔══════════════════════════════════════╗  ║
║ [2] What is AI       │  ║ What is AI?                          ║  ║
║ [3] Why Matters      │  ║                                      ║  ║
║ [4] Examples         │  ║ • Artificial Intelligence            ║  ║
║ [5] Summary          │  ║   - Machines learning from data      ║  ║
║                      │  ║   - Improving over time              ║  ║
║ + Add Scene          │  ║ • Why Study?                         ║  ║
║                      │  ║   - Career opportunities             ║  ║
║                      │  ║                                      ║  ║
║                      │  ║                      ┌─────────────┐ ║  ║
║                      │  ║                      │   AVATAR    │ ║  ║
║                      │  ║                      │PLACEHOLDER  │ ║  ║
║                      │  ║                      │ (Drag/      │ ║  ║
║                      │  ║                      │  Resize)    │ ║  ║
║                      │  ║                      └─────────────┘ ║  ║
║                      │  ║                                      ║  ║
║                      │  ╚══════════════════════════════════════╝  ║
║                      │                                             ║
║                      │  Saved ✓                                   ║
║                      │                                             ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## Interactive Elements

### Element 1: Avatar Placeholder (Draggable & Resizable)

**Default State**:
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  • Main Point          ┌─────────────┐              │
│    - Sub point         │   AVATAR    │              │
│  • Another Point       │PLACEHOLDER  │              │
│    - Details           │  (Resize    │              │
│                        │   handles   │              │
│  [Image]               │   on edges) │              │
│                        │             │              │
│                        │    ◼ ◼ ◼    │              │
│                        │    ◼   ◼    │              │
│                        │    ◼ ◼ ◼    │              │
│                        └─────────────┘              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**User Drags Avatar to Left**:
```
┌──────────────────────────────────────────────────────┐
│  ┌─────────────┐                                     │
│  │   AVATAR    │  • Main Point                      │
│  │PLACEHOLDER  │    - Sub point                     │
│  │  (Drag/     │  • Another Point                   │
│  │   Resize)   │    - Details                       │
│  │             │                                    │
│  │    ◼ ◼ ◼    │  [Image]                          │
│  │    ◼   ◼    │                                    │
│  │    ◼ ◼ ◼    │                                    │
│  └─────────────┘                                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**User Resizes Avatar Larger**:
```
┌──────────────────────────────────────────────────────┐
│                                    ┌──────────────┐  │
│                                    │   AVATAR     │  │
│                                    │ PLACEHOLDER  │  │
│  • Main Point                      │   (Larger)   │  │
│    - Sub point                     │              │  │
│  • Another Point                   │              │  │
│    - Details                       │    ◼ ◼ ◼    │  │
│                                    │    ◼   ◼    │  │
│  [Image]                           │    ◼ ◼ ◼    │  │
│                                    │              │  │
│                                    └──────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Result**: Layout adapts, content repositions automatically

---

### Element 2: Text Editing (Click to Edit)

**Title Editing**:
```
Before Click:
┌─────────────────────────────────┐
│ What is Artificial Intelligence? (click to edit)

After Click:
┌─────────────────────────────────┐
│ [What is Artificial Intelligence?] 
  (text box active, cursor blinking)

User edits text:
[Introduction to AI]

After Blur/Enter:
┌─────────────────────────────────┐
│ Introduction to AI (updated on canvas)
```

**Bullet Editing**:
```
Before Click:
• Main Point
  - Sub point 1
  - Sub point 2
• Another Point

User clicks first bullet:
┌──────────────────────────────────┐
│ [Main Point        ] [delete]    │
└──────────────────────────────────┘

User edits:
[Definition of AI        ] [delete]

Result:
• Definition of AI
  - Sub point 1
  - Sub point 2
• Another Point

User clicks [+Add bullet]:
• Definition of AI
  - Sub point 1
  - Sub point 2
• Another Point
• [New bullet point] [delete]

After typing:
• Definition of AI
  - Sub point 1
  - Sub point 2
• Another Point
• Business applications
```

---

### Element 3: Image Resizing

**Image Present (from PDF)**:
```
Before:
[Image] (auto-detected size)

User clicks image:
┌─────────────┐
│ [Image]     │  (resize handles appear)
│    ◼   ◼    │
│ ◼       ◼   │
│    ◼   ◼    │
└─────────────┘

User drags corner:
┌──────────────────┐
│    [Image]       │  (larger)
│       ◼   ◼      │
│  ◼          ◼    │
│       ◼   ◼      │
└──────────────────┘

Or drags corner (smaller):
┌────┐
│[I] │
└────┘
```

**No Image (Empty Slot)**:
```
• Point 1
• Point 2

[+ Add Image]  (or can just leave empty)
```

---

## Complete Slide Example (Before & After)

### Example 1: Default Slide (After Template Applied)

```
BEFORE EDIT:
┌──────────────────────────────────────┐
│ Untitled                             │
│                                      │
│ • Main point                     ┌──────────┐
│   - Sub keypoint                 │ AVATAR   │
│ • Main point                     │PLACEHOLDER
│                                  │  (Drag/  │
│                                  │ Resize)  │
│                                  └──────────┘
│                                      │
│                                      │
└──────────────────────────────────────┘

AFTER USER EDITS:
┌──────────────────────────────────────┐
│ What is AI?                          │
│                                      │
│ • Artificial Intelligence      ┌──────────────┐
│   - Machines learning from data│   AVATAR     │
│   - Improves over time        │ PLACEHOLDER  │
│ • Why study AI?              │   (Moved     │
│   - Career growth            │    left,     │
│   - Industry demand          │    larger)   │
│                              │              │
│                              │              │
│ [chart.png]                  │              │
│                              │              │
│                              └──────────────┘
└──────────────────────────────────────┘
```

---

### Example 2: Flexible Text Format

**Slide 1: Minimal Format**
```
Title: "Summary"

(Just title, no bullets)

Avatar on right
```

**Slide 2: Bullet Format**
```
Title: "Key Points"

• Point 1
• Point 2
• Point 3
• Point 4

Avatar bottom-right
```

**Slide 3: Mixed Format**
```
Title: "Advanced AI"

What is it?
  • Machine learning
    - Supervised
    - Unsupervised
  • Deep learning

Uses:
  • Image recognition
  • Natural language
  
Avatar on left
```

**Slide 4: Image Focus**
```
Title: "System Architecture"

[Large Architecture Diagram]

Small avatar overlay (bottom-right)
```

---

## User Interactions (Timeline)

```
Time 0s: User clicks "Modern" template
        ↓
Time 1s: All slides updated with Modern styling
        Green toast: "Template applied"
        ↓
Time 2s: User sees first slide
        ↓
Time 5s: User clicks avatar placeholder
        Outline becomes blue, resize handles appear
        ↓
Time 7s: User drags avatar to left side
        Canvas updates in real-time
        Position saved to database
        ↓
Time 10s: User clicks title text
         Text box becomes active
         ↓
Time 12s: User edits title text
         Canvas updates as they type
         ↓
Time 15s: User clicks elsewhere
         Title saves automatically
         Green checkmark: "Saved ✓"
         ↓
Time 20s: User clicks first bullet point
         Bullet editor panel opens
         ↓
Time 25s: User adds new bullet point
         Canvas updates
         Auto-saves
         ↓
Time 30s: User clicks next slide
         Previous slide saves
         New slide loads with its composition
         ↓
Time 35s: User continues editing next slide
         Same process repeats
         ↓
Time X: User finishes all slides
        All slides show green checkmarks
        "Continue to Video" button enabled
        ↓
Time X+1: User clicks "Continue to Video"
         Passes to Phase 5
```

---

## Responsive Behavior

### Content Adjusts When Avatar Moves

**Avatar Right (Default)**:
```
┌────────────────────────────────────┐
│ Title                              │
│                         ┌──────────┐
│ • Bullet 1              │ AVATAR   │
│   - Sub                 │ (Right)  │
│ • Bullet 2              │          │
│                         └──────────┘
│ [Image]                            │
└────────────────────────────────────┘
```

**Avatar Left**:
```
┌────────────────────────────────────┐
│ ┌──────────┐                       │
│ │ AVATAR   │ Title                │
│ │  (Left)  │                       │
│ │          │ • Bullet 1           │
│ │          │   - Sub              │
│ │          │ • Bullet 2           │
│ │          │                       │
│ └──────────┘ [Image]               │
└────────────────────────────────────┘
```

**Avatar Center-Bottom**:
```
┌────────────────────────────────────┐
│ Title                              │
│                                    │
│ • Bullet 1                         │
│   - Sub                            │
│ • Bullet 2                         │
│                                    │
│   ┌────────────────────────────┐  │
│   │     AVATAR (Center)        │  │
│   │     (Moves up/down)        │  │
│   └────────────────────────────┘  │
└────────────────────────────────────┘
```

**Result**: Content intelligently repositions to avoid overlap

---

## Toolbar & Controls

```
╔═══════════════════════════════════════════════════════════╗
║ Save Status: [●●●●●●○○○○] Saved ✓                   ║
║                                                           ║
║ [← Back to Voices]  •  4. Visual Design  •  5. Video → │
╚═══════════════════════════════════════════════════════════╝
```

**Save Status Indicator**:
- "Editing..." (gray) → User making changes
- "Saving..." (yellow) → Auto-save in progress
- "Saved ✓" (green) → All changes persisted

---

## Grid & Alignment

**16px Grid** (Optional Visual):
```
┌────────────────────────────────────┐
│ ┌ ┬ ┬ ┬ ┬ ┬ ┬ ┬ ┬ ┬ ┬ ┬ ┬ ┬ ┬ ┬ ┐ │
│ ├ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┤ │
│ │ Title                           │ │
│ ├ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┤ │
│ │                                  │ │
│ │ • Bullet 1        ┌──────────┐   │ │
│ │   - Sub           │ AVATAR   │   │ │
│ │ • Bullet 2        │ (Snaps   │   │ │
│ │                   │ to grid) │   │ │
│ ├ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┼ ┤ │
│ │ [Image]           └──────────┘   │ │
│ └ ┴ ┴ ┴ ┴ ┴ ┴ ┴ ┴ ┴ ┴ ┴ ┴ ┴ ┴ ┴ ┘ │
└────────────────────────────────────┘

(User can toggle grid on/off)
```

---

## State Transitions

```
IDLE STATE
├─ User has selected scene
├─ Canvas displays composition
├─ No element selected
└─ Save button grayed out

      ↓ (User clicks avatar)

AVATAR SELECTED
├─ Avatar outline blue
├─ Resize handles visible
├─ User can drag or resize
└─ Changes auto-save on release

      ↓ (User clicks text)

TEXT EDIT MODE
├─ Text box becomes active
├─ Cursor in input field
├─ User types text
└─ Auto-saves on blur

      ↓ (User clicks elsewhere)

IDLE STATE (again)
└─ All changes persisted
```

---

## Error Handling

**Network Error During Save**:
```
Save Status: "Save failed - Retrying..."

After retry succeeds:
Save Status: "Saved ✓"
```

**Invalid Data**:
```
User tries to leave slide with empty title
Toast appears: "Slide title cannot be empty"
Focus returns to title field
```

**Auto-recovery**:
```
Browser crashes
User reopens application
Scene loads with last saved composition
Toast: "Recovered last save"
```

---

## Summary: What Users Will See

1. **Template Gallery** - Browse & select template (1 click)
2. **Slide Canvas** - See slide with avatar placeholder
3. **Drag Avatar** - Move/resize avatar directly on canvas
4. **Edit Text** - Click text to edit (inline editing)
5. **Edit Bullets** - Add/delete/reorder bullet points
6. **Resize Images** - Drag image handles to resize
7. **Auto-save Feedback** - See save status indicator
8. **Move to Next** - Continue button enabled after editing

**Result**: Clean, intuitive, no complexity
