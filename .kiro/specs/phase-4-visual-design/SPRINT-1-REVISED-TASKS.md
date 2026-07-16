# Sprint 1: Visual Design (Revised) - Detailed Tasks

**Duration**: 1 week  
**Goal**: Template selection + Canvas with draggable avatar + Text editing  
**Deliverable**: Working visual designer with basic editing

---

## Task 1: Database Schema Update

**Description**: Add avatar position fields to SlideComposition  
**Effort**: 1 day  
**Owner**: Backend Developer

### Changes to Prisma

```prisma
model SlideComposition {
  id              String    @id @default(cuid())
  sceneId         String    @unique
  templateId      String    @default("modern")
  
  // Content
  title           String    @default("")
  contentBullets  Json      @default("[]")
  imageUrl        String?
  
  // Avatar placeholder position (% of slide)
  avatarX         Float     @default(70)
  avatarY         Float     @default(50)
  avatarWidth     Float     @default(25)
  
  status          String    @default("draft")
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  scene           Scene     @relation(fields: [sceneId], references: [id])
}
```

### Success Criteria
- [ ] Migration runs without errors
- [ ] New fields appear in database
- [ ] Prisma types generate correctly

---

## Task 2: API - GET Composition

**Description**: Fetch slide composition for scene  
**Effort**: 1 day  
**Owner**: Backend Developer

### Implementation

```typescript
// api/src/functions/compositions.ts
export async function getComposition(sceneId: string) {
  let comp = await prisma.slideComposition.findUnique({
    where: { sceneId }
  })
  
  if (!comp) {
    // Create default
    comp = await prisma.slideComposition.create({
      data: {
        sceneId,
        templateId: 'modern',
        title: 'Untitled',
        contentBullets: [
          { type: 'main', text: 'Main point' },
          { type: 'sub', text: 'Sub-point' }
        ],
        avatarX: 70,
        avatarY: 50,
        avatarWidth: 25
      }
    })
  }
  
  return comp
}
```

### Success Criteria
- [ ] Returns composition
- [ ] Creates default if missing
- [ ] All fields present in response

---

## Task 3: API - PATCH Composition

**Description**: Save composition changes  
**Effort**: 1 day  
**Owner**: Backend Developer

### Implementation

```typescript
export async function updateComposition(sceneId: string, updates: any) {
  return prisma.slideComposition.upsert({
    where: { sceneId },
    create: { sceneId, ...updates },
    update: { ...updates, updatedAt: new Date() }
  })
}
```

### Endpoint
```
PATCH /api/scenes/{sceneId}/composition
Body: {
  "title": "New title",
  "contentBullets": [...],
  "avatarX": 65,
  "avatarY": 45,
  "avatarWidth": 30,
  "imageUrl": "https://..."
}
```

### Success Criteria
- [ ] Updates persist
- [ ] Timestamps update
- [ ] Returns updated composition

---

## Task 4: Canvas Component - Basic Rendering

**Description**: Create Konva.js canvas that renders slide  
**Effort**: 1.5 days  
**Owner**: Frontend Developer

### Component: `CanvasEditor`

```jsx
import { Stage, Layer, Rect, Image } from 'react-konva'

export function CanvasEditor({ composition, onUpdate }) {
  const SLIDE_WIDTH = 1280   // 16:9 aspect ratio
  const SLIDE_HEIGHT = 720
  
  return (
    <div style={{ border: '1px solid #ccc' }}>
      <Stage width={SLIDE_WIDTH} height={SLIDE_HEIGHT}>
        <Layer>
          {/* Slide background */}
          <Rect
            x={0} y={0}
            width={SLIDE_WIDTH} height={SLIDE_HEIGHT}
            fill="#ffffff"
          />
          
          {/* Title text */}
          <Text
            text={composition.title}
            x={50} y={50}
            width={700}
            fontSize={32}
            fontFamily="Arial"
            fill="#000"
          />
          
          {/* Content bullets - simple render for now */}
          {composition.contentBullets.map((bullet, i) => (
            <Text
              key={i}
              text={bullet.text}
              x={50} y={120 + i * 40}
              fontSize={16}
              fill="#000"
            />
          ))}
          
          {/* Avatar placeholder - draggable */}
          <Rect
            x={(SLIDE_WIDTH * composition.avatarX) / 100}
            y={(SLIDE_HEIGHT * composition.avatarY) / 100}
            width={(SLIDE_WIDTH * composition.avatarWidth) / 100}
            height={(SLIDE_WIDTH * composition.avatarWidth * 9) / 100 / 16} // 16:9
            fill="rgba(0,100,200,0.2)"
            stroke="#0066cc"
            strokeWidth={2}
            draggable
            onDragEnd={(e) => {
              const newX = (e.target.x() / SLIDE_WIDTH) * 100
              const newY = (e.target.y() / SLIDE_HEIGHT) * 100
              onUpdate({ avatarX: newX, avatarY: newY })
            }}
          />
          
          {/* Avatar placeholder label */}
          <Text
            text="AVATAR\nPLACEHOLDER"
            x={(SLIDE_WIDTH * composition.avatarX) / 100 + 30}
            y={(SLIDE_HEIGHT * composition.avatarY) / 100 + 60}
            fontSize={12}
            fill="#0066cc"
            align="center"
          />
        </Layer>
      </Stage>
    </div>
  )
}
```

