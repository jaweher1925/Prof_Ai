/**
 * Admin-only endpoints — everything here is gated by requireAdmin() (see
 * api/src/lib/auth.ts), which throws 403 for a signed-in professor and 401
 * for a signed-out request. Mirrors the SwaUser.appRole set at login time
 * (api/src/functions/auth/login.ts) from User.role in the DB.
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
app.http('adminStats', {
  methods: ['GET'], route: 'admin/stats', authLevel: 'anonymous',
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
app.http('adminListUsers', {
  methods: ['GET'], route: 'admin/users', authLevel: 'anonymous',
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
app.http('adminCreateUser', {
  methods: ['POST'], route: 'admin/users', authLevel: 'anonymous',
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
app.http('adminUpdateUser', {
  methods: ['PATCH'], route: 'admin/users/{id}', authLevel: 'anonymous',
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
app.http('adminDeleteUser', {
  methods: ['DELETE'], route: 'admin/users/{id}', authLevel: 'anonymous',
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
app.http('adminPurgeNonAdminUsers', {
  methods: ['POST'], route: 'admin/users/purge-non-admin', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const denied = guard(req); if (denied) return denied
    try {
      const result = await prisma.user.deleteMany({ where: { role: { not: 'admin' } } })
      return { status: 200, jsonBody: { deletedCount: result.count } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// ── GET /api/admin/projects ────────────────────────────────────────────────
// All projects across all professors — projects aren't user-scoped yet (see
// schema.prisma's note on User), so this is currently the same data
// listProjects returns, just admin-gated and with module/scene counts folded
// in for an at-a-glance view.
app.http('adminListProjects', {
  methods: ['GET'], route: 'admin/projects', authLevel: 'anonymous',
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

// ── GET/PATCH /api/admin/settings ──────────────────────────────────────────
// Simple key/value store (AppSetting model) — GET returns everything as a
// flat object, PATCH upserts whichever keys are present in the body.
app.http('adminGetSettings', {
  methods: ['GET'], route: 'admin/settings', authLevel: 'anonymous',
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

app.http('adminUpdateSettings', {
  methods: ['PATCH'], route: 'admin/settings', authLevel: 'anonymous',
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
