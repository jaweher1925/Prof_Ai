import React from 'react'

/**
 * ProfAI Studio brand mark — a mountain/"A" triangle with a diagonal cut
 * and a graduation-cap badge in the top-right corner.
 *
 * `toneClassName` controls the indigo strokes/fills, `cutoutClassName`
 * controls the negative-space fill (i.e. whatever sits "behind" the mark —
 * white on light surfaces, slate-900 on dark surfaces). Override
 * `cutoutClassName` when placing the mark on a surface that doesn't follow
 * the light/dark toggle (e.g. the permanently-dark sidebar).
 */
export default function Logo({
  className = 'w-8 h-8',
  toneClassName = 'text-indigo-800 dark:text-indigo-400',
  cutoutClassName = 'fill-white dark:fill-slate-900',
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Triangle / mountain body */}
      <path
        className={toneClassName}
        fill="currentColor"
        d="M50 8 L92.5 86a4.6 4.6 0 0 1-4.1 6.7H11.6a4.6 4.6 0 0 1-4.1-6.7L50 8z"
      />

      {/* Diagonal slash cut through the peak (left band + right "pen" band) */}
      <path className={cutoutClassName} d="M58 26 L33 92.7H21L47 20z" />
      <path className={cutoutClassName} d="M50 8 L63.5 31 51 45 36.5 31z" />

      {/* Rivet dots sitting on the bands */}
      <circle cx="50.5" cy="45" r="3.1" className={toneClassName} fill="currentColor" />
      <circle cx="38.5" cy="70.5" r="3.1" className={toneClassName} fill="currentColor" />

      {/* Connecting stem from the peak up to the badge */}
      <line x1="62" y1="29" x2="73" y2="15" className={toneClassName} stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="67.5" cy="22" r="2.3" className={toneClassName} fill="currentColor" />

      {/* Graduation cap (mortarboard) */}
      <rect x="61" y="8.5" width="19" height="3.8" rx="1.2" className={toneClassName} fill="currentColor" />
      <path className={toneClassName} fill="currentColor" d="M70.5 12.3 L79 16 70.5 19.7 62 16z" />
      <line x1="79" y1="16" x2="79" y2="22" className={toneClassName} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="79" cy="22.8" r="1.5" className={toneClassName} fill="currentColor" />
    </svg>
  )
}