### Success Criteria
- [ ] Canvas renders slide background
- [ ] Title displays
- [ ] Bullets display
- [ ] Avatar placeholder shows (semi-transparent box)
- [ ] Avatar placeholder is draggable
- [ ] Drag updates position in real-time

---

## Task 5: Avatar Placeholder - Draggable & Resizable

**Description**: Add drag/resize handles to avatar  
**Effort**: 1 day  
**Owner**: Frontend Developer

### Features to Add

```jsx
// Add to avatar Rect:
<Rect
  // ... existing props
  onDragEnd={(e) => {
    const newX = (e.target.x() / SLIDE_WIDTH) * 100
    const newY = (e.target.y() / SLIDE_HEIGHT) * 100
    onUpdate({ avatarX: newX, avatarY: newY })
  }}
/>

// Add resize handles (4 corners + 4 edges)
// Click + drag handle → resize avatar
// Maintain 16:9 aspect ratio
```

### Resize Logic

```javascript
const handleResize = (newWidth) => {
  // Keep 16:9 ratio
  const newHeight = (newWidth * 9) / 16
  
  // Constrain size (15% - 50% of slide width)
  const constrainedWidth = Math.max(15, Math.min(50, newWidth))
  
  onUpdate({ avatarWidth: constrainedWidth })
}
```

### Success Criteria
- [ ] Avatar can be dragged anywhere
- [ ] Avatar can be resized from corners
- [ ] 16:9 aspect ratio maintained
- [ ] Min/max size enforced
- [ ] Changes persisted immediately

---

## Task 6: Text Editing - Title

**Description**: Click title to edit  
**Effort**: 1 day  
**Owner**: Frontend Developer

### Implementation

```jsx
const [editingTitle, setEditingTitle] = useState(false)
const [titleText, setTitleText] = useState(composition.title)

// When title clicked:
// Show text input box
// Allow edit
// On blur or Enter → save

<div>
  {editingTitle ? (
    <input
      type="text"
      value={titleText}
      onChange={(e) => setTitleText(e.target.value)}
      onBlur={() => {
        setEditingTitle(false)
        onUpdate({ title: titleText })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          setEditingTitle(false)
          onUpdate({ title: titleText })
        }
      }}
      autoFocus
    />
  ) : (
    <div onClick={() => setEditingTitle(true)}>
      {titleText || 'Click to add title'}
    </div>
  )}
</div>
```

### Success Criteria
- [ ] Click title → Becomes editable
- [ ] Type new text → Updates
- [ ] Press Enter or click away → Saves
- [ ] Title updates on canvas
- [ ] Changes persisted to API

---

## Task 7: Bullet Text Editing

**Description**: Edit/add/delete bullet points  
**Effort**: 1.5 days  
**Owner**: Frontend Developer

### Component: `BulletEditor`

```jsx
export function BulletEditor({ bullets, onUpdate }) {
  const [editing, setEditing] = useState(null)
  
  const addBullet = () => {
    const newBullets = [
      ...bullets,
      { type: 'main', text: 'New point' }
    ]
    onUpdate(newBullets)
  }
  
  const updateBullet = (index, newText) => {
    const updated = [...bullets]
    updated[index].text = newText
    onUpdate(updated)
  }
  
  const deleteBullet = (index) => {
    const updated = bullets.filter((_, i) => i !== index)
    onUpdate(updated)
  }
  
  const toggleType = (index) => {
    const updated = [...bullets]
    updated[index].type = updated[index].type === 'main' ? 'sub' : 'main'
    onUpdate(updated)
  }
  
  return (
    <div className="space-y-2">
      {bullets.map((bullet, i) => (
        <div key={i} className="flex items-center gap-2">
          <button
            onClick={() => toggleType(i)}
            className="px-2 py-1 text-sm rounded"
          >
            {bullet.type === 'main' ? '•' : '-'}
          </button>
          <input
            type="text"
            value={bullet.text}
            onChange={(e) => updateBullet(i, e.target.value)}
            className="flex-1 px-2 py-1 border rounded"
          />
          <button
            onClick={() => deleteBullet(i)}
            className="px-2 py-1 text-sm text-red-600"
          >
            Delete
          </button>
        </div>
      ))}
      <button
        onClick={addBullet}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        + Add bullet
      </button>
    </div>
  )
}
```

