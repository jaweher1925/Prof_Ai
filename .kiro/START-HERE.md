# Phase 4 Visual Design - START HERE 🚀

**Welcome!** This guide helps you get started with Phase 4 implementation.

---

## 5-Minute Overview

You're building the **Visual Design step** where users:
1. Select a template (Modern, Minimal, etc.)
2. Get a slide with avatar placeholder
3. Drag/resize the avatar anywhere
4. Edit text and images
5. Save automatically

**Timeline**: 2 weeks  
**Complexity**: Low  
**Team**: 1 Backend + 1 Frontend

---

## What to Read (Pick Your Role)

### 👔 If You're the Product Manager
→ **Read this file** (5 min) → **PHASE-4-REVISED-SUMMARY.md** (10 min)  
✓ You'll understand user flows and features

### 🏗️ If You're the Tech Lead
→ **This file** → **PHASE-4-REVISED-SUMMARY.md** → **.kiro/specs/phase-4-visual-design/REVISED-REQUIREMENTS.md**  
✓ You'll understand architecture and make tech decisions

### 💻 If You're a Developer
→ **This file** → **.kiro/specs/phase-4-visual-design/SPRINT-1-REVISED-TASKS.md**  
✓ You'll have 10 specific tasks to implement

### 🧪 If You're QA
→ **This file** → **PHASE-4-VISUAL-GUIDE.md** (see what users interact with)  
✓ You'll know what to test

---

## File Navigation

```
.kiro/specs/phase-4-visual-design/
├── REVISED-REQUIREMENTS.md ← READ THIS FIRST (user flows, features)
├── SPRINT-1-REVISED-TASKS.md ← THEN THIS (10 tasks, code examples)
├── SPRINT-1-TASKS.md (original, for reference)
├── README.md (original spec, for reference)
├── IMPLEMENTATION-GUIDE.md (original strategy, for reference)
├── SUMMARY.md (original overview, for reference)
└── INDEX.md (document navigation)

.kiro/ (root)
├── PHASE-4-REVISED-SUMMARY.md ← Quick 5-min overview
├── PHASE-4-VISUAL-GUIDE.md ← UI mockups & interactions
├── PHASE-4-FINAL-SUMMARY.txt ← Complete status
└── START-HERE.md (this file)
```

---

## Quick Decision Matrix

| Role | Read This | Time | Purpose |
|------|-----------|------|---------|
| **PM** | PHASE-4-REVISED-SUMMARY.md | 5 min | Understand features |
| **Tech Lead** | REVISED-REQUIREMENTS.md | 20 min | Architecture review |
| **Backend Dev** | SPRINT-1-REVISED-TASKS.md (Tasks 1-3) | 30 min | Implement APIs |
| **Frontend Dev** | SPRINT-1-REVISED-TASKS.md (Tasks 4-10) | 1 hour | Implement UI |
| **QA** | PHASE-4-VISUAL-GUIDE.md | 20 min | Know what to test |

---

## What You're Building (Visual)

```
DEFAULT SLIDE LAYOUT
┌──────────────────────────────┐
│ Title                        │
│                              │
│ • Main point           ┌────┐ │
│   - Sub point          │AVAT│ │
│ • Another point        │AR  │ │
│                        │PLCE│ │
│ [Image]                │HLDR│ │
│                        │    │ │
│                        │◄─ Draggable
│                        │   Resizable
│                        │   16:9 ratio
│                        └────┘ │
└──────────────────────────────┘

USER INTERACTIONS:
✓ Click title → Edit text
✓ Click bullet → Add/edit/delete
✓ Drag avatar → Move anywhere
✓ Resize avatar → Corner handles
✓ Drag image → Reposition/resize
✓ All changes auto-save
```

---

## 10 Tasks (2-Week Sprint)

### Week 1: Backend (Tasks 1-3)
- [ ] Task 1: Database (add avatar position fields)
- [ ] Task 2: API GET composition
- [ ] Task 3: API PATCH composition

**Effort**: 3-4 days  
**Owner**: Backend developer

