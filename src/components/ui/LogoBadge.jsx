import React from 'react'
import logoImg from '@/assets/profai-logo-icon.png'

/**
 * ProfAI Studio brand mark — the real logo asset (icon mark only, cropped
 * from the source lockup, background keyed out to transparent). The
 * original source file had an opaque WHITE background, so recoloring it via
 * CSS filters for dark surfaces turned the whole badge into a solid white
 * square — the filter blackened+inverted the background right along with
 * the ink. This asset has true alpha transparency, so the same filter trick
 * now only recolors the logo's ink and leaves the background invisible.
 *
 * `tone`:
 *   - 'auto'  (default) — follows the app's light/dark theme: the mark's
 *     natural dark-navy on light surfaces, inverted to white on dark ones.
 *   - 'white' — always white, for surfaces that are dark regardless of the
 *     app theme (e.g. the sidebar, which never lightens).
 *   - 'dark'  — always the mark's natural navy color.
 */
export default function LogoBadge({
  size = 'w-10 h-10',
  className = '',
  tone = 'auto',
}) {
  const toneClass = tone === 'white' ? 'brightness-0 invert' : tone === 'dark' ? '' : 'dark:brightness-0 dark:invert'
  return (
    <div className={`${size} flex-shrink-0 ${className}`}>
      <img
        src={logoImg}
        alt="ProfAI Studio"
        className={`w-full h-full object-contain ${toneClass}`}
        style={{ objectPosition: '50% 30%' }}
      />
    </div>
  )
}
