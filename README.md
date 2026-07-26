# ProfAI Studio

AI-powered platform that turns lecture notes, PDFs, and slides into complete presenter-driven video courses — scripts, designed slides, natural voiceover, and a talking avatar.

---

## What It Does

Upload your source material and ProfAI walks it through a staged pipeline. Each stage unlocks once the previous one is complete.

```
1. Library        → Upload PDFs, DOCX, TXT, or URLs (text is extracted once and reused)
2. Scripts        → AI generates modules and scenes; review and approve them
3. Voices         → ElevenLabs turns each part's narration into natural voiceover
4. Visual Design  → Design each slide in the WYSIWYG editor, then use the built-in
                     Video Editing tab (timeline, per-point timing, animation) to
                     preview and approve each scene
5. Final Video    → ffmpeg renders slides + audio into an MP4, with an optional
                     HeyGen talking avatar composited in
⚙  Casting        → Pick the presenter avatar and voice (applies project-wide)
```

Scenes are broken into ordered **parts** (a welcome scene's hook / content / recap, a quiz scene's questions, etc.). Every part carries its own slide design, narration, timing, and approval, so you can work on one part without disturbing the others.

## Tech Stack

| Layer     | Technology |
|-----------|-----------|
| Frontend  | React 18 + Vite 6 + Tailwind CSS v4 + Framer Motion |
| Routing   | React Router v6 |
| Data      | TanStack Query v5 |
| Backend   | Azure Functions v4 (Node.js 20, TypeScript) |
| Database  | Prisma 5 + SQLite (local) |
| AI script | OpenAI-compatible API (configurable model via `OPENAI_MODEL`) |
| Voice     | ElevenLabs TTS |
| Avatar    | HeyGen v2 video API |
| Video     | ffmpeg-static + sharp (SVG→PNG), html-to-image (WYSIWYG slide snapshots) |

## Project Structure

```
ProfAI/
├── src/                        # React frontend
│   ├── pages/ProjectWorkspace.jsx      # Stage rail + pipeline shell
│   └── components/workspace/           # Pipeline stage panels
│       ├── SourcesPanel.jsx            # 1. Library
│       ├── ScriptsPanel.jsx            # 2. Scripts
│       ├── VoicePanel.jsx              # 3. Voices
│       ├── VisualDesignerPanel.jsx     # 4. Visual Design (WYSIWYG editor + snapshot)
│       ├── SceneTimelineEditor.jsx     #    Video Editing timeline (voice bar + timing)
│       ├── VideoPanel.jsx              # 5. Final Video
│       └── CastingSettings.jsx         # ⚙ Casting (avatar + voice)
├── api/                        # Azure Functions backend (TypeScript)
│   ├── src/functions/          # HTTP endpoints (scenes, segments, upload, media…)
│   │   └── agents/             # Pipeline agents: scriptGeneratorAgent, generateTTS,
│   │                           #   generateSceneAsset, generateHeyGenAvatar…
│   ├── src/lib/                # ffmpegVideo, heygenAvatar, slideRenderer, auth, db
│   ├── prisma/schema.prisma    # Project → Module → Scene → SceneSegment
│   └── uploads/                # Generated audio/images/videos (gitignored)
├── docker-compose.yml          # Client-testing deployment
├── Dockerfile.web / nginx.conf # Frontend image
└── api/Dockerfile              # Backend image
```

## Data Model

```
Project ─┬─ Module ─┬─ Scene ─┬─ SceneSegment (one per narrated part)
         │          │         └─ SlideComposition (per-segment slide design)
         └─ defaultAvatarId / defaultVoiceId (Casting)
```

## Getting Started (local development)

Prerequisites: Node.js 20+, Azure Functions Core Tools v4.

```bash
# 1. Install dependencies (frontend + api)
npm install
cd api && npm install

# 2. Configure secrets
#    Edit api/.env — set OPENAI_API_KEY, OPENAI_MODEL, HEYGEN_API_KEY,
#    ELEVENLABS_API_KEY. Keep LOCAL_DEV="true" for local auth bypass.

# 3. Create the database
cd api && npx prisma generate && npx prisma db push

# 4. Run
npm run dev            # frontend + api together via the SWA CLI (from project root)
cd api && npm start    # or run the Functions host on its own
```

## Environment Variables (`api/.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Prisma SQLite path, e.g. `file:./prisma/dev.db` |
| `LOCAL_DEV` | `"true"` = skip SWA auth and use a mock user (local/demo only) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Script generation (any OpenAI-compatible endpoint/model) |
| `ELEVENLABS_API_KEY` | Text-to-speech narration |
| `HEYGEN_API_KEY` | Talking-avatar generation + avatar/voice catalogs |
