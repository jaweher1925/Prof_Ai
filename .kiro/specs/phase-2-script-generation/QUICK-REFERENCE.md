# Phase 2: Script Generation - Quick Reference Guide

**Phase 2 Location**: `src/components/workspace/ScriptsPanel.jsx`  
**Status**: ✅ Production Ready

---

## Workflow At A Glance

```
┌─ DRAFT ─────────────────────────────────────┐
│ • User can edit scenes                       │
│ • [Approve Script] button enabled            │
│ • Green lock icon NOT visible                │
└─ Click "Approve Script" ──────────────────→─┘

┌─ APPROVED ──────────────────────────────────┐
│ • Scenes still editable                      │
│ • [Lock Script →] button enabled (green)     │
│ • Yellow "Approved" badge shown              │
└─ Click "Lock Script →" ───────────────────→─┘

┌─ LOCKED ────────────────────────────────────┐
│ • All editing disabled                       │
│ • Edit button shows "Locked" (disabled)      │
│ • Green "🔒 Locked" banner visible           │
│ • Cannot proceed to Voice until ALL locked   │
└─ [Continue to Voice] ──────────────────────→─┘
```

---

## User Journey (Step-by-Step)

### 1. View Scripts
```
→ Open Project
→ Go to "2. Script Generation" stage
→ See all scripts for project (one per module)
```

### 2. Expand Script
```
→ Click on script card
→ Expands to show:
   • Learning objectives
   • 6 scenes (welcome + 4 content + quiz)
   • Two-column layout per scene
```

### 3. Edit Scene (Optional)
```
→ Click "Edit voice" link on scene header
→ Text area appears for voice script
→ Edit narration text
→ Click "Save" or "Cancel"
```

### 4. Approve Script
```
→ Once satisfied with all scenes
→ Click [Approve Script] button
→ Script moves to APPROVED state
→ Badge changes to yellow "Approved"
→ Lock button now appears
```

### 5. Lock Script
```
→ Click [Lock Script →] button (green)
→ Script moves to LOCKED state
→ Badge changes to "🔒 Locked"
→ Cannot edit anymore
```

### 6. Continue to Phase 3
```
→ When ALL scripts locked
→ Green banner appears: "All scripts approved and locked"
→ Click [Continue to Voice] button
→ Navigate to Phase 3 (Voice Generation)
```

---

## UI Components Breakdown

### Script Card Header
```
┌─────────────────────────────────────────┐
│ [1] Module Name         ~5 min · 6 scenes│
│     Draft               [▼ Expand]       │
└─────────────────────────────────────────┘
```

### Expanded View - Learning Objectives
```
┌─────────────────────────────────────────┐
│ Learning Objectives                      │
│ • Understanding promises                 │
│ • Async/await patterns                   │
│ • Error handling in promises             │
└─────────────────────────────────────────┘
```

### Scene Card (Two-Column)
```
┌─ Scene 1: Welcome ──────────────────────┐
│                                          │
│ 🎙 Voice Script  │  📋 Slide Content    │
│ ─────────────────┼──────────────────    │
│ "Today we'll     │  Title: Welcome      │
│ explore..."      │  • 3 key objectives  │
│ [6 rows text]    │  • Engaging intro     │
│                  │  • Course overview   │
│ [Save] [Cancel]  │  Edit in Designer → │
│                  │                      │
└─────────────────────────────────────────┘
```

### Action Buttons
```
DRAFT:     [Approve Script]     ← Yellow button
APPROVED:  [Lock Script →]      ← Green button  
LOCKED:    🔒 Locked (disabled) ← Grey, no button
```

### Completion Banner (All Locked)
```
┌─────────────────────────────────────────┐
│ ✓ All scripts approved and locked        │
│              [Continue to Voice] →       │
└─────────────────────────────────────────┘
```

---

## API Endpoints Used

### Get Scripts
```
GET /api/projects/{projectId}/scripts
```
Returns: Array of script objects with approval_status

### Update Script (Approve)
```
PATCH /api/scripts/{id}
Body: { "approvalStatus": "approved" }
```
Returns: Updated script with approvalStatus === "approved"

### Update Script (Lock)
```
PATCH /api/scripts/{id}
Body: { "approvalStatus": "locked" }
```
Returns: Updated script with:
- approvalStatus === "locked"
- locked === true
- locked_at === timestamp
- locked_by === user_id

### Edit Scene Content
```
PATCH /api/scripts/{id}
Body: { "sections": JSON.stringify({...}) }
```
Returns: Updated script with modified scene text
⚠️ Validation: Cannot edit if locked === true (403 error)

---

## Database Fields Reference

### Script Table
```sql
id                 → UUID identifier
project_id         → Link to project
module_id          → Link to module
title              → Script name
approval_status    → 'draft' | 'approved' | 'locked'
locked             → boolean (redundant with approval_status)
locked_at          → timestamp when locked
locked_by          → user_id who locked
sections           → JSON: { welcome, content_scenes, quiz_scene }
learning_objectives → JSON array of strings
estimated_duration_minutes → float
created_at         → timestamp
updated_at         → timestamp
```

