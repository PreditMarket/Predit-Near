import type { NearSide } from './types';

/** The contract's byte limits for market text. */
export const MAX_SHORT = 200;
export const MAX_LONG = 600;
export const MAX_LABEL = 40;

const MIN_DRAFT_LEAD_MS = 2 * 3_600_000;
const MAX_HORIZON_MS = 10 * 365 * 24 * 3_600_000;
const CATEGORIES = ['crypto', 'politics', 'sports', 'tech', 'culture', 'economy', 'other'];

export const textBytes = (text: string) => new TextEncoder().encode(text).length;

/** The longest start of `text` that fits a byte limit. */
export function fitBytes(text: string, max: number): string {
  let out = '';
  for (const char of text) {
    if (textBytes(out + char) > max) break;
    out += char;
  }
  return out;
}

export interface MarketDraft {
  question: string;
  description: string;
  yesLabel: string;
  noLabel: string;
  yesCondition: string;
  noCondition: string;
  invalidConditions: string;
  /** Empty when the model named nothing usable: the creator must supply one. */
  source: string;
  /** Null when the model's date is unusable: the form keeps its default. */
  deadlineMs: number | null;
  category: string;
  claimSide: NearSide;
}

export interface PredictionDetection {
  detected: boolean;
  claim: string;
}

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? fitBytes(value.replace(/\s+/g, ' ').trim(), max).trim() : '';

/** A public https page. The address comes from a model reading a stranger's post. */
function publicHttps(value: unknown): string {
  const text = clean(value, MAX_SHORT);
  try {
    const { protocol, hostname, username, password } = new URL(text);
    const isName = hostname.includes('.') && !/^[\d.]+$/.test(hostname) && !hostname.startsWith('[');
    return protocol === 'https:' && isName && !username && !password && !/\s/.test(text) ? text : '';
  } catch {
    return '';
  }
}

export function parseDetection(raw: unknown): PredictionDetection | null {
  if (!raw || typeof raw !== 'object') return null;
  const { detected, claim } = raw as Record<string, unknown>;
  if (typeof detected !== 'boolean') return null;
  const text = clean(claim, MAX_SHORT);
  return { detected: detected && !!text, claim: detected ? text : '' };
}

/**
 * A model's reply as form values, or null when it can't start a market.
 * Fields it got wrong fall back to a safe value: the creator reviews them all.
 */
export function parseDraft(raw: unknown, nowMs: number): MarketDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const question = clean(value.question, MAX_SHORT);
  const yesCondition = clean(value.yesCondition, MAX_LONG);
  const noCondition = clean(value.noCondition, MAX_LONG);
  if (!question || !yesCondition || !noCondition) return null;

  const yesLabel = clean(value.yesLabel, MAX_LABEL);
  const noLabel = clean(value.noLabel, MAX_LABEL);
  const labelled = yesLabel && noLabel && yesLabel !== noLabel;
  const deadlineMs = typeof value.deadline === 'string' ? Date.parse(value.deadline) : NaN;
  const usableDeadline = deadlineMs >= nowMs + MIN_DRAFT_LEAD_MS && deadlineMs <= nowMs + MAX_HORIZON_MS;
  const category = clean(value.category, MAX_SHORT).toLowerCase();

  return {
    question,
    description: clean(value.description, MAX_LONG),
    yesLabel: labelled ? yesLabel : 'Yes',
    noLabel: labelled ? noLabel : 'No',
    yesCondition,
    noCondition,
    invalidConditions:
      clean(value.invalidConditions, MAX_LONG) || 'The source named above cannot be read at the deadline.',
    source: publicHttps(value.source),
    // The form works in whole minutes, and must not close before the time the rules name.
    deadlineMs: usableDeadline ? Math.ceil(deadlineMs / 60_000) * 60_000 : null,
    category: CATEGORIES.includes(category) ? category : 'other',
    claimSide: value.claimSide === 'no' ? 'no' : 'yes',
  };
}
