# ProfAI — New Project Kickoff Prompt

Paste everything below into a fresh Claude conversation (new folder/project) to pick up where this one left off.

---

## What this project is

ProfAI is an AI course-video generation studio. A user uploads source material (PDF/text), and the app runs it through a pipeline that produces finished narrated/avatar videos, organized into modules and scenes.

**Pipeline stages (in order, most expensive last):**
1. **Library** — upload source files (PDF/TXT), text gets extracted.
2. **Script** — an LLM generates a course structure: modules → scenes, each with narration script + slide content + learning objectives. Includes a "welcome" scene (hook + objectives) and a "quiz" scene per module.
3. **Voice** — ElevenLabs TTS converts each scene's narration to audio, segment by segment.
4. **Visual Designer** — generates/edits animated slide backgrounds and text overlays per scene (per-module theme/palette, Ken Burns pan/zoom, page-transition/text-reveal animations, crossfades).
5. **Avatar Studio** — HeyGen-style settings panel: pick an avatar (grid), tune voice (stability/similarity/style/speed sliders), choose avatar framing (normal/circle/closeUp) and background. Saved as project-level defaults.
6. **Video** — HeyGen generates the talking-head avatar clip (or a voice-only render via local ffmpeg if no avatar), then ffmpeg composites the avatar into a reserved bottom-right box over the slide video, per scene. Scenes get merged into one full module video.

There's also a quick "Casting Settings" popup (gear icon) that's a fast subset of Avatar Studio (just avatar + voice pick), shown once as a gate before entering the Voice stage.

## Current architecture (what existed in the old project)

- **Frontend:** React 18 + Vite + Tailwind v4, React Router, TanStack Query for data fetching, react-hook-form + zod for forms, framer-motion for animation, lucide-react icons, axios for HTTP, sonner for toasts.
- **Backend (being replaced):** Azure Functions (Node/TypeScript) + Prisma ORM + SQLite (`api/prisma/schema.prisma`, `api/prisma/dev.db`). JSON-as-string columns used for structured data (SQLite has no native JSON type) — fields like `hiltGates`, `textCues`, `quizData`, `elements`, `sections`, `avatarBackground`, `voiceSettings` all store JSON strings parsed/stringified in app code.
- **External APIs:** OpenAI/Gemini (course + script generation), ElevenLabs (TTS), HeyGen (avatar video generation, `https://api.heygen.com`).

## Why we're starting a new project

A backend developer is joining who will build the real backend in **Python** (framework/DB not finalized yet) with his own database. I (the user) am taking over **frontend-only** work going forward. The goal of the new project is:

1. Rebuild/restructure the frontend so it is **backend-agnostic** — a single, well-defined API client/services layer (clear function signatures, typed request/response shapes) that doesn't assume Azure Functions/Prisma conventions.
2. Produce a **written API contract** (REST endpoints, request/response JSON shapes, status codes) that the Python developer can implement against, independent of what framework/DB he picks.
3. Translate the existing Prisma data model into a **backend-agnostic data model doc** (entities, fields, relationships) he can turn into SQLAlchemy/Django/Pydantic models for whatever database he chooses.
4. Optionally, stub/mock the API layer so frontend development can continue before his backend exists.

## Data model to translate (from Prisma)

Entities: **Project** (title, status, default avatar/voice, avatar style/background JSON, voice settings JSON) → has many **Module** (title, objective, order, full video URL) → has many **Scene** (order, sceneKind: welcome/content/quiz, script content, slide content, visual prompt/asset URL, text animation type, text cues JSON, quiz data JSON, presenter position/coordinates, TTS audio URL, avatar video URL, status, duration) → has many **SceneSegment** (order, segmentType: hook/content/interaction/recap/question/answer, narration text, slide title, elements JSON, image prompt, animation, TTS audio URL, duration). Project also has **Script** (versioned course outline: learning objectives JSON, sections JSON) and **SourceFile** (uploaded file metadata + extracted text).

## Known gotchas to carry forward

- HeyGen's servers fetch audio/image over the public internet — they can't reach `localhost`. Local dev needs a tunnel (ngrok) with `PUBLIC_BASE_URL` set, or use the "voice only" (no avatar) render path which runs entirely through local ffmpeg.
- Avatar overlay compositing is done **locally with ffmpeg**, not via HeyGen's offset/scale params — those aren't reliably documented and produced off-frame avatars in testing. HeyGen renders a plain full-frame clip; the app crops/composites it into the slide video afterward.
- A recurring environment issue in the old project: a Windows-sync-mount occasionally truncated files edited via tools, silently corrupting them mid-file. Always verify file integrity (line counts, clean EOF) after edits in synced environments.

## Outstanding/recent items from the old project's backlog

- Auto-generate welcome + objective scenes per module (was in progress).
- General backlog: rename "My Courses" → "Dashboard", remove duplicate "Director" nav item, keep script generation capped (4–5 videos, max 6 scenes each, ~6 min per video), Visual Designer polish (text spacing, avatar placeholder visibility, hover crop/resize).

## What I want from you in this new project

Help me restructure/rebuild the frontend (same React/Vite/Tailwind stack, can carry over UI components) with:
- A clean `services/` or `api/` layer with one obvious place per resource (projects, modules, scenes, scripts, source files, agents/generation actions) and explicit typed shapes.
- A written API contract doc (markdown or OpenAPI) covering every endpoint the frontend needs, in framework-agnostic REST/JSON terms.
- A translated data-model doc from the entities above.
- Everything organized so a Python backend developer can implement against the contract without needing to read frontend code.
