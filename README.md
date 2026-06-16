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
| AI        | OpenAI GPT-4o