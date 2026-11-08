/**
 * The service worker's precache list, trimmed to the offline shell (plan
 * 5.2). The build hands Serwist every file in .next/static — 300+ chunks,
 * ~12 MB — and installing the worker would download all of it on a first
 * visit. Only what renders /~offline is needed up front; every other chunk is
 * cached when a page first loads it (the `next-static` CacheFirst route).
 *
 * Used at build time from next.config.ts (Serwist `manifestTransforms`),
 * where Next's app-build-manifest says which files each layout/page loads.
 * No imports: next.config.ts loads this file directly.
 */

export interface PrecacheEntryLike {
  url: string;
  revision?: string | null;
  size?: number;
}

/** app-build-manifest.json `pages`: entry name → files under .next/. */
export type AppBuildPages = Record<string, readonly string[]>;

/**
 * The entries the shell renders with: the root layout (wraps /~offline),
 * the (app) layout (shared by nearly every page — the first page opened
 * offline from cache needs it), and the offline page itself.
 */
export const SHELL_ENTRIES = ['/layout', '/(app)/layout', '/~offline/page'] as const;

/** Next's runtime: needed by every page, whatever the manifest says. */
const RUNTIME_CHUNK =
  /^\/_next\/static\/chunks\/(?:webpack|framework|main|main-app|polyfills)-[0-9a-f]+\.js$/;
/** The shell's own chunks by name, for when no build manifest is at hand. */
const SHELL_CHUNK =
  /^\/_next\/static\/chunks\/app\/(?:layout|\(app\)\/layout|~offline\/page)-[0-9a-f]+\.js$/;
const GLOBAL_CSS = /^\/_next\/static\/css\/[^/]+\.css$/;
const FONT = /^\/_next\/static\/media\/[^/]+\.(?:woff2?|ttf|otf)$/;

const normalize = (url: string) => {
  let path = url.replace(/^\/_next\/\/+/, '/_next/');
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep it as is.
  }
  return path;
};

/** The URLs (`/_next/static/…`) the shell's entries load, per the build. */
export function shellFiles(pages: AppBuildPages): Set<string> {
  const files = new Set<string>();
  for (const entry of SHELL_ENTRIES) {
    for (const file of pages[entry] ?? []) files.add(normalize(`/_next/${file}`));
  }
  return files;
}

/**
 * `entries` cut down to the shell: Next's runtime chunks, the shell's
 * layout/page chunks and the chunks they share (from `pages`), global CSS
 * and fonts. Anything not under /_next/ (the /~offline page, its logo and
 * icon) is kept as is. Without `pages` the shell's own chunks are matched by
 * name only — still loadable offline, but their shared chunks are left to
 * runtime caching.
 */
export function shellPrecache<E extends PrecacheEntryLike>(
  entries: readonly E[],
  pages: AppBuildPages | null | undefined,
): E[] {
  const files = pages ? shellFiles(pages) : new Set<string>();
  return entries.filter(({ url }) => {
    const path = normalize(url);
    if (!path.startsWith('/_next/')) return true;
    return (
      files.has(path) ||
      RUNTIME_CHUNK.test(path) ||
      SHELL_CHUNK.test(path) ||
      GLOBAL_CSS.test(path) ||
      FONT.test(path)
    );
  });
}
