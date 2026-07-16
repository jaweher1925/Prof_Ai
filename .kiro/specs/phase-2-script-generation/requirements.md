# Phase 2: Script Generation (HITL Checkpoint)

**Status**: In Development  
**Priority**: 🔴 High (Foundation for Voice & Visual phases)  
**Created**: July 8, 2026  

---

## 1. Overview

Phase 2 is the first HITL (Human-In-The-Loop) checkpoint in the ProfAI workflow.

**User Journey:**
1. Sources uploaded & analyzed (Phase 1 complete)
2. **Script Generation triggered** → 6 scenes per module
3. **User reviews** each scene (voice script + slide content)
4. **User edits** scenes if needed
5. **User approves** script → moves to APPROVED state
6. **User locks** script → frozen, cannot edit
7. **Phase 3 (Voice) unlocks** → ready for TTS generation

**Key Constraint:** Once locked, script cannot be edited. Voice generation depends on locked scripts.

---

## 2. Script Structure

### 2.1 Scenes per Module
Each module generates exactly **6 scenes**:
- **Scene 1:** Welcome (50-60 words max)
- **Scenes 2-5:** Content (60-100 words each)
- **Scene 6:** Knowledge Check / Quiz

### 2.2 Scene Content
Each scene contains:
```json
{
  "id": "scene-uuid",
  "moduleId": "module-uuid",
  "orderIndex": 1,
  "sceneKind": "welcome|content|quiz",
  "scriptContent": "Narration text (what presenter says)",
  "slideDeckContent": {
    "title": "Slide title",
    "subtitle": "Key concept",
    "layout": "bullets|definitions|two-column|quotes|diagrams|key-concepts",
    "blocks": [
      { "type": "bullet", "text": "Point 1", "level": 1 }
    ]
  },
  "status": "draft",
  "approvalStatus": "draft|approved|locked",
  "locked": false,
  "locked_at": null,
  "locked_by": null,
  "estimatedDurationMinutes": 1.5
}
```

### 2.3 Approval States
```
DRAFT
  ↓ [Approve]
APPROVED
  ↓ [Lock Script]
LOCKED (frozen)
```

---

## 3. UI Requirements

### 3.1 Script Card Layout (Dark Mode)
```
┌─ Script Card ──────────────────────────────┐
│ [Module 1] Promise                    ≈5 min │
│ ────────────────────────────────────────    │
│ Status: [Draft/Approved/🔒 Locked]          │
│ Scenes: 6                                    │
└─ [▼ Expand] ────────────────────────────────┘
```

### 3.2 Expanded View
When expanded, show:
- **Learning Objectives** (if any)
- **6 Scenes** with two-column layout:
  - **Left column:** Voice Script (narration)
  - **Right column:** Slide Content (what students see)
- **Action Buttons** (context-aware based on state)

### 3.3 Scene Display Format
```
Scene [1/6]: Welcome — Hook
─────────────────────────────
[🎙 Voice Script]        [📋 Slide Content]
─────────────────        ─────────────────
"Today we'll explore     Title: Welcome
the concept of           Subtitle: Hook & Objectives
promises..."             • 3 learning objectives listed
                         • Keep it brief and engaging
```

### 3.4 Edit Mode
When editing a scene:
- **Text area** appears for voice script
- **[Save]** button to persist changes
- **[Cancel]** button to discard
- Changes saved only if script NOT locked

### 3.5 Action Buttons (State-Based)

**Draft State:**
```
[Approve Script]  ← Yellow button, moves to APPROVED
```

**Approved State:**
```
[Lock Script →]  ← Green button, freezes content
```

**Locked State:**
```
🔒 Locked (grayed out)
[Edit] disabled
Cannot edit content
"Script locked. Cannot edit."
```

### 3.6 Completion Banner
When all scripts in project are locked:
```
┌─ All Scripts Locked ────────────┐
│ ✓ All scripts approved & locked │
│             [Continue to Voice]→ │
└─────────────────────────────────┘
```
Green banner, allows navigation to Phase 3.

