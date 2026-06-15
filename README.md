# ProfAI Studio

AI-powered platform that transforms lecture notes, PDFs, and slides into complete presenter-driven video courses — scripts, voiceover, visuals, and avatar video — in minutes.

---

## What It Does

Upload your source material → ProfAI runs a 5-stage pipeline:

```
1. Library   → Upload PDFs, DOCX, or URLs
2. Script    → OpenAI GPT-4o generates course modules + scene scripts
3. Voice     → ElevenLabs converts scripts to natural voiceover
4. Visual    → DALL-E 3 generates a custom image per scene
5. Video     → HeyGen renders avatar-driven video per scene
⚙ Casting   → Choose your avatar and voice (gear icon, not a stage)
```

---

## Tech Stack

| Layer     | Technology |
|-----------|-----------|
| Frontend  | React 18 + Vite 6 + Tailwind CSS v4 + Framer Motion |
| Routing   | React Router v6 |
| Data      | TanStack Query v5 |
| Backend   | Azure Functions v4 (Node.js 20, TypeScript) |
| Database  | Prisma 5 + SQLite (local) / PostgreSQL (Azure) |
| AI        | OpenAI GPT-4o + DALL-E 3 |
| Voice     | ElevenLabs |
| Video     | HeyGen |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Azure Functions Core Tools v4 (`npm install -g azure-functions-core-tools@4`)

### 1. Clone & install

```bash
git clone <repo-url>
cd ProfAI

# Frontend dependencies
npm install

# Backend dependencies
cd api && npm install
```

### 2. Configure environment

