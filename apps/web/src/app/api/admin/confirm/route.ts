import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_RECIPIENT, type AdminConfirmMessage } from '@/lib/near/evidence';
import { nearView } from '@/lib/near/rpc';
import { NEAR_MARKET_CONTRACT } from '@/lib/near/config';
import type { NearMarket } from '@/lib/near/types';
import { SITE_URL } from '@/lib/site-url';
import { adminAccounts } from '@/lib/resolve/admins';
import { readBundle } from '@/lib/resolve/evidence-store';
import { isSignedByAccount } from '@/lib/resolve/nep413';
import { operatorCall } from '@/lib/resolve/operator';

export const dynamic = 'force-dynamic';

const MAX_AGE_MS = 5 * 60_000;
const MAX_REASON_BYTES = 600;

const refuse = (error: string, status: number) => NextResponse.json({ error }, { status });

/** A person's decision on a market: their wallet signed it, the operator key posts it. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    message?: string;
    nonce?: string;
    accountId?: string;
    publicKey?: string;
    signature?: string;
  } | null;
  if (!body?.message || !body.nonce || !body.accountId || !body.publicKey || !body.signature) {
    return refuse('Missing fields', 400);
  }

  let decision: AdminConfirmMessage;
  try {
    decision = JSON.parse(body.message) as AdminConfirmMessage;
  } catch {
    return refuse('Unreadable message', 400);
  }
  if (decision.app !== ADMIN_RECIPIENT) return refuse('Wrong message', 400);
  if (!(Math.abs(Date.now() - Number(decision.issuedAt)) < MAX_AGE_MS)) return refuse('This signature has expired', 401);
  if (!adminAccounts().includes(body.accountId)) return refuse('This account is not an admin', 403);
  let authentic: boolean;
  try {
    authentic = await isSignedByAccount({
      message: body.message,
      recipient: ADMIN_RECIPIENT,
      nonce: Buffer.from(body.nonce, 'base64'),
      accountId: body.accountId,
      publicKey: body.publicKey,
      signature: Buffer.from(body.signature, 'base64'),
    });
  } catch {
    return refuse('Could not check the signature on NEAR. Try again.', 503);
  }
  if (!authentic) return refuse('The signature does not match this account', 401);

  const reason = String(decision.reason ?? '').trim();
  if (!reason || Buffer.byteLength(reason) > MAX_REASON_BYTES) return refuse('A reason is required', 400);
  const { marketId, outcome, invalidKind } = decision;

  const bundle = await readBundle(String(marketId));
  if (!bundle) return refuse('This market has no snapshot yet', 409);
  const market = await nearView<NearMarket | null>(NEAR_MARKET_CONTRACT, 'get_market', { market_id: String(marketId) });
  if (market?.status !== 'open') return refuse('This market already has a result', 409);

  let report: unknown;
  if (outcome === 'yes' || outcome === 'no') {
    if (!bundle.ai) return refuse('YES or NO needs a NEAR AI reading first', 409);
    report = { proposed: { outcome, reason } };
  } else if (outcome === 'invalid' && (invalidKind === 'source_unavailable' || invalidKind === 'ambiguous_rules')) {
    report = { invalid: { kind: invalidKind, reason } };
  } else {
    return refuse('Unknown outcome', 400);
  }

  const origin = req.headers.get('origin') || SITE_URL;
  const ai = bundle.ai && {
    model: bundle.ai.model,
    chat_id: bundle.ai.chatId,
    signed_text: bundle.ai.signedText,
    signature: bundle.ai.signature,
    signing_address: bundle.ai.signingAddress,
  };
  try {
    await operatorCall('post_receipt', {
      market_id: String(marketId),
      report,
      evidence: { hash: bundle.snapshot.hash, uri: `${origin}/api/evidence/${marketId}`, ai },
    });
  } catch (err) {
    console.error('post_receipt failed:', (err as Error).message);
    return refuse('The receipt could not be posted', 502);
  }
  return NextResponse.json({ ok: true });
}
