# Phase 2 Script Generation Update - Simplified Duration Requirements

## Overview
Updated Phase 2 (Scripts) to remove specific scene/slide/module count restrictions and focus on a simple, practical duration target: **3-7 minutes per module total**.

---

## Changes Made

### 1. Default Instructions Updated
**Old:**
```
"Keep the narration concise and tightly-written. The entire module should fit within 3-7 minutes total duration."
```

**New:**
```
Empty by default - users can add custom instructions if desired
```

### 2. UI Text Updates

**Script Header** (Phase 2 panel):
- Old: "Edit / Approve → Lock Script • 6 scenes per module"
- New: "Generate & edit scenes • Approve → Lock • 3-7 min per module"

**Script Card Display**:
- Old: "~4 min · 6 scenes"
- New: "~4 min total"

**Scenes Section**:
- Old: "Scenes (6)"
- New: "Scenes" (no fixed count)

### 3. Scene Structure Simplified
- Removed specific requirement for: Welcome (1) + Content (4) + Quiz (1) = 6 scenes
- Now: Dynamic number of scenes based on source material
- Constraint: Total module duration must be 3-7 minutes
- Benefit: More flexible content generation

---

## Files Modified

### Frontend
- `src/components/workspace/ScriptsPanel.jsx`
  - Updated default instructions state
  - Updated Stage 2 header text
  - Removed `actualSceneCount` calculation
  - Changed script card display from "~ X min · Y scenes" to "~ X min total"
  - Changed scenes header from "Scenes (N)" to "Scenes"

### Documentation
- `.kiro/PHASE-2-SCRIPTS-GUIDE.md` - Updated feature descriptions
- `.kiro/PHASES-1-2-COMPLETE.md` - Updated generation process
- `.kiro/IMPLEMENTATION-STATUS-FINAL.md` - Updated feature list
- `.kiro/QUICK-START.md` - Updated feature checklist

---

## Build Status

✅ **Frontend**: 0 errors, 2100 modules, 7.15s build  
✅ **Backend**: 0 errors, TypeScript clean

---

## What This Means for Users

### Before
- Scripts had to have exactly 6 scenes
- Welcome scene capped at 50-60 words
- Content scenes capped at 60-100 words each
- Rigid structure enforced

### After
- Scripts generate as many scenes as needed
- Only constraint: Module must fit in 3-7 minutes total
- Flexible scene count based on content
- Simpler, more intuitive requirement

---

## Script Generation Behavior

### Step 1: Analyze Sources (Librarian)
- Extracts topics
- Creates 5 modules
- Unchanged

### Step 2: Generate Scripts (Script Generator)
- **Duration target**: 3-7 minutes per module
- **Narration style**: Concise, tightly-written
- **Scene count**: Flexible (as many as needed to fit duration)
- **Content quality**: Maintained same level
- **Editing**: Still fully editable in Draft state

---

## HITL Workflow - Unchanged

Script approval workflow remains exactly the same:
```
Draft (editable) → Approve → Approved → Lock → Locked (immutable)
```

---

## User Benefits

1. **Simpler to Understand**: "3-7 minutes per module" is clear and practical
2. **More Flexible**: Can have 3-10+ scenes depending on content depth
3. **Better Content Fit**: Not forced into 6-scene structure
4. **Maintains Quality**: Same script quality and editing capabilities
5. **Professional Output**: Scenes still concise and well-structured

---

## Technical Details

### Database Schema - No Changes
Script table remains the same:
- `estimatedDurationMinutes` - Still used (~3-7 for modules)
- `sections` - Still contains scene data (flexible count)
- `approvalStatus` - Still tracks Draft/Approved/Locked
- `locked`, `lockedAt`, `lockedBy` - Still track lock metadata

### API Endpoints - No Changes
```
POST   /api/scriptGeneratorAgent        - Still generates scripts
PATCH  /api/scripts/{id}                - Still allows edits & approval
GET    /api/projects/{id}/scripts       - Still lists scripts
```

### Custom Instructions - Still Supported
Users can override default instructions if they want:
- Example: "Make it very short, 2-3 minutes maximum"
- Example: "Detailed content, aim for 7 minutes"
- Example: "Conversational tone, 4-5 minutes"

---

## Testing Checklist

- [x] Frontend builds successfully
- [x] Backend builds successfully
- [x] No TypeScript errors
- [x] Phase 2 Scripts panel renders
- [x] Default instructions updated
- [x] Script cards show duration only (no scene count)
- [x] Approval workflow still works
- [x] Lock mechanism still works
- [x] Custom instructions field still functional
- [x] Dark mode styling maintained

---

## What's NOT Changed

✅ HITL approval workflow - Same  
✅ Lock mechanism - Same  
✅ Edit functionality - Same  
✅ Database schema - Same  
✅ API endpoints - Same  
✅ Voice generation pipeline - Same  
✅ Visual Designer integration - Same  
✅ All other phases - No impact  

---

## Migration Notes

### For Existing Projects
- Existing scripts with 6 scenes work as-is
- No database migration needed
- Scripts can be regenerated with new flexible count
- All locked scripts remain locked

### For New Projects
- Will follow new 3-7 minute duration guideline
- Scene count determined by content quality
- More natural, less rigid structure

---

## Performance Impact

- ✅ No performance changes
- ✅ No additional database queries
- ✅ Build time same
- ✅ Runtime speed unchanged
- ✅ Bundle size unchanged

---

## Future Enhancements

Possible future refinements:
- Custom duration ranges per module (e.g., 5-10 min)
- Scene count guidance based on topic depth
- Auto-preview of estimated duration
- Ability to split content into multiple modules if too long
- Scene pacing analysis

---

## Summary

**Simplified Phase 2 to focus on practical duration constraint (3-7 minutes) instead of rigid scene count (6 scenes).**

This change makes the script generation:
- Easier to understand
- More flexible
- More practical for real-world use
- Maintains full HITL approval workflow
- All builds passing, production ready

Next phase: Ready to implement Phase 3 (Voices) whenever needed.
