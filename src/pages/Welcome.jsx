import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, ArrowRight, Mic, Video, FileText, Image as ImageIcon, Sparkles,
  User, Bot, BookOpen, BarChart3, Presentation, PlayCircle, Sun, Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/ThemeContext'
import LogoBadge from '@/components/ui/LogoBadge'

const FEATURES = [
  { icon: FileText,  title: 'Script Generation', desc: 'AI reads your PDFs and writes engaging lecture scripts automatically' },
  { icon: Mic,       title: 'Voice Synthesis',    desc: 'Converts scripts into natural-sounding professional voiceovers' },
  { icon: ImageIcon, title: 'Visual Creation',    desc: 'Generates custom background visuals for every scene' },
  { icon: Video,     title: 'Avatar Video',       desc: 'Produces presenter-driven video courses at scale' },
]

const NAV_LINKS = ['Our Approach', 'Features', 'About us']

export default function Welcome() {
  const navigate = useNavigate()
  const [flashing, setFlashing] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  function enter() {
    setFlashing(true)
    localStorage.setItem('profai_visited', 'true')
    setTimeout(() => navigate('/dashboard'), 400)
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] dark:bg-[#0a0e1a] text-slate-900 dark:text-white transition-colors">
      <AnimatePresence>
        {flashing && (
          <motion.div
            className="fixed inset-0 bg-white dark:bg-slate-950 z-50 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          />
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-6 pt-8 pb-24">

        {/* Nav */}
        <motion.nav
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-2.5">
            <LogoBadge size="w-9 h-9" />
            <span className="font-bold text-lg tracking-tight">ProfAI</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500 dark:text-slate-400">
            {NAV_LINKS.map((l) => (
              <span key={l} className="hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors cursor-default">{l}</span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-50 dark:bg-white/10 border border-indigo-100 dark:border-white/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-white/15 transition-colors flex-shrink-0"
            >
              <span className="relative w-4 h-4 block">
                <Sun className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100')} />
                <Moon className={cn('w-4 h-4 absolute inset-0 transition-all', isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50')} />
              </span>
            </button>
            <button onClick={enter} className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors hidden sm:block">
              Sign in
            </button>
            <motion.button
              onClick={enter}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-xl transition-colors shadow-md shadow-indigo-500/20"
            >
              Free Trial
            </motion.button>
          </div>
        </motion.nav>

        {/* Hero */}
         <motion.div
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-800 via-indigo-700 to-indigo-500 px-8 md:px-12 py-12 md:py-16 mb-20 shadow-xl"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* Subtle decoration elements */}
          <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute right-10 bottom-[-4rem] w-44 h-44 rounded-full bg-white/10 pointer-events-none" />

          {/* Grid Layout containing information and the motion image preview collage requested by the user */}
          <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

            {/* Direct Copywriting parameters */}
            <div className="lg:col-span-7">
              <motion.div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 text-indigo-50 text-xs font-medium mb-6"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                AI-Powered Course Creation
              </motion.div>
              <h1 className="text-4xl md:text-6xl font-display font-black text-white leading-[1.05] tracking-tight mb-8">
                Turn your lecture<br />into a video course
              </h1>
              <p className="text-indigo-100 text-base max-w-sm mb-8 leading-relaxed">
                Upload your PDFs, slides, or notes. ProfAI turns them into a complete
                video lecture, automatically.
              </p>
              <motion.button
                onClick={enter}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-indigo-800 bg-white hover:bg-slate-50 rounded-xl shadow-lg transition-colors"
              >
                Get Started <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>

            {/* User requested replacement slot: Interactive AI course generation cards using vector icons instead of raw images */}
            <div className="lg:col-span-5 relative h-[320px] sm:h-[360px] flex items-center justify-center">
              <div className="relative w-full max-w-xs h-full flex items-center justify-center">

                {/* Simulated Generator Card 1: Main AI Presenter / Lecture Video simulation */}
                <motion.div
                  className="absolute z-20 shadow-2xl rounded-2xl border border-slate-700/50 bg-slate-950 text-left p-4 p-y-5 flex flex-col justify-between"
                  style={{ width: "230px", height: "300px", left: "5%" }}
                  initial={{ opacity: 0, scale: 0.9, rotate: -4 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: [0, -10, 0],
                    rotate: [-4, -2, -4]
                  }}
                  transition={{
                    opacity: { duration: 0.5, delay: 0.3 },
                    scale: { duration: 0.5, delay: 0.3 },
                    y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
                    rotate: { duration: 6, repeat: Infinity, ease: "easeInOut" }
                  }}
                >
                  {/* Top Bar Status */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-rose-400 flex items-center gap-1.5 font-bold">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      Live Preview
                    </span>
                    <Video className="w-3.5 h-3.5 text-indigo-400" />
                  </div>

                  {/* Core Visual Presenter Center Area */}
                  <div className="my-4 flex-1 flex flex-col items-center justify-center relative bg-slate-900/50 rounded-xl border border-slate-800/80 p-3 overflow-hidden">
                    <div className="absolute top-1 right-2 text-[8px] font-mono text-emerald-400 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" /> Course AI
                    </div>

                    <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 mb-2 relative">
                      <User className="w-8 h-8" />
                      <motion.div
                        className="absolute inset-0 rounded-full border border-indigo-400/50"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0, 0.8] }}
                        transition={{ duration: 2.5, repeat: Infinity }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-slate-300">Avatar Presenter</span>
                    <span className="text-[8px] text-slate-500 text-center line-clamp-1">Synthesizing vocal expressions...</span>
                  </div>

                  {/* Player Controls simulation */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>02:45 / 15:00</span>
                      <span className="text-indigo-400">FPS: 60</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-indigo-500 rounded-full"
                        animate={{ width: ["20%", "72%", "20%"] }}
                        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                      />
                    </div>
                  </div>
                </motion.div>

                {/* Simulated Generator Card 2: Voice Synthesizer / Audio Waveform simulation */}
                <motion.div
                  className="absolute z-30 shadow-xl rounded-xl border border-slate-700/40 bg-slate-950 text-left p-3.5 flex flex-col justify-between"
                  style={{ width: "140px", height: "185px", right: "2%", bottom: "5%" }}
                  initial={{ opacity: 0, scale: 0.8, rotate: 6 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: [0, 8, 0],
                    rotate: [6, 9, 6]
                  }}
                  transition={{
                    opacity: { duration: 0.5, delay: 0.55 },
                    scale: { duration: 0.5, delay: 0.55 },
                    y: { duration: 5, repeat: Infinity, ease: "easeInOut" },
                    rotate: { duration: 5, repeat: Infinity, ease: "easeInOut" }
                  }}
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-[8px] font-mono font-medium text-slate-400">Voice Generation</span>
                    <Mic className="w-3 h-3 text-indigo-400" />
                  </div>

                  {/* Stylized Visual Equalizer bars */}
                  <div className="my-3 flex items-end justify-center gap-1 h-12 bg-slate-900/45 rounded-lg border border-slate-800/50 px-2 py-1">
                    {[0.8, 0.4, 0.9, 0.5, 0.7, 0.3, 0.6].map((multiplier, idx) => (
                      <motion.div
                        key={idx}
                        className="w-1.5 bg-gradient-to-t from-indigo-400 to-indigo-500 rounded-t-sm"
                        animate={{ height: ["15%", `${multiplier * 100}%`, "15%"] }}
                        transition={{
                          duration: 1.2 + idx * 0.15,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      />
                    ))}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] font-mono text-slate-400">
                      <span>Synthesis</span>
                      <span className="text-emerald-400 font-bold">ACTIVE</span>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full w-4/5 bg-indigo-400" />
                    </div>
                  </div>
                </motion.div>

              </div>
            </div>

          </div>
        </motion.div>
        {/* Professor <-> AI <-> Student pipeline */}
        <div className="relative mb-24">
          <motion.h2
            className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white text-center mb-3"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Professor, meet your AI co-teacher
          </motion.h2>
          <p className="text-slate-500 dark:text-slate-400 text-center max-w-xl mx-auto mb-16 text-base">
            Upload your slides or notes ProfAI's pipeline turns them into scripts, voiceover,
            and avatar-driven video, so every student gets the full lecture experience.
          </p>

          <div className="relative flex items-center justify-center gap-8 md:gap-20">
            <svg
              className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-40 pointer-events-none hidden sm:block"
              viewBox="0 0 700 140"
              fill="none"
              preserveAspectRatio="none"
            >
              <motion.path
                d="M 130 70 C 260 10, 440 130, 570 70"
                stroke="#3b82f6"
                strokeWidth="3"
                strokeDasharray="7 7"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: 'easeInOut' }}
              />
            </svg>

            {/* Professor */}
            <motion.div
              className="relative z-10 flex flex-col items-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <motion.div
                className="relative w-32 h-32 md:w-40 md:h-40 rounded-[2rem] bg-gradient-to-br from-indigo-700 to-indigo-500 shadow-xl shadow-indigo-500/25 flex items-center justify-center"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <User className="w-14 h-14 md:w-16 md:h-16 text-white" strokeWidth={1.5} />
                <div className="absolute -bottom-2 -right-2 w-10 h-10 md:w-11 md:h-11 rounded-xl bg-white dark:bg-slate-900 shadow-md flex items-center justify-center">
                  <Presentation className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </motion.div>
              <p className="text-base font-semibold text-slate-900 dark:text-white mt-4">Professor</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">Uploads source material</p>
            </motion.div>

            {/* AI orb */}
            <motion.div
              className="relative z-10 flex  flex-col items-center"
              initial={{ opacity: 0, scale: 0.7 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, type: 'spring' }}
            >
              <div className="relative w-24 h-24 md:w-32 md:h-32 flex items-center justify-center">
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-indigo-300"
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                />
                <motion.div
                  className="relative w-20 h-20 md:w-28 md:h-28 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-500/30 shadow-2xl flex items-center justify-center"
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Bot className="w-9 h-9 md:w-12 md:h-12 text-indigo-600 dark:text-indigo-400" strokeWidth={1.5} />
                  <motion.div
                    className="absolute -top-1 -right-1"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                  </motion.div>
                </motion.div>
              </div>
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-4 tracking-wide uppercase">AI Studio</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Script · Voice · Video</p>
            </motion.div>

            {/* Student */}
            <motion.div
              className="relative z-10 flex flex-col items-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <motion.div
                className="relative w-32 h-32 md:w-40 md:h-40 rounded-[2rem] bg-gradient-to-br from-indigo-500 to-indigo-400 shadow-xl shadow-indigo-500/25 flex items-center justify-center"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              >
                <GraduationCap className="w-14 h-14 md:w-16 md:h-16 text-white" strokeWidth={1.5} />
                <div className="absolute -bottom-2 -right-2 w-10 h-10 md:w-11 md:h-11 rounded-xl bg-white dark:bg-slate-900 shadow-md flex items-center justify-center">
                  <PlayCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </motion.div>
              <p className="text-base font-semibold text-slate-900 dark:text-white mt-4">Student</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">Watches the finished course</p>
            </motion.div>
          </div>
        </div>

        {/* Features */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <motion.div
              key={title}
              className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 shadow-sm rounded-2xl p-5 text-left"
              variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}
              whileHover={{ y: -4, transition: { duration: 0.15 } }}
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center mb-4">
                <Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <footer className="text-center py-6 text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-white/10">
        © {new Date().getFullYear()} ProfAI Studio AI course creation for educators
          </footer>
    </div>
  )
}
