# Phase 2: Script Generation - Implementation Checklist

**Status**: Ready to Build  
**Target**: Complete script HITL workflow with lock mechanism  

---

## 📋 Implementation Roadmap

### Step 1: Verify Current Implementation ✓
- [x] Database schema has `approval_status`, `locked`, `locked_at`, `locked_by`
- [x] Backend API has validation for locked scripts
- [x] Frontend has HITL buttons (Approve, Lock)
- [x] UI shows correct states (Draft, Approved, Locked)
- [x] Build passes

### Step 2: UI Refinement (NEXT)
Focus: Make Phase 2 panel match new design specification

**Files to update:**
- `src/components/workspace/ScriptsPanel.jsx`

**Tasks:**
- [ ] Update step headers to match Phase 2 spec
- [ ] Ensure card design is consistent with Phase 1
- [ ] Verify all 6 scenes display correctly
- [ ] Check two-column scene layout works
- [ ] Verify edit mode functionality
- [ ] Test approval workflow UI
- [ ] Test lock workflow UI
- [ ] Verify "locked" state disables edit button
- [ ] Check green completion banner

**Acceptance Criteria:**
- ✅ All script states render correctly
- ✅ Edit mode works and saves changes
- ✅ Approve button moves script to approved state
- ✅ Lock button freezes script
- ✅ Green banner shows when all locked
- ✅ Continue to Voice button works

---

### Step 3: Scene Editing Logic
Focus: Ensure scenes can be edited, saved, and validated

**Files to check:**
- `src/components/workspace/ScriptsPanel.jsx` (buildDisplayItems function)
- `src/services/scripts.js` (API calls)

**Tasks:**
- [ ] Verify `buildDisplayItems()` handles both old and new section shapes
- [ ] Test editing scene text
- [ ] Test saving scene changes
- [ ] Verify changes persist to database
- [ ] Test that editing is disabled for locked scripts
- [ ] Test rollback on cancel

**Acceptance Criteria:**
- ✅ Can edit scene voice script
- ✅ Changes save to database
- ✅ Edit button disabled when locked
- ✅ Cancel discards changes

---

### Step 4: Approval Workflow
Focus: Draft → Approved → Locked state transitions

**Files to check:**
- `src/components/workspace/ScriptsPanel.jsx` (approveMutation, lockMutation)
- `api/src/functions/scripts.ts` (validation)

**Tasks:**
- [ ] Test approving draft script
- [ ] Verify script moves to APPROVED state
- [ ] Test locking approved script
- [ ] Verify script moves to LOCKED state
- [ ] Verify locked_at and locked_by are set
- [ ] Test that unapproved scripts cannot be locked
- [ ] Test error messages appear

**Acceptance Criteria:**
- ✅ Approve button works and updates state
- ✅ Lock button works and updates state
- ✅ State transitions are correct
- ✅ Lock metadata is tracked
- ✅ Error handling works

---

### Step 5: Multi-Script Workflow
Focus: Handle multiple scripts per project

**Files to check:**
- `src/components/workspace/ScriptsPanel.jsx` (allLocked logic)
- Database queries

**Tasks:**
- [ ] Test with multiple scripts (2-3 modules)
- [ ] Verify expand/collapse works for each
- [ ] Test editing one script while others exist
- [ ] Test approving one script at a time
- [ ] Test locking one script at a time
- [ ] Verify green banner appears only when ALL locked
- [ ] Verify Continue to Voice button appears only when ALL locked

**Acceptance Criteria:**
- ✅ Multiple scripts display correctly
- ✅ Each script can be edited independently
- ✅ Each script can be approved/locked independently
- ✅ Banner shows correct "all locked" state
- ✅ Continue button only appears when complete

---

### Step 6: Backend Validation & Error Handling
Focus: Ensure API validates all state transitions

**Files to check:**
- `api/src/functions/scripts.ts`

**Tasks:**
- [ ] Test: Cannot edit locked script (403)
- [ ] Test: Cannot lock unapproved script (400)
- [ ] Test: Missing sections returns error
- [ ] Test: Invalid scene count returns error
- [ ] Verify error messages are clear
- [ ] Test all edge cases

