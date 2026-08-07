import React from 'react'
import { motion } from 'framer-motion'
import {
  GraduationCap, BookOpen, Video, Mic, FileText, Presentation,
  PlayCircle, Bot, Sparkles, BarChart3, Code, Award,
} from 'lucide-react'
import { useTheme } from '@/lib/ThemeContext'
import { cn } from '@/lib/utils'

// Course/class iconography drifting slowly in the background — reinforces
// "AI course creation" the same way Welcome.jsx's hero does. Positions are
// hand-placed (not randomized) so they read as an intentional scatter, not
// visual noise.
const ICONS = [
  { Icon: GraduationCap, top: '10%', left: '8%',  size: 44, delay: 0,   duration: 7.5 },
  { Icon: BookOpen,      top: '16%', left: '86%', size: 36, delay: 0.6, duration: 8.5 },
  { Icon: Video,         top: '72%', left: '7%',  size: 40, delay: 1.1, duration: 9 },
  { Icon: Mic,           top: '80%', left: '90%', size: 32, delay: 0.3, duration: 6.5 },
  { Icon: FileText,      top: '42%', left: '4%',  size: 28, delay: 0.9, duration: 7 },
  { Icon: Presentation,  top: '8%',  left: '48%', size: 34, delay: 1.4, duration: 8 },
  { Icon: PlayCircle,    top: '88%', left: '42%', size: 30, delay: 0.5, duration: 7.5 },
  { Icon: Bot,           top: '48%', left: '93%', size: 38, delay: 0.8, duration: 9.5 },
  { Icon: Sparkles,      top: '60%', left: '50%', size: 24, delay: 1.6, duration: 6 },
  { Icon: BarChart3,     top: '26%', left: '70%', size: 28, delay: 0.2, duration: 8.2 },
  { Icon: Code,          top: '58%', left: '16%', size: 30, delay: 1.2, duration: 7.8 },
  { Icon: Award,         top: '30%', left: '20%', size: 26, delay: 1.8, duration: 6.8 },
]

/**
 * Auth pages' own background — a plain two-color system, not the neutral
 * #f5f7fb/#0a0e1a used elsewhere in the app: dark mode is a deep BLUE
 * gradient (never black), light mode is plain white. The card that sits on
 * top of this always uses the OPPOSITE of whichever is showing (see
 * Login.jsx/Signup.jsx) so it's never a washed-out white-on-white or
 * blue-on-blue situation.
 */
export default function AuthBackground() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      <div className={cn(
        'absolute inset-0 transition-colors duration-500',
        isDark ? 'bg-gradient-to-br from-indigo-950 via-indigo-800 to-indigo-600' : 'bg-white'
      )} />

      {/* Soft depth blobs */}
      <div className={cn('absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl', isDark ? 'bg-indigo-400/25' : 'bg-indigo-300/30')} />
      <div className={cn('absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl', isDark ? 'bg-fuchsia-400/10' : 'bg-fuchsia-300/15')} />
      <div className={cn('absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl', isDark ? 'bg-cyan-300/10' : 'bg-sky-300/20')} />

      {/* Faint grid for texture/depth */}
      <div
        className="absolute inset-0 opacity-[0.06] transition-opacity duration-500"
        style={{
          backgroundImage: isDark
            ? 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)'
            : 'linear-gradient(#4338ca 1px, transparent 1px), linear-gradient(90deg, #4338ca 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Drifting course/class icons */}
      {ICONS.map(({ Icon, top, left, size, delay, duration }, i) => (
        <motion.div
          key={i}
          className={cn('absolute transition-colors duration-500', isDark ? 'text-white' : 'text-indigo-500')}
          style={{ top, left }}
          initial={{ opacity: 0 }}
          animate={{ opacity: isDark ? [0.12, 0.3, 0.12] : [0.15, 0.35, 0.15], y: [0, -18, 0], rotate: [0, 6, 0] }}
          transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon style={{ width: size, height: size }} strokeWidth={1.4} />
        </motion.div>
      ))}
    </div>
  )
}
