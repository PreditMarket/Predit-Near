/** Runs in a TEE and returns a signature that can be checked later. */
export const NEAR_AI_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';

const API = process.env.NEAR_AI_BASE_URL?.trim() || 'https://cloud-api.near.ai/v1';
const ENDPOINT = `${API}/chat/completions`;
const TIMEOUT_MS = 75_000;
const RETRY_WAIT_MS = 1_000;
const SIGNATURE_TRIES = 6;
const SIGNATURE_WAIT_MS = 2_000;

export const nearAiKey = () => process.env.NEAR_AI_API_KEY?.trim() || null;

const attempt = (key: string, body: string) =>
  fetch(ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // NEAR AI signs the uncompressed body sent to the model that was named.
      'Accept-Encoding': 'identity',
      'x-no-aliasing': 'true',
    },
    body,
  });

/** One retry: the gateway drops an occasional connection or times out. */
async function send(key: string, body: string): Promise<Response> {
  try {
    const res = await attempt(key, body);
    if (res.status !== 429 && res.status < 500) return check(res);
  } catch {
    // Retried below.
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
  return check(await attempt(key, body));
}

function check(res: Response): Response {
  if (!res.ok) throw new Error(`NEAR AI answered ${res.status}`);
  return res;
}

export interface NearAiCompletion {
  value: unknown;
  chatId: string;
  /** The exact bytes sent and received, which is what NEAR AI signs a hash of. */
  requestBody: string;
  responseBody: string;
}

/** One completion whose answer is a JSON object. Thrown errors never carry the key. */
export async function nearAiJson(system: string, user: string, maxTokens: number): Promise<NearAiCompletion> {
  const key = nearAiKey();
  if (!key) throw new Error('NEAR AI is not configured');

  const request = JSON.stringify({
    model: NEAR_AI_MODEL,
    temperature: 0.2,
    reasoning_effort: 'low',
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const res = await send(key, request);

  const responseBody = await res.text();
  const body = JSON.parse(responseBody) as { id?: string; choices?: { message?: { content?: string | null } }[] };
  const json = body.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('NEAR AI returned no JSON');
  return { value: JSON.parse(json) as unknown, chatId: body.id ?? '', requestBody: request, responseBody };
}

export interface NearAiSignature {
  signedText: string;
  signature: string;
  signingAddress: string;
  signatureKind: string | null;
  signingAlgo: string;
}

/** The enclave's signature over a completion, or null if it never appears. */
export async function nearAiSignature(chatId: string): Promise<NearAiSignature | null> {
  const key = nearAiKey();
  if (!key) return null;
  const url = `${API}/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(NEAR_AI_MODEL)}&signing_algo=ecdsa`;
  for (let tries = 0; tries < SIGNATURE_TRIES; tries += 1) {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    }).catch(() => null);
    if (res?.ok) {
      const body = (await res.json()) as Record<string, string | undefined>;
      if (body.text && body.signature && body.signing_address) {
        return {
          signedText: body.text,
          signature: body.signature,
          signingAddress: body.signing_address,
          signatureKind: body.signature_kind ?? null,
          signingAlgo: body.signing_algo ?? 'ecdsa',
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, SIGNATURE_WAIT_MS));
  }
  return null;
}
