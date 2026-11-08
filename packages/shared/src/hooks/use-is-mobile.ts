'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the device is mobile based on screen width
 * @param breakpoint - The width breakpoint in pixels (default: 1024px for lg breakpoint)
 * @returns boolean indicating if the screen width is below the breakpoint
 */
export function useIsMobile(breakpoint: number = 1024): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}
