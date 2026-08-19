import React from 'react'

/**
 * Glass card — static now, no cursor-follow tilt (removed 2026-08-17: "don't
 * do the hover animation... keep it 3d simple". The old rotateX/rotateY
 * mouse-tracking could render cards at a steep, disorienting skew — visible
 * on the admin project/user detail pages, screenshot-reported). Still keeps
 * `perspective` + `transformStyle: preserve-3d` so children can use a plain
 * `translateZ()` for a fixed, simple layered-depth look (e.g. an icon badge
 * sitting slightly in front of its card) without any animation.
 *
 * Single div now, not nested (2026-08-17, "this is not good" — screenshot
 * showed two cards collapsed to a sliver with a huge empty gap after them).
 * The old two-div version put `perspective` on an outer wrapper and
 * `className` on an INNER div — fine for plain flow layout, but the inner
 * div isn't a direct child of a CSS grid, so grid-only utilities in that
 * className (lg:col-span-2, lg:col-span-3, etc.) landed on an element
 * `grid-column` has no effect on and were silently ignored. Every TiltCard
 * inside a `grid` with a col-span was affected, not just this one. Putting
 * everything on one div makes `className` land on the actual grid item.
 */
export default function TiltCard({ children, className = '' }) {
  return (
    <div className={className} style={{ perspective: 1200, transformStyle: 'preserve-3d' }}>
      {children}
    </div>
  )
}
