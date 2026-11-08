'use client';

import React, { useState } from 'react'
import Avatar from 'boring-avatars'

const PALETTE = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B'];

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Seed string for 8-bit avatar fallback (e.g. oracle name or id) */
  fallbackSeed?: string;
}

export function ImageWithFallback({ fallbackSeed, src, alt, style, className, ...rest }: ImageWithFallbackProps) {
  const [didError, setDidError] = useState(false)

  if (didError || !src) {
    const seed = fallbackSeed || alt || 'fallback';

    return (
      <div className={`inline-flex items-center justify-center overflow-hidden bg-muted ${className ?? ''}`} style={style}>
        <Avatar name={seed} variant="pixel" size="100%" square colors={PALETTE} />
      </div>
    )
  }

  return (
    <img src={src} alt={alt} className={className} style={style} {...rest} onError={() => setDidError(true)} />
  )
}
