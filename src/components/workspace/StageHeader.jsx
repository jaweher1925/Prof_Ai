/**
 * Shared stage header — same card used across every workspace stage
 * (Library, Scripts, Voice, Visual Design, Video, Avatar Studio) so the
 * pipeline reads as one consistent flow instead of each panel inventing its
 * own header treatment.
 *
 * Visual contract (originally introduced in SourcesPanel/ScriptsPanel):
 *   - Icon chip (gradient background) + title + subtitle on the left
 *   - When `complete` is true: green border/glow, a green checkmark, and an
 *     optional "Continue to X" button on the right
 *   - When not complete: neutral border, no checkmark/button
 */
import { CheckCircle, ArrowRight } from 'lucide-react'

export default function StageHeader({
  icon: Icon,
  iconGradient = 'from-indigo-500 to-indigo-600',
  title,
  subtitle,
  complete = false,
  onContinue,
  continueLabel = 'Continue',
}) {
  return (
    <div
      className={`mb-6 rounded-2xl p-6 border-2 transition-all ${
        complete
          ? 'border-green-500/40 bg-gradient-to-br from-blue-900/30 to-blue-900/10 dark:from-blue-900/40 dark:to-blue-900/20'
          : 'border-slate-200 dark:border-white/[0.06] bg-white dark:bg-slate-900/40'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center flex-shrink-0 shadow-lg`}>
          {Icon && <Icon className="w-6 h-6 text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {complete && (
            <>
              <CheckCircle className="w-6 h-6 text-green-500" />
              {onContinue && (
                <button
                  onClick={onContinue}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  {continueLabel}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
