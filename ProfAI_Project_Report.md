# ProfAI Studio — Full Project Report
**Grand Valley State University · AI-Powered Educational Video Platform**

---

## 1. What Is ProfAI Studio?

ProfAI Studio is a web application that lets university professors turn their course materials (PDFs, slides, documents) into polished, AI-narrated educational video courses — without any video editing skills. A professor uploads their source material, and the system generates scripts, voice audio, animated presentation slides, and avatar-based videos automatically.

The project was started from a base scaffold (referred to as "base44") and has been built up across two major sessions.

---

## 2. The Starting Point — Base44 Scaffold

The initial scaffold came with:
- A basic React + Vite frontend boilerplate
- An Azure Functions Node/TypeScript backend shell
- Prisma ORM connected to a SQLite database (local dev) / PostgreSQL (production)
- Placeholder page routes with no real functionality

Everything that makes ProfAI Studio work — the AI pipeline, the UI, the database schema, the backend agents — was built on top of this scaffold.

---

## 3. Technology Stack

### Frontend
| Technology | Version / Notes | Why chosen |
|---|---|---|
| **React** | v18 | Component model fits a complex multi-stage editor |
| **Vite** | Latest | Fast HMR dev server; handles JSX + TailwindCSS out of the box |
| **TailwindCSS** | v3 | Utility-first; lets us build dark-themed UI rapidly without CSS files |
| **Framer Motion** | Latest | Page transitions, spring animations, stagger effects for a polished feel |
| **@tanstack/react-query** | v5 | Server state management — automatic caching, polling, refetch on focus |
| **React Router DOM** | v6 | SPA routing (`/`, `/workspace?project_id=...`) |
| **Lucide React** | v0.383.0 | Consistent icon set (400+ icons) used throughout the UI |
| **Recharts** | Latest | Available for data visualisation (not yet used in production) |
| **Axios** | Latest | HTTP client for API calls |
| **Zod + React Hook Form** | Latest | Form validation |
| **Sonner** | Latest | Toast notifications |

### Backend
| Technology | Notes | Why chosen |
|---|---|---|
| **Azure Functions v4** | Node.js runtime, TypeScript | Serverless; scales to zero in dev, easy Azure deployment; HTTP-triggered endpoints map cleanly to the agent pipeline |
| **TypeScript** | Strict mode | Catches type errors at compile time — critical when piping AI JSON between agents |
| **Prisma ORM** | v5 | Type-safe DB queries; schema migrations; single `schema.prisma` works for both SQLite (local) and PostgreSQL (cloud) |
| **SQLite** | Local dev | Zero-config; data lives in `api/prisma/dev.db` — no Docker needed to run locally |
| **PostgreSQL** | Production target | Prisma switches with one line in `schema.prisma` |

### AI / Third-Party Services
| Service | What it does | Why chosen |
|---|---|---|
| **Groq API** (`llama-3.3-70b-versatile`) | All text generation: scripts, storyboards, slide content, AI rewrites | OpenAI-compatible API — the `openai` npm package works with just a `baseURL` swap. Groq's free tier is fast (200+ tokens/sec) and the 70B model produces high-quality educational content |
| **ElevenLabs** | Text-to-speech for scene narration | Best-in-class voice cloning; supports SSML, stability/style/speed controls, speaker boost |
| **HeyGen** | AI avatar video generation | Generates talking-head videos from audio + a chosen presenter avatar (integrated, not yet fully tested) |

### Key Configuration Files
```
api/.env               — API keys (Groq/ElevenLabs/HeyGen), never committed
api/local.settings.json — Azure Functions local settings (AzureWebJobsStorage)
```

---

## 4. Database Schema

Five main models managed by Prisma:

```
Project    — top-level container (title, status, defaultVoiceId, ...)
  └── Module     — one video = one module (title, objective, orderIndex)
        └── Scene      — one scene per ~45 seconds (scriptContent, slideDeckContent,
                         ttsAudioUrl, visualAssetUrl, presenterPosition, ...)
  └── Script     — AI-generated script record (sections JSON, status, learningObjectives)
  └── SourceFile — uploaded PDFs/slides (filename, extractedText, storageUrl)
```

**Project status flow:**
`draft` → `ingesting_sources` → `pending_director_approval` → `journey_approved` → `in_production` → `completed`

---

## 5. The Pipeline — How a Video Gets Made

