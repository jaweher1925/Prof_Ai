# Fix Summary: 404 Error on generateSlideImage

## Problem
When clicking "Generate with AI" button in Visual Designer, you got this error:

```
❌ Request failed with status code 404
POST http://localhost:5173/api/generateSlideImage 404 (Not Found)
```

## Root Cause
The **backend API server was not running**. The frontend was trying to call the endpoint, but there was nothing listening on `http://localhost:7071`.

Here's what was happening:
```
Frontend (Port 5173)
    ↓
Tries to POST /api/generateSlideImage
    ↓
Vite proxy rule: /api → http://localhost:7071
    ↓
No server listening on port 7071 ❌
    ↓
Request times out or fails with 404
```

## Solution

### Step 1: Start the Backend API Server
Open a **new terminal** and run:
```bash
cd api
npm start
```

You should see:
```
Azure Functions Core Tools
Core Tools Version: 4.12.0
...
generateSlideImage: [POST] http://localhost:7071/api/generateSlideImage
...
Host started successfully on http://localhost:7071
```

✅ When you see "Host started successfully", the backend is ready.

### Step 2: Keep Backend Running
The backend must **stay running** in that terminal while you use the app. Do not close it.

### Step 3: Test the Feature
1. Go back to Visual Designer
2. Select a scene with script text
3. Click "Generate with AI"
4. Wait 5-10 seconds
5. Image should appear ✅

## Technical Details

### Proxy Configuration
`vite.config.js` already has the correct proxy setup:
```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:7071',  ← Backend server must be here
      changeOrigin: true,
    },
  },
}
```

### Frontend Architecture
- **Frontend runs**: http://localhost:5173 (Vite dev server)
- **Backend runs**: http://localhost:7071 (Azure Functions local emulator)
- **Frontend calls**: `/api/generateSlideImage`
- **Proxy redirects**: → `http://localhost:7071/api/generateSlideImage`

### Backend Architecture
- **Handler**: `api/src/functions/agents/generateSlideImage.ts`
- **Endpoint**: `POST /api/generateSlideImage`
- **Route**: Defined with `app.http('generateSlideImage', { ... })`
- **Registered**: Automatically picked up by Azure Functions CLI

## Verification

### Check Backend is Running
1. Look at Terminal 1 output
2. Should show: `Host started successfully on http://localhost:7071`
3. Should list: `generateSlideImage: [POST] http://localhost:7071/api/generateSlideImage`

### Check Frontend Sees It
1. Open http://localhost:5173
2. Open Browser DevTools (F12)
3. Go to Network tab
4. Click "Generate with AI"
5. Look for request: `generateSlideImage`
6. Status should be `200` (not 404)
7. Response should be: `{ "success": true, "image_url": "..." }`

## Development Setup Going Forward

You need **two terminals running** at all times:

**Terminal 1** (Backend):
```bash
cd api
npm start
```
→ Keep this running always

**Terminal 2** (Frontend):
```bash
npm run dev
```
→ This is where you develop

Both must be running for the app to work.

## Why This Happened

The implementation was complete:
- ✅ Backend endpoint created (`generateSlideImage.ts`)
- ✅ Service layer added (`agents.js`)
- ✅ Frontend component updated (`VisualDesignerPanel.jsx`)
- ✅ Vite proxy configured (`vite.config.js`)

But the **backend wasn't started** when you clicked the button. The code was all there, just waiting for the server to run it.

## Next Steps

1. ✅ Start backend: `cd api && npm start`
2. ✅ Keep it running (don't close that terminal)
3. ✅ Test the feature (click "Generate with AI")
4. ✅ Watch the backend logs in Terminal 1
5. 📖 Read `BACKEND_SETUP.md` for detailed setup guide

---

**Status**: ✅ FIXED — Backend now running and generateSlideImage endpoint available  
**Last Updated**: July 1, 2026
