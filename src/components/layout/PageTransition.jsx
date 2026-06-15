import React from 'react'
import { motion } from 'framer-motion'

// Variants for different transition types
const variants = {
  // Standard page: fade + slight slide up
  page: {
    initial:  { opacity: 0, y: 16 },
    animate:  { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
    exit:     { opacity: 0, y: -8, transition: { duration: 0.2, ease: 'easeIn' } },
  },
  // Welcome → app: zoom + fade (like launching an app)
  launch: {
    initial:  { opacity: 0, scale: 0.97 },
    animate:  { opacity: 1, scale: 1, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] } },
    exit:     { opacity: 0, scale: 1.02, transition: { duration: 0.25, ease: 'easeIn' } },
  },
}

export function PageTransition({ children, variant = 'page' }) {
  const v = variants[variant]
  return (
    <motion.div
      initial={v.initial}
      animate={v.animate}
      exit={v.exit}
      style={{ width: '100%', height: '100%' }}
    >
      {children}
    </motion.div>
  )
}

// Stagger container — animates children one by one
export function StaggerContainer({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.07, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  )
}

// Individual stagger child
export function StaggerItem({ children, className = '' }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden:  { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
      }}
    >
      {children}
    </motion.div>
  )
}

// Flash overlay — white flash when navigating from welcome to app
export function FlashTransition({ trigger, onDone }) {
  return (
    <motion.div
      key={trigger}
      className="fixed inset-0 bg-white pointer-events-none z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.15, 0] }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      onAnimationComplete={onDone}
    />
  )
}
