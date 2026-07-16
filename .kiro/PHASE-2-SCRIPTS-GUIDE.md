# Phase 2: Scripts - Complete Implementation Guide

## Overview
Phase 2 implements the **Scripts** stage - where users generate scripts from uploaded sources, edit them, and approve/lock them for voice generation.

## Core Features

### 1. Two-Step Generation Process ✅

#### Step 1: Analyze Sources (Librarian)
- Extracts topics and concepts from uploaded materials
- Creates 5 modules from the content
- Generates module titles and learning objectives
- Status: One-time analysis per project
- Re-analyze available if sources change

#### Step 2: Generate Scripts (Script Generator)
- Creates narrative scenes from content
- Generates voice scripts (what presenter says)
- Generates slide content (what students read)
- **Module duration target**: 3-7 minutes per module (natural guideline)
- **Concise narration**: Standard throughout
- **Custom instructions**: Optional field for user guidance (leave empty if none needed)

### 2. Custom Instructions ✅
- Optional custom instructions field (starts empty)
- Users can add tone, style, audience guidance if desired
- Examples: "Friendly tone", "Professional style", "University audience", "Very concise"
- Fully optional - can be left empty
- Instructions persist across regenerations when provided

### 3. Full Scene Editing ✅
- **Edit Voice Script**: Modify narration text for any scene
- **Edit Functionality**: Only available if script is NOT locked
- **Save Mechanism**: Changes saved immediately to database
- **Error Handling**: Clear error messages if edits fail
- **Cannot Edit Locked Scripts**: Once locked, scenes are read-only

### 4. Scene Layout (Two-Column View) ✅

Left Column - **🎙 Voice Script**
- Narration text (what presenter says)
- Editable textarea when editing
- Word count target shown in instructions

Right Column - **📋 Slide Content**
- Slide title and subtitle
- Bullet points with hierarchy levels
- Quick preview of slide visuals
- "Edit in Visual Designer" hint

### 5. HITL Approval & Lock Workflow ✅

**States per Script**:
- **Draft**: Initial state, full edit access
- **Approved**: User confirms content is correct
- **Locked**: Locked for voice generation - no more edits

**Workflow**:
1. User reviews all scenes (can edit voice scripts)
2. Clicks "Approve Script" → moves to Approved state
3. Reviews again (optional, still editable)
4. Clicks "Lock Script" → moves to Locked state
5. All scripts locked → "Continue to Voice" button appears

**Visual Indicators**:
- Badge shows current state (Draft/Approved/Locked 🔒)
- Locked scripts show lock icon and "Cannot edit" message
- Edit button disabled on locked scripts
- Green success message when all scripts locked

### 6. Scene Structure

Script content is dynamically generated based on source material. Each module:
- Fits within 3-7 minutes total duration
- Contains multiple scenes (number varies based on content)
- Maintains concise, tightly-written narration throughout

### 7. Legacy Support ✅
- Handles old flat-array script format
- Normalizes both old and new shapes for display
- Edits save to current shape

## Technical Details

### Database Fields (Script Model)

```
id                        - UUID
projectId                 - Foreign key to projects
moduleId                  - Foreign key to modules (optional)
title                     - "Module N - Topic"
version                   - Integer, incremented on regeneration
learningObjectives        - JSON string: ["Objective 1", "Objective 2", ...]
sections                  - JSON string: { welcome, content_scenes, quiz_scene }
status                    - "review" (legacy field, not used in Phase 2)
estimatedDurationMinutes  - ~4.0 min per module
approvalStatus            - "draft" | "approved" | "locked"
locked                    - Boolean (matches approvalStatus === 'locked')
lockedAt                  - Timestamp when locked
lockedBy                  - User ID who locked script
createdAt, updatedAt      - Timestamps
```

### API Endpoints

```
POST   /api/scriptGeneratorAgent       - Trigger script generation
GET    /api/projects/{id}/scripts      - List scripts for project
PATCH  /api/scripts/{id}               - Update script (text, approval status)
```

### Update Operations

