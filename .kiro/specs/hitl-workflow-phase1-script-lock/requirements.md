# Phase 1: Script Creation with HITL Lock
## Requirements & Specifications

**Status**: In Development
**Priority**: 🔴 High (Foundation for all downstream phases)
**Target**: Script locking mechanism + UI checkpoint

---

## 1. Overview

Phase 1 implements the first HITL checkpoint: **Script generation with edit/approve → lock**.

Once a script is approved and locked:
- ✅ Cannot be edited
- ✅ Triggers Phase 2 (Voice generation)
- ✅ Prevents cascading rerenders downstream

---

## 2. Current State vs. New State

### Current (Before)
```
Script Panel:
- Generate Scripts
- Edit scripts anytime
- No lock mechanism
- Voice/Video regenerate automatically
```

### New (After)
```
Script Panel:
- [Generate Scripts]
         ↓
- [Edit / Approve] ← HITL Checkpoint
         ↓
- [Lock Script] ← Frozen, cannot edit
         ↓
- Phase 2: Voice Generation enabled
```

---

## 3. Requirements

### 3.1 Script Entity Enhancement

**Database Changes**:
```
Script table additions:
- locked: boolean (default: false)
- locked_at: timestamp
- locked_by: user_id
- approval_status: 'draft' | 'approved' | 'locked'
```

### 3.2 UI Changes - Scripts Panel

**New UI Elements**:

1. **Script Card States**:
   - Draft: "Edit / Approve" buttons visible
   - Approved: "Approve / Lock Script" button visible
   - Locked: "🔒 Script Locked" badge + read-only view

2. **Action Buttons**:
   ```
   [Edit Script Content]  [Approve] → [Lock Script] 
                                            ↓
                                         🔒 Locked
   ```

3. **Status Indicators**:
   - Draft: Gray badge
   - Approved: Yellow badge
   - Locked: Green badge with lock icon

### 3.3 Edit/Approve Workflow

**When Script is NOT Locked**:
- ✅ Edit button: Opens inline editor
- ✅ Approve button: Moves to "approved" state
- ✅ Lock button: Freezes script permanently

**When Script is Locked**:
- ❌ Edit disabled (grayed out)
- ❌ Cannot regenerate Voice automatically
- ✅ View-only mode
- ✅ Show "Unlock Script" button (admin only, if needed)

---

## 4. Functional Specifications

### 4.1 Lock Script Action

**Endpoint**: `PATCH /api/scripts/{id}`

**Request**:
```json
{
  "approval_status": "locked",
  "locked_at": "2024-07-08T12:00:00Z"
}
```

**Response**:
```json
{
  "id": "script-123",
  "title": "Promise",
  "approval_status": "locked",
  "locked": true,
  "locked_at": "2024-07-08T12:00:00Z",
  "message": "Script locked. Voice generation is now available."
}
```

### 4.2 Edit Script (Before Lock)

**Constraint**: Only editable if `locked === false`

**Endpoint**: `PATCH /api/scripts/{id}`

**Rules**:
- If locked = true → return 403 Forbidden
- If locked = false → allow edit
- Automatically clear voice/video related to this script when edited (require re-approval)

### 4.3 Approve Script

**Endpoint**: `PATCH /api/scripts/{id}`

**Request**:
```json
{
  "approval_status": "approved"
}
```

**Behavior**:
- Moves from "draft" → "approved"
- User sees "Lock Script" button next to it
- Voice generation CAN begin, but content is still editable

---

## 5. Database Schema

### Script Table Updates

```sql
ALTER TABLE script ADD COLUMN IF NOT EXISTS approval_status 
  VARCHAR(50) DEFAULT 'draft'; -- 'draft' | 'approved' | 'locked'

ALTER TABLE script ADD COLUMN IF NOT EXISTS locked 
  BOOLEAN DEFAULT false;

ALTER TABLE script ADD COLUMN IF NOT EXISTS locked_at 
  TIMESTAMP NULL;

ALTER TABLE script ADD COLUMN IF NOT EXISTS locked_by 
  VARCHAR(255) NULL;

CREATE INDEX idx_script_approval_status 
  ON script(approval_status);

CREATE INDEX idx_script_locked 
  ON script(locked);
```

