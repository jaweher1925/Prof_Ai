# ProfAI Studio

AI-powered platform that transforms lecture notes, PDFs, and slides into complete presenter-driven video courses — scripts, voiceover, designed slides, and a talking avatar .

---

## What It Does

Upload your source material and ProfAI walks it through a staged pipeline:

```
1. Library    → Upload PDFs, DOCX, TXT, or URLs (text is extracted once and reused)
2. Script     → AI generates modules
3. Visual     → Design each slide in the WYSIWYG Visual Designer
4. Voice      → ElevenLabs converts each segment's narration to natural voiceover
5. Video      → ffmpeg renders slides + audio into MP4, with a HeyGen talking avatar 
⚙  Casting    → Pick the presenter avatar and voice (applies project-wide)
```

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
| Video     | ffmpeg-static + sharp (SVG→PNG), html-to-image (slide snapshots) |

## Project Structure

```
ProfAI/
├── src/                        # React frontend
│   └── components/workspace/   # Pipeline stage panels
│       ├── VisualDesignerPanel.jsx   # WYSIWYG slide editor + snapshot capture
│       ├── StoryboardPanel.jsx
│       └── ScenePreviewPlayer.jsx
├── api/                        # Azure Functions backend (TypeScript)
│   ├── src/functions/          # HTTP endpoints (scenes, segments, upload, media…)
│   │   └── agents/             # Pipeline agents: scriptGeneratorAgent, generateTTS,
│   │                           #   generateSceneAsset, generateHeyGenAvatar…
│   ├── src/lib/                # ffmpegVideo, heygenAvatar, slideRenderer, auth, db
│   ├── src/scripts/            # One-off maintenance scripts
│   ├── prisma/schema.prisma    # Project → Module → Scene → SceneSegment
│   └── uploads/                # Generated audio/images/videos (gitignored)
├── docker-compose.yml          # Client-testing deployment (see DOCKER.md)
├── Dockerfile.web / nginx.conf # Frontend image
└── api/Dockerfile              # Backend image
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

# 4. Run (from the project root)
npm run dev       # frontend + api together via SWA CLI
cd api && npm start
```



## Environment Variables (`api/.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Prisma SQLite path, e.g. `file:./prisma/dev.db` |
| `LOCAL_DEV` | `"true"` = skip SWA auth and use a mock user (local/demo only) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Script generation (any OpenAI-compatible endpoint/model) |
| `ELEVENLABS_API_KEY` | Text-to-speech narration |
| `HEYGEN_API_KEY` | Talking-avatar generation + avatar/voice catalogs |


