# Sprint 1: Visual Design MVP - Detailed Tasks

**Duration**: 2 weeks  
**Goal**: Template selection + basic canvas editing + API persistence  
**Deliverable**: User can select template, edit slides, and save

---

## Task 1.1: Database Schema Update

**Description**: Add SlideComposition table and update Scripts table  
**Effort**: 1 day  
**Owner**: Backend Developer

### Actions

1. Update `prisma/schema.prisma`:
   - Add `SlideComposition` model
   - Add `slide_compositions` relation to `Scene`
   - Add `visual_status` to `Script` model

2. Create migration:
   ```bash
   npx prisma migrate dev --name add_slide_compositions
   ```

3. Update Prisma client generation:
   ```bash
   npx prisma generate
   ```

### Success Criteria
- [ ] Migration runs without errors
- [ ] Prisma client generates successfully
- [ ] Tables exist in database
- [ ] Foreign keys established

---

## Task 1.2: API - GET Slide Composition

**Description**: Fetch existing slide composition for a scene  
**Effort**: 1 day  
**Owner**: Backend Developer

### Create Endpoint

**File**: `api/src/functions/compositions.ts`

```typescript
export const getComposition = async (sceneId: string) => {
  const composition = await prisma.slideComposition.findFirst({
    where: { sceneId },
    include: { scene: true }
  })
  
  if (!composition) {
    // Create default composition
    return createDefaultComposition(sceneId)
  }
  
  return composition
}
```

### HTTP Function

```
GET /api/scenes/{sceneId}/composition
```

Response:
```json
{
  "id": "comp-uuid",
  "sceneId": "scene-uuid",
  "templateId": "modern",
  "layoutType": "bullets",
  "canvasElements": [...],
  "textAnimationType": "word-by-word",
  "status": "draft",
  "durationMs": 12000,
  "createdAt": "2026-07-08T..."
}
```

### Success Criteria
- [ ] Endpoint callable from frontend
- [ ] Returns existing composition
- [ ] Creates default if missing
- [ ] Includes all necessary fields

---

## Task 1.3: API - PATCH Slide Composition

**Description**: Save canvas element changes  
**Effort**: 1 day  
**Owner**: Backend Developer

### Create Endpoint

```
PATCH /api/scenes/{sceneId}/composition
Body: {
  "canvasElements": [...],
  "layoutType": "two-column",
  "status": "editing"
}
```

### Implementation

```typescript
export const updateComposition = async (
  sceneId: string,
  updates: Partial<SlideComposition>
) => {
  return prisma.slideComposition.upsert({
    where: { sceneId },
    create: { sceneId, ...updates },
    update: { ...updates, updatedAt: new Date() }
  })
}
```

### Success Criteria
- [ ] Updates persist to database
- [ ] Returns updated composition
- [ ] Timestamps update correctly
- [ ] Validation works (no invalid data)

---

## Task 1.4: Frontend - Complete Template Library

**Description**: Extend from 5 to 10 professional templates  
**Effort**: 1.5 days  
**Owner**: Frontend Developer

### Current Templates (5)

```javascript
const THEMES = [
  'dark-navy', 'ocean', 'academic', 'light', 'corporate'
]
```

### Add 5 More Templates

Add to `VisualDesignerPanel.jsx`:

```javascript
const TEMPLATES = [
  // Existing 5
  { id: 'modern', name: 'Modern', preview: '...' },
  { id: 'minimal', name: 'Minimal', preview: '...' },
  { id: 'corporate', name: 'Corporate', preview: '...' },
  { id: 'academic', name: 'Academic', preview: '...' },
  { id: 'ocean', name: 'Ocean', preview: '...' },
  
  // New 5
  { id: 'playful', name: 'Playful', preview: '...' },
  { id: 'dark', name: 'Dark', preview: '...' },
  { id: 'gradient', name: 'Gradient', preview: '...' },
  { id: 'elegant', name: 'Elegant', preview: '...' },
  { id: 'vibrant', name: 'Vibrant', preview: '...' },
]
```

### Define Template Defaults

For each template, add:
```javascript
const TEMPLATE_DEFAULTS = {
  'modern': {
    colors: { primary: '#3B82F6', accent: '#10B981' },
    fonts: { title: 'Inter', body: 'Inter' },
    layout: 'bullets'
  },
  // ... more templates
}
```

### Create Template Gallery UI

Component: `TemplateGallery`

