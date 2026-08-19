/**
 * Admin-only endpoints — everything here is gated by requireAdmin() (see
 * api/src/lib/auth.ts), which throws 403 for a signed-in professor and 401
 * for a signed-out request. Mirrors the SwaUser.appRole set at login time
 * (api/src/functions/auth/login.ts) from User.role in the DB.
 *
 * Route paths here are `console-api/...` and function NAMES are `console*`
 * (consoleStats, consoleListUsers, ...) — NEITHER may start with the literal
 * string "admin" (2026-08-17). Azure Functions reserves `/admin/...` for its
 * own built-in host management API (host status, invoking a function by
 * name via /admin/functions/{functionName}, etc.), and the conflict check
 * for that reservation is a PREFIX match, not an exact-segment match —
 * confirmed the hard way, in this order:
 *   1. route: 'admin/stats', name 'adminStats' → rejected.
 *   2. route: 'admin-api/stats' (renamed route only, kept name 'adminStats')
 *      → STILL rejected — proved the route path alone wasn't it.
 *   3. name 'consoleStats' (renamed name, kept route 'admin-api/stats')
 *      → STILL rejected — proved the function name alone wasn't it either.
 *   4. route: 'console-api/stats' (renamed BOTH, this is what fixed it) —
 *      'admin-api' still starts with "admin" and still collided; only a
 *      route that doesn't start with "admin" anywhere passes.
 * Every failure showed identically as "The specified route conflicts with
 * one or more built in routes" in the func host's own startup log — never a
 * TypeScript error, never anything visible from the frontend beyond a plain
 * 404, which is what made this so slow to pin down. Don't reintroduce an
 * `admin`-prefixed route OR function name here.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/db'
import { requireAdmin } from '../../lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const userSelect = { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } as const

const forbidden = (msg = 'Admin access required') => ({ status: 403, jsonBody: { error: msg } } as HttpResponseInit)
const unauth    = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const badReq    = (msg: string) => ({ status: 400, jsonBody: { error: msg } } as HttpResponseInit)
const notFound  = (msg: string) => ({ status: 404, jsonBody: { error: msg } } as HttpResponseInit)
const err500    = (e: any) => ({ status: 500, jsonBody: { error: e?.message || 'Internal error' } } as HttpResponseInit)

/** Wraps requireAdmin()'s thrown {status,message} into an HTTP response so
 *  every handler below doesn't need to repeat the same try/catch shape. */
function guard(req: HttpRequest): HttpResponseInit | null {
  try {
    requireAdmin(req)
    return null
  } catch (e: any) {
    if (e?.status === 401) return unauth()
    if (e?.status === 403) return forbidden(e?.message)
    throw e
  }
}

// HeyGen pricing (developers.heygen.com/docs/pricing) varies by avatar type
// within each engine — we don't persist avatar type per render, so these are
// representative rates (720p/1080p, mid-tier of each engine's range) for a
// directional cost estimate, not an exact bill. Labelled as such in the API
// response so the frontend doesn't present it as authoritative.
const ENGINE_RATE_PER_SEC = { avatar_iii: 0.025, avatar_iv: 0.06 } as const

// ── GET /api/admin/stats ──────────────────────────────────────────────────
app.http('consoleStats', {
  methods: ['GET'], route: 'console-api/stats', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const [userCount, professorCount, adminCount, projectCount, moduleCount, sceneCount, completedScenes] =
        await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { role: 'professor' } }),
          prisma.user.count({ where: { role: 'admin' } }),
          prisma.project.count(),
          prisma.module.count(),
          prisma.scene.count(),
          prisma.scene.count({ where: { status: 'completed' } }),
        ])

      // Cost/engine breakdown — only scenes that have actually gone through
      // HeyGen have avatarEngineUsed set (older scenes rendered before this
      // field existed, or voice-only scenes, are null and excluded).
      const renderedScenes = await prisma.scene.findMany({
        where: { avatarEngineUsed: { not: null } },
        select: { avatarEngineUsed: true, durationSeconds: true },
      })
      let avatarIIICount = 0, avatarIVCount = 0, estimatedCostUsd = 0
      for (const s of renderedScenes) {
        const seconds = s.durationSeconds || 0
        if (s.avatarEngineUsed === 'avatar_iv') {
          avatarIVCount++
          estimatedCostUsd += seconds * ENGINE_RATE_PER_SEC.avatar_iv
        } else if (s.avatarEngineUsed === 'avatar_iii') {
          avatarIIICount++
          estimatedCostUsd += seconds * ENGINE_RATE_PER_SEC.avatar_iii
        }
      }

      const recentProjects = await prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, status: true, updatedAt: true },
      })

      return {
        status: 200,
        jsonBody: {
          users: { total: userCount, professors: professorCount, admins: adminCount },
          projects: { total: projectCount, modules: moduleCount },
          scenes: { total: sceneCount, completed: completedScenes },
          heygen: {
            avatarIIIRenders: avatarIIICount,
            avatarIVRenders: avatarIVCount,
            estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
            note: 'Directional estimate — HeyGen bills by avatar type (Digital Twin/Studio/Photo) within each engine, which isn\'t persisted per-render, so actual cost may vary. Check your HeyGen wallet balance for exact spend.',
          },
          recentProjects,
        },
      }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// ── GET /api/admin/users ──────────────────────────────────────────────────