---

## 6. API Changes

### 6.1 Update Script Endpoint

**File**: `api/src/functions/scripts.ts`

**Changes**:
1. Add `approval_status` to update payload
2. Add validation: if locked=true, reject edit attempts
3. Add `locked_at`, `locked_by` tracking

**Pseudocode**:
```typescript
app.http('updateScript', {
  handler: async (req, res) => {
    const { id } = req.params
    const { approval_status, locked } = req.body
    
    const script = await prisma.script.findUnique({ where: { id } })
    
    // Validation: Cannot edit if locked
    if (script.locked === true && req.body.sections !== undefined) {
      return { status: 403, jsonBody: { error: 'Script is locked' } }
    }
    
    // Update with lock tracking
    await prisma.script.update({
      where: { id },
      data: {
        approval_status,
        locked: approval_status === 'locked',
        locked_at: approval_status === 'locked' ? new Date() : null,
        locked_by: approval_status === 'locked' ? userId : null,
        ...otherUpdates
      }
    })
    
    return { status: 200, jsonBody: updatedScript }
  }
})
```

---

## 7. Frontend Changes

### 7.1 ScriptsPanel.jsx Updates

**Changes**:
1. Add state for `approval_status`
2. Show appropriate buttons based on status
3. Disable edit when `locked === true`
4. Add lock/unlock actions

**New Components**:
```jsx
<ScriptCard 
  script={script}
  onApprove={handleApprove}
  onLock={handleLock}
  onEdit={handleEdit}
/>
```

**Script Card States**:
```jsx
// Draft state
<button>Edit</button>
<button>Approve</button>

// Approved state
<button>Edit</button>
<button>Lock Script →</button>

// Locked state
<badge>🔒 Locked</badge>
<p>Script frozen. Cannot edit.</p>
```

---

## 8. Constraints & Validation

### 8.1 Lock Prerequisites

Script can only be locked if:
- ✅ approval_status = 'approved'
- ✅ All required fields populated (title, sections)
- ✅ Valid scene count (6 per module)

### 8.2 Downstream Impact

When script is locked:
- ✅ Voice generation becomes available
- ✅ Cannot revert lock without admin action
- ❌ Changing voice settings doesn't re-trigger script tasks

---

## 9. User Flow

```
User Opens Scripts Panel
    ↓
[Review Generated Scripts]
    ↓
For each script:
    ├─ DRAFT STATE
    │  ├─ [Edit Content] → Edit modal opens
    │  ├─ [Approve] → Moves to APPROVED
    │  └─ Script content still editable
    │
    ├─ APPROVED STATE
    │  ├─ [Edit] (still allowed)
    │  ├─ [Lock Script →] ← Main action
    │  └─ Can start Voice generation
    │
    └─ LOCKED STATE
       ├─ 🔒 Script Locked badge
       ├─ Read-only view
       ├─ Cannot edit
       └─ Proceed to Phase 2: Voice
```

---

## 10. Error Handling

| Error | Status | Message |
|-------|--------|---------|
| Try to edit locked script | 403 | "Script is locked. Cannot edit." |
| Try to lock unapproved script | 400 | "Script must be approved first." |
| Missing required sections | 400 | "Script is incomplete." |
| Invalid scene count | 400 | "Script must have exactly 6 scenes." |

---

## 11. Testing Checklist

- [ ] Create script in draft state
- [ ] Edit script content
- [ ] Approve script
- [ ] Lock script
- [ ] Verify locked script cannot be edited
- [ ] Verify edit button is disabled when locked
- [ ] Verify Phase 2 (Voice) is enabled after lock
- [ ] Test database lock tracking
- [ ] Test API validation

---

## 12. Success Criteria

✅ **Phase 1 is complete when**:
- Scripts have draft/approved/locked states
- UI shows correct buttons per state
- Locked scripts cannot be edited
- Database tracks lock status
- Voice generation is gated behind lock

---

**Next Phase**: Phase 2 - Voice Generation (locked script triggers TTS)

---

**Created**: July 8, 2026
**Status**: Ready for implementation
