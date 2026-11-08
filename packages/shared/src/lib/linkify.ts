/**
 * Split post text into plain text, links and (optionally) @mentions so the
 * renderer can make them clickable. Pure, so it is unit-tested on its own.
 */
export type ContentToken =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; label: string }
  | { type: 'mention'; handle: string };

const TOKEN_PATTERN = /(https?:\/\/[^\s<]+)|@([A-Za-z0-9_]{1,15})/g;
// Punctuation that ends a sentence rather than the URL ("see x.com/a.").
const TRAILING_PUNCTUATION = /[.,!?;:'")\]]+$/;
const MAX_LABEL = 30;

/** `https://www.example.com/a/very/long/path` → `example.com/a/very/long/pa…`,
 *  the way X shows links. */
export function linkLabel(href: string): string {
  const bare = href.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return bare.length > MAX_LABEL ? `${bare.slice(0, MAX_LABEL - 1)}…` : bare;
}

export function tokenizeContent(
  text: string,
  opts: { mentions?: boolean } = {},
): ContentToken[] {
  const tokens: ContentToken[] = [];
  let last = 0;
  const pushText = (value: string) => {
    if (!value) return;
    const prev = tokens[tokens.length - 1];
    if (prev?.type === 'text') prev.value += value;
    else tokens.push({ type: 'text', value });
  };

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const start = match.index ?? 0;
    const [whole, url, handle] = match;

    if (url) {
      const href = url.replace(TRAILING_PUNCTUATION, '');
      pushText(text.slice(last, start));
      tokens.push({ type: 'link', href, label: linkLabel(href) });
      last = start + href.length;
      continue;
    }

    // A mention needs a word boundary before it, so emails stay text.
    const before = start > 0 ? text[start - 1] : '';
    if (!opts.mentions || !handle || /[A-Za-z0-9_]/.test(before)) continue;
    pushText(text.slice(last, start));
    tokens.push({ type: 'mention', handle });
    last = start + whole.length;
  }
  pushText(text.slice(last));
  return tokens;
}
