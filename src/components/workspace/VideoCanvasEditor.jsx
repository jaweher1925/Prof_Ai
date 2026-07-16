/**
 * Video Canvas Editor — Real-time element editing on canvas
 * 
 * Merged from VisualDesignerPanel's CanvasEditor — shows full slide content:
 * - Slide layout with template colors
 * - Avatar placeholder
 * - Title, subtitle, and content blocks
 * - Responsive typography
 */

import { useState, useRef, useEffect } from 'react'
import { GripHorizontal, Maximize2 } from 'lucide-react'

const TEMPLATE_LIBRARY = [
  { id: 'modern',    name: 'Modern',    colors: { bg: '#0B1220', accent: '#3B82F6', text: '#F8FAFC' } },
  { id: 'minimal',   name: 'Minimal',   colors: { bg: '#FAFAFA', accent: '#6B7280', text: '#111827' } },
  { id: 'corporate', name: 'Corporate', colors: { bg: '#111827', accent: '#F59E0B', text: '#F9FAFB' } },
  { id: 'vibrant',   name: 'Vibrant',   colors: { bg: '#2A0A1A', accent: '#EC4899', text: '#FFF5F7' } },
  { id: 'ocean',     name: 'Ocean',     colors: { bg: '#041A2E', accent: '#06B6D4', text: '#F0FDFF' } },
  { id: 'forest',    name: 'Forest',    colors: { bg: '#08170D', accent: '#16A34A', text: '#F0FDF4' } },
  { id: 'sunset',    name: 'Sunset',    colors: { bg: '#1F1408', accent: '#F97316', text: '#FFFBEB' } },
  { id: 'elegant',   name: 'Elegant',   colors: { bg: '#0D0D0D', accent: '#D97706', text: '#F5F5F5' } },
  { id: 'academic',  name: 'Academic',  colors: { bg: '#0A1A0A', accent: '#10B981', text: '#F0FDF4' } },
  { id: 'startup',   name: 'Startup',   colors: { bg: '#05070D', accent: '#58A6FF', text: '#F0F6FC' } },
]