```jsx
<div className="grid grid-cols-5 gap-4">
  {TEMPLATES.map(t => (
    <button 
      onClick={() => selectTemplate(t.id)}
      className="border rounded-lg p-3 hover:border-indigo-500"
    >
      <img src={t.preview} />
      <p>{t.name}</p>
    </button>
  ))}
</div>
```

### Success Criteria
- [ ] All 10 templates display
- [ ] Thumbnails show correct colors
- [ ] Click applies template
- [ ] Template defaults set correctly

---

## Task 1.5: Frontend - Apply Template to All Scenes

**Description**: When template selected, apply to all scenes in module  
**Effort**: 1 day  
**Owner**: Frontend Developer

### Implementation

```javascript
const applyTemplateToModule = async (templateId) => {
  // Get all scenes in module
  const scenes = await fetch(
    `/api/modules/${moduleId}/scenes`
  ).then(r => r.json())
  
  // Update each scene's composition
  await Promise.all(
    scenes.map(scene => 
      fetch(`/api/scenes/${scene.id}/composition`, {
        method: 'PATCH',
        body: JSON.stringify({
          templateId,
          layoutType: TEMPLATE_DEFAULTS[templateId].layout
        })
      })
    )
  )
  
  // Refresh
  queryClient.invalidateQueries({ queryKey: ['scenes'] })
}
```

### UI Flow

```
User clicks template → Confirm dialog → 
Apply to all scenes → Progress indicator → 
All scenes updated → Refresh UI
```

### Success Criteria
- [ ] All scenes in module get new template
- [ ] Progress shown while applying
- [ ] UI refreshes after completion
- [ ] Undo possible (or show warning)

---

## Task 1.6: Frontend - Canvas Save/Load Integration

**Description**: Connect canvas to API for persistence  
**Effort**: 1.5 days  
**Owner**: Frontend Developer

### Load on Scene Select

```javascript
useEffect(() => {
  if (!selectedScene?.id) return
  
  loadComposition(selectedScene.id)
}, [selectedScene?.id])

const loadComposition = async (sceneId) => {
  try {
    const comp = await fetch(
      `/api/scenes/${sceneId}/composition`
    ).then(r => r.json())
    
    setCanvasElements(comp.canvasElements)
    setLayout(comp.layoutType)
    setTextAnimation(comp.textAnimationType)
  } catch (e) {
    console.error('Load failed:', e)
  }
}
```

### Save on Element Change

```javascript
const updateCanvasElements = async (newElements) => {
  setCanvasElements(newElements)
  
  // Debounced save
  clearTimeout(saveTimeoutRef.current)
  saveTimeoutRef.current = setTimeout(async () => {
    try {
      await fetch(`/api/scenes/${scene.id}/composition`, {
        method: 'PATCH',
        body: JSON.stringify({
          canvasElements: newElements
        })
      })
      toast.success('Saved')
    } catch (e) {
      toast.error('Save failed')
    }
  }, 500)
}
```

### Success Criteria
- [ ] Canvas loads on scene select
- [ ] Changes auto-save after 500ms
- [ ] No data loss on page refresh
- [ ] Concurrent edits don't conflict

---

## Task 1.7: Frontend - Element Properties Inspector

**Description**: Edit properties of selected element  
**Effort**: 1.5 days  
**Owner**: Frontend Developer

### Component: `ElementInspector`

```jsx
<div className="p-4 border-l">
  <h3>Element Properties</h3>
  
  <div className="space-y-3">
    <div>
      <label>Position X</label>
      <input 
        type="number"
        value={selected?.x}
        onChange={(e) => updateElement({ x: parseFloat(e.target.value) })}
      />
    </div>
    
    <div>
      <label>Position Y</label>
      <input 
        type="number"
        value={selected?.y}
        onChange={(e) => updateElement({ y: parseFloat(e.target.value) })}
      />
    </div>
    
    <div>
      <label>Width</label>
      <input 
        type="number"
        value={selected?.width}
        onChange={(e) => updateElement({ width: parseFloat(e.target.value) })}
      />
    </div>
    
    <div>
      <label>Height</label>
      <input 
        type="number"
        value={selected?.height}
        onChange={(e) => updateElement({ height: parseFloat(e.target.value) })}
      />
    </div>
    
    {selected?.type === 'text' && (
      <>
        <div>
          <label>Font Size</label>
          <input type="number" />
        </div>
        
        <div>
          <label>Color</label>
          <input type="color" />
        </div>
      </>
    )}
  </div>
</div>
```

