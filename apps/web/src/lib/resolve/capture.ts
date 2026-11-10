const READER = 'https://r.jina.ai/';
const TIMEOUT_MS = 45_000;
const MAX_CHARS = 40_000;

export interface CapturedSource {
  text: string;
  truncated: boolean;
}

/**
 * The source page as text, right now. Many sites turn away a plain server
 * fetch, so a reader service loads it. The address never reaches our own
 * network: a market's creator chooses it.
 */
export async function captureSource(url: string): Promise<CapturedSource> {
  const res = await fetch(`${READER}${url}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'text/plain', 'X-No-Cache': 'true' },
  });
  if (!res.ok) throw new Error(`The reader answered ${res.status}`);
  const text = (await res.text()).trim();
  if (!text) throw new Error('The page was empty');
  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(0, MAX_CHARS).replace(/[\uD800-\uDBFF]$/, '') : text, truncated };
}