```
STAGE 1 — Library
  Professor uploads source files (PDF, PPTX, DOCX, URLs)
  → Librarian Agent reads files and creates 5 module topics

STAGE 2 — Script
  Script Generator Agent writes for each module:
  • 8 scenes × ~45 seconds = 6-minute video
  • scriptContent   = what the PRESENTER SAYS (conversational speech)
  • slideDeckContent = what STUDENTS READ on the slide (title, insight, bullets)
  These are kept deliberately different — slide content is study-friendly,
  voice content is natural speech

STAGE 3 — Voice
  ElevenLabs TTS converts each scene's scriptContent to audio
  Controls: Stability · Clarity · Style Exaggeration · Speed · Speaker Boost
  Professor can edit the text before generating

STAGE 4 — Visual Designer  ← (formerly two stages: Storyboard + Visual)
  Live animated slide preview for each scene
  9 layouts: Intro · Bullets · 2-Column · Icon Grid · Stats · Chart · Definition · Quote · Summary
  Clean geometric gradient backgrounds (no stock photos)
  Figma-style drag-to-reposition: Logo · Title · Subtitle · Content block · Image
  GVSU logo on every slide (white on dark / blue badge on light)
  AI rewrite buttons (Shorter / Simpler / Expand) + Reset to original
  Image upload (URL or local file → base64) with shape picker
  "Generate Slide Image" → backend renders 1920×1080 PNG

STAGE 5 — Video
  HeyGen generates avatar-narrated video per scene
  Avatar + voice selected in Casting Settings (gear icon)
```

---

## 6. Backend Agents (Azure Functions)

Each agent is a separate HTTP-triggered Azure Function:

| Function | Route | What it does |
|---|---|---|
| `librarianAgent` | `POST /api/librarianAgent` | Reads uploaded source files, creates 5 module topics using Groq |
| `scriptGeneratorAgent` | `POST /api/scriptGeneratorAgent` | Generates 8-scene scripts per module — two outputs per scene (voice + slide) |
| `storyboardAgent` | `POST /api/storyboardAgent` | (Legacy) Enriches scenes with visual prompts and motion styles |
| `generateSceneAsset` | `POST /api/generateSceneAsset` | Renders SVG slide → PNG using Sharp; saves to `api/uploads/` |
| `generateTTS` | `POST /api/generateTTS` | Calls ElevenLabs with voice settings; saves audio URL to scene |
| `generateHeyGenAvatar` | `POST /api/generateHeyGenAvatar` | Submits avatar video render job to HeyGen |
| `pollHeyGenVideo` | `POST /api/pollHeyGenVideo` | Polls HeyGen for completed video URL |
| `heygenWebhook` | `POST /api/heygenWebhook` | Receives HeyGen webhook when video is done |
| `produceScenes` | `POST /api/produceScenes` | Orchestrates full video production run |
| `scenes` | `PATCH /api/scenes/:id` | Updates individual scene (positions, slide content, audio URL, ...) |
| `scenes/ai-rewrite` | `POST /api/scenes/:id/ai-rewrite` | AI rewrites slide bullets (shorter/simpler/expand) |

**How Groq is wired in:**
```typescript
// api/src/lib/llm.ts
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,  // ← this is the Groq API key
  baseURL: 'https://api.groq.com/openai/v1',
})
const MODEL = process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile'
```
The variable is named `OPENAI_API_KEY` in `.env` because Groq exposes an OpenAI-compatible API — no custom SDK needed.

---

## 7. Session 1 — What Was Built Before This Conversation

The handoff from Session 1 described these completed features:

**UI / UX**
- Welcome landing page (`/`) with animated hero → click → flash transition → Dashboard
- Dashboard with stat cards (Total / Drafts / In Progress / Completed), time-of-day greeting
- Sidebar: ProfAI branding, graduation cap icon, professor-friendly nav labels
- Project cards: pipeline progress bar (Script→Voice→Visual→Video), delete with confirm
- Framer Motion animations throughout (page transitions, stagger, spring hover)
- Browser tab title: "ProfAI Studio"

**6-Stage Pipeline (before Session 2)**
`Library → Script → Voice → Storyboard → Visual → Video`

**Script Stage**
- Generates exactly 5 videos × 6 minutes each (8 scenes per video, ~45s each)
- Each scene produces `scriptContent` (voice) and `slideDeckContent` (slide)
- Inline scene editing (click any scene text to edit)
- "Continue to Voice →" button when all scripts approved

**Voice Stage**
- Voice Settings panel: Stability, Clarity, Style Exaggeration, Speed sliders + Speaker Boost
- SSML Cheat Sheet (collapsible reference — later removed per user request)
- Edit text before generating audio; play/stop audio preview

**Storyboard Stage** (separate from Visual)
- Backend `storyboardAgent.ts` generates per scene: `visual_prompt`, `motion_style`, `text_cues`
- Dark card grid UI; motion style clickable buttons

