import React from 'react'
import logoImg from '@/assets/Profai studio.png'

export default function LogoBadge({
  size = 'w-10 h-10',
  bgClassName = 'bg-white',
  className = '',
}) {
  return (
    <div className={`${size} rounded-full flex-shrink-0 overflow-hidden ${bgClassName} ${className}`}>
      <img
        src={logoImg}
        alt="ProfAI Studio"
        className="w-full h-full object-cover"
        style={{ objectPosition: '50% 30%', transform: 'scale(1.15)' }}
      />
    </div>
  )
}
