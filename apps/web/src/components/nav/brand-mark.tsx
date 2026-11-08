'use client';

import { HoverPrefetchLink } from './hover-prefetch-link';
import { ImageWithFallback } from '@/components/figma/image-with-fallback';

/**
 * Predit brand mark — keeps the original SVG logo (per product) but sized
 * to fit the shorter 40px v2 topnav. Text wordmark hidden on <sm so the
 * mark alone represents the brand on tight widths.
 */
export function BrandMark() {
  return (
    <HoverPrefetchLink
      href="/"
      className="logo-swirl-parent inline-flex items-center gap-[6px] mr-[10px] cursor-pointer select-none h-[26px]"
    >
      <span className="logo-swirl-child inline-flex items-center justify-center shrink-0 origin-center h-[18px]">
        <ImageWithFallback
          src="/logo-MarkWhite.svg"
          alt="Predit"
          className="h-[18px] w-auto"
        />
      </span>
      <span className="hidden sm:inline text-[13px] font-extrabold uppercase tracking-[0.02em] leading-none text-foreground">
        Predit
      </span>
    </HoverPrefetchLink>
  );
}
