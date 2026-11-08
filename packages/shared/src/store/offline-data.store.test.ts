import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearResponseSources,
  latestSavedDataFlag,
  noteResponseSource,
  SAVED_DATA_FLAG_MS,
  savedDataExpiresAt,
  showSavedDataBanner,
  useOfflineDataStore,
} from './offline-data.store';

const NOW = 1_000_000;
const flags = () => useOfflineDataStore.getState().cachedUrls;

beforeEach(() => clearResponseSources());

describe('noteResponseSource', () => {
  it('flags a saved copy with when it came, and unflags it once live data comes', () => {
    noteResponseSource('https://api/leaders', true, NOW);
    expect(flags()).toEqual({ 'https://api/leaders': NOW });
    // A later saved copy refreshes the time.
    noteResponseSource('https://api/leaders', true, NOW + 10);
    expect(flags()['https://api/leaders']).toBe(NOW + 10);
    noteResponseSource('https://api/leaders', false, NOW + 20);
    expect(flags()).toEqual({});
  });

  it('leaves the state alone for live data that was never flagged', () => {
    const before = useOfflineDataStore.getState();
    noteResponseSource('https://api/posts', false, NOW);
    expect(useOfflineDataStore.getState()).toBe(before);
  });
});

describe('showSavedDataBanner', () => {
  it('shows while offline, whatever the flags', () => {
    expect(showSavedDataBanner({ offline: true, cachedUrls: {} }, NOW)).toBe(true);
  });

  it('shows for a minute after a saved copy, then lapses on its own', () => {
    noteResponseSource('https://api/leaders', true, NOW);
    const at = (t: number) => showSavedDataBanner({ offline: false, cachedUrls: flags() }, t);
    expect(at(NOW)).toBe(true);
    expect(at(NOW + SAVED_DATA_FLAG_MS - 1)).toBe(true);
    expect(at(NOW + SAVED_DATA_FLAG_MS)).toBe(false);
    expect(at(NOW + 60 * 60_000)).toBe(false);
  });

  it('goes by the newest flag', () => {
    noteResponseSource('https://api/a', true, NOW);
    noteResponseSource('https://api/b', true, NOW + 30_000);
    expect(latestSavedDataFlag(flags(), NOW + 40_000)).toBe(NOW + 30_000);
    expect(savedDataExpiresAt(flags(), NOW + 40_000)).toBe(NOW + 30_000 + SAVED_DATA_FLAG_MS);
    expect(showSavedDataBanner({ offline: false, cachedUrls: flags() }, NOW + 70_000)).toBe(true);
    expect(savedDataExpiresAt(flags(), NOW + 100_000)).toBeNull();
  });

  it('is cleared on navigation (clearResponseSources)', () => {
    noteResponseSource('https://api/leaders', true, NOW);
    clearResponseSources();
    expect(showSavedDataBanner({ offline: false, cachedUrls: flags() }, NOW)).toBe(false);
  });
});
