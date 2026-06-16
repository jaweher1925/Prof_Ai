/**
 * POST /api/generateSceneAsset
 * Step 4 — Slide generation.
 * Gamma-style: structured content → layout template → themed SVG → PNG
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlideBullet { text: string; level?: number }
interface SlideBlock {
  type: 'bullets' | 'definition' | 'quote' | 'two-column' | 'key-concept' | 'summary'
  items?: SlideBullet[]
  term?: string; definition?: string; examples?: string[]
  quote?: string; attribution?: string
  concept?: string
  left?: SlideBullet[]; right?: SlideBullet[]
}
interface SlideContent {
  title?: string
  subtitle?: string
  layout?: string
  theme?: string
  blocks?: SlideBlock[]
  imagePrompt?: string
}

// ─── Themes ───────────────────────────────────────────────────────────────────

const THEMES: Record<string, {
  bg1: string; bg2: string; bg3: string
  accent: string; accentLight: string
  title: string; body: string; muted: string
  glow: string
}> = {
  'dark-navy': {
    bg1: '#020C1B', bg2: '#0A1628', bg3: '#0F1F3D',
    accent: '#3B82F6', accentLight: '#3B82F620',
    title: '#F8FAFC', body: '#CBD5E1', muted: '#64748B',
    glow: '#3B82F6',
  },
  'ocean': {
    bg1: '#041A2E', bg2: '#062D4F', bg3: '#083B66',
    accent: '#06B6D4', accentLight: '#06B6D420',
    title: '#F0FDFF', body: '#BAE6FD', muted: '#7DD3FC',
    glow: '#06B6D4',
  },
  'academic': {
    bg1: '#0A1A0A', bg2: '#0D2B0D', bg3: '#133913',
    accent: '#10B981', accentLight: '#10B98120',
    title: '#F0FDF4', body: '#BBF7D0', muted: '#6EE7B7',
    glow: '#10B981',
  },
  'light': {
    bg1: '#F8FAFC', bg2: '#F1F5F9', bg3: '#E2E8F0',
    accent: '#6366F1', accentLight: '#6366F120',
    title: '#0F172A', body: '#334155', muted: '#94A3B8',
    glow: '#6366F1',
  },
  'corporate': {
    bg1: '#111827', bg2: '#1F2937', bg3: '#374151',
    accent: '#F59E0B', accentLight: '#F59E0B20',
    title: '#F9FAFB', body: '#D1D5DB', muted: '#6B7280',
    glow: '#F59E0B',
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function wrap(text: string, max