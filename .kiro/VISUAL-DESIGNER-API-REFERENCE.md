# Visual Designer API Reference

**Last Updated**: July 8, 2026  
**Component**: Phase 4 Visual Designer  
**Status**: Production Ready

---

## API ENDPOINTS

All endpoints require authentication (via `getUser(req)`).

### 1. Get Composition

```
GET /api/scenes/{id}/composition
```

**Description**: Fetch slide composition data for a scene. Auto-creates default if not found.

**Parameters**:
- `id` (path): Scene ID (UUID)

**Response** (200 OK):
```json
{
  "id": "uuid",
  "sceneId": "scene-uuid",
  "templateId": "modern",
  "title": "Welcome to the Course",
  "mainPoint": "Understanding the fundamentals",
  "keyPoints": [
    "First key concept",
    "Second key concept",
    "Third key concept"
  ],
  "avatarX": 75,
  "avatarY": 50,
  "avatarWidth": 20,
  "imageUrl": "https://example.com/image.jpg",
  "imageX": 10,
  "imageY": 70,
  "imageWidth": 25,
  "imageHeight": 25,
  "status": "draft",
  "createdAt": "2026-07-08T12:00:00Z",
  "updatedAt": "2026-07-08T12:00:00Z"
}
```

**Errors**:
- `401`: Unauthenticated
- `500`: Database error

---

### 2. Update Composition

```
PATCH /api/scenes/{id}/composition
```

**Description**: Update slide composition. Creates if not found (upsert).

**Parameters**:
- `id` (path): Scene ID (UUID)

**Request Body** (partial update):
```json
{
  "title": "New Title",
  "mainPoint": "Main idea",
  "keyPoints": ["Point 1", "Point 2"],
  "avatarX": 75,
  "avatarY": 50,
  "avatarWidth": 25,
  "templateId": "ocean",
  "imageUrl": "https://...",
  "imageX": 10,
  "imageY": 70,
  "imageWidth": 30,
  "imageHeight": 30
}
```

**Response** (200 OK):
```json
{
  "id": "uuid",
  "sceneId": "scene-uuid",
  "templateId": "ocean",
  "title": "New Title",
  "mainPoint": "Main idea",
  "keyPoints": ["Point 1", "Point 2"],
  "avatarX": 75,
  "avatarY": 50,
  "avatarWidth": 25,
  "imageUrl": "https://...",
  "imageX": 10,
  "imageY": 70,
  "imageWidth": 30,
  "imageHeight": 30,
  "status": "draft",
  "updatedAt": "2026-07-08T12:30:00Z"
}
```

**Errors**:
- `400`: Invalid sceneId
- `401`: Unauthenticated
- `500`: Database error

**Notes**:
- All fields are optional
- Unspecified fields retain previous values
- `keyPoints` is auto-serialized/parsed
- Timestamp auto-updated on write

---

### 3. Apply Template to Module

```
POST /api/modules/{id}/apply-template
```

**Description**: Apply a template to ALL scenes in a module.

**Parameters**:
- `id` (path): Module ID (UUID)

**Request Body**:
```json
{
  "templateId": "ocean"
}
```

**Response** (200 OK):
```json
{
  "message": "Template applied to 8 slides",
  "count": 8
}
```

**Errors**:
- `400`: Missing templateId
- `401`: Unauthenticated
- `404`: Module not found or no scenes
- `500`: Database error

**Notes**:
- Bulk operation: updates all compositions at once
- Existing slide data is preserved (only templateId changes)
- Returns count of updated slides

---

### 4. Get Module Compositions

```
GET /api/modules/{id}/compositions
```

**Description**: Fetch all compositions for a module with metadata.

**Parameters**:
- `id` (path): Module ID (UUID)

**Response** (200 OK):
```json
{
  "moduleId": "module-uuid",
  "totalSlides": 8,
  "compositions": [
    {
      "id": "uuid",
      "sceneId": "scene-1",
      "templateId": "modern",
      "title": "Slide 1",
      "mainPoint": "...",
      "keyPoints": [...],
      "avatarX": 75,
      "avatarY": 50,
      "avatarWidth": 20,
      "imageUrl": "...",
      "imageX": 10,
      "imageY": 70,
      "imageWidth": 25,
      "imageHeight": 25,
      "status": "draft"
    },
    ...
  ]
}
```

**Errors**:
- `401`: Unauthenticated
- `500`: Database error

**Notes**:
- Returns compositions ordered by scene orderIndex
- `keyPoints` is parsed into array (not string)
- Useful for exporting or bulk operations

---

## FRONTEND INTEGRATION

### Basic Usage

```jsx
import VisualDesignerPanel from '@/components/workspace/VisualDesignerPanel'

export default function WorkspaceView() {
  return (
    <VisualDesignerPanel 
      project={projectData}
      onUpdate={() => refetch()}
      onContinue={(nextStage) => navigate(`/stage/${nextStage}`)}
    />
  )
}
```

### Props

