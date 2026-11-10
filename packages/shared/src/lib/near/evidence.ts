import { fitBytes, MAX_LONG } from './market-draft';

export type InvalidKind = 'source_unavailable' | 'ambiguous_rules';
export type SuggestedOutcome = 'yes' | 'no' | 'invalid';

export interface OutcomeSuggestion {
  outcome: SuggestedOutcome;
  invalidKind: InvalidKind | null;
  reason: string;
}

/** The exact bytes NEAR AI signed a hash of, so anyone can recheck the signature. */
export interface AiReadingBundle {
  model: string;
  chatId: string;
  requestBody: string;
  responseBody: string;
  signedText: string;
  signature: string;
  signingAddress: string;
  signatureKind: string | null;
  signingAlgo: string;
}

/** What was read at expiry and what NEAR AI said about it. Served publicly. */
export interface EvidenceBundle {
  marketId: string;
  sourceUrl: string;
  capturedAt: string;
  snapshot: { text: string; truncated: boolean; hash: string };
  /** Set when the source could not be read: `snapshot.text` then says why. */
  sourceError: string | null;
  suggestion: OutcomeSuggestion | null;
  ai: AiReadingBundle | null;
}

/** Wallets show this as the app asking for the signature. */
export const ADMIN_RECIPIENT = 'predit-admin';

export interface AdminConfirmMessage {
  app: typeof ADMIN_RECIPIENT;
  marketId: string;
  outcome: SuggestedOutcome;
  invalidKind: InvalidKind | null;
  reason: string;
  issuedAt: number;
}

/**
 * A model's verdict, or null when it can't be used. An invalid result with no
 * stated kind counts as an unreadable source: "ambiguous rules" costs the
 * creator their bond, so it must be said outright.
 */
export function parseSuggestion(raw: unknown): OutcomeSuggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const { outcome, invalidKind, reason } = raw as Record<string, unknown>;
  if (outcome !== 'yes' && outcome !== 'no' && outcome !== 'invalid') return null;
  const text = typeof reason === 'string' ? fitBytes(reason.replace(/\s+/g, ' ').trim(), MAX_LONG).trim() : '';
  if (!text) return null;
  return {
    outcome,
    invalidKind: outcome !== 'invalid' ? null : invalidKind === 'ambiguous_rules' ? 'ambiguous_rules' : 'source_unavailable',
    reason: text,
  };
}
