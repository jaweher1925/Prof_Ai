# Visual Designer — Quick Start Guide

**New clean, light design with flexible text editing and large avatar placeholder**

---

## Start the App

```bash
# Terminal 1: API Server
cd c:\Users\GIGABYTE\Desktop\ProfAI\api
npm run dev
# → http://localhost:7071

# Terminal 2: Frontend
cd c:\Users\GIGABYTE\Desktop\ProfAI
npm run dev
# → http://localhost:5173
```

Navigate to **Visual Designer** stage.

---

## Layout Overview

```
┌─────────────────────────────────────────────────────┐
│  Visual Designer │ Continue to Video                │
├──────────────────┼─────────────────────────────────┤
│  MODULES         │                                  │
│  ──────────────  │  ┌──────────────────────────┐   │
│  ▼ Module 1      │  │ GVSU              ProfAI │   │
│    ✓ Slide 1     │  │                          │   │
│    □ Slide 2     │  │   [Text Elements]        │   │
│    □ Slide 3     │  │   [Image Icon - drag it] │   │
│                  │  │                          │   │
│  ▼ Module 2      │  │                  ┌─────┐│   │
│    □ Slide 4     │  │                  │Avtr.││   │
│    □ Slide 5     │  │                  │(big)││   │
│                  │  │                  └─────┘│   │
│                  │  └──────────────────────────┘   │
│                  │                                  │
│                  │  [Controls Below]                │
└──────────────────┴─────────────────────────────────┘
```

---

## How to Edit a Slide

### Step 1: Select Scene
- Click a scene from left panel
- Slide preview appears on right
- You see: logos, text, image icon, avatar area

### Step 2: Add Text
- Click **"+ Add Text"** button (middle panel)
- New text appears on slide
- Type your content in the editor

### Step 3: Edit Text Properties
- Click text element on slide (shows blue ring when selected)
- Edit panel opens on right with:
  - **Text**: Multiline textarea
  - **Size**: 12-40px slider
  - **Bold**: On/Off toggle
  - **Color**: Color picker
- Click **"Save"** to apply

### Step 4: Add Image
- Option A: **Upload**
  - Click "Upload" button
  - Pick an image
  - Image appears as small icon (56×56px)
- Option B: **Generate with AI**
  - Type: "flowchart for photosynthesis" 
  - Click "Generate"
  - AI creates image, you can drag it

### Step 5: Position Elements
- Click any element (text or image)
- Drag it to desired location
- Release to save position

### Step 6: Pick Theme Color
- 4 color swatches in left panel
- White | Blue | Green | Gray
- Click one
- Slide background changes
- Text colors auto-match

### Step 7: Save & Continue
- Click **"Save Slide"** → saves to database
- Click **"Next"** → moves to next scene
- Previous scene shows ✓ checkmark

---

## Controls Explained

### Left Panel
```
MODULES
├─ ▼ Module 1         (Expandable)
│  ├─ ✓ Slide 1       (Completed - has checkmark)
│  ├─ □ Slide 2       (Not completed - empty box)
│  └─ □ Slide 3
└─ ▼ Module 2
   └─ □ Slide 4
```

- **Click module**: Expand/collapse
- **Click scene**: Edit that slide
- **✓**: Scene completed
- **X**: Delete scene (hover)

### Top Panel (Theme Colors)
```
[White] [Blue] [Green] [Gray]
```
- 4 clean, light color options
- Click to apply to current slide

### Right Panel (Controls)

**"+ Add Text"**
- Creates new text element at x:100, y:150
- Ready to edit immediately

**Theme Colors**
- 4 color swatches
- Changes slide background
- Text colors auto-adjust

**Slide Image Section**
- **Upload**: Pick image file
- **[X]**: Delete image
- **Generate**: AI create with prompt
- Shows preview (12×48px)

**Edit Text Panel** (when text selected)
- Text area: type/edit content
- Size slider: 12-40px
- Bold checkbox: make bold
- Color picker: choose color
- "Save": apply changes
- "Delete": remove element

**Save Buttons**
- **"Save Slide"**: Save all changes
- **"Next"**: Save + move to next scene

---

## Tips & Tricks

### Text Editing
- Click text on slide → shows blue ring (selected)
- Edit panel opens automatically
- Change properties anytime
- Save before moving to next element

### Moving Elements
- Click to select (blue ring)
- Drag to new position
- Release to place

### Image Positioning
- Upload/generate image
- Image appears as icon (56×56px)
- Drag to any location
- Can position over avatar area
- Can position in top corner
- Fully draggable

### Deletion
- **Delete text**: Select → Click "Delete" in edit panel
- **Delete image**: Click X on image thumbnail

### Themes
- Each theme changes: background + text colors
- White = professional, clean
- Blue = tech, education
- Green = nature, biology
- Gray = neutral, minimal

### Completion Tracking
- Save slide → scene gets ✓ checkmark
- Helps track progress
- Visual indication of done slides

### Avatar
- Large area: 140×180px
- Bottom-right position
- Leave empty for avatar video
- Can position other elements around it

---

## Common Tasks

### "How do I add a title?"
1. Click "+ Add Text"
2. Edit panel: type title
3. Size: increase to 28px
4. Bold: toggle on
5. Save

### "How do I add multiple paragraphs?"
1. Add multiple text elements
2. Position them vertically
3. Each has own properties
4. Can edit size, color separately

### "Can I use an image I already have?"
1. Click "Upload" button
2. Pick image file
3. Image appears as icon
4. Drag to position
5. Save slide

### "How do I change colors?"
1. Select text element
2. Click color picker
3. Choose color
4. Save

### "How do I move to next slide?"
1. Edit current slide
2. Click "Save Slide"
3. Click "Next"
4. Auto-moves to next scene
5. Previous gets ✓ checkmark

### "Can I delete an image?"
1. Click X on image thumbnail
2. Image removed

---

## Keyboard Shortcuts

- **Tab**: Move between controls
- **Enter**: Save text element
- **Escape**: Cancel editing
- **Drag**: Reposition elements

---

## Troubleshooting

**Slide preview is blank**
→ Refresh page, reload component

**Text won't save**
→ Click "Save" button in edit panel

**Image not showing**
→ Try uploading again or generating with prompt

**Can't drag elements**
→ Click element first (should show blue ring)

**Avatar too small**
→ Now 140×180px, should be visible
→ Clear browser cache if still small

**Theme colors not changing**
→ Click theme swatch again
→ Try different theme

---

## Visual Guide

```
SLIDE LAYOUT:

┌────────────────────────────────────┐
│ GVSU (small)      Text Here   ProfAI│
│                                    │
│          ┌────┐                    │
│          │Icon│                    │
│          └────┘                    │
│                                    │
│        More Text Here              │
│                                    │
│                        ┌────────┐  │
│                        │        │  │
│                        │ Avatar │  │
│                        │  Area  │  │
│                        │(large) │  │
│                        └────────┘  │
└────────────────────────────────────┘
```

---

## Ready to Start?

1. ✅ Open http://localhost:5173
2. ✅ Go to Visual Designer
3. ✅ Select a scene
4. ✅ Add text (click "+ Add Text")
5. ✅ Edit properties
6. ✅ Add image (upload or generate)
7. ✅ Save slide
8. ✅ Move to next (click "Next")

**Enjoy the new clean, simple design!** 🎨