### Success Criteria
- [ ] All properties editable
- [ ] Changes reflect on canvas in real-time
- [ ] Input validation works
- [ ] Units clearly labeled

---

## Task 1.8: Frontend - Snap-to-Grid System

**Description**: Align elements to 16px grid  
**Effort**: 1 day  
**Owner**: Frontend Developer

### Implementation

```javascript
const GRID_SIZE = 16

const snapToGrid = (value) => {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

const onElementDragEnd = (elementId, newPos) => {
  const snappedPos = {
    x: snapToGrid(newPos.x),
    y: snapToGrid(newPos.y)
  }
  
  updateElement(elementId, snappedPos)
}
```

### Visual Grid Overlay

```jsx
<svg className="absolute inset-0 pointer-events-none opacity-10">
  {/* Draw grid lines */}
  {Array.from({ length: Math.ceil(2560 / 16) }).map((_, i) => (
    <line
      key={`v${i}`}
      x1={i * 16}
      y1={0}
      x2={i * 16}
      y2={1440}
      stroke="currentColor"
    />
  ))}
</svg>
```

### Success Criteria
- [ ] Grid lines visible as guide
- [ ] Elements snap on drop
- [ ] No visual jumping
- [ ] User can toggle grid on/off

---

## Task 1.9: Testing - Unit Tests

**Description**: Test canvas operations  
**Effort**: 1 day  
**Owner**: QA/Frontend Developer

### Test Suite

```javascript
describe('VisualDesigner', () => {
  test('Load template applies to all scenes', async () => {
    // ...
  })
  
  test('Canvas elements drag and snap to grid', () => {
    // ...
  })
  
  test('Inspector updates element properties', () => {
    // ...
  })
  
  test('Save composition persists to API', async () => {
    // ...
  })
  
  test('Load composition on scene select', async () => {
    // ...
  })
})
```

### Success Criteria
- [ ] All core operations tested
- [ ] Edge cases covered
- [ ] Mocks for API calls
- [ ] 80%+ coverage

---

## Task 1.10: Integration Testing

**Description**: End-to-end workflow testing  
**Effort**: 1.5 days  
**Owner**: QA/Frontend Developer

### Test Scenarios

1. **Template Selection Flow**
   - Select template → All scenes update → Verify all saved

2. **Canvas Editing Flow**
   - Load scene → Drag element → Inspector updates → Save → Reload → Persisted

3. **Multi-Scene Workflow**
   - Switch between scenes → Each maintains own composition → No crosstalk

4. **Error Handling**
   - API fails → Show error → Retry works
   - Invalid data → Validation prevents save → User warned

### Success Criteria
- [ ] All workflows functional
- [ ] No data loss
- [ ] Error messages clear
- [ ] Performance acceptable

---

## Sprint 1 Definition of Done

### Code Quality
- [ ] All TypeScript types correct (no `any`)
- [ ] ESLint passes
- [ ] Prettier formatting applied
- [ ] No console errors in production build

### Testing
- [ ] Unit tests pass (>80% coverage)
- [ ] Integration tests pass
- [ ] Manual testing complete
- [ ] No regressions in other features

### Database
- [ ] Migration successful
- [ ] Schema valid
- [ ] Data integrity maintained

### API
- [ ] All endpoints working
- [ ] Error handling implemented
- [ ] Input validation complete
- [ ] Response schema documented

### Frontend
- [ ] UI responsive on all screen sizes
- [ ] Accessibility baseline met
- [ ] Dark mode working
- [ ] Performance acceptable

### Documentation
- [ ] Comments on complex logic
- [ ] README updated with new endpoints
- [ ] API docs updated

---

## Sprint 1 Blockers/Risks

⚠️ **High Risk**:
- Canvas performance with many elements
- Concurrent saves from multiple tabs

⚠️ **Medium Risk**:
- Template previews need design
- API rate limiting on rapid saves

⚠️ **Low Risk**:
- Minor UI tweaks needed

---

## Success Metrics for Sprint 1

✅ Core metrics:
- User can select template and apply to module
- User can drag/drop elements on canvas
- User can edit element properties
- Canvas state persists to database
- No data loss on page refresh

📊 Performance:
- Canvas renders at 60fps with 20+ elements
- Save API responds in <500ms
- Page load time <3s

🎯 Quality:
- 0 critical bugs
- >80% test coverage
- 0 TypeScript errors

---

**Sprint Start**: July 8, 2026  
**Sprint End**: July 22, 2026  
**Status**: Ready for sprint planning meeting