### Success Criteria
- [ ] Display all bullets with correct type (•, -)
- [ ] Click bullet → Can edit text
- [ ] Add new bullet button
- [ ] Delete bullet button
- [ ] Toggle bullet type (main ↔ sub)
- [ ] Changes save to API

---

## Task 8: Template Selection UI

**Description**: Gallery of 10 templates, apply to module  
**Effort**: 1 day  
**Owner**: Frontend Developer

### Component: `TemplateGallery`

```jsx
const TEMPLATES = [
  { id: 'modern', name: 'Modern', color: '#3B82F6' },
  { id: 'minimal', name: 'Minimal', color: '#FFFFFF' },
  { id: 'corporate', name: 'Corporate', color: '#1E40AF' },
  // ... 7 more
]

export function TemplateGallery({ onSelect }) {
  return (
    <div className="grid grid-cols-5 gap-4 p-4">
      {TEMPLATES.map(t => (
        <button
          key={t.id}
          onClick={() => {
            if (confirm(`Apply ${t.name} to all slides?`)) {
              onSelect(t.id)
            }
          }}
          className="p-4 border rounded-lg hover:border-blue-500"
        >
          <div
            style={{ background: t.color }}
            className="w-full h-32 rounded mb-2"
          />
          <p className="text-sm font-medium">{t.name}</p>
        </button>
      ))}
    </div>
  )
}
```

### Success Criteria
- [ ] All 10 templates display
- [ ] Click template → Confirmation dialog
- [ ] Confirm → Apply to all scenes
- [ ] All scenes get new template styling

---

## Task 9: Auto-save Integration

**Description**: Save changes automatically  
**Effort**: 1 day  
**Owner**: Frontend Developer

### Implementation

```javascript
// Debounce saves
const [saveTimeout, setSaveTimeout] = useState(null)

const autoSave = (updates) => {
  // Clear previous timeout
  if (saveTimeout) clearTimeout(saveTimeout)
  
  // Wait 500ms then save
  const newTimeout = setTimeout(async () => {
    try {
      await fetch(`/api/scenes/${sceneId}/composition`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      })
      setStatus('Saved')
    } catch (e) {
      setStatus('Save failed')
    }
  }, 500)
  
  setSaveTimeout(newTimeout)
  setStatus('Saving...')
}

// Call autoSave whenever user makes changes
```

### Success Criteria
- [ ] Changes auto-save after 500ms
- [ ] "Saving..." indicator shown
- [ ] "Saved" confirmation shown
- [ ] No data loss on refresh
- [ ] Error handling for failed saves

---

## Task 10: Load/Save Composition

**Description**: Load composition on scene select, persist changes  
**Effort**: 1 day  
**Owner**: Frontend Developer

### Load Logic

```javascript
useEffect(() => {
  if (!selectedScene?.id) return
  
  loadComposition(selectedScene.id)
}, [selectedScene?.id])

async function loadComposition(sceneId) {
  try {
    const res = await fetch(`/api/scenes/${sceneId}/composition`)
    const comp = await res.json()
    setComposition(comp)
    setStatus('Loaded')
  } catch (e) {
    setStatus('Load failed')
  }
}
```

### Save Logic
Already implemented via `autoSave` function above

### Success Criteria
- [ ] Composition loads when scene selected
- [ ] All fields populated correctly
- [ ] Canvas renders loaded data
- [ ] Changes persist after refresh
- [ ] No data loss

---

## Sprint 1 Definition of Done

### Code
- [ ] All 10 tasks completed
- [ ] No TypeScript errors
- [ ] ESLint passing
- [ ] Functions documented

### Testing
- [ ] Manual testing complete
- [ ] No console errors
- [ ] Works in Chrome, Firefox, Safari
- [ ] Mobile-friendly layout

### Database
- [ ] Migration successful
- [ ] Data persists
- [ ] No orphaned records

### API
- [ ] All endpoints tested
- [ ] Error handling working
- [ ] Performance acceptable (<500ms response)

### UI/UX
- [ ] Clean, intuitive interface
- [ ] Drag/resize smooth and responsive
- [ ] Auto-save feedback clear
- [ ] No visual glitches

---

## Sprint 1 Success Metrics

✅ User can select template  
✅ Avatar placeholder draggable  
✅ Avatar placeholder resizable (16:9 maintained)  
✅ Title text editable  
✅ Bullets editable (add/delete/toggle type)  
✅ All changes auto-save  
✅ No data loss on refresh  
✅ Canvas renders smoothly (60fps)  

---

**Sprint Duration**: 1 week  
**Team**: 1 Backend + 1 Frontend  
**Start**: Next Monday  
**Status**: Ready for execution
