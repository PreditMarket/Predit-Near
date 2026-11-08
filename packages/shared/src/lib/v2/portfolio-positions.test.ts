import { describe, expect, it } from 'vitest';
import {
  filterPositions,
  positionsCounts,
  positionsInTab,
  searchPositions,
  sortPositions,
} from './portfolio-positions';

const row = (
  id: string,
  status: string,
  over: Partial<{ marketQuestion: string; createdAt: string; amount: string; xpValue: number }> = {},
) => ({
  id,
  status,
  marketQuestion: `Market ${id}`,
  createdAt: '2026-10-01T00:00:00Z',
  amount: '0',
  ...over,
});

const ROWS = [
  row('a', 'open', { createdAt: '2026-10-03T00:00:00Z', amount: '5', xpValue: 10 }),
  row('b', 'WON', { createdAt: '2026-10-01T00:00:00Z', amount: '50', xpValue: 1 }),
  row('c', 'cancelled', { createdAt: '2026-10-02T00:00:00Z', amount: '20' }),
  row('d', 'live', { marketQuestion: 'Will BTC close above 100k?', amount: 'oops' }),
  row('e', 'claimed'),
  row('f', 'lost'),
];

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('positionsInTab', () => {
  it('open is open/active/pending/live, any case, never cancelled', () => {
    expect(ids(positionsInTab(ROWS, 'open'))).toEqual(['a', 'd']);
  });

  it('settled is won/lost/claimed', () => {
    expect(ids(positionsInTab(ROWS, 'resolved'))).toEqual(['b', 'e', 'f']);
  });

  it('cancelled and trades', () => {
    expect(ids(positionsInTab(ROWS, 'cancelled'))).toEqual(['c']);
    expect(positionsInTab(ROWS, 'history')).toHaveLength(ROWS.length);
  });

  it('copes with a missing status', () => {
    const odd = [{ status: undefined as unknown as string }];
    expect(positionsInTab(odd, 'open')).toEqual([]);
  });
});

describe('searchPositions', () => {
  it('matches the question, case-insensitively and trimmed', () => {
    expect(ids(searchPositions(ROWS, '  btc '))).toEqual(['d']);
  });

  it('blank returns the same rows', () => {
    expect(searchPositions(ROWS, '   ')).toBe(ROWS);
  });
});

describe('sortPositions', () => {
  it('recent is newest first', () => {
    expect(ids(sortPositions(ROWS.slice(0, 3), 'recent'))).toEqual(['a', 'c', 'b']);
  });

  it('value is largest traded amount first; unreadable amounts count as 0', () => {
    expect(ids(sortPositions(ROWS, 'value')).slice(0, 3)).toEqual(['b', 'c', 'a']);
  });

  it('xp is largest first; missing xp counts as 0', () => {
    expect(ids(sortPositions(ROWS, 'xp')).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const copy = [...ROWS];
    sortPositions(ROWS, 'value');
    expect(ROWS).toEqual(copy);
  });
});

describe('filterPositions', () => {
  it('tab, then search, then sort', () => {
    const rows = filterPositions(ROWS, { tab: 'history', search: 'market', sort: 'value' });
    expect(ids(rows)[0]).toBe('b');
    expect(rows).toHaveLength(5);
  });
});

describe('positionsCounts', () => {
  it('takes cancelled rows off the summary open count', () => {
    expect(positionsCounts(ROWS, 3)).toEqual({ open: 2, history: 6, resolved: 3, cancelled: 1 });
  });

  it('never goes below zero', () => {
    expect(positionsCounts(ROWS, 0).open).toBe(0);
  });
});
