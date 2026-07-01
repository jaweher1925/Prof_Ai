# ProfAI Scaling Roadmap — Next Steps

**Status**: Codebase cleaned ✅ | Ready for infrastructure upgrades

---

## Current Architecture (MVP - Ready for 100-1,000 users)

```
Frontend         Backend              External APIs        Storage
┌────────┐      ┌────────┐           ┌──────────┐         ┌──────┐
│ React  │─────→│Node.js │──────────→│ElevenLabs│         │Local │
│ (Vite) │      │Functions          │(TTS)     │         │Disk  │
└────────┘      │        │           └──────────┘         └──────┘
                │        │
                │        │──────────→┌──────────┐
                │        │           │ HeyGen   │
                │        │           │(Avatar)  │
                │        │           └──────────┘
                └────────┘
                   ↓
                SQLite DB
```

---

## Phase 1: Storage Migration (Critical — DO THIS FIRST)

### Why
- Current: Files saved to `api/uploads/` on single server
- Problem: Disk fills up at ~75 MB per 5-minute video
- Breaking point: 500+ videos (~35 GB)

### What to Change

**File**: `api/src/lib/storage.ts`

```typescript
// BEFORE (local disk):
export async function uploadBuffer(buffer: Buffer, ext: string) {
  await writeFile(join(UPLOAD_DIR, fileName), buffer)
  return `/api/uploads/${fileName}`
}

// AFTER (Azure Blob):
import { BlobServiceClient } from "@azure/storage-blob"

const blobClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
)
const container = blobClient.getContainerClient("uploads")

export async function uploadBuffer(buffer: Buffer, ext: string) {
  const fileName = `${randomUUID()}.${ext}`
  await container.getBlockBlobClient(fileName).upload(buffer, buffer.length)
  return `${AZURE_STORAGE_URL}/uploads/${fileName}`
}
```

### Cost
- **Development**: Free tier (50 GB free/month)
- **Production**: ~$0.02/GB/month
  - 750 GB/month = $15/month
  - With CDN: +$0.08/GB = ~$60/month

### Time Estimate
- 2-3 hours (including testing)

### Steps
1. Create Azure Storage Account (or S3 bucket if using AWS)
2. Add connection string to `api/.env`
3. Update `storage.ts` with blob client code
4. Test with one video generation
5. Delete local `api/uploads/` folder

---

## Phase 2: Job Queue (Important — DO THIS SECOND)

### Why
- Current: FFmpeg rendering blocks the HTTP request (5 min wait)
- Problem: Each video locks up a server slot
- Breaking point: 10+ concurrent users = all slots full

### What to Change

**Pattern**: Sync → Async

```typescript
// BEFORE (synchronous — blocks request):
POST /api/generateVideo
  ↓
FFmpeg renders (5 minutes) ← User waits...
  ↓
Response: 200 OK

// AFTER (asynchronous — returns immediately):
POST /api/generateVideo
  ↓
Add job to queue
  ↓
Response: 200 OK { job_id: "abc123" }
  ↓
Background worker renders (5 minutes)
  ↓
Webhook: "Your video is ready"
```

### Solution Options

#### Option A: Azure Service Bus (Enterprise)
```typescript
import { ServiceBusClient } from "@azure/service-bus"

const client = new ServiceBusClient(connectionString)
const sender = client.createSender("video-render-queue")

// Queue a job
await sender.sendMessages({
  body: { scene_id, user_id, avatar_id, voice_id }
})

// Worker listens on same queue (separate service)
const receiver = client.createReceiver("video-render-queue")
receiver.subscribe({
  processMessage: async (message) => {
    const job = message.body
    await renderVideo(job)
    await message.complete()
  }
})
```
**Cost**: ~$10/month | **Reliability**: ✅✅✅

#### Option B: Redis + Bull (Developer-Friendly)
```typescript
import Queue from "bull"
import redis from "redis"

const redisClient = redis.createClient()
const videoQueue = new Queue("video-render", redisClient)

// Queue a job
await videoQueue.add({ scene_id, user_id, ... })

// Worker processes jobs
videoQueue.process(async (job) => {
  await renderVideo(job.data)
})
```
**Cost**: $5-20/month (redis host) | **Reliability**: ✅✅

#### Option C: AWS SQS + Lambda
```typescript
import { SQS } from "@aws-sdk/client-sqs"

const sqs = new SQS()
await sqs.sendMessage({
  QueueUrl: QUEUE_URL,
  MessageBody: JSON.stringify(jobData)
})
```
**Cost**: ~$5/month | **Reliability**: ✅✅✅

### Time Estimate
- 1-2 days (queue setup + two workers)

### Implementation Steps
1. Choose queue service (recommend: Azure Service Bus or Redis)
2. Modify `/api/generateHeyGenAvatar` to queue instead of render
3. Create separate worker service to process queue
4. Update frontend to poll job status (or use WebSocket)
5. Add webhook support for notifications

---

## Phase 3: Database Upgrade (Easy)

