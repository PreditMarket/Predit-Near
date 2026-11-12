#!/usr/bin/env node
/**
 * Renders the PWA's raster assets from public/logo-MarkWhite.svg:
 *
 *   public/icons/icon-{192,512}.png            `any` icons: desktop installs (rounded tile)
 *   public/icons/icon-{192,512}-maskable.png   logo inside the 80% safe zone
 *   public/icons/apple-touch-icon-180.png      iOS home screen (no transparency)
 *   public/splash/apple-splash-<w>x<h>.png     iOS launch screens
 *
 *   pnpm --filter web pwa:assets
 *
 * Rasterises with Playwright's Chromium (already a dev dependency) instead of
 * pwa-asset-generator / sharp — both need install scripts, which pnpm blocks
 * here unless listed in pnpm-workspace.yaml `allowBuilds`.
 */

import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(appDir, 'public');
const splashList = path.join(
  appDir,
  '../../packages/shared/src/lib/pwa/splash-screens.json',
);

// Same as --background in globals.css and theme_color in app/manifest.ts.
const BACKGROUND = '#14141C';
// logo-MarkWhite.svg's viewBox is 120 × 155.7.
const LOGO_ASPECT = 120 / 155.7;

/**
 * Maskable icons are cropped to as little as a circle 80% of the canvas wide.
 * At 56% height the logo's corners sit ~0.35 of the size from the centre —
 * inside the 0.4 radius with room to spare.
 */
const ASSETS = [
  // Shown as is (no mask): a rounded tile, like the other apps beside it.
  { file: 'icons/icon-192.png', width: 192, height: 192, logo: 0.6, radius: 0.22 },
  { file: 'icons/icon-512.png', width: 512, height: 512, logo: 0.6, radius: 0.22 },
  { file: 'icons/icon-192-maskable.png', width: 192, height: 192, logo: 0.56 },
  { file: 'icons/icon-512-maskable.png', width: 512, height: 512, logo: 0.56 },
  { file: 'icons/apple-touch-icon-180.png', width: 180, height: 180, logo: 0.6 },
];

const splash = JSON.parse(await readFile(splashList, 'utf8')).map((s) => ({
  file: `splash/apple-splash-${s.width * s.ratio}x${s.height * s.ratio}.png`,
  width: s.width * s.ratio,
  height: s.height * s.ratio,
  // Logo about a quarter of the screen width, like a native launch screen.
  logo: (0.25 * s.width) / s.height / LOGO_ASPECT,
}));

const svg = await readFile(path.join(publicDir, 'logo-MarkWhite.svg'));
const logoSrc = `data:image/svg+xml;base64,${svg.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
try {
  for (const asset of [...ASSETS, ...splash]) {
    const { file, width, height, logo, transparent = false, radius = 0 } = asset;
    // A rounded tile is the background colour on a clear canvas.
    const clear = transparent || radius > 0;
    await page.setViewportSize({ width, height });
    // A div, not the body: the body's background would fill the whole canvas.
    await page.setContent(
      `<body style="margin:0"><div style="width:${width}px;height:${height}px;display:grid;place-items:center;background:${
        transparent ? 'transparent' : BACKGROUND
      };border-radius:${(radius * width).toFixed(2)}px"><img src="${logoSrc}" style="height:${(
        logo * height
      ).toFixed(2)}px"></div></body>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    const out = path.join(publicDir, file);
    await mkdir(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, omitBackground: clear });
    console.log(`  ${file}  ${width}×${height}`);
  }
} finally {
  await browser.close();
}