app.http('consoleListUsers', {
  methods: ['GET'], route: 'console-api/users', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: userSelect })
      return { status: 200, jsonBody: users }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// ── POST /api/admin/users ─────────────────────────────────────────────────
// Admin-created account — same shape as auth/signup.ts, but doesn't log the
// creator in as the new user (no Set-Cookie) and lets the admin set the role
// up front instead of always defaulting to "professor".
app.http('consoleCreateUser', {
  methods: ['POST'], route: 'console-api/users', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string; name?: string; role?: string }
      const email = (body.email || '').trim().toLowerCase()
      const password = body.password || ''
      const name = (body.name || '').trim() || null
      const role = body.role === 'admin' ? 'admin' : 'professor'

      if (!email || !EMAIL_RE.test(email)) return badReq('Enter a valid email address')
      if (password.length < 8) return badReq('Password must be at least 8 characters')

      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) return badReq('An account with this email already exists')

      const passwordHash = await bcrypt.hash(password, 10)
      const user = await prisma.user.create({ data: { email, passwordHash, name, role }, select: userSelect })
      return { status: 201, jsonBody: user }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// PATCH /api/admin/users/{id} — role, name, email, and/or a password reset.
// Any field omitted from the body is left untouched.
app.http('consoleUpdateUser', {
  methods: ['PATCH'], route: 'console-api/users/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const body = (await req.json().catch(() => ({}))) as { role?: string; name?: string; email?: string; password?: string }
      if (body.role !== undefined && body.role !== 'admin' && body.role !== 'professor') {
        return badReq('role must be "admin" or "professor"')
      }
      const admin = requireAdmin(req)
      // Guard against an admin locking themselves out by demoting their own
      // only-admin account — cheap check, not a full "last admin" audit, but
      // covers the common accidental-self-demote case.
      if (body.role === 'professor' && req.params.id === admin.userId) {
        const adminCount = await prisma.user.count({ where: { role: 'admin' } })
        if (adminCount <= 1) return badReq('Cannot demote the only remaining admin account')
      }

      const data: Record<string, any> = {}
      if (body.role !== undefined) data.role = body.role
      if (body.name !== undefined) data.name = (body.name || '').trim() || null
      if (body.email !== undefined) {
        const email = (body.email || '').trim().toLowerCase()
        if (!email || !EMAIL_RE.test(email)) return badReq('Enter a valid email address')
        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing && existing.id !== req.params.id) return badReq('Another account already uses this email')
        data.email = email
      }
      if (body.password !== undefined && body.password !== '') {
        if (body.password.length < 8) return badReq('Password must be at least 8 characters')
        data.passwordHash = await bcrypt.hash(body.password, 10)
      }

      const user = await prisma.user.update({ where: { id: req.params.id }, data, select: userSelect })
      return { status: 200, jsonBody: user }
    } catch (e: any) {
      if (e?.code === 'P2025') return notFound('User not found')
      ctx.error(e); return err500(e)
    }
  },
})

// DELETE /api/admin/users/{id} — permanent. User has no FK-linked data
// (projects aren't user-scoped yet, see schema.prisma's note on User), so
// this is a plain row delete, no cascade to worry about.
app.http('consoleDeleteUser', {
  methods: ['DELETE'], route: 'console-api/users/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const admin = requireAdmin(req)
      if (req.params.id === admin.userId) return badReq('Cannot delete your own account from here — sign in as another admin to remove this one')
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } })
      if (!target) return notFound('User not found')
      if (target.role === 'admin') {
        const adminCount = await prisma.user.count({ where: { role: 'admin' } })
        if (adminCount <= 1) return badReq('Cannot delete the only remaining admin account')
      }
      await prisma.user.delete({ where: { id: req.params.id } })
      return { status: 204 }
    } catch (e: any) {
      if (e?.code === 'P2025') return notFound('User not found')
      ctx.error(e); return err500(e)
    }
  },
})

