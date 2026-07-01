# Visual Designer Testing Checklist

**Date**: July 1, 2026  
**Build**: ✅ SUCCESS (3.65s)  
**Status**: Ready for testing

---

## Pre-Test Setup

```bash
# Terminal 1: Start API
cd c:\Users\GIGABYTE\Desktop\ProfAI\api
npm run dev
# Should show: Azure Functions are listening on http://localhost:7071

# Terminal 2: Start Frontend  
cd c:\Users\GIGABYTE\Desktop\ProfAI
npm run dev
# Should show: Local: http://localhost:5173
```

---

## Test Checklist

### ✓ Layout & Navigation
- [ ] Left panel shows all modules and scenes
- [ ] Scenes are expandable/collapsible
- [ ] Can select different scenes
- [ ] Right panel updates when scene selected
- [ ] Header shows correct title and buttons

### ✓ Slide Preview  
- [ ] Slide preview shows with clean background
- [ ] GVSU logo visible top-left (small, faded)
- [ ] ProfAI logo visible top-right (small, faded)
- [ ] Avatar placeholder visible bottom-right (LARGE)
- [ ] Avatar box is 140×180px (not tiny)
- [ ] Scene title/content displays correctly

### ✓ Themes (4 Colors)
- [ ] White theme: clean white background
- [ ] Blue theme: light blue background
- [ ] Green theme: light green background
- [ ] Gray theme: light gray background
- [ ] Text color changes with theme
- [ ] Clicking theme swatch updates slide

### ✓ Text Editing (NOT Bullets)
- [ ] Click "+ Add Text" button
- [ ] New text element appears on slide at x:100, y:150
- [ ] Click text element → edit panel opens
- [ ] Edit panel shows:
  - [ ] Text area (multiline)
  - [ ] Size slider (12-40px)
  - [ ] Bold checkbox
  - [ ] Color picker
- [ ] Edit text content → appears on slide
- [ ] Change size → updates immediately
- [ ] Toggle bold → updates immediately
- [ ] Change color → updates immediately
- [ ] Click "Save" → element saved
- [ ] Click "Delete" → element removed

### ✓ Drag & Drop  
- [ ] Click text element → shows blue ring (selected)
- [ ] Drag text element → moves on slide
- [ ] Release → position saved temporarily
- [ ] Image icon appears as small square (56×56px)
- [ ] Click image → shows blue border
- [ ] Drag image → moves anywhere on slide
- [ ] Can position image in different areas

### ✓ Image Management
- [ ] Click "Upload" button
- [ ] File picker opens
- [ ] Select an image
- [ ] Image preview appears (12×48px thumbnail)
- [ ] Image icon appears on slide (draggable)
- [ ] Image X button deletes the image
- [ ] Image disappears from preview and slide

### ✓ AI Image Generation
- [ ] Type custom prompt: "flowchart for photosynthesis"
- [ ] Click "Generate" button
- [ ] Spinner shows (loading)
- [ ] After 5-10 seconds, image appears
- [ ] Image appears as draggable icon on slide
- [ ] Can drag image to different position
- [ ] Can generate another image (replaces old one)

### ✓ Completion Tracking
- [ ] Edit a slide
- [ ] Click "Save Slide" button
- [ ] Scene in left panel now shows ✓ checkmark
- [ ] Checkmark stays after save
- [ ] Different scenes can be marked completed

### ✓ Save & Next Workflow
- [ ] Edit slide content
- [ ] Click "Save Slide" button
- [ ] Data saved (no error messages)
- [ ] If another scene exists: "Next" button visible
- [ ] Click "Next" button
- [ ] Auto-moves to next scene
- [ ] Previous scene shows ✓ checkmark
- [ ] New scene editor opens

### ✓ Multiple Text Elements
- [ ] Add 3 different text elements
- [ ] Each has different content/size/color
- [ ] All visible on slide preview
- [ ] Can click each to edit separately
- [ ] Can delete individual elements
- [ ] Can drag each independently

### ✓ Large Avatar Placeholder
- [ ] Avatar box is clearly visible (140×180px)
- [ ] Shows at bottom-right of slide
- [ ] Has light tinted background
- [ ] Shows "Avatar" label
- [ ] Is not covered by other elements
- [ ] Makes sense for placing avatar video

### ✓ Clean Background (No Gradients)
- [ ] Slide background is solid color
- [ ] NOT a gradient
- [ ] NOT a heavy pattern
- [ ] Simple and clean
- [ ] No image background

---

## Error Scenarios

### If things don't work:

**Slide preview is blank**
→ Check browser console for errors  
→ Verify API is running  

**Theme colors not changing**
→ Refresh page  
→ Check if scene has slideDeckContent  

**Text won't save**
→ Check browser console  
→ Verify API endpoint works  

**Image not generating**
→ Check if Gemini API key is valid  
→ Check API logs for Gemini errors  
→ Try custom prompt first  

**Can't drag elements**
→ Click element first to select  
→ Should show blue ring  
→ Then drag  

**Avatar too small**
→ This is fixed now (140×180px)  
→ If still small, clear browser cache  

---

## Performance Notes

- Slide preview should be smooth
- No lag when dragging elements
- Themes change instantly
- Save completes within 2-3 seconds
- Image generation 5-10 seconds (depends on Gemini)

---

## Success Criteria

✅ All checkboxes pass  
✅ No console errors  
✅ Can create, edit, and save slides  
✅ Visual design is clean and not heavy  
✅ Large avatar placeholder works  
✅ Image is draggable icon (not background)  
✅ Text editing is logic-based (not bullets)  
✅ Themes apply correctly  
✅ Completion tracking works  
✅ Save & next workflow functions  

---

## Notes for User

The redesign focuses on:
1. **Simplicity**: Clean, light colors (no dark heavy design)
2. **Large avatar**: 140×180px (much more prominent)
3. **Flexible text**: Logic editing, not restricted to bullets
4. **Image as icon**: Can move it anywhere, not a background
5. **Workflow**: Save → checkmark → move to next
6. **Completion tracking**: Visual indicator of progress

**You can now:**
- Add unlimited text elements
- Position them anywhere
- Edit properties (size, bold, color)
- Add/remove images
- Generate images with AI
- Save and track progress