**Visual Stage** (Gamma-style slides, separate from Storyboard)
- Two-column layout: scene list left, editor right
- 5 layout templates: Intro / Bullets / Definition / Quote / Summary
- 5 themes: Navy / Ocean / Academic / Light / Corporate
- AI rewrite: Shorter / Simpler / More detail
- SVG slide renderer (1920×1080) → PNG via Sharp

---

## 8. Session 2 — Everything Built in This Conversation

### 8.1 Merged Storyboard + Visual → "Visual Designer"

**Why:** Two separate stages (Storyboard and Visual) were redundant — the storyboard generated visual data that the Visual stage then used. Professors found it confusing to navigate both. They were collapsed into one unified **Visual Designer** stage.

**Pipeline changed from 6 stages to 5:**
```
Before: Library → Script → Voice → Storyboard → Visual → Video
After:  Library → Script → Voice → Visual Designer → Video
```

Files changed:
- `src/pages/ProjectWorkspace.jsx` — removed `storyboard` stage, added `visual-designer`
- `src/components/workspace/VoicePanel.jsx` — "Continue" button now goes to `visual-designer`

---

### 8.2 Tightened Voice vs Slide Separation in Script Generator

**Why:** The AI was sometimes generating near-identical text for voice script and slide content. A professor reading a slide that says exactly what they're about to say defeats the purpose.

**Change:** The prompt in `scriptGeneratorAgent.ts` was rewritten to be explicit:
- `scriptContent` = natural conversational speech, first-person narrator voice, no bullet points, 80-120 words
- `slideDeckContent` = structured educational reference (title, subtitle, bullets) that students can study independently, with no narration phrasing

File changed: `api/src/functions/agents/scriptGeneratorAgent.ts`

---

### 8.3 ScriptsPanel — Dual-Column Scene Display

**Why:** Professors needed to see both outputs side-by-side to verify they were different before approving.

**Change:** Each scene card now shows two panels:
- 🎙 **Voice Script** (left) — editable inline, what the presenter says
- 📋 **Slide Content** (right) — read-only preview (title, insight, bullets), with note "Edit slides in Visual Designer →"

File changed: `src/components/workspace/ScriptsPanel.jsx`

---

### 8.4 VisualDesignerPanel — Complete Rewrite (New File)

This is the largest piece of new work. `src/components/workspace/VisualDesignerPanel.jsx` replaces both `StoryboardPanel.jsx` and `VisualPanel.jsx`.

**Architecture:**
- Left column (w-72): Scene list grouped by video, with mini slide thumbnail previews
- Right column (flex-1): Live animated slide editor + controls

**9 Slide Layouts (up from 5):**

| Layout | What it shows |
|---|---|
| **Intro** | Large title + topic icon centered, accent underline |
| **Bullets** | Title + accent bar + staggered animated bullet list |
| **2-Column** | Split panel — concept left, details/examples right |
| **Icon Grid** | Each bullet becomes a card with auto-selected topic icon |
| **Stats** | 2-4 large number cards (extracts real numbers from bullet text) |
| **Chart** | SVG bar chart — bar heights derived from numbers in bullets; no fake data shown if no numbers exist |
| **Definition** | Term → definition box → examples list |
| **Quote** | Large highlighted quote from first bullet |
| **Summary** | Animated checklist with tick circles |

**Live Animated Preview (pure CSS, no backend):**
- CSS `@keyframes` injected once into `<head>` on mount
- Title slides in from left, subtitle fades up, bullets stagger in
- 6 background motion styles applied to the geometric layer: Slow Zoom, Zoom Out, Pan Left, Pan Right, Ken Burns, Static
- ▷ "Replay" button re-triggers all animations

**Clean Geometric Backgrounds:**
- No stock photos / Picsum images
- Each theme uses a diagonal gradient + inline SVG layer:
  - Large decorative circles (top-right, bottom-left)
  - Dot grid (top-right quadrant)
  - Left accent bar
  - Bottom accent line

**5 Themes:**
| Theme | Background | Accent | Text |
|---|---|---|---|
| Light (default) | `#F8FAFC → #EEF2FF` | `#6366F1` | `#1E293B` |
| Navy | `#020C1B → #05183A` | `#3B82F6` | `#E2E8F0` |
| Ocean | `#041A2E → #062638` | `#06B6D4` | `#E2E8F0` |
| Academic | `#061410 → #0C2218` | `#10B981` | `#E2E8F0` |
| Corp | `#0D1117 → #161B22` | `#F59E0B` | `#E2E8F0` |

