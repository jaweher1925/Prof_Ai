import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GraduationCap, ArrowRight, Mic, Video, FileText, Image, Sparkles } from 'lucide-react'

const FEATURES = [
  { icon: FileText, title: 'Script Generation',  desc: 'AI reads your PDFs and writes lecture scripts automatically' },
  { icon: Mic,      title: 'Voice Synthesis',     desc: 'ElevenLabs turns scripts into natural-sounding voiceovers' },
  { icon: Image,    title: 'Visual Creation',     desc: 'DALL-E 3 generates custom visuals for every scene' },
  { icon: Video,    title: 'Avatar Video',        desc: 'HeyGen produces presenter-driven video courses at scale' },
]

export default function Welcome() {
  const navigate = useNavigate()
  const [flashing, setFlashing] = useState(false)

  function enter() {
    setFlashing(true)
    localStorage.setItem('profai_visited', 'true')
    setTimeout(() => navigate('/dashboard'), 400)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col overflow-hidden">

      {/* Flash overlay */}
      <AnimatePresence>
        {flashing && (
          <motion.div
            className="fixed inset-0 bg-white z-50 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          />
        )}
      </AnimatePresence>

      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/10 rounded-full blur-3xl"
          animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-indigo-600/10 rounded-full blur-3xl"
          animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      {/* Nav */}
      <motion.nav
        className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/[0.06]"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30"
            whileHover={{ scale: 1.05, rotate: 3 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <GraduationCap className="w-5 h-5 text-white" />
          </motion.div>
          <div>
            <p className="text-sm font-bold text-white leading-none">ProfAI</p>
            <p className="text-[10px] text-blue-400 tracking-widest uppercase font-medium">Studio</p>
          </div>
        </div>
        <motion.button
          onClick={enter}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          Enter Studio <ArrowRight className="w-4 h-4" />
        </motion.button>
      </motion.nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">

        {/* Badge */}
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-8"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI-Powered Course Creation
        </motion.div>

        {/* Headline */}
        <motion.h1
          className="text-5xl lg:text-6xl font-bold text-white max-w-3xl leading-tight mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        >
          Turn your lectures into
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400"> video courses</span>
        </motion.h1>

        {/* Sub */}
        <motion.p
          className="text-slate-400 text-lg max-w-xl leading-relaxed mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5, ease: 'easeOut' }}
        >
          Upload your PDFs, slides, or notes — ProfAI generates complete presenter-driven
          video courses with scripts, voiceover, and visuals in minutes.
        </motion.p>

        {/* CTA */}
        <motion.button
          onClick={enter}
          className="flex items-center gap-3 px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-xl shadow-blue-500/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          whileHover={{ scale: 1.04, boxShadow: '0 20px 40px rgba(59,130,246,0.35)' }}
          whileTap={{ scale: 0.97 }}
        >
          Get Started <ArrowRight className="w-5 h-5" />
        </motion.button>

        {/* Feature cards */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-20 max-w-4xl w-full"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1, delayChildren: 0.55 } } }}
        >
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <motion.div
              key={title}
              className="bg-slate-900/60 border border-white/[0.06] rounded-2xl p-5 text-left"
              variants={{
                hidden:  { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] } },
              }}
              whileHover={{ borderColor: 'rgba(59,130,246,0.3)', y: -3, transition: { duration: 0.2 } }}
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <Icon className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-white mb-1.5">{title}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <motion.footer
        className="relative z-10 text-center py-6 text-xs text-slate-700 border-t border-white/[0.04]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
      >
        © {new Date().getFullYear()} ProfAI Studio — AI course creation for educators
      </motion.footer>
    </div>
  )
}
