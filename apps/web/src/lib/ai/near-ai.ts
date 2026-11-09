/** Runs in a TEE and returns a signature that can be checked later. */
export const NEAR_AI_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';

const ENDPOINT = 'https://cloud-api.near.ai/v1/chat/completions';
const TIMEOUT_MS = 75_000;
const RETRY_WAIT_MS = 1_000;

export const nearAiKey = () => process.env.NEAR_AI_API_KEY?.trim() || null;

const attempt = (key: string, body: string) =>
  fetch(ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
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

/** One completion whose answer is a JSON object. Thrown errors never carry the key. */
export async function nearAiJson(
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ value: unknown; chatId: string }> {
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

  const body = (await res.json()) as { id?: string; choices?: { message?: { content?: string | null } }[] };
  const json = body.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('NEAR AI returned no JSON');
  return { value: JSON.parse(json) as unknown, chatId: body.id ?? '' };
}