**Light theme is the default** for all new scenes.

**Figma-Style Drag-to-Reposition:**

Every element on the slide is an independently draggable layer:
- **GVSU Logo** — top-right by default
- **Title** — main slide heading
- **Key Insight** — subtitle / one-liner
- **Content Block** — bullets / chart / grid / stats
- **Image** — user-uploaded photo or figure

How dragging works:
1. `onMouseDown` on a layer starts the drag — captures `startX/Y` and `rect`
2. `mousemove` on `document` updates `positions[key]` as percentage offsets
3. `mouseup` on `document` ends drag, calls `saveContent()`
4. Positions stored as `{x: %, y: %}` in `slideDeckContent` JSON → DB

Null safety: `startDrag` has an early return if `positions[key]` is undefined. Positions are always merged with `DEFAULT_POSITIONS` on init so no key can be missing.

**GVSU Logo Integration:**

Uses `/gvsu-logo.png` (the actual circular GV emblem PNG):
- **Dark slides:** `filter: grayscale(1) brightness(20)` boosts mark to white; `mix-blend-mode: screen` removes the black background
- **Light slide:** White mark inside a GVSU-blue (`#0032A0`) rounded badge; `filter: brightness(0) invert(1)` makes the PNG white inside

Eye/Hide toggle per scene. Logo is a draggable layer.

**Image / Figure Feature:**

Collapsible panel in the editor:
- Paste any URL (web image, diagram, chart screenshot)
- Upload from computer → FileReader → base64 data URL stored in DB
- Width slider (15–70% of slide)
- Shape: Sharp / Rounded / Circle
- Draggable layer on the slide

**AI Content Rewrite:**

Three buttons with carefully worded prompts:
- **Shorter** — "Make more concise, keep full educational meaning, 10-18 words each. Do NOT reduce to 2-3 words."
- **Simpler** — "Plain language, same meaning, similar length, no jargon."
- **Expand** — "Add concrete example or detail, 15-25 words each."
- **↺ Reset** — restores to original AI-generated bullets (stored in `useRef` on mount)

**Smart data extraction (Chart & Stats):**
- Parses actual numbers from bullet text (e.g. "72% pass rate" → bar height = 72%)
- If no numbers found: bars render at equal height with no value labels; Stats cards show topic icons instead of fabricated percentages — **no fake data ever shown**

**Error Boundary:**

React class component `SlideEditorBoundary` wraps `SceneEditor`. Any render crash shows a friendly "Slide editor error — Retry" card instead of the full app going blank.

---

### 8.5 VoicePanel Cleanup

**Removed:** SSML Cheat Sheet collapsible section (7 XML tag examples). Professors don't need it — ElevenLabs handles prosody well without manual SSML tagging.

**Kept:** Voice Settings slider panel (Stability, Clarity, Style Exaggeration, Speed, Speaker Boost).

---

### 8.6 Public Assets Cleanup

**Before:** 5 files including binary images mis-named as `.svg`
**After:** 3 files only:
```
public/
  favicon.svg       — app favicon
  gvsu-logo.png     — GVSU circular GV emblem (used for slide logo)
  icons.svg         — UI icon sprite
```
Deleted: `11.svg`, `GVSU.svg`, `gvsu-logo.svg` (all were binary images with wrong extensions that caused Vite to serve them as `image/svg+xml`, breaking browser parsing).

---

### 8.7 Azure Functions Storage Fix

`api/local.settings.json` had `"AzureWebJobsStorage": ""` (empty string). The Azure Functions host requires a valid storage value for its health check infrastructure, so it was reporting `Unhealthy`. Changed to `"UseDevelopmentStorage=true"` which tells the host to use the local Azurite storage emulator when running `npm start`.

---

## 9. Key Design Decisions

### Why Groq instead of OpenAI?
- Groq's API is OpenAI-compatible — zero code change, just swap `baseURL`
- Free tier, very fast inference (200+ tokens/sec) — script generation for 5 modules with 8 scenes each completes in seconds
- `llama-3.3-70b-versatile` produces high-quality structured JSON reliably

### Why Azure Functions?
- Each pipeline stage is a separate HTTP endpoint — easy to test individually with curl/Postman
- Serverless scales to zero locally (no always-on server cost)
- Natural fit for Azure deployment (GVSU is a Microsoft partner institution)
- TypeScript support is first-class

### Why SQLite for local dev?
- Zero setup — runs immediately after `npm install`
- Prisma makes switching to PostgreSQL a one-line change in `schema.prisma`