**Acceptance Criteria:**
- ✅ All validations work correctly
- ✅ Error messages are helpful
- ✅ Status codes are correct
- ✅ Database constraints enforced

---

### Step 7: Integration Testing
Focus: Test full Phase 2 workflow end-to-end

**Scenario 1: Single Module**
- [ ] Generate script (1 module, 6 scenes)
- [ ] Review all scenes
- [ ] Edit one scene
- [ ] Save changes
- [ ] Approve script
- [ ] Lock script
- [ ] Verify locked
- [ ] Try to edit (fails)

**Scenario 2: Multiple Modules**
- [ ] Generate scripts (3 modules, 6 scenes each)
- [ ] Edit module 1 only
- [ ] Approve module 1
- [ ] Approve modules 2-3 without editing
- [ ] Lock modules one by one
- [ ] Verify green banner appears
- [ ] Click Continue to Voice

**Scenario 3: Error Cases**
- [ ] Try to lock without approving (fails)
- [ ] Try to edit while locked (fails)
- [ ] Try to approve twice (should be idempotent)
- [ ] Try to lock twice (should be idempotent)

**Acceptance Criteria:**
- ✅ All scenarios work as expected
- ✅ No errors or crashes
- ✅ State is consistent
- ✅ Navigation works

---

### Step 8: Visual Polish & Testing
Focus: Ensure UI matches design and works smoothly

**Tasks:**
- [ ] Test dark mode
- [ ] Test light mode
- [ ] Test responsive layout
- [ ] Test hover states
- [ ] Test disabled states
- [ ] Test animations/transitions
- [ ] Test keyboard navigation
- [ ] Test accessibility

**Acceptance Criteria:**
- ✅ UI looks polished in both modes
- ✅ All interactive elements work
- ✅ No visual glitches
- ✅ Responsive on all screen sizes

---

### Step 9: Documentation & Testing Checklist
Focus: Ensure everything is documented and tested

**Tasks:**
- [ ] Run full test suite
- [ ] Document any gotchas
- [ ] Create user guide for Phase 2
- [ ] Get approval from stakeholder
- [ ] Mark Phase 2 as COMPLETE

**Acceptance Criteria:**
- ✅ All tests pass
- ✅ Documentation complete
- ✅ Stakeholder approves
- ✅ Ready for Phase 3

---

## 🎯 Quick Summary

**What's Already Done:**
- ✅ Database schema
- ✅ Backend API with validation
- ✅ Frontend UI structure
- ✅ HITL buttons and states

**What Needs Testing & Refinement:**
- ⏳ UI consistency with Phase 1 design
- ⏳ Scene editing workflow
- ⏳ Approval/lock state transitions
- ⏳ Multi-script handling
- ⏳ Error messages
- ⏳ End-to-end testing

---

## 📝 Files to Modify

1. **Frontend:**
   - `src/components/workspace/ScriptsPanel.jsx` (UI refinement)
   - `src/services/scripts.js` (API services)

2. **Backend:**
   - `api/src/functions/scripts.ts` (validation)

3. **Database:**
   - Already has required schema ✓

---

## ✅ Success Criteria for Phase 2

**Phase 2 is COMPLETE when:**
1. ✅ All scripts have draft/approved/locked states
2. ✅ UI shows correct buttons per state
3. ✅ Locked scripts cannot be edited
4. ✅ Database tracks lock metadata
5. ✅ Multi-script workflow works correctly
6. ✅ All tests pass
7. ✅ All builds pass (frontend + backend)
8. ✅ Documentation complete
9. ✅ Ready to move to Phase 3 (Voice)

---

## 🚀 Ready to Start?

**Recommended order:**
1. Update ScriptsPanel UI (Step 2)
2. Verify scene editing (Step 3)
3. Test approval workflow (Step 4)
4. Test multi-script scenarios (Step 5)
5. Verify backend validation (Step 6)
6. Full integration testing (Step 7)
7. Visual polish (Step 8)
8. Documentation (Step 9)

---

**Let's start with Step 2: UI Refinement in ScriptsPanel.jsx**

