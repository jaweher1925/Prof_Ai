import React, { useRef } from 'react'
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion'

/**
 * Glass card that tilts toward the cursor in real 3D (perspective + rotateX/
 * rotateY, not a fake box-shadow trick) — children can add their own
 * `translateZ` to pop further out of the card's plane (see the logo badge in
 * Login/Signup) for genuine layered depth instead of a single flat tilt.
 */
export default function TiltCard({ children, className = '' }) {
  const ref = useRef(null)
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)

  const rotateX = useSpring(useTransform(py, [0, 1], [10, -10]), { stiffness: 220, damping: 22 })
  const rotateY = useSpring(useTransform(px, [0, 1], [-10, 10]), { stiffness: 220, damping: 22 })
  // Subtle glossy highlight that follows the cursor, reinforcing the tilt.
  const glareX = useTransform(px, [0, 1], ['0%', '100%'])
  const glareY = useTransform(py, [0, 1], ['0%', '100%'])
  const glareBg = useTransform([glareX, glareY], ([gx, gy]) =>
    `radial-gradient(500px circle at ${gx} ${gy}, rgba(255,255,255,0.14), transparent 55%)`
  )

  function handleMouseMove(e) {
    const rect = ref.current.getBoundingClientRect()
    px.set((e.clientX - rect.left) / rect.width)
    py.set((e.clientY - rect.top) / rect.height)
  }
  function handleMouseLeave() {
    px.set(0.5)
    py.set(0.5)
  }

  return (
    <div style={{ perspective: 1200 }}>
      <motion.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className={className}
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: glareBg }}
        />
        {children}
      </motion.div>
    </div>
  )
}
