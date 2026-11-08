'use client';

import { ThemeProvider as NextThemes } from 'next-themes';

// Light mode temporarily disabled — force every user to dark regardless of
// stored preference. Remove `forcedTheme` and restore the toggle in
// `top-nav.tsx` to re-enable light mode later.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
    >
      {children}
    </NextThemes>
  );
}
