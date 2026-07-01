# 🚀 Quick Start — Local Development

## Setup (First Time Only)

```bash
# 1. Install dependencies
npm install
cd api && npm install && cd ..

# 2. Build backend
cd api && npm run build && cd ..

# 3. Done! (no further setup needed)
```

---

## Running the App (Every Time)

**You need TWO terminals open at the same time:**

### Terminal 1: Backend API
```bash
cd api
npm start
```

Wait for: `Host started successfully on http://localhost:7071`

### Terminal 2: Frontend UI
```bash
npm run dev
```

Wait for: `Local: http://localhost:5173`

---

## Using the App

1. Open browser: http://localhost:5173
2. Sign in / create account
3. Create project → upload content → Visual Designer
4. Click "Generate with AI" to create slide backgrounds
5. Continue to Video stage to render final video

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 404 on /api/generateSlideImage | Make sure Terminal 1 running `npm start` in api folder |
| Can't find localhost:7071 | Backend not started - check Terminal 1 |
| 400/500 error from API | Check `.env` files have API keys (OPENAI_API_KEY, etc) |
| Image not generating | Check OpenAI API key is valid |
| Port 7071 already in use | Kill existing: `taskkill /F /IM node.exe` |

---

## Architecture

```
┌─────────────────────────────────────┐
│ Browser                             │
│ http://localhost:5173               │
│                                     │
│ Frontend (React + Vite)             │
│ ┌─────────────────────────────────┐ │
│ │ Visual Designer Panel           │ │
│ │ [Generate with AI] button       │ │
│ │ POST /api/generateSlideImage    │ │
│ └──────┬──────────────────────────┘ │
└────────┼──────────────────────────────┘
         │
         │ Vite Proxy
         │ /api → http://localhost:7071
         │
┌────────▼──────────────────────────────┐
│ Azure Functions Local (Port 7071)     │
│                                       │
│ generateSlideImage handler            │
│ • Get scene from database             │
│ • Call OpenAI DALL-E 3 API            │
│ • Download image                      │
│ • Upload to storage                   │
│ • Save URL to database                │
│ • Return { image_url: "..." }         │
└────────┬──────────────────────────────┘
         │
         │ Returns image URL
         │
┌────────▼──────────────────────────────┐
│ Browser shows image on slide          │
└───────────────────────────────────────┘
```

---

## Environment Variables

### Frontend (`.env` - already configured)
```
VITE_API_BASE=/api  # Dev: uses Vite proxy
                    # Prod: calls api.domain.com
```

### Backend (`api/.env` - you may need to add)
```
# REQUIRED for image generation
OPENAI_API_KEY=sk-...

# Optional (if using these features)
HEYGEN_API_KEY=...
ELEVENLABS_API_KEY=...

# Database
DATABASE_URL=file:./prisma/dev.db

# Local development
LOCAL_DEV=true
```

---

## Key Files

**Frontend**:
- `src/components/workspace/VisualDesignerPanel.jsx` — Image panel UI + handler
- `src/services/agents.js` — API client method
- `src/api/apiClient.js` — Axios instance with proxy config
- `vite.config.js` — Proxy configuration

**Backend**:
- `api/src/functions/agents/generateSlideImage.ts` — Handler
- `api/host.json` — Azure Functions config
- `api/.env` — API keys

---

## Monitoring

### Backend Logs (Terminal 1)
```
[2026-07-01T18:37:21.456Z] Executing 'Functions.generateSlideImage' (...)
[2026-07-01T18:37:26.789Z] Executed 'Functions.generateSlideImage' (Succeeded, Duration=5333ms)
```

### Frontend Logs (Browser Console F12)
```
POST /api/generateSlideImage 200
{"success": true, "image_url": "https://..."}
```

---

## Next Steps

1. ✅ Start backend & frontend (2 terminals)
2. ✅ Test image generation in browser
3. ✅ Check logs if anything fails
4. 📖 Read `BACKEND_SETUP.md` for detailed info
5. 🚀 Build app with `npm run build` when ready to deploy

---

**Backend Status**: ✅ Running on http://localhost:7071  
**Frontend Status**: 🟡 Ready to start (run `npm run dev`)  
**Last Updated**: July 1, 2026