Create `api/.env` (never commit this file — it's in `.gitignore`):

```env
# Database
DATABASE_URL="file:./prisma/dev.db"

# Local dev auth bypass
LOCAL_DEV="true"

# OpenAI (required for script generation + visuals)
OPENAI_API_KEY="sk-proj-..."
OPENAI_MODEL="gpt-4o"

# HeyGen (avatar video)
HEYGEN_API_KEY="sk_V2_..."

# ElevenLabs (voiceover)
ELEVENLABS_API_KEY="sk_..."
```

### 3. Set up the database

```bash
cd api
npx prisma migrate dev
npx prisma generate
```

### 4. Run locally

**Terminal 1 — Backend:**
```bash
cd api
npm start
```

**Terminal 2 — Frontend:**
```bash
cd ..   # back to project root
npm run dev
```

Open: [http://localhost:5173](http://localhost:5173)

---

## Project Structure

```
ProfAI/
├── src/                        # Frontend (React)
│   ├── pages/
│   │   ├── Welcome.jsx         # Landing page
│   │   ├── Dashboard.jsx       # Course list
│   │   ├── ProjectWorkspace.jsx
│   │   ├── Library.jsx
│   │   ├── Director.jsx
│   │   ├── DigitalTwinVault.jsx
│   │   └── Integrations.jsx
│   ├── components/
│   │   ├── layout/             # Sidebar, AppLayout, PageTransition
│   │   ├── workspace/          # Pipeline panels (Script, Voice, Visual, Video)
│   │   ├── projects/           # ProjectCard, NewProjectModal
│   │   └── ui/                 # Button, Card, Badge, Input, Modal, Spinner
│   ├── services/               # API service modules (projects, scripts, media…)
│   └── lib/                    # AuthContext, queryClient, utils
│
└── api/                        # Backend (Azure Functions)
    └── src/
        ├── lib/
        │   ├── llm.ts          # OpenAI client (generateJson / generateText)
        │   ├── db.ts           # Prisma singleton
        │   ├── auth.ts         # SWA auth + LOCAL_DEV bypass
        │   └── storage.ts      # Local disk / Azure Blob uploads
        └── functions/
            ├── projects.ts     # CRUD endpoints
            ├── sourceFiles.ts
            ├── scripts.ts
            ├── scenes.ts
            ├── upload.ts
            ├── media.ts        # HeyGen avatars + ElevenLabs voices
            └── agents/
                ├── librarianAgent.ts       # PDF → OpenAI → modules
                ├── scriptGeneratorAgent.ts # modules → scripts + scenes
                ├── generateTTS.ts          # ElevenLabs TTS per scene
                ├── generateSceneAsset.ts   # DALL-E 3 per scene
                ├── generateHeyGenAvatar.ts # HeyGen video per scene
                ├── pollHeyGenVideo.ts      # Poll HeyGen job status
                ├── heygenWebhook.ts        # HeyGen callback handler
                ├── produceScenes.ts        # Bulk TTS + visual
                └── exportSCORM.ts          # SCORM package export
```

---

## API Endpoints (29 total)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/projects` | List / create projects |
| GET/PATCH/DELETE | `/api/projects/:id` | Get / update / delete project |
| POST | `/api/upload` | Upload source file |
| POST | `/api/sourceFiles` | Create source file record |
| GET/DELETE | `/api/sourceFiles/:id` | Get / delete source file |
| GET/PATCH | `/api/scripts/:id` | Get / update script |
| GET/PATCH/POST | `/api/scenes/:id` | Get / update / approve scenes |
| GET/PATCH | `/api/modules/:id` | Get / update module |
| GET | `/api/media/avatars` | List HeyGen avatars |
| GET | `/api/media/voices` | List ElevenLabs voices |
| POST | `/api/agents/librarian` | Stage 1: PDF → course structure |
| POST | `/api/agents/scriptGenerator` | Stage 2: modules → scripts |
| POST | `/api/agents/generateTTS` | Stage 3: ElevenLabs TTS |
| POST | `/api/agents/generateSceneAsset` | Stage 4: DALL-E 3 visuals |
| POST | `/api/agents/generateHeyGenAvatar` | Stage 5: HeyGen video |
| POST | `/api/agents/produceScenes` | Bulk Stage 3+4 |
| GET | `/api/agents/pollHeyGenVideo` | Poll video job |
| POST | `/api/agents/heygenWebhook` | HeyGen callback |
| POST | `/api/agents/exportSCORM` | Export SCORM package |

---

## Current Status

| Feature | Status |
|---------|--------|
| Backend (29 endpoints) | ✅ Working |
| Database (SQLite) | ✅ Working |
| File uploads | ✅ Working |
| Project CRUD + delete | ✅ Working |
| HeyGen avatar list | ✅ Working |
| ElevenLabs voice list | ✅ Working |
| PDF extraction | ✅ Working |
| OpenAI pipeline | ⚠️ Blocked — `insufficient_quota` (add credits at [platform.openai.com/settings/billing](https://platform.openai.com/settings/billing)) |
| Full end-to-end test | ⏳ Pending OpenAI credits |
| Azure deployment | ⏳ Planned |

---

## Roadmap

- [ ] End-to-end pipeline test once OpenAI credits are added
- [ ] `creativeDuoAgent` — scene-level creative direction
- [ ] `finalRenderEngine` — combine audio + video + visuals
- [ ] `finalEditorAgent` — post-production polish
- [ ] Storyboard panel
- [ ] Azure deployment (Static Web App + PostgreSQL + Blob + AD)

---

## Azure Deployment (4 steps when ready)

1. **Static Web App** — hosts frontend + Azure Functions backend
2. **PostgreSQL** — replace SQLite (`DATABASE_URL` in App Settings)
3. **Blob Storage** — replace local disk uploads (`AZURE_STORAGE_*` in App Settings)
4. **Azure Active Directory** — remove `LOCAL_DEV=true`, enable SWA auth

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Prisma DB connection string |
| `LOCAL_DEV` | Dev only | Set `true` to bypass auth locally |
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `OPENAI_MODEL` | Optional | Default: `gpt-4o` |
| `HEYGEN_API_KEY` | ✅ | HeyGen API key for avatar video |
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs API key for voiceover |
