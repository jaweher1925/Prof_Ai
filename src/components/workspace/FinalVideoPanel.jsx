/**
 * Stage 5 — Final Video.
 *
 * All per-scene design + timeline editing lives in Visual Design now. This step
 * is only ASSEMBLY: the modules in order, shown as a filmstrip, with a visible,
 * animated TRANSITION between each pair of modules. Click a transition to change
 * it — the little preview loops so you can actually SEE the effect. Choices are
 * saved per project and applied when the full course video is compiled.
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { modulesService } from '@/services/modules'
import { Film, Download, CheckCircle } from 'lucide-react'
import StageHeader from '@/components/workspace/StageHeader'
import Spinner from '@/components/ui/Spinner'

const TRANSITIONS = [
  { id: 'none',     label: 'Cut',      anim: 'pa-tr-cut' },
  { id: 'fade',     label: 'Fade',     anim: 'pa-tr-fade' },
  { id: 'dissolve', label: 'Dissolve', anim: 'pa-tr-dissolve' },
  { id: 'slide',    label: 'Slide',    anim: 'pa-tr-slide' },
]

// Little looping demo: an emerald panel entering over an indigo one, using the
// chosen transition's animation — so you can see what it does.
function TransitionDemo({ animName, size = 'w-16 h-10' }) {
  return (
    <div className={`relative ${size} rounded-md overflow-hidden border border-slate-200 dark:border-white/10 shadow-sm flex-shrink-0`}>
      <div className="absolute inset-0 bg-indigo-500" />
      <div className="absolute inset-0 bg-emerald-500" style={{ animation: `${animName} 2.6s ease-in-out infinite` }} />
    </div>
  )
}

export default function FinalVideoPanel({ project }) {
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['modules', project?.id],
    queryFn: () => modulesService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const storeKey = `pa-module-transitions-${project?.id}`
  const [transitions, setTransitions] = useState({})
  useEffect(() => {
    try { setTransitions(JSON.parse(localStorage.getItem(storeKey) || '{}')) } catch { setTransitions({}) }
  }, [storeKey])
  const setTransition = (gapId, val) => {
    setTransitions(prev => {
      const next = { ...prev, [gapId]: val }
      try { localStorage.setItem(storeKey, JSON.stringify(next)) } catch {}
      return next
    })
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  const ordered = [...modules].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))

  return (
    <div className="p-6 w-full max-w-6xl mx-auto pa-page-enter space-y-5">
      <StageHeader
        icon={Film}
        title="Final Video"
        subtitle="Your modules in order — set and preview the transition between each"
      />

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Design and per-scene editing happen in Visual Design. Here you just choose how the course flows from one module to the next.
      </p>

      {ordered.length === 0 ? (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-sm text-slate-500 dark:text-slate-400 text-center">
          No modules yet — generate scripts first.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm p-4 overflow-x-auto">
          {/* ── Filmstrip: module block → transition → module block → … ── */}
          <div className="flex items-stretch gap-0 min-w-min">
            {ordered.map((mod, i) => {
              const ready = !!mod.fullVideoUrl
              const transId = transitions[mod.id] || 'fade'
              const transDef = TRANSITIONS.find(t => t.id === transId) || TRANSITIONS[1]
              return (
                <div key={mod.id} className="flex items-stretch">
                  {/* Module block */}
                  <div className="w-44 flex-shrink-0 flex flex-col rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-slate-800/40">
                    <div className="relative aspect-video bg-gradient-to-br from-indigo-500/80 to-indigo-700/80 flex items-center justify-center">
                      {ready && mod.fullVideoUrl
                        ? <video src={mod.fullVideoUrl} muted preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                        : <span className="text-white/90 text-2xl font-bold">{i + 1}</span>}
                      <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-md bg-black/40 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                    </div>
                    <div className="p-2.5 flex-1 flex flex-col gap-1">
                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate" title={mod.title}>{mod.title || `Module ${i + 1}`}</p>
                      <p className={`text-[10px] flex items-center gap-1 ${ready ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        {ready ? <><CheckCircle className="w-3 h-3" /> Ready</> : 'Not compiled'}
                      </p>
                      {ready && (
                        <a href={mod.fullVideoUrl} download target="_blank" rel="noopener noreferrer"
                          className="mt-auto inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                          <Download className="w-3 h-3" /> Download
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Transition between this module and the next */}
                  {i < ordered.length - 1 && (
                    <div className="w-32 flex-shrink-0 flex flex-col items-center justify-center gap-2 px-2">
                      <TransitionDemo animName={transDef.anim} />
                      <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">{transDef.label}</p>
                      <div className="flex flex-wrap justify-center gap-1">
                        {TRANSITIONS.map(t => (
                          <button key={t.id}
                            onClick={() => setTransition(mod.id, t.id)}
                            title={`Preview: ${t.label}`}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-medium border transition-all ${
                              transId === t.id
                                ? 'bg-indigo-600 text-white border-transparent'
                                : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        The transition preview loops so you can see the effect. Choices are saved with the project and applied when the full course video is compiled.
      </p>
    </div>
  )
}