---

## 4. Database Schema

### 4.1 Script Table
```sql
CREATE TABLE scripts (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  module_id VARCHAR(36),
  title VARCHAR(255) NOT NULL,
  version INT DEFAULT 1,
  learning_objectives JSON DEFAULT '[]',
  sections JSON DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'review',
  estimated_duration_minutes FLOAT DEFAULT 4.0,
  
  -- Phase 2 HITL fields
  approval_status VARCHAR(50) DEFAULT 'draft',  -- draft|approved|locked
  locked BOOLEAN DEFAULT FALSE,
  locked_at TIMESTAMP NULL,
  locked_by VARCHAR(255) NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE,
  
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (module_id) REFERENCES modules(id),
  INDEX (approval_status),
  INDEX (locked)
);
```

### 4.2 Scene Table
```sql
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS approval_status 
  VARCHAR(50) DEFAULT 'draft';
  
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS locked 
  BOOLEAN DEFAULT FALSE;

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS locked_at 
  TIMESTAMP NULL;

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS locked_by 
  VARCHAR(255) NULL;
```

---

## 5. API Endpoints

### 5.1 Get Scripts by Project
**GET** `/api/projects/{projectId}/scripts`

**Response:**
```json
[
  {
    "id": "script-uuid",
    "projectId": "project-uuid",
    "moduleId": "module-uuid",
    "title": "Promise",
    "approvalStatus": "draft|approved|locked",
    "locked": false,
    "sections": {
      "welcome": { "segments": [...] },
      "content_scenes": [...],
      "quiz_scene": { "questions": [...] }
    },
    "learningObjectives": [],
    "estimatedDurationMinutes": 5
  }
]
```

### 5.2 Get Script by ID
**GET** `/api/scripts/{id}`

Same response structure as above.

### 5.3 Update Script (Edit & Approve)
**PATCH** `/api/scripts/{id}`

**Request:**
```json
{
  "sections": { "welcome": {...}, ... },
  "approvalStatus": "approved",
  "learningObjectives": [...]
}
```

**Response:**
```json
{
  "id": "script-uuid",
  "approvalStatus": "approved",
  "locked": false,
  "updated_at": "2024-07-08T12:00:00Z"
}
```

**Validation:**
- ❌ Cannot edit if `locked === true` → Return 403 Forbidden
- ✅ Can edit if `locked === false`
- ✅ Can approve if `approvalStatus === 'draft'`
- ✅ Can lock if `approvalStatus === 'approved'`

### 5.4 Approve Script
**PATCH** `/api/scripts/{id}`

**Request:**
```json
{
  "approvalStatus": "approved"
}
```

**Response:**
```json
{
  "id": "script-uuid",
  "approvalStatus": "approved",
  "locked": false,
  "message": "Script approved. Ready to lock."
}
```

### 5.5 Lock Script
**PATCH** `/api/scripts/{id}`

**Request:**
```json
{
  "approvalStatus": "locked"
}
```

**Response:**
```json
{
  "id": "script-uuid",
  "approvalStatus": "locked",
  "locked": true,
  "locked_at": "2024-07-08T12:30:00Z",
  "locked_by": "user-uuid",
  "message": "Script locked. Phase 3 (Voice) is now available."
}
```

**Validation:**
- ❌ Cannot lock if `approvalStatus !== 'approved'` → Return 400 Bad Request
- ✅ Locks script and sets `locked_at` + `locked_by`

---

## 6. Frontend Implementation (ScriptsPanel.jsx)

### 6.1 State Management
```javascript
const [expandedScript, setExpandedScript] = useState(null)
const [editingScene, setEditingScene] = useState(null)  // { scriptId, kind, idx, text }
const [savingScene, setSavingScene] = useState(false)

const approveMutation = useMutation({
  mutationFn: (id) => scriptsService.update(id, { approvalStatus: 'approved' }),
  onSuccess: () => { /* refresh */ }
})

const lockMutation = useMutation({
  mutationFn: (id) => scriptsService.update(id, { approvalStatus: 'locked' }),
  onSuccess: () => { /* refresh */ }
})
```

