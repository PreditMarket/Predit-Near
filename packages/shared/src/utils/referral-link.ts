import { useMemo } from 'react';

import { SITE_URL } from '@/lib/site-url';
import useAuthStore from '@/store/auth.store';

/**
 * Query param written onto outgoing share links. Deliberately terse: a visible
 * `?invitecode=` reads as "this person is farming me" and costs clicks, which
 * matters most where the raw URL is on show (Telegram, Discord, DMs) rather
 * than on X, where the link is shortened and truncated anyway.
 */
export const INVITE_CODE_PARAM = 'r';

/**
 * Spellings still honoured on inbound links. The Earn page link was the only
 * referral link for a long time, so `?invitecode=` is already out in group
 * chats and old posts; those must keep working forever. Never emit these.
 */
export const LEGACY_INVITE_CODE_PARAMS = ['invitecode', 'inviteCode'] as const;

/** Every param name a landing URL may carry the code in, newest first. */
export const ACCEPTED_INVITE_CODE_PARAMS = [
  INVITE_CODE_PARAM,
  ...LEGACY_INVITE_CODE_PARAMS,
] as const;

/**
 * Referral links are opt-in per app, declared in each app's `next.config.ts`
 * so the switch ships as committed code rather than deploy-time config.
 *
 * Default is OFF on purpose. A new app that forgets to opt in silently emits
 * plain links, which is a visible product gap; the reverse failure (an admin
 * tool quietly crediting its operator on every market it shares) corrupts
 * referral attribution and is far harder to notice. `apps/admin` relies on
 * this default — it never sets the flag.
 */
const REFERRAL_LINKS_ENABLED = process.env.NEXT_PUBLIC_REFERRAL_LINKS === 'on';

/** The signed-in user's own referral code, or '' when signed out. */
export function getMyInviteCode(): string {
  const user = useAuthStore.getState().user;
  return user?.referralCode || user?.inviteCode || '';
}

function toAbsolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const origin =
    typeof window !== 'undefined' ? window.location.origin : SITE_URL;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Absolute-ise `url` and attach the referral code, for links that leave the
 * site (share sheets, tweet text, copy-link buttons).
 *
 * Pass `code` explicitly to attribute someone other than the current user —
 * the competition group share credits the group's creator, not the viewer.
 * Passing '' attaches nothing.
 */
export function withInviteCode(url: string, code?: string): string {
  const absolute = toAbsolute(url);
  if (!REFERRAL_LINKS_ENABLED) return absolute;

  const inviteCode = code ?? getMyInviteCode();
  if (!inviteCode) return absolute;

  try {
    const parsed = new URL(absolute);
    // An explicit code already in the URL wins — never re-attribute a link
    // that was built to credit someone specific. Checked across every accepted
    // spelling so a legacy `?invitecode=` link doesn't also pick up an `?r=`.
    if (ACCEPTED_INVITE_CODE_PARAMS.some((p) => parsed.searchParams.has(p))) {
      return parsed.toString();
    }
    parsed.searchParams.set(INVITE_CODE_PARAM, inviteCode);
    return parsed.toString();
  } catch {
    // Malformed URL: a share button must never be the thing that throws.
    return absolute;
  }
}

/**
 * Hook form, for components that compute a share URL during render and must
 * pick up the code as soon as the user signs in.
 */
export function useShareUrl(url: string, code?: string): string {
  const myCode = useAuthStore(
    (s) => s.user?.referralCode || s.user?.inviteCode || '',
  );
  const effective = code ?? myCode;
  return useMemo(() => withInviteCode(url, effective), [url, effective]);
}