### Week 1: Frontend Canvas (Tasks 4-5)
- [ ] Task 4: Canvas rendering (Konva.js)
- [ ] Task 5: Avatar drag/resize

**Effort**: 2-3 days  
**Owner**: Frontend developer

### Week 2: Frontend Text & Save (Tasks 6-10)
- [ ] Task 6: Title text editing
- [ ] Task 7: Bullet text editing
- [ ] Task 8: Template selection UI
- [ ] Task 9: Auto-save (500ms)
- [ ] Task 10: Load/save composition

**Effort**: 3-4 days  
**Owner**: Frontend developer

---

## Key Implementation Details

### Database Change (Simple)
```
Add 3 fields to slide_compositions:
  • avatarX (% of slide width)
  • avatarY (% of slide height)
  • avatarWidth (% of slide width)

Reason: Store avatar position so user can drag/resize
```

### API Endpoints (Simple)
```
GET  /api/scenes/{sceneId}/composition
PATCH /api/scenes/{sceneId}/composition
POST /api/modules/{moduleId}/apply-template
```

### Canvas Library
```
Konva.js (React wrapper)
  ✓ Drag elements
  ✓ Resize elements
  ✓ Snap to grid
  ✓ Aspect ratio lock
```

---

## Testing Checklist

```
✓ Avatar placeholder visible (semi-transparent box)
✓ Avatar draggable to any position
✓ Avatar resizable (16:9 aspect ratio maintained)
✓ Title editable (click → type → save)
✓ Bullets editable (add/edit/delete)
✓ Images resizable
✓ Auto-save works (500ms debounce)
✓ No data loss on page refresh
✓ Canvas smooth (60fps)
✓ Works in Chrome, Firefox, Safari
```

---

## Success Definition

| Criteria | Status |
|----------|--------|
| All 10 tasks complete | ✓ Required |
| Code reviews approved | ✓ Required |
| No TypeScript errors | ✓ Required |
| Tests passing | ✓ Required |
| Auto-save working | ✓ Required |
| Avatar drag/resize smooth | ✓ Required |
| Text editing works | ✓ Required |
| Deployed to staging | ✓ Required |

---

## Getting Started (Right Now)

### Step 1: Read (20 minutes)
```
Start: PHASE-4-REVISED-SUMMARY.md
Then: .kiro/specs/phase-4-visual-design/REVISED-REQUIREMENTS.md
End: .kiro/specs/phase-4-visual-design/SPRINT-1-REVISED-TASKS.md
```

### Step 2: Understand Current Code (15 minutes)
```
Open: src/components/workspace/VisualDesignerPanel.jsx
Look for:
  • How templates are defined
  • How scenes are loaded
  • Where to add avatar position
  • Existing Konva.js usage (if any)
```

### Step 3: Create Jira Tickets (1 hour)
```
Create 10 tickets from SPRINT-1-REVISED-TASKS.md
  Task 1: Database schema
  Task 2: API GET
  Task 3: API PATCH
  Task 4: Canvas rendering
  Task 5: Avatar drag/resize
  Task 6: Title editing
  Task 7: Bullet editing
  Task 8: Template UI
  Task 9: Auto-save
  Task 10: Load/save

Assign to:
  Backend: Tasks 1-3
  Frontend: Tasks 4-10
```

### Step 4: Setup Development (1-2 hours)
```
Backend:
  [ ] Prisma schema updated
  [ ] Migration created locally
  [ ] Test database populated

Frontend:
  [ ] Konva.js added to package.json
  [ ] npm install ran
  [ ] VisualDesignerPanel.jsx reviewed
  [ ] Component structure understood
```

### Step 5: Sprint Kickoff (Next Monday)
```
Team meets:
  • Review spec together (30 min)
  • Clarify any questions
  • Assign specific tasks
  • Set up daily standups
  • Define success criteria
```

---

## Common Questions

**Q**: How many slides will there be?  
**A**: Dynamic - whatever the PDF needs (2, 5, 10, etc.). Not fixed to 4.

**Q**: Can I edit avatar position?  
**A**: Yes - drag it anywhere on the slide. Resize it too.

