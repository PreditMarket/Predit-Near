#!/usr/bin/env node
/**
 * PWA acceptance (plan 02, T1/Q3): the individual Lighthouse PWA audits must
 * all pass. Exits non-zero if any fails.
 *
 *   pnpm --filter web build && pnpm --filter web start -p 3123
 *   pnpm --filter web lighthouse:pwa http://localhost:3123/
 *
 * Lighthouse 12 dropped the PWA category *and* these audits, and 10 already
 * lacked apple-touch-icon — no release has all seven. So: Lighthouse 10.4.0
 * (the last with service-worker; fetched by npx, nothing added to the
 * lockfile) for six, and the apple-touch-icon check (what Lighthouse ≤ 9 did)
 * here.
 *
 * Chrome: $CHROME_PATH, else Playwright's Chromium, else whatever Lighthouse's
 * chrome-launcher finds.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const LIGHTHOUSE = 'lighthouse@10.4.0';
const AUDITS = [
  'installable-manifest',
  'service-worker',
  'splash-screen',
  'themed-omnibox',
  'maskable-icon',
  'viewport',
];

const url = process.argv[2];
if (!url) {
  console.error('usage: lighthouse-pwa.mjs <url>   e.g. http://localhost:3123/');
  process.exit(2);
}

if (!process.env.CHROME_PATH) {
  try {
    const { chromium } = await import('@playwright/test');
    const executable = chromium.executablePath();
    if (existsSync(executable)) process.env.CHROME_PATH = executable;
  } catch {
    // No Playwright browser — leave it to chrome-launcher.
  }
}

const dir = mkdtempSync(path.join(tmpdir(), 'lighthouse-pwa-'));
const configPath = path.join(dir, 'config.json');
const reportPath = path.join(dir, 'report.json');
writeFileSync(
  configPath,
  JSON.stringify({ extends: 'lighthouse:default', settings: { onlyAudits: AUDITS } }),
);

const run = spawnSync(
  'npx',
  [
    '--yes',
    LIGHTHOUSE,
    url,
    `--config-path=${configPath}`,
    '--output=json',
    `--output-path=${reportPath}`,
    '--chrome-flags=--headless=new --no-sandbox',
    '--quiet',
  ],
  { stdio: ['ignore', 'inherit', 'inherit'], env: process.env },
);
if (run.status !== 0 || !existsSync(reportPath)) {
  console.error(`${LIGHTHOUSE} did not produce a report (exit ${run.status}).`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const results = AUDITS.map((id) => {
  const audit = report.audits[id];
  const passed = audit?.score === 1;
  let detail = audit ? audit.title : 'missing from the report';
  if (!passed && audit?.details?.items?.length) {
    detail += ` — ${JSON.stringify(audit.details.items)}`;
  }
  return { id, passed, detail };
});
results.push(await appleTouchIcon(report.finalDisplayedUrl ?? url));

let failed = 0;
for (const { id, passed, detail } of results) {
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${id.padEnd(22)} ${detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed (${LIGHTHOUSE} + apple-touch-icon)`);
process.exit(failed ? 1 : 0);

/** A <link rel="apple-touch-icon"> to a PNG at least 180px wide (as Lighthouse ≤ 9 checked). */
async function appleTouchIcon(pageUrl) {
  const id = 'apple-touch-icon';
  try {
    const html = await (await fetch(pageUrl)).text();
    const link = html.match(/<link[^>]*rel="apple-touch-icon"[^>]*>/)?.[0];
    const href = link?.match(/href="([^"]+)"/)?.[1];
    if (!href) return { id, passed: false, detail: 'no <link rel="apple-touch-icon" href>' };
    const res = await fetch(new URL(href, pageUrl));
    const png = Buffer.from(await res.arrayBuffer());
    const isPng = png.subarray(1, 4).toString('latin1') === 'PNG';
    const width = isPng ? png.readUInt32BE(16) : 0;
    return {
      id,
      passed: res.ok && isPng && width >= 180,
      detail: `${href} — ${res.status}, ${isPng ? `PNG ${width}px` : 'not a PNG'}`,
    };
  } catch (error) {
    return { id, passed: false, detail: String(error) };
  }
}
