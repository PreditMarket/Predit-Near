import { NextResponse, type NextRequest } from 'next/server';
import { nearAiSignature } from '@/lib/ai/near-ai';

export const dynamic = 'force-dynamic';

/** Who signed a chat answer: the enclave's address, from NEAR AI. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!/^chatcmpl-[\w-]{8,80}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const signature = await nearAiSignature(id).catch(() => null);
  if (!signature) return NextResponse.json({ error: 'Not signed yet' }, { status: 404 });
  return NextResponse.json({ signer: signature.signingAddress, kind: signature.signatureKind });
}