### Why
- Current: SQLite (file-based, single-user)
- Problem: Locks up under concurrent writes
- Breaking point: 20+ concurrent API requests

### What to Change

**File**: `api/prisma/schema.prisma`

```prisma
// BEFORE:
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// AFTER:
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**File**: `api/.env`

```env
# BEFORE:
DATABASE_URL="file:./prisma/dev.db"

# AFTER:
DATABASE_URL="postgresql://user:pass@db.azure.com:5432/profai"
```

### Cost
- Development: Free tier (Azure)
- Production: ~$15/month (Azure PostgreSQL single server)

### Time Estimate
- 1 hour (just config + migrate)

### Steps
1. Create PostgreSQL instance (Azure or AWS RDS)
2. Update `schema.prisma`
3. Update `.env`
4. Run `npx prisma migrate deploy`
5. Done ✅

---

## Phase 4: Rate Limiting & Monitoring

### Why
- Current: No protection against abuse
- Problem: One bad actor can crash the server
- Plus: No visibility into errors

### What to Add

```typescript
// Rate limiting
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                     // max 10 requests per window
  message: "Too many requests"
})

app.post('/api/generateVideo', limiter, handler)

// Error monitoring
import * as Sentry from "@sentry/node"

Sentry.init({ dsn: process.env.SENTRY_DSN })

app.use(Sentry.Handlers.errorHandler())
```

### Cost
- Sentry: Free tier for up to 5K errors/month
- Express-rate-limit: Free (no external service)

### Time Estimate
- 30 minutes (rate limiting)
- 1 hour (Sentry setup)

---

## Phase 5: Scaling Beyond 10,000 Users

At this scale, you'll need:

### Infrastructure
```
┌─ Load Balancer ─┐
│ (distribute     │
│  traffic)       │
└─────────┬───────┘
          │
    ┌─────┴─────┐
    │           │
┌─ API Server 1 ─┐  ┌─ API Server 2 ─┐  ... (N servers)
│ (request       │  │ (request        │
│  handling)     │  │  handling)      │
└────────────────┘  └─────────────────┘

        ↓ (share queue)

┌─────────────────────────────────┐
│ Job Queue (Service Bus / RabbitMQ)
└─────────────────────────────────┘
        ↓
    ┌─ Render Worker 1 ─┐
    │ (FFmpeg render)    │
    └────────────────────┘
    ┌─ Render Worker 2 ─┐
    │ (FFmpeg render)    │
    └────────────────────┘
    ... (scale to N workers)

        ↓ (all share)

┌─────────────────────────────────┐
│ PostgreSQL (replicated, cached)
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Azure Blob Storage + CDN
└─────────────────────────────────┘
```

### Cost
- 5 API servers: $500/month
- 10 render workers: $1,000/month
- PostgreSQL (HA): $300/month
- Service Bus: $50/month
- CDN: $200/month
- Monitoring: $200/month
- **Total**: ~$2,250/month

---

## Quick Timeline to 10,000 Users

| Phase | Timeline | Cost | Users |
|-------|----------|------|-------|
| Phase 1 (Storage) | Week 1 | $15/mo | 100-500 |
| Phase 2 (Queue) | Week 2-3 | +$10/mo | 500-2,000 |
| Phase 3 (DB) | Week 3 | +$15/mo | 2,000-10,000 |
| Phase 4 (Monitoring) | Week 4 | +$50/mo | 10,000+ |
| Phase 5 (Scale) | Ongoing | +$2,250/mo | 100,000+ |

---

## Recommended Order

1. ✅ **Storage** (Azure Blob) — DO FIRST
   - Prevents disk overflow immediately
   - Easiest to implement

2. ✅ **Queue** (Service Bus/Redis) — DO SECOND
   - Prevents request timeouts
   - Enables background processing

3. ✅ **Database** (PostgreSQL) — DO THIRD
   - Enables concurrent users
   - One-hour change

4. ✅ **Monitoring** (Sentry) — DO ANYTIME
   - Helps debug issues quickly

5. ✅ **Multi-server** (Kubernetes) — DO WHEN NEEDED
   - Only needed for 10,000+ users

---

## DO NOT SKIP

- ⚠️ **Storage migration** — Disk will fill in 6-8 weeks with real users
- ⚠️ **Job queue** — Site will become unresponsive at peak hours
- ⚠️ **Rate limiting** — Vulnerable to DDoS/abuse

---

## Current Code Health

✅ **Good for production**:
- Clean architecture (no circular dependencies)
- Modular code (easy to swap implementations)
- Proper error handling
- Cloud-ready design

⚠️ **Needs infrastructure**:
- Single server (no redundancy)
- Local storage (not scalable)
- No job queue (blocks on long operations)
- SQLite (not concurrent)

---

## Next Meeting

When you're ready to scale, prepare:
1. Azure account or AWS account
2. Estimated budget ($500/month)
3. User growth projections
4. Performance targets (SLAs)

Ready to start with Phase 1? 🚀