### 6.2 Render Script Card
```jsx
<div className="rounded-lg border border-slate-200 dark:border-white/[0.06] 
                bg-white dark:bg-slate-900/40 overflow-hidden">
  {/* Header */}
  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer 
                  hover:bg-slate-50 dark:hover:bg-slate-800/30 
                  transition-colors"
       onClick={() => setExpandedScript(isExpanded ? null : script.id)}>
    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 
                    flex items-center justify-center">
      <span>{videoIdx + 1}</span>
    </div>
    <div className="flex-1">
      <p className="text-sm font-medium">{script.title}</p>
      <p className="text-xs text-slate-500">~{script.estimatedDurationMinutes} min · {sceneCount} scenes</p>
    </div>
    <Badge variant={badge.variant}>{badge.label}</Badge>
    <ChevronDown className="w-4 h-4" />
  </div>

  {/* Expanded Content */}
  {isExpanded && (
    <div className="border-t border-slate-200 dark:border-white/[0.06] 
                    px-4 py-4 space-y-4">
      {/* Lock indicator if locked */}
      {script.approvalStatus === 'locked' && (
        <div className="flex items-center gap-2 p-3 rounded-lg 
                        bg-green-500/10 border border-green-500/20">
          <Lock className="w-4 h-4 text-green-600" />
          <p className="text-sm text-green-700 font-medium">
            Script locked. Cannot edit.
          </p>
        </div>
      )}

      {/* Learning Objectives */}
      {objectives.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Learning Objectives</p>
          <ul className="space-y-1">
            {objectives.map((o, i) => (
              <li key={i} className="text-xs text-slate-600">• {o}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Scenes */}
      <div>
        <p className="text-xs font-medium mb-2">Scenes ({sceneCount})</p>
        <div className="space-y-3">
          {displayItems.map((item, i) => (
            <SceneItem 
              key={item.kind}-{item.idx}
              item={item}
              isEditing={editingScene?.idx === item.idx}
              isLocked={script.approvalStatus === 'locked'}
              onEdit={() => setEditingScene({...})}
              onSave={() => handleSaveScene(script, item)}
            />
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        {script.approvalStatus === 'draft' && (
          <Button onClick={() => approveMutation.mutate(script.id)} 
                  className="w-full">
            <CheckCircle className="w-4 h-4" />
            Approve Script
          </Button>
        )}
        {script.approvalStatus === 'approved' && (
          <Button onClick={() => lockMutation.mutate(script.id)}
                  className="w-full bg-green-600 hover:bg-green-500">
            <Lock className="w-4 h-4" />
            Lock Script →
          </Button>
        )}
      </div>
    </div>
  )}
</div>
```