```typescript
interface VisualDesignerPanelProps {
  project: Project          // Current project
  onUpdate: () => void      // Callback when data changes
  onContinue: (stage: string) => void  // Navigate to next stage
}
```

### Component State Flow

```
VisualDesignerPanel
  ↓
[showTemplateGallery = true]
  ↓ User clicks "Apply Template"
  ↓
[showTemplateGallery = false]
  ↓
SceneList + CanvasEditor visible
  ↓ User edits canvas
  ↓
[Auto-save triggers after 1s]
  ↓
PATCH /api/scenes/{id}/composition
  ↓
[Changes persisted to DB]
```

---

## DATA MODEL

### SlideComposition Table

```sql
CREATE TABLE "slide_compositions" (
  "id" TEXT PRIMARY KEY,
  "scene_id" TEXT UNIQUE NOT NULL,
  "template_id" TEXT DEFAULT 'modern',
  "title" TEXT DEFAULT 'Untitled Slide',
  "main_point" TEXT DEFAULT '',
  "key_points" TEXT DEFAULT '[]',
  "avatar_x" REAL DEFAULT 75,
  "avatar_y" REAL DEFAULT 50,
  "avatar_width" REAL DEFAULT 20,
  "image_url" TEXT,
  "image_x" REAL DEFAULT 10,
  "image_y" REAL DEFAULT 70,
  "image_width" REAL DEFAULT 25,
  "image_height" REAL DEFAULT 25,
  "status" TEXT DEFAULT 'draft',
  "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "slide_compositions_scene_id_key" ON "slide_compositions"("scene_id");
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `sceneId` | UUID | Scene reference (1:1 unique) |
| `templateId` | String | Template ID (see TEMPLATES) |
| `title` | String | Slide title (max 255 chars recommended) |
| `mainPoint` | String | Main idea (max 500 chars) |
| `keyPoints` | String | JSON array of strings |
| `avatarX` | Float | Avatar X position (0-100%) |
| `avatarY` | Float | Avatar Y position (0-100%) |
| `avatarWidth` | Float | Avatar width (% of slide width) |
| `imageUrl` | String | Image asset URL (optional) |
| `imageX` | Float | Image X position (0-100%) |
| `imageY` | Float | Image Y position (0-100%) |
| `imageWidth` | Float | Image width (% of slide width) |
| `imageHeight` | Float | Image height (% of slide height) |
| `status` | String | 'draft', 'ready', or 'locked' |
| `createdAt` | DateTime | Created timestamp |
| `updatedAt` | DateTime | Last modified timestamp |

---

## TEMPLATE LIBRARY

10 Professional Templates:

```javascript
const TEMPLATES = [
  { id: 'modern', name: 'Modern', colors: { bg: '#ffffff', accent: '#3B82F6', text: '#1F2937' } },
  { id: 'minimal', name: 'Minimal', colors: { bg: '#f9fafb', accent: '#6B7280', text: '#111827' } },
  { id: 'corporate', name: 'Corporate', colors: { bg: '#0f172a', accent: '#1e40af', text: '#f1f5f9' } },
  { id: 'vibrant', name: 'Vibrant', colors: { bg: '#fff5f7', accent: '#ec4899', text: '#1f2937' } },
  { id: 'ocean', name: 'Ocean', colors: { bg: '#ecf0f1', accent: '#0EA5E9', text: '#0c4a6e' } },
  { id: 'forest', name: 'Forest', colors: { bg: '#f0fdf4', accent: '#16a34a', text: '#15803d' } },
  { id: 'sunset', name: 'Sunset', colors: { bg: '#fffbeb', accent: '#f97316', text: '#92400e' } },
  { id: 'elegant', name: 'Elegant', colors: { bg: '#1a1a1a', accent: '#d97706', text: '#f5f5f5' } },
  { id: 'academic', name: 'Academic', colors: { bg: '#f8f9fa', accent: '#4f46e5', text: '#1e293b' } },
  { id: 'startup', name: 'Startup', colors: { bg: '#0d1117', accent: '#58a6ff', text: '#c9d1d9' } }
]
```

**Color application**:
- `bg` → Slide background
- `accent` → Title underline, key point bullets, borders
- `text` → All text content

---

## CANVAS SPECIFICATIONS

### Canvas Dimensions
- **Aspect Ratio**: 16:9 (widescreen)
- **Display Width**: 90% viewport width (max 1400px)
- **Auto-centered**: Horizontally and vertically on screen

### Avatar Placeholder
- **Default Position**: X=75%, Y=50% (right-center)
- **Size Range**: 10% - 40% of slide width
- **Aspect Ratio**: 9:16 (portrait, maintains on resize)
- **Transform**: Centered on drag (translate -50%, -50%)

### Image Asset
- **Size Range**: 5% - 80% of slide width
- **Aspect Ratio**: Maintains original (no distortion)
- **Positioning**: Relative to top-left corner

### Text Layout
- **Title**: Top-left, 32px bold
- **Main Point**: Below title, 18px medium, left-aligned
- **Key Points**: Below main point, 14px regular, bullet list

---

## AUTO-SAVE MECHANISM

### How It Works

1. User makes change (e.g., edit title)
2. State updates immediately (optimistic UI)
3. Timer starts (1000ms debounce)
4. If user makes another change within 1s, timer resets
5. After 1s of inactivity, auto-save triggers
6. PATCH request sent to `/api/scenes/{id}/composition`
7. Backend saves to database
8. Frontend shows "✓ Auto-saved" for 2s

### Debounce Implementation

```jsx
const autoSave = useCallback(async () => {
  // Save logic here
}, [slideData])