**Approve Script**:
```
PATCH /api/scripts/{id}
{ "approvalStatus": "approved" }
```

**Lock Script**:
```
PATCH /api/scripts/{id}
{ "approvalStatus": "locked" }
```

**Edit Scene Text**:
```
PATCH /api/scripts/{id}
{ "sections": JSON.stringify({...updated sections...}) }
```

## UI/UX Pattern

### Expandable Cards
- Each script is a collapsible card
- Shows: Module #, Title, Duration, Scene count, Status badge
- Click to expand/collapse
- Only one expanded at a time

### Scene Blocks
- Two-column layout for voice/slide content
- Color-coded headers (blue for voice, violet for slides)
- Editable textarea with Save/Cancel buttons
- Full grid structure maintained

### Action Buttons
- **Approve Script** (Draft → Approved): Green button with checkmark
- **Lock Script** (Approved → Locked): Green button with lock icon
- **Continue to Voice** (All locked): Green button with arrow (auto-appears)

### Status Display
- **In Progress**: Loading spinner with "Analyzing..." or "Generating..."
- **Error**: Red alert box with retry option
- **Success**: Green success box with next action button
- **Locked**: Green lock box with "Cannot edit" message

## Limitations & Edge Cases

### What Locked Scripts Cannot Do
- ❌ Edit voice script text
- ❌ Delete or add scenes
- ❌ Change approval status back to draft
- ❌ Modify slide content (must be done before locking)

### What Can Be Changed After Locking
- ✅ Slides can still be designed in Visual Designer (separate CRUD)
- ✅ Scripts can be regenerated (creates new script entry)
- ✅ Voice can be changed independently

### Validation Rules
- Script must be in Draft/Approved to be editable
- Cannot edit while generation is in progress
- Locked state is permanent (creates new script if regenerating)
- All scripts must be locked before Voice stage unlocks

## Workflow Guarantees

✅ **HITL Checkpoint**: Scripts cannot proceed to Voice without approval
✅ **No Silent Saves**: All edits show explicit Save/Cancel
✅ **Lock Guarantee**: Once locked, script state is immutable
✅ **Clear Feedback**: All state changes show instant UI updates
✅ **Error Recovery**: Can retry failed operations

## Testing Checklist

- [ ] Generate scripts from sources successfully
- [ ] Custom instructions applied to generated scripts
- [ ] Edit voice script in draft state
- [ ] Save scene edit without errors
- [ ] Cannot edit locked script (button disabled)
- [ ] Approve script changes status to "Approved"
- [ ] Lock script changes status to "Locked" with green badge
- [ ] All locked → "Continue to Voice" button appears
- [ ] Click "Continue to Voice" → navigates to Voices stage
- [ ] Regenerate scripts → creates new scripts, old ones unaffected
- [ ] Dark mode styling works correctly
- [ ] Error messages display properly

## Known Patterns

### Scene Display Normalization
The `buildDisplayItems()` function handles:
- Legacy flat-array format: `[scene1, scene2, ...]`
- New structured format: `{ welcome, content_scenes, quiz_scene }`
- Converts both to a unified display list

### Editable State Management
- `editingScene`: `{ scriptId, kind, idx, text }`
- Persists only during edit session
- Cleared on Save or Cancel
- Prevents simultaneous edits

### Approval State Machine
```
Draft
  ↓ (Approve)
Approved
  ↓ (Lock)
Locked (immutable)
```

## Integration Points

### From Library (Phase 1)
- Receives project with uploaded sources
- Librarian agent extracts and creates modules

### To Voices (Phase 3)
- Locked scripts unlock voice generation
- All scripts must be locked before Voice stage
- Voice settings applied uniformly to all scenes

### To Visual Design (Phase 4)
- Script content feeds into slide design
- One slide per scene segment
- Avatar placeholder added during design phase

## Future Enhancements

- Bulk approval of multiple scripts
- Script comparison (before/after regeneration)
- Import custom scripts from file
- Export scripts to DOCX/PDF
- AI-powered script suggestions
- Tone/style templates (formal, friendly, conversational, etc.)