### 6.3 Scene Item Render
```jsx
<div className="rounded-lg border border-slate-200 dark:border-white/[0.06] 
                bg-slate-100 dark:bg-slate-800/50">
  {/* Scene Header */}
  <div className="flex items-center justify-between px-3 py-2 
                  bg-slate-50 dark:bg-slate-900/30">
    <div className="flex items-center gap-2">
      <span className="w-5 h-5 rounded-md bg-indigo-500/20 
                       flex items-center justify-center text-[10px]">
        {i + 1}
      </span>
      <p className="text-xs font-medium">{item.title}</p>
    </div>
    {!isEditing ? (
      <button onClick={() => onEdit()} 
              disabled={isLocked}
              className="text-[10px] text-slate-400 
                         hover:text-indigo-600 disabled:opacity-50">
        <Edit2 className="w-3 h-3" /> 
        {isLocked ? 'Locked' : 'Edit voice'}
      </button>
    ) : (
      <div className="flex gap-2">
        <button onClick={() => onSave()} className="text-[10px] text-green-600">
          <Save className="w-3 h-3" /> Save
        </button>
        <button onClick={() => setEditingScene(null)} className="text-[10px]">
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    )}
  </div>

  {/* Two-Column Content */}
  <div className="grid grid-cols-2 divide-x divide-slate-100">
    {/* Voice Script */}
    <div className="p-3">
      <p className="text-[10px] font-semibold text-blue-600 mb-1.5">
        🎙 Voice Script
      </p>
      {isEditing ? (
        <textarea value={editingText} 
                  onChange={(e) => setEditingText(e.target.value)}
                  rows={6} 
                  className="w-full bg-white border border-indigo-500/30 
                             rounded-lg p-2 text-xs" />
      ) : (
        <p className="text-xs text-slate-500 leading-relaxed">
          {item.text}
        </p>
      )}
    </div>

    {/* Slide Content */}
    <div className="p-3">
      <p className="text-[10px] font-semibold text-violet-600 mb-1.5">
        📋 Slide Content
      </p>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold">
          {item.slideContent?.title}
        </p>
        {item.slideContent?.subtitle && (
          <p className="text-[11px] text-slate-500 italic">
            {item.slideContent.subtitle}
          </p>
        )}
        {/* Bullets rendering */}
        <ul className="space-y-1">
          {slideBullets.map((b, bi) => (
            <li key={bi} className="text-[11px]">
              <span className="text-violet-500">▸</span> {b.text}
            </li>
          ))}
        </ul>
        <p className="text-[9px] text-slate-400 italic">
          Edit slides in Visual Designer →
        </p>
      </div>
    </div>
  </div>
</div>
```

---

## 7. Backend Implementation (scripts.ts)

### 7.1 API Validation
```typescript
// PATCH /api/scripts/{id}
app.http('updateScript', {
  handler: async (req, res) => {
    const { id } = req.params
    const body = await req.json()
    const script = await prisma.script.findUnique({ where: { id } })
    
    // Validation: Cannot edit if locked
    if (script.locked && body.sections !== undefined) {
      return { status: 403, jsonBody: { error: 'Script is locked. Cannot edit.' } }
    }
    
    // Validation: Can only lock if approved
    if (body.approvalStatus === 'locked') {
      if (script.approvalStatus !== 'approved') {
        return { status: 400, jsonBody: { error: 'Script must be approved first.' } }
      }
    }
    
    // Build update with lock tracking
    const updateData = {
      ...(body.approvalStatus && { approvalStatus: body.approvalStatus }),
      ...(body.sections && { sections: body.sections }),
      ...(body.approvalStatus === 'locked' && {
        locked: true,
        lockedAt: new Date(),
        lockedBy: getUser(req)
      })
    }
    
    const updated = await prisma.script.update({
      where: { id },
      data: updateData
    })
    
    return { status: 200, jsonBody: updated }
  }
})
```

---

## 8. Error Handling

| Scenario | Status | Message |
|----------|--------|---------|
| Try to edit locked script | 403 | "Script is locked. Cannot edit." |
| Try to lock unapproved script | 400 | "Script must be approved first." |
| Missing scenes/objectives | 400 | "Script is incomplete." |
| Invalid scene count | 400 | "Script must have exactly 6 scenes." |

---

## 9. Testing Checklist

- [ ] Generate script in DRAFT state
- [ ] View all 6 scenes with content
- [ ] Edit a scene's voice script
- [ ] Save edited scene
- [ ] Approve script → moves to APPROVED state
- [ ] Lock script → moves to LOCKED state
- [ ] Try to edit locked script → button disabled
- [ ] See green banner when all scripts locked
- [ ] Navigate to Phase 3 (Voice) when ready
- [ ] Verify database tracks lock metadata

---

## 10. Success Criteria

✅ **Phase 2 is complete when:**
- Scripts have draft/approved/locked states
- UI shows correct buttons per state
- Locked scripts cannot be edited
- Database tracks lock status and metadata
- "Continue to Voice" button appears when all locked
- All builds pass (frontend + backend)

---

## 11. Next Phase

**Phase 3: Voice Generation** → Triggered only when scripts are LOCKED

---

**Status**: Ready for Implementation  
**Last Updated**: July 8, 2026