// POST /api/admin/users/purge-non-admin — bulk cleanup ("delete all users
// except admin", requested 2026-08-13). Admin accounts are excluded by the
// where clause itself, so there's no last-admin edge case to guard here.
app.http('consolePurgeNonAdminUsers', {
  methods: ['POST'], route: 'console-api/users/purge-non-admin', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const result = await prisma.user.deleteMany({ where: { role: { not: 'admin' } } })
      return { status: 200, jsonBody: { deletedCount: result.count } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// ── GET /api/admin/users/{id} ─────────────────────────────────────────────
// Full profile for one user — account info, every project they own, and a
// HeyGen usage/cost breakdown scoped to their own scenes. Requested
// 2026-08-17 ("see details each user") alongside full project management.
app.http('consoleGetUser', {
  methods: ['GET'], route: 'console-api/users/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { ...userSelect, emailVerified: true },
      })
      if (!user) return notFound('User not found')

      // Project.userId is a plain column, not a Prisma relation (see
      // schema.prisma's note on Project — existing rows predate ownership,
      // and a real FK would reject writes from the LOCAL_DEV mock user), so
      // this is a manual filter rather than a `user.projects` include.
      const projects = await prisma.project.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          modules: {
            include: { scenes: { select: { status: true, avatarEngineUsed: true, durationSeconds: true } } },
          },
        },
      })

      let scenesTotal = 0, scenesCompleted = 0
      let avatarIIIRenders = 0, avatarIVRenders = 0, estimatedCostUsd = 0
      for (const p of projects) {
        for (const m of p.modules) {
          for (const s of m.scenes) {
            scenesTotal++
            if (s.status === 'completed') scenesCompleted++
            const seconds = s.durationSeconds || 0
            if (s.avatarEngineUsed === 'avatar_iv') { avatarIVRenders++; estimatedCostUsd += seconds * ENGINE_RATE_PER_SEC.avatar_iv }
            else if (s.avatarEngineUsed === 'avatar_iii') { avatarIIIRenders++; estimatedCostUsd += seconds * ENGINE_RATE_PER_SEC.avatar_iii }
          }
        }
      }

      return {
        status: 200,
        jsonBody: {
          user,
          projects: projects.map((p) => ({
            id: p.id, title: p.title, status: p.status, updatedAt: p.updatedAt,
            moduleCount: p.modules.length,
            sceneCount: p.modules.reduce((n, m) => n + m.scenes.length, 0),
          })),
          usage: { scenesTotal, scenesCompleted, avatarIIIRenders, avatarIVRenders, estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100 },
        },
      }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// ── GET /api/admin/spend-by-user ──────────────────────────────────────────
// Answers "$ for who" (2026-08-17) — the Overview stat cards were just raw
// totals with no way to see which professor they came from. Same per-scene
// cost math as consoleStats/consoleGetUser, just grouped by every user at
// once instead of the whole app or one person.
app.http('consoleSpendByUser', {
  methods: ['GET'], route: 'console-api/spend-by-user', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true } })
      const projects = await prisma.project.findMany({
        include: { modules: { include: { scenes: { select: { status: true, avatarEngineUsed: true, durationSeconds: true } } } } },
      })

      // Project.userId is a plain column, not a Prisma relation (see
      // schema.prisma's note on Project), so group manually rather than an
      // `include: { projects: true }` on the user query.
      const projectsByUser = new Map<string, typeof projects>()
      const unassignedProjects: typeof projects = []
      for (const p of projects) {
        if (!p.userId) { unassignedProjects.push(p); continue }
        if (!projectsByUser.has(p.userId)) projectsByUser.set(p.userId, [])
        projectsByUser.get(p.userId)!.push(p)
      }

      function summarize(ownedProjects: typeof projects) {
        let scenesTotal = 0, scenesCompleted = 0, avatarIIIRenders = 0, avatarIVRenders = 0, estimatedCostUsd = 0
        for (const p of ownedProjects) {
          for (const m of p.modules) {
            for (const s of m.scenes) {
              scenesTotal++
              if (s.status === 'completed') scenesCompleted++
              const seconds = s.durationSeconds || 0
              if (s.avatarEngineUsed === 'avatar_iv') { avatarIVRenders++; estimatedCostUsd += seconds * ENGINE_RATE_PER_SEC.avatar_iv }
              else if (s.avatarEngineUsed === 'avatar_iii') { avatarIIIRenders++; estimatedCostUsd += seconds * ENGINE_RATE_PER_SEC.avatar_iii }
            }
          }
        }
        return { scenesTotal, scenesCompleted, avatarIIIRenders, avatarIVRenders, estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100 }
      }

      const rows = users
        .map((u) => {
          const ownedProjects = projectsByUser.get(u.id) || []
          return { id: u.id, email: u.email, name: u.name, role: u.role, projectCount: ownedProjects.length, ...summarize(ownedProjects) }
        })
        .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)

      const unassigned = { projectCount: unassignedProjects.length, ...summarize(unassignedProjects) }

      return { status: 200, jsonBody: { users: rows, unassigned } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// ── GET /api/admin/projects ────────────────────────────────────────────────
// All projects across all professors — projects aren't user-scoped yet (see
// schema.prisma's note on User), so this is currently the same data
// listProjects returns, just admin-gated and with module/scene counts folded
// in for an at-a-glance view.
app.http('consoleListProjects', {
  methods: ['GET'], route: 'console-api/projects', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const projects = await prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { modules: true, scripts: true } } },
      })
      return { status: 200, jsonBody: projects }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// ── GET /api/admin/projects/{id} ──────────────────────────────────────────