### Why keep storyboard + visual separate in the backend but merged in the UI?
- The `storyboardAgent.ts` function still exists on the backend (generates `visual_prompt`, `motion_style`, `text_cues`)
- The frontend no longer exposes a separate Storyboard stage — everything happens in Visual Designer
- This keeps the backend modular (can call storyboard agent independently) while the UI is simpler

### Why pure CSS animations instead of a backend slide renderer?
- The live preview in Visual Designer uses CSS `@keyframes` — instant feedback as you type
- No API calls needed to see the slide update
- The "Generate Slide Image" button still calls the backend SVG→PNG renderer for the actual 1920×1080 production asset
- Best of both: interactive preview + high-quality output

### Why inline SVG for the slide backgrounds instead of images?
- No HTTP requests; renders at any resolution
- Colors update instantly when theme changes
- No Picsum/stock photo dependency

---

## 10. How to Run Locally

```bash
# Terminal 1 — Backend API
cd C:\Users\GIGABYTE\Desktop\ProfAI\api
npm start
# → Azure Functions runs on http://localhost:7071

# Terminal 2 — Frontend
cd C:\Users\GIGABYTE\Desktop\ProfAI
npm run dev
# → Vite dev server on http://localhost:5173
```

**Prerequisites:**
- Node.js 18+
- `api/.env` with: `OPENAI_API_KEY` (Groq key), `OPENAI_MODEL`, `ELEVENLABS_API_KEY`, `HEYGEN_API_KEY`
- Azurite running (for Azure Functions storage health check): `npx azurite` or VS Code Azurite extension

---

## 11. Current Status

| Stage | Status |
|---|---|
| Library (upload sources) | ✅ Working |
| Script generation (Groq) | ✅ Working |
| Voice generation (ElevenLabs) | ✅ Working |
| Visual Designer (slides + drag editor) | ✅ Working |
| Video generation (HeyGen) | ⚠️ Code complete, not fully tested |
| Azure deployment | ⏳ Pending |
| Remotion integration (rough edit) | ⏳ Installed, not wired |
| SCORM export | ⏳ `exportSCORM.ts` exists, not UI-connected |

---

## 12. File Structure Overview

```
ProfAI/
├── src/
│   ├── pages/
│   │   ├── Welcome.jsx            — Animated landing page
│   │   ├── Dashboard.jsx          — Project list + stats
│   │   └── ProjectWorkspace.jsx   — 5-stage pipeline shell
│   ├── components/
│   │   ├── layout/
│   │   │   └── Sidebar.jsx        — ProfAI branding + nav
│   │   ├── projects/
│   │   │   └── ProjectCard.jsx    — Pipeline progress bar + delete
│   │   └── workspace/
│   │       ├── SourcesPanel.jsx       — Stage 1: file upload
│   │       ├── ScriptsPanel.jsx       — Stage 2: voice + slide dual view
│   │       ├── VoicePanel.jsx         — Stage 3: ElevenLabs TTS
│   │       ├── VisualDesignerPanel.jsx— Stage 4: 9 layouts, drag editor
│   │       ├── VideoPanel.jsx         — Stage 5: HeyGen avatar
│   │       ├── CastingSettings.jsx    — Avatar + voice selection
│   │       └── ScenePreviewPlayer.jsx — Scene preview component
│   └── services/
│       ├── agents.js   — API calls to backend agents
│       ├── scripts.js  — Script CRUD
│       └── projects.js — Project CRUD
├── public/
│   ├── favicon.svg
│   ├── gvsu-logo.png   — GVSU circular GV emblem
│   └── icons.svg
└── api/
    ├── src/
    │   ├── lib/
    │   │   ├── llm.ts   — Groq wrapper (generateJson)
    │   │   ├── db.ts    — Prisma singleton
    │   │   └── auth.ts  — User auth helper
    │   └── functions/
    │       ├── agents/
    │       │   ├── scriptGeneratorAgent.ts  — 5 modules × 8 scenes
    │       │   ├── librarianAgent.ts        — Source analysis
    │       │   ├── generateTTS.ts           — ElevenLabs voice
    │       │   ├── generateSceneAsset.ts    — SVG→PNG renderer
    │       │   ├── generateHeyGenAvatar.ts  — HeyGen video
    │       │   ├── storyboardAgent.ts       — Visual prompts
    │       │   └── exportSCORM.ts           — SCORM package
    │       └── routes/
    │           ├── scenes.ts    — Scene PATCH endpoint
    │           ├── modules.ts   — Module + scene queries
    │           └── projects.ts  — Project CRUD
    └── prisma/
        └── schema.prisma  — Project/Module/Scene/Script/SourceFile models
```

---

*Report generated June 2026 — ProfAI Studio v2.0*
