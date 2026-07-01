# Backend Setup & Development Guide

## 🚀 Quick Start (Local Development)

You need **two terminals** to run the app locally:

### Terminal 1: Backend API (Azure Functions)
```bash
cd api
npm start
```

**Expected output**:
```
Azure Functions Core Tools
Core Tools Version: 4.12.0
Function Runtime Version: 4.1048.200

Functions loaded...
generateSlideImage: [POST] http://localhost:7071/api/generateSlideImage
...
Workers initialized...
Host started successfully on http://localhost:7071
```

✅ When you see "Host started successfully", the backend is ready.

### Terminal 2: Frontend (React + Vite)
```bash
npm run dev
```

**Expected output**:
```
VITE v6.4.3 ready in 1234 ms

➜  Local:   http://localhost:5173/
➜  press h to show help
```

✅ When you see the local URL, the frontend is ready.

---

## 🔗 How They Connect

The frontend (port 5173) automatically proxies API requests to the backend (port 7071):

```
Browser Request
    ↓
http://localhost:5173/api/generateSlideImage
    ↓
Vite Dev Server (Port 5173)
    ↓
Proxy Rule: /api → http://localhost:7071
    ↓
Azure Functions Local Emulator (Port 7071)
    ↓
generateSlideImage endpoint
    ↓
DALL-E API call
    ↓
Response back through proxy
```

**Vite Proxy Config**: `vite.config.js` (already set up)
```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:7071',
      changeOrigin: true,
    },
  },
}
```

---

## ⚠️ Common Issues

### ❌ Error: "Request failed with status code 404"
**Cause**: Backend is not running  
**Fix**: Start the backend in Terminal 1 with `npm start` from the `api` folder

### ❌ Error: "No backend — run npm start in the api folder"
**Cause**: Frontend tried calling `/api` but got HTML instead of JSON  
**Fix**: Make sure `func start` is running (check Terminal 1 output)

### ❌ Error: "Cannot find module 'generateSlideImage'"
**Cause**: Frontend/backend out of sync  
**Fix**: 
```bash
cd api
npm run build  # Recompile TypeScript to JavaScript
npm start      # Restart backend
```

### ❌ Backend says "port 7071 already in use"
**Cause**: Another `func start` process is still running  
**Fix**: 
```bash
# Kill the existing process
# Windows:
taskkill /F /IM node.exe
# macOS/Linux:
killall node
# Then restart: npm start
```

---

## 📝 Environment Variables

### Frontend (.env - already set up)
```
VITE_API_BASE=/api  # Relative URL for proxying in dev
```

### Backend (.env in api folder)
```
# Required for generateSlideImage
OPENAI_API_KEY=sk-...

# Other services (if needed)
HEYGEN_API_KEY=...
ELEVENLABS_API_KEY=...

# Database
DATABASE_URL=file:./prisma/dev.db

# Local development
LOCAL_DEV=true
```

---

## 🔧 Development Workflow

### To test the new image generation feature:

1. **Start both servers** (as shown above)
2. **Open browser**: http://localhost:5173
3. **Navigate**: Dashboard → any project → Visual Designer
4. **Select a scene** with script text
5. **Click "Generate with AI"**
6. **Wait 5-10 seconds** for DALL-E to generate the image
7. **Check browser console** for any errors
8. **Check Terminal 1** (backend) for execution logs

### Watch the logs:
**Terminal 1** (Backend):
```
[2026-07-01T18:37:16.123Z] Executing 'Functions.generateSlideImage' (...)
[2026-07-01T18:37:21.456Z] Executed 'Functions.generateSlideImage' (Succeeded, Duration=5333ms)
```

**Terminal 2** (Frontend):
```
GET /api/generateSlideImage 200 (5s)
```

---

## 🛠️ Building & Testing

### Build Frontend
```bash
npm run build
# Output: dist/ folder ready for deployment
```

### Build Backend
```bash
cd api
npm run build
# Output: dist/ folder with compiled functions
```

### Test Backend Endpoint Directly
```bash
# From any terminal, test the API with curl:
curl -X POST http://localhost:7071/api/generateSlideImage \
  -H "Content-Type: application/json" \
  -d '{"scene_id": "your-scene-id-here"}'

# Should return:
# {"success": true, "image_url": "https://..."}
```

---

## 📊 API Endpoints Reference

### All available endpoints (listed when backend starts):
```
generateSlideImage: [POST] http://localhost:7071/api/generateSlideImage
generateTTS: [POST] http://localhost:7071/api/generateTTS
generateHeyGenAvatar: [POST] http://localhost:7071/api/generateHeyGenAvatar
generateSceneAsset: [POST] http://localhost:7071/api/generateSceneAsset
... and 30+ more
```

### generateSlideImage endpoint details:
```
Method: POST
URL: http://localhost:7071/api/generateSlideImage
Content-Type: application/json

Request:
{
  "scene_id": "uuid-of-scene"
}

Response (Success):
{
  "success": true,
  "image_url": "https://storage.example.com/image-123.png"
}

Response (Error):
{
  "status": 500,
  "error": "Image generation failed: API rate limit exceeded"
}
```

---

## 🚀 Production Deployment

In production, the backend runs on **Azure Functions**, not locally.

### Deployment checklist:
```bash
# 1. Build both frontend and backend
npm run build
cd api && npm run build && cd ..

# 2. Deploy to Azure
# Frontend → Azure Static Web Apps
# Backend → Azure Functions

# 3. Set environment variables in Azure
# Portal → Function App → Configuration → Application settings
OPENAI_API_KEY=sk-...
HEYGEN_API_KEY=...
DATABASE_URL=Server=...;Database=...;

# 4. No proxy needed in production
# Frontend calls https://api.profai.app/generateSlideImage directly
```

---

## 📚 Related Files

- **Frontend API Client**: `src/api/apiClient.js`
- **Frontend Service**: `src/services/agents.js`
- **Frontend Component**: `src/components/workspace/VisualDesignerPanel.jsx`
- **Backend Handler**: `api/src/functions/agents/generateSlideImage.ts`
- **Vite Config** (proxy): `vite.config.js`
- **Azure Functions Config**: `api/host.json`

---

## ❓ Troubleshooting Checklist

Before asking for help, check:
- [ ] Backend terminal showing "Host started successfully"
- [ ] Frontend terminal showing local URL
- [ ] Browser console open (F12)
- [ ] Backend logs visible in Terminal 1
- [ ] OPENAI_API_KEY set in api/.env
- [ ] Network tab shows `/api/generateSlideImage` request
- [ ] Response shows 200 or 5xx status (not 404)

---

**Status**: ✅ Backend running at http://localhost:7071  
**Last Updated**: July 1, 2026
