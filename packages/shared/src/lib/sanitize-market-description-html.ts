import DOMPurify from 'isomorphic-dompurify';

type SanitizeConfig = NonNullable<Parameters<typeof DOMPurify.sanitize>[1]>;

const DESCRIPTION_HTML_CONFIG: SanitizeConfig = {  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "strike",
    "del",
    "ins",
    "sub",
    "sup",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "span",
    "mark",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class"],
  ALLOW_DATA_ATTR: false,
};

export function isLikelyRichTextHtml(raw: string | undefined | null): boolean {
  const t = (raw ?? "").trim();
  if (!t) return false;
  return /<\/?[a-z][a-z0-9]*(\s|>|\/)/i.test(t);
}

export function sanitizeMarketDescriptionHtml(unsafe: string): string {
  return DOMPurify.sanitize(unsafe ?? "", DESCRIPTION_HTML_CONFIG);
}