// Full detail for one project — every module and scene underneath it, plus
// the owning user (looked up manually, same reason as consoleGetUser above).
app.http('consoleGetProject', {
  methods: ['GET'], route: 'console-api/projects/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: {
          modules: {
            orderBy: { orderIndex: 'asc' },
            include: {
              scenes: {
                orderBy: { orderIndex: 'asc' },
                select: { id: true, orderIndex: true, sceneKind: true, status: true, durationSeconds: true, avatarEngineUsed: true },
              },
            },
          },
        },
      })
      if (!project) return notFound('Project not found')

      const owner = project.userId
        ? await prisma.user.findUnique({ where: { id: project.userId }, select: { id: true, email: true, name: true } })
        : null

      return { status: 200, jsonBody: { ...project, owner } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// PATCH /api/admin/projects/{id} — title and/or status only. Ownership
// reassignment isn't exposed here — out of scope for what was asked
// (2026-08-17: "just manage" projects, alongside the existing user CRUD).
app.http('consoleUpdateProject', {
  methods: ['PATCH'], route: 'console-api/projects/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const body = (await req.json().catch(() => ({}))) as { title?: string; status?: string }
      const data: Record<string, any> = {}
      if (body.title !== undefined) {
        const title = (body.title || '').trim()
        if (!title) return badReq('Title cannot be empty')
        data.title = title
      }
      if (body.status !== undefined) {
        if (!body.status.trim()) return badReq('Status cannot be empty')
        data.status = body.status
      }
      if (!Object.keys(data).length) return badReq('Nothing to update')

      const project = await prisma.project.update({ where: { id: req.params.id }, data })
      return { status: 200, jsonBody: project }
    } catch (e: any) {
      if (e?.code === 'P2025') return notFound('Project not found')
      ctx.error(e); return err500(e)
    }
  },
})

// DELETE /api/admin/projects/{id} — permanent. Cascades to modules, scenes,
// scene segments, slide compositions, scripts, and source files via the
// onDelete: Cascade relations already declared on those models
// (schema.prisma) — no manual cleanup needed here.
app.http('consoleDeleteProject', {
  methods: ['DELETE'], route: 'console-api/projects/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      await prisma.project.delete({ where: { id: req.params.id } })
      return { status: 204 }
    } catch (e: any) {
      if (e?.code === 'P2025') return notFound('Project not found')
      ctx.error(e); return err500(e)
    }
  },
})

// ── GET/PATCH /api/admin/settings ──────────────────────────────────────────
// Simple key/value store (AppSetting model) — GET returns everything as a
// flat object, PATCH upserts whichever keys are present in the body.
app.http('consoleGetSettings', {
  methods: ['GET'], route: 'console-api/settings', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const rows = await prisma.appSetting.findMany()
      const settings: Record<string, any> = {}
      for (const row of rows) {
        try { settings[row.key] = JSON.parse(row.value) } catch { settings[row.key] = row.value }
      }
      return { status: 200, jsonBody: settings }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

app.http('consoleUpdateSettings', {
  methods: ['PATCH'], route: 'console-api/settings', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, any>
      const keys = Object.keys(body)
      if (!keys.length) return badReq('No settings provided')
      await Promise.all(keys.map((key) =>
        prisma.appSetting.upsert({
          where: { key },
          update: { value: JSON.stringify(body[key]) },
          create: { key, value: JSON.stringify(body[key]) },
        })
      ))
      const rows = await prisma.appSetting.findMany()
      const settings: Record<string, any> = {}
      for (const row of rows) {
        try { settings[row.key] = JSON.parse(row.value) } catch { settings[row.key] = row.value }
      }
      return { status: 200, jsonBody: settings }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