useEffect(() => {
  const timeout = setTimeout(autoSave, 1000)
  return () => clearTimeout(timeout)
}, [slideData, autoSave])
```

### Error Handling

- Save errors are logged to console
- User is NOT blocked from continuing
- Errors don't show in UI (to avoid disruption)
- Next change will trigger another save attempt

---

## POSITION COORDINATE SYSTEM

### Canvas Coordinates

All positions are **percentage-based** (0-100%):

```
(0, 0) ─────────────────── (100, 0)
  │                              │
  │                              │
  │         16:9 Canvas          │
  │                              │
  │                              │
(0, 100) ──────────────────(100, 100)
```

### Avatar Positioning

```javascript
avatarX: 75      // 75% from left (right side)
avatarY: 50      // 50% from top (center vertically)
avatarWidth: 20  // 20% of slide width
// Height = width * (16/9) to maintain aspect ratio
```

### Image Positioning

```javascript
imageX: 10       // 10% from left
imageY: 70       // 70% from top (lower area)
imageWidth: 25   // 25% of slide width
imageHeight: 25  // 25% of slide height (independent)
```

---

## ERROR HANDLING

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (missing params) |
| 401 | Unauthenticated |
| 404 | Resource not found |
| 500 | Server error |

### Error Response Format

```json
{
  "error": "Error message describing what went wrong"
}
```

### Frontend Error Handling

```jsx
try {
  const response = await fetch(`/api/scenes/${sceneId}/composition`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slideData)
  })
  
  if (!response.ok) {
    const error = await response.json()
    console.error('Save failed:', error.error)
    // User can continue editing — error is non-blocking
    return
  }
  
  const result = await response.json()
  // Success
} catch (err) {
  console.error('Network error:', err)
}
```

---

## PERFORMANCE TIPS

### Optimization Strategies

1. **Debounce saves**: 1s is good for most use cases (don't go below 500ms)
2. **Lazy-load images**: Use IntersectionObserver for canvas preview
3. **Memoize callbacks**: Use `useCallback` to prevent unnecessary re-renders
4. **Batch updates**: Group multiple changes before save
5. **Pagination**: If module has 100+ slides, consider pagination in SceneList

### Expected Performance

- **Edit feedback**: <50ms (instant)
- **Canvas render**: <100ms (smooth drag/resize)
- **Save request**: <500ms (network latency)
- **Total perceived latency**: <1.5s (1s debounce + network)

---

## TESTING

### Unit Test Example

```typescript
describe('CanvasEditor', () => {
  test('should update avatar position on drag', () => {
    const { getByText } = render(<CanvasEditor scene={mockScene} />)
    const avatar = getByText('AVATAR')
    
    fireEvent.mouseDown(avatar)
    fireEvent.mouseMove(window, { clientX: 500, clientY: 300 })
    fireEvent.mouseUp(window)
    
    // Assert position changed
  })
  
  test('should auto-save after 1 second', async () => {
    jest.useFakeTimers()
    render(<CanvasEditor scene={mockScene} />)
    
    fireEvent.change(screen.getByDisplayValue('Title'), { 
      target: { value: 'New Title' }
    })
    
    jest.advanceTimersByTime(1000)
    
    expect(fetch).toHaveBeenCalledWith(
      '/api/scenes/scene-id/composition',
      expect.any(Object)
    )
  })
})
```

### Integration Test Example

```typescript
test('should apply template to all slides', async () => {
  const { getByText } = render(<VisualDesignerPanel project={project} />)
  
  fireEvent.click(getByText('Apply "Ocean" to All Slides'))
  
  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      '/api/modules/module-id/apply-template',
      { method: 'POST', body: JSON.stringify({ templateId: 'ocean' }) }
    )
  })
})
```

---

## DEPLOYMENT NOTES

### Environment Variables

Ensure `.env` contains:
```
DATABASE_URL=file:./prisma/dev.db    # Development
# or
DATABASE_URL=postgresql://user:pass@host/dbname  # Production
```

### Database Setup

```bash
# Run migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Seed data (optional)
npx prisma db seed
```

### Build & Deploy

```bash
# Frontend
npm run build
# Deploy dist/ folder

# Backend
cd api
npm run build
# Deploy to Azure Functions (or serverless provider)
```

---

## SUPPORT

For issues or questions:
1. Check browser console for errors
2. Verify API endpoint is responding
3. Check database connection in `.env`
4. Review logs in Azure Functions (if deployed)