---

## Error Codes & Messages

| Scenario | Status | Message |
|----------|--------|---------|
| Cannot edit locked | 403 | "Script is locked. Cannot edit content." |
| Cannot lock unapproved | 400 | "Script must be approved before locking." |
| Script not found | 404 | "Script not found" |
| Unauthenticated | 401 | "Unauthenticated" |
| Server error | 500 | Error details logged |

---

## Common Tasks

### To Approve Multiple Scripts Quickly
1. Expand each script
2. Review objectives and scenes (no need to edit)
3. Click [Approve Script] on each
4. Once all approved, lock them one by one

### To Edit a Scene
1. Expand script
2. Click "Edit voice" on scene header
3. Edit the text in textarea
4. Click "Save" to persist
   - or "Cancel" to discard

### To Proceed to Phase 3
1. Ensure all scripts are in LOCKED state
2. Green "All scripts approved and locked" banner appears
3. Click [Continue to Voice]
4. Redirect to Voice Generation stage

### To Check Script Status
1. Look at script card badge color:
   - Blue/Default = Draft
   - Yellow = Approved
   - Green = Locked
2. Expand to see lock indicator

---

## State Management (React Hooks)

```javascript
const [expandedScript, setExpandedScript] = useState(null)
  // Which script card is expanded

const [editingScene, setEditingScene] = useState(null)
  // Which scene is in edit mode: { scriptId, kind, idx, text }

const [savingScene, setSavingScene] = useState(false)
  // Is a scene save in progress?

const [saveError, setSaveError] = useState(null)
  // Error message from scene save attempt

const approveMutation = useMutation(...)
  // Handles POST to approve script

const lockMutation = useMutation(...)
  // Handles POST to lock script
```

---

## Design Token Reference

### Colors (Dark Mode)
```
Draft:    bg-slate-900/40, border-white/[0.06]
Approved: Badge color yellow
Locked:   Badge color green, banner bg-green-500/10
Header:   bg-gradient-to-br from-blue-900/30 to-blue-900/10
```

### Typography
```
Title:    text-2xl font-bold
Label:    text-xs font-semibold uppercase
Scene:    text-xs font-medium
Content:  text-xs text-slate-500
```

### Spacing
```
Header:      p-6 mb-6
Card:        p-4 space-y-4
Scene:       p-3
Two-column:  grid-cols-2 divide-x
```

---

## Troubleshooting

### Script Not Showing
1. Check project has completed Phase 1 (Librarian)
2. Check scripts are generated (Run Script Generator)
3. Refresh page if stuck

### Cannot Save Scene Edit
1. Check script is not locked
2. Check browser console for errors
3. Try again - may be network issue

### Cannot Lock Script
1. Ensure script is APPROVED first
2. Try refreshing page
3. Check backend logs for validation errors

### "Continue to Voice" Not Appearing
1. Check ALL scripts are locked (not just some)
2. Refresh page to see updated state
3. Expand each script to verify locked status

---

## Performance Tips

1. **Don't expand all scripts at once** - Load them as needed
2. **Edit scenes efficiently** - Save after each edit
3. **Approve/lock one at a time** - Prevents race conditions
4. **Use browser DevTools to check network** - See if requests are slow

---

## Frontend File Locations

| File | Purpose |
|------|---------|
| `src/components/workspace/ScriptsPanel.jsx` | Main component |
| `src/services/scripts.js` | API client |
| `src/pages/ProjectWorkspace.jsx` | Workflow control |
| `src/components/ui/Badge.jsx` | Status badge |
| `src/components/ui/Button.jsx` | Action buttons |

## Backend File Locations

| File | Purpose |
|------|---------|
| `api/src/functions/scripts.ts` | API endpoints |
| `api/src/lib/db.ts` | Database client |
| `api/prisma/schema.prisma` | Data model |

---

## Key Insights

1. **Approval ≠ Lock**: Approved scripts can still be edited. Only locked scripts are frozen.

2. **Lock is Permanent**: Once locked, script cannot be unlocked. Users must regenerate if changes needed.

3. **Phase Progression**: Cannot proceed to Voice until ALL scripts are locked.

4. **Lock Metadata**: `locked_at` and `locked_by` track who locked and when for audit trail.

5. **Scene Structure**: 6 scenes per module is required:
   - 1 Welcome (50-60 words)
   - 4 Content (60-100 words each)
   - 1 Quiz (questions)

6. **Two-Column Design**: Voice script (left) vs Slide content (right) makes review efficient.

7. **Error Handling**: Clear messages guide users when operations fail.

---

## Related Phases

| Phase | Purpose | Prerequisite |
|-------|---------|--------------|
| Phase 1 | Content Library | - |
| **Phase 2** | **Script Generation** | **Phase 1 complete** |
| Phase 3 | Voice Generation | **All scripts locked** |
| Phase 4 | Visual Design (Slides) | Voice complete |
| Phase 5 | Timing & Transitions | Visual D1 complete |
| Phase 6 | Avatar & Rendering | All previous complete |

---

**Last Updated**: July 8, 2026  
**Status**: ✅ Production Ready
