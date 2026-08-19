import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, FolderKanban, Clapperboard, DollarSign, ShieldCheck, AlertTriangle } from 'lucide-react'
import { adminService } from '@/services/admin'
import AdminStatCard from '@/components/admin/AdminStatCard'
import TiltCard from '@/components/auth/TiltCard'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'

// Same statuses AdminProjects/AdminProjectDetail color-code, plus a
// human-readable label — "journey_approved" repeated five times in a row
// reads as noise; "Journey approved" with a color that actually differs by
// stage reads as information (2026-08-17, "more understandable").
const STATUS = {
  draft:                     { label: 'Draft',            variant: 'default' },
  in_production:             { label: 'In production',    variant: 'blue' },
  pending_director_approval: { label: 'Pending approval',  variant: 'yellow' },
  journey_approved:          { label: 'Journey approved',  variant: 'indigo' },
  completed:                 { label: 'Completed',         variant: 'green' },
}
const statusInfo = (status) => STATUS[status] || { label: status, variant: 'default' }

// "8/17/2026" tells you nothing at a glance — "Today"/"2 days ago" does.
// Falls back to the plain date past a month so this doesn't turn into "47
// days ago" math nobody wants to do either.
function relativeDate(dateStr) {
  const date = new Date(dateStr)
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString()
}

export default function AdminOverview() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: adminService.stats,
    retry: false,
  })

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-400 text-sm">
        Couldn't load admin stats.
      </div>
    )
  }

  const { users, projects, scenes, heygen, recentProjects } = data

  // No max-w cap (2026-08-17, "there is space right keep it for whole
  // page") — was max-w-6xl mx-auto, which left a growing strip of unused
  // space on the right of AdminLayout's content column on anything wider
  // than ~1152px. Data-table/grid pages read fine stretched full width;
  // left as-is on AdminSettings, which is a form and reads worse wide.
  return (
    <div className="px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Overview</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Platform-wide usage across every professor account.</p>
      </motion.div>

      {/* Breakpoints are xl/2xl, not lg/xl — this sits inside AdminLayout's
          256px fixed sidebar, so "viewport is wide enough" (what lg: alone
          checks) isn't the same as "content column is wide enough". At a
          1024-1279px viewport, lg: still forced 4 equal columns into the
          ~700px left after the sidebar, squeezing each card enough that the
          last one's content pushed past the container edge with no visible
          scrollbar — reported 2026-08-17 (screenshot: "EST. HEYGEN SPEND"
          card cut off at the right). */}
      {/* Every card is now clickable (2026-08-17: "wanna see details for
          which user or $ for who") — Professors/Projects/Scenes link to the
          existing list pages; spend has no existing per-user view, so it
          goes to a new breakdown page instead. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-8" style={{ perspective: 1400 }}>
        <AdminStatCard icon={Users} label="Professors" value={users.professors} sublabel={`${users.admins} admin${users.admins === 1 ? '' : 's'}`} accent="indigo" onClick={() => navigate('/admin/users')} />
        <AdminStatCard icon={FolderKanban} label="Projects" value={projects.total} sublabel={`${projects.modules} modules`} accent="blue" onClick={() => navigate('/admin/projects')} />
        <AdminStatCard icon={Clapperboard} label="Scenes rendered" value={scenes.completed} sublabel={`of ${scenes.total} total`} accent="emerald" onClick={() => navigate('/admin/projects')} />
        <AdminStatCard icon={DollarSign} label="Est. HeyGen spend" value={`$${heygen.estimatedCostUsd.toFixed(2)}`} sublabel="all-time, directional" accent="amber" onClick={() => navigate('/admin/spend')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 mt-6">
        {/* HeyGen engine breakdown — ties directly into the cost work: shows
            how many renders landed on the cheap avatar_iii engine vs the
            pricier avatar_iv fallback. */}
        <TiltCard className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          {/* No translateZ wrapper here (2026-08-17) — this card's content is
              a multi-line paragraph, not a compact icon/number like
              AdminStatCard's. Popping a whole tall text block forward with
              translateZ under TiltCard's perspective scales it slightly
              larger than its own layout box (a real, if subtle, rendering
              effect of perspective transforms), so the last line rendered
              visibly below the card's bottom edge ("text out of box",
              screenshot). Keep 3D pop reserved for small elements. */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">HeyGen engine usage</h2>
            </div>
            {(() => {
              const totalRenders = heygen.avatarIIIRenders + heygen.avatarIVRenders
              const cheapPct = totalRenders > 0 ? Math.round((heygen.avatarIIIRenders / totalRenders) * 100) : 0
              return totalRenders > 0 ? (
                // Leads with the one sentence that actually answers "is this
                // costing more than it should" — the two bars below are the
                // detail, not the headline.
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{cheapPct}%</span> of renders used the cheaper engine ({heygen.avatarIIIRenders} of {totalRenders} total).
                </p>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">No avatar renders yet.</p>
              )
            })()}
            <div className="space-y-4">
              <EngineBar label="Avatar III — cheap engine" count={heygen.avatarIIIRenders} total={heygen.avatarIIIRenders + heygen.avatarIVRenders} color="bg-emerald-500" />
              <EngineBar label="Avatar IV — 2-4x pricier fallback" count={heygen.avatarIVRenders} total={heygen.avatarIIIRenders + heygen.avatarIVRenders} color="bg-amber-500" />
            </div>
            {heygen.avatarIVRenders > 0 && (
              <div className="flex items-start gap-2 mt-5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                {/* min-w-0 (2026-08-17, real fix — translateZ removal above
                    didn't do it): flex items default to min-width: auto, so
                    without this the <p> refused to shrink/wrap below its
                    own unbroken content width and pushed past the amber
                    box's (and card's) right edge at narrower viewports —
                    the actual "text out of box" bug. */}
                <p className="text-xs text-amber-700 dark:text-amber-200/80 min-w-0">{heygen.avatarIVRenders} scene(s) rendered on the costlier engine because their avatar doesn't support Avatar III.</p>
              </div>
            )}
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4 leading-relaxed">{heygen.note}</p>
          </div>
        </TiltCard>

        <TiltCard className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          {/* Same translateZ removal as the HeyGen card above — this list's
              length varies with project count, so it's just as exposed to
              the same overflow. */}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-5">Recently updated projects</h2>
            <div className="space-y-1">
              {recentProjects.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No projects yet.</p>}
              {recentProjects.map((p) => {
                const status = statusInfo(p.status)
                return (
                  // Clickable row (2026-08-17) — status/date alone weren't
                  // enough to tell projects apart at a glance; jumping
                  // straight to the project detail page is the fastest way
                  // to actually answer "what is this".
                  <Link key={p.id} to={`/admin/projects/${p.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors group">
                    {/* min-w-0 — same flex-shrink gotcha as the amber box
                        above: `truncate`'s overflow:hidden already gives this
                        an automatic min-width of 0 per spec, but pairing it
                        with an explicit min-w-0 keeps it robust regardless of
                        how tight the card gets, instead of relying on that
                        one spec quirk alone (this row nearly rendered with no
                        visible title at all when the card was mistakenly
                        narrow — see TiltCard.jsx's grid-item fix). */}
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate min-w-0 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{p.title || 'Untitled project'}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 w-20 text-right">{relativeDate(p.updatedAt)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </TiltCard>
      </div>
    </div>
  )
}

function EngineBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>
    </div>
  )
}