**Q**: What's the text format?  
**A**: User decides - no forced structure. One bullet or ten? Both OK.

**Q**: How does auto-save work?  
**A**: Every 500ms, if there are unsaved changes, they save automatically.

**Q**: What if I refresh the page?  
**A**: All compositions load from database. No data loss.

**Q**: Which Konva.js version?  
**A**: Use latest (react-konva). See package.json for version constraints.

---

## Blockers & Help

**If you're stuck:**

1. Check SPRINT-1-REVISED-TASKS.md (your task description)
2. Look for code examples in the task
3. Ask your sprint lead
4. Check existing VisualDesignerPanel.jsx code
5. Reference Konva.js documentation

**If you find a bug:**

1. Note the exact steps to reproduce
2. Take a screenshot
3. Report in Slack/Jira
4. Include browser + version

---

## Daily Standup Template

```
What did you do yesterday?
  • Completed Task X
  • Started Task Y

What will you do today?
  • Continue Task Y
  • Start Task Z

Any blockers?
  • Need clarification on API response format
  • Konva.js resize handles not working correctly
```

---

## Definition of Done (Per Task)

- [ ] Code written
- [ ] ESLint passing (npm run lint)
- [ ] No TypeScript errors (npm run type-check)
- [ ] Manual testing complete
- [ ] Code reviewed (2+ reviewers)
- [ ] Merged to main branch
- [ ] No regressions in other features

---

## Timeline Expectations

```
Week 1 (Mon-Fri)
  Mon: Database schema + API GET/PATCH ready
  Tue-Wed: Canvas rendering + avatar drag/resize
  Thu: Text editing (title + bullets)
  Fri: Template UI + auto-save setup

Week 2 (Mon-Wed)
  Mon-Tue: Load/save integration
  Wed: Testing, bug fixes, polish

Wed Afternoon
  Sprint demo (show working visual designer)
  Sprint retro (what went well, what to improve)

Thu-Fri (Buffer)
  Final polish, edge cases, production readiness
```

---

## Resources

**Konva.js Docs**: https://konvajs.org/  
**React Konva**: https://github.com/konvajs/react-konva  
**Prisma Docs**: https://www.prisma.io/docs/  
**Azure Functions**: https://docs.microsoft.com/en-us/azure/azure-functions/  

---

## Success Looks Like

```
Friday EOD (Week 2):
  ✓ All 10 tasks complete
  ✓ Code reviews approved
  ✓ Tests passing
  ✓ Demo shows:
    • Template selection working
    • Avatar draggable & resizable
    • Text fully editable
    • Images resizable
    • Auto-save working
    • No data loss on refresh
  ✓ Ready for production deployment
```

---

## Questions?

1. **About the spec**: See REVISED-REQUIREMENTS.md
2. **About tasks**: See SPRINT-1-REVISED-TASKS.md
3. **About UI**: See PHASE-4-VISUAL-GUIDE.md
4. **About status**: See PHASE-4-FINAL-SUMMARY.txt
5. **About implementation**: Ask your tech lead

---

## Next: What To Do Right Now

✅ **Action 1** (5 min): Read PHASE-4-REVISED-SUMMARY.md  
✅ **Action 2** (20 min): Read REVISED-REQUIREMENTS.md  
✅ **Action 3** (30 min): Read SPRINT-1-REVISED-TASKS.md  
✅ **Action 4** (1 hour): Create Jira tickets  
✅ **Action 5** (Schedule): Sprint kickoff meeting  

**Total time to ready**: ~2 hours  
**Start**: Right now! 🚀

---

## Feedback & Updates

If you find:
- **Unclear requirements** → Update REVISED-REQUIREMENTS.md
- **Incorrect estimates** → Note in retrospective
- **Missing info** → Add to this file
- **Better approach** → Share with tech lead

**This spec is a living document** - update it as you learn!

---

**Last Updated**: July 8, 2026  
**Status**: ✅ Ready for Team Distribution  
**Version**: 1.0

**Let's build Phase 4! 🎨✨**