export default function VideoCanvasEditor({
  scene = null,
  contentScale = 1,
  onElementMove = () => {},
  onElementResize = () => {},
}) {
  const canvasRef = useRef(null)
  const [draggedElement, setDraggedElement] = useState(null)
  const [dragMode, setDragMode] = useState(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  if (!scene) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-100 dark:bg-slate-900 rounded-lg">
        <p className="text-slate-500 dark:text-slate-400 text-sm">No scene selected</p>
      </div>
    )
  }

  // Get template colors — use the template from composition or default to modern
  const template = TEMPLATE_LIBRARY.find(t => t.id === scene.slideComposition?.templateId) || TEMPLATE_LIBRARY[0]
  
  // Get slide data from composition, with proper fallbacks
  const slideData = {
    title: scene.slideComposition?.title || scene.scriptContent?.slice(0, 50) || 'Slide Title',
    subtitle: scene.slideComposition?.subtitle || '',
    contentBlocks: scene.slideComposition?.contentBlocks || [],
    avatarX: scene.slideComposition?.avatarX ?? 85,
    avatarY: scene.slideComposition?.avatarY ?? 50,
    avatarWidth: scene.slideComposition?.avatarWidth ?? 14,
    imageUrl: scene.slideComposition?.imageUrl || null,
    layout: scene.slideComposition?.layout || 'bullets',
    textAnimationType: scene.slideComposition?.textAnimationType || scene.textAnimationType || 'fade',
  }

  const isHeroLayout = slideData.layout === 'title-hero'
  const avatarLeftEdgePct = slideData.avatarX - slideData.avatarWidth / 2
  const contentMaxWidthPct = Math.max(40, Math.min(65, avatarLeftEdgePct - 8))

  const titleBoxStyle = isHeroLayout
    ? { 
        left: `50%`, 
        top: `38%`, 
        width: `${contentMaxWidthPct}%`, 
        transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      }
    : { 
        left: `8%`, 
        top: `8%`, 
        width: `${contentMaxWidthPct}%` 
      }

  const subtitleBoxStyle = isHeroLayout
    ? { 
        left: `50%`, 
        top: `48%`, 
        width: `${contentMaxWidthPct}%`, 
        transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      }
    : { 
        left: `8%`, 
        top: `18%`, 
        width: `${contentMaxWidthPct}%` 
      }

  const contentBoxOuterStyle = isHeroLayout
    ? {
        left: `50%`,
        top: `62%`,
        width: `${contentMaxWidthPct}%`,
        transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      }
    : {
        left: `8%`,
        top: `30%`,
        width: `${contentMaxWidthPct}%`,
      }

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-full shadow-2xl rounded-lg overflow-hidden select-none"
      style={{
        aspectRatio: '16/9',
        backgroundColor: template.colors.bg,
        color: template.colors.text,
        transform: `scale(${contentScale})`,
        transformOrigin: 'top left',
      }}
    >
      {/* Title */}
      <div
        className="absolute font-bold"
        style={{
          ...titleBoxStyle,
          fontSize: 'clamp(1.4rem, 3.5vw, 1.75rem)',
          lineHeight: 1.2,
          pointerEvents: 'none',
          padding: 'clamp(1rem, 4vw, 2rem)',
          color: template.colors.text,
        }}
      >
        <div style={{ height: 'clamp(2px, 0.3vw, 3px)', width: 'clamp(24px, 3vw, 40px)', backgroundColor: template.colors.accent, marginBottom: '0.5rem', marginLeft: isHeroLayout ? 'auto' : 0, marginRight: isHeroLayout ? 'auto' : 0 }} />
        {slideData.title || 'Slide Title'}
      </div>

      {/* Subtitle */}
      {slideData.subtitle && (
        <div
          className="absolute font-medium rounded-full inline-block"
          style={{
            ...subtitleBoxStyle,
            fontSize: 'clamp(0.8rem, 2vw, 0.95rem)',
            padding: 'clamp(0.3rem, 1vw, 0.6rem) clamp(0.6rem, 1.5vw, 1rem)',
            color: template.colors.accent,
            backgroundColor: `${template.colors.accent}15`,
            pointerEvents: 'none',
          }}
        >
          {slideData.subtitle}
        </div>
      )}

      {/* Content Area */}
      <div
        className="absolute overflow-hidden"
        style={{
          ...contentBoxOuterStyle,
          maxHeight: '55%',
          padding: 'clamp(0.5rem, 2vw, 2rem) clamp(0.5rem, 3vw, 2.5rem)',
          pointerEvents: 'none',
        }}
      >
        <div className="grid gap-2">
          {slideData.contentBlocks && slideData.contentBlocks.map((block, blockIdx) => (
            <div
              key={blockIdx}
              className="rounded-lg px-3 py-2"
              style={{
                backgroundColor: `${template.colors.text}08`,
                borderLeft: `2px solid ${template.colors.accent}`,
              }}
            >
              {block.title && (
                <p 
                  className="font-semibold leading-snug"
                  style={{
                    color: template.colors.text,
                    fontSize: 'clamp(0.65rem, 1.2vw, 0.8rem)',
                  }}
                >
                  {block.title}
                </p>
              )}
              {block.keyPoints && block.keyPoints.filter(Boolean).length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {block.keyPoints.filter(Boolean).map((kp, kpIdx) => (
                    <p 
                      key={kpIdx} 
                      className="opacity-75 flex items-start gap-1.5"
                      style={{
                        color: template.colors.text,
                        fontSize: 'clamp(0.6rem, 1rem, 0.75rem)',
                      }}
                    >
                      <span className="opacity-50 flex-shrink-0 mt-0.5">•</span>
                      <span>{kp}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Image - if present */}
      {slideData.imageUrl && (
        <div
          className="absolute rounded-lg overflow-hidden border-2 border-white/20"
          style={{
            left: `${slideData.imageUrl ? (slideData.slideComposition?.imageX || 5) : 0}%`,
            top: `${slideData.imageUrl ? (slideData.slideComposition?.imageY || 5) : 0}%`,
            width: `${slideData.imageUrl ? (slideData.slideComposition?.imageWidth || 20) : 0}%`,
            height: `${slideData.imageUrl ? (slideData.slideComposition?.imageHeight || 20) : 0}%`,
            pointerEvents: 'none',
          }}
        >
          <img src={slideData.imageUrl} alt="Slide" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Avatar Placeholder - Fixed Position */}
      <div
        className="absolute flex items-center justify-center bg-indigo-500/20 border-2 border-indigo-400 rounded-lg"
        style={{
          left: `${slideData.avatarX}%`,
          top: `${slideData.avatarY}%`,
          width: `${slideData.avatarWidth}%`,
          aspectRatio: '9/16',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        <div className="text-center">
          <div className="text-xs font-bold text-indigo-600 dark:text-indigo-300">AVATAR</div>
          <GripHorizontal className="w-3 h-3 text-indigo-400 mx-auto mt-1" />
        </div>
      </div>

      {/* Timeline Indicator */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-between text-xs text-slate-400 pointer-events-none">
        <span>Timeline Preview</span>
        <span>{slideData.textAnimationType || 'fade'}</span>
      </div>
    </div>
  )
}
