import type { PostDto } from '@/services/feed.service';
import type { ExternalQuote, LinkPreview, PostMedia } from '@/types/feed';

interface RawMedia {
  type?: string;
  media_url_https?: string;
  url?: string;
  original_info?: { width?: number; height?: number };
  video_info?: { variants?: { content_type?: string; url: string; bitrate?: number }[] };
}

interface RawCardValue {
  key: string;
  value?: { string_value?: string; image_value?: { url: string; width?: number; height?: number } };
}

export interface RawTweet {
  id: string;
  url?: string;
  twitterUrl?: string;
  text?: string;
  createdAt?: string;
  isReply?: boolean;
  isRetweet?: boolean;
  inReplyToId?: string | null;
  author?: { id?: string; userName?: string; name?: string; profilePicture?: string | null; isBlueVerified?: boolean };
  entities?: { urls?: { url: string; expanded_url?: string }[] };
  extendedEntities?: { media?: RawMedia[] };
  card?: { name?: string; url?: string; binding_values?: RawCardValue[] } | null;
  quoted_tweet?: RawTweet | null;
  retweeted_tweet?: { id: string } | null;
}

const MAX_MEDIA = 4;
const MAX_VIDEO_SHORT_SIDE = 720;
const MAX_VIDEO_BITRATE = 2_200_000;
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

const tweetUrl = (username: string, id: string) => `https://x.com/${username}/status/${id}`;

/** X returns 48px avatars; the 400px rendition stays sharp on every surface. */
const fullSizeAvatar = (url?: string | null) => url?.replace(/_normal(\.\w+)$/, '_400x400$1') ?? null;

const parseDate = (raw?: string) => {
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

/** Only an author's own words can carry a prediction of theirs. */
export const isOriginalTweet = (t: RawTweet) =>
  !t.isReply && !t.inReplyToId && !t.isRetweet && !t.retweeted_tweet;

function cleanText(tweet: RawTweet, quoteEmbedded = false): string {
  let text = tweet.text ?? '';
  const quotedId = tweet.quoted_tweet?.id;
  const isQuoteLink = (url: string) => !!quotedId && url.includes(`/status/${quotedId}`);

  for (const media of tweet.extendedEntities?.media ?? []) {
    if (media.url) text = text.split(media.url).join('');
  }
  for (const link of tweet.entities?.urls ?? []) {
    const expanded = link.expanded_url ?? '';
    if (quoteEmbedded && isQuoteLink(expanded)) text = text.split(link.url).join('');
    else if (expanded) text = text.split(link.url).join(expanded);
  }
  text = text.replace(/&(amp|lt|gt|quot|#39);/g, (m) => HTML_ENTITIES[m] ?? m).trim();

  const quoted = tweet.quoted_tweet;
  if (!quoteEmbedded && quoted?.id && !isQuoteLink(text)) {
    const link = quoted.twitterUrl || quoted.url;
    if (link) text = text ? `${text}\n\n${link}` : link;
  }
  return text;
}

/** Best mp4 up to 720p. X also lists an HLS playlist, which <video> can't play. */
function pickMp4(media: RawMedia): string | null {
  const mp4s = (media.video_info?.variants ?? [])
    .filter((v) => v.content_type === 'video/mp4' && v.url)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  if (!mp4s.length) return null;
  const fits = mp4s.find((v) => {
    const m = v.url.match(/\/(\d+)x(\d+)\//);
    return m
      ? Math.min(Number(m[1]), Number(m[2])) <= MAX_VIDEO_SHORT_SIDE
      : (v.bitrate ?? 0) <= MAX_VIDEO_BITRATE;
  });
  return (fits ?? mp4s[mp4s.length - 1]).url;
}

function mimeOf(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png' || ext === 'webp' || ext === 'gif') return `image/${ext}`;
  return 'image/jpeg';
}

function mapMedia(tweet: RawTweet): PostMedia[] {
  return (tweet.extendedEntities?.media ?? [])
    .filter((m): m is RawMedia & { media_url_https: string } => !!m.media_url_https)
    .slice(0, MAX_MEDIA)
    .map((m) => ({
      url: m.media_url_https,
      width: m.original_info?.width,
      height: m.original_info?.height,
      mime: mimeOf(m.media_url_https),
      ...(m.type === 'photo' ? {} : { videoUrl: pickMp4(m) }),
    }));
}

function toQuote(tweet: RawTweet): ExternalQuote | null {
  const quoted = tweet.quoted_tweet;
  const username = quoted?.author?.userName;
  if (!quoted?.id || !username) return null;
  return {
    id: quoted.id,
    url: tweetUrl(username, quoted.id),
    text: cleanText(quoted),
    createdAt: parseDate(quoted.createdAt)?.toISOString() ?? null,
    author: {
      name: quoted.author?.name || username,
      username,
      avatar: quoted.author?.profilePicture ?? null,
      verified: !!quoted.author?.isBlueVerified,
    },
    media: mapMedia(quoted),
  };
}

const LARGE_CARD_IMAGES = [
  'photo_image_full_size_large',
  'summary_photo_image_large',
  'player_image_large',
  'thumbnail_image_large',
  'photo_image_full_size',
  'player_image',
  'thumbnail_image',
];
const SMALL_CARD_IMAGES = ['thumbnail_image_large', 'thumbnail_image', 'thumbnail_image_small'];

function toLinkPreview(tweet: RawTweet): LinkPreview | null {
  const card = tweet.card;
  if (!card?.binding_values?.length) return null;
  const values = new Map(card.binding_values.map((b) => [b.key, b.value]));
  const str = (key: string) => values.get(key)?.string_value?.trim() || null;

  const title = str('title');
  if (!title) return null;
  const shortUrl = card.url ?? str('card_url');
  const url = (tweet.entities?.urls ?? []).find((u) => u.url === shortUrl)?.expanded_url;
  if (!url) return null;

  const name = card.name ?? '';
  const large = name.includes('large_image') || name.endsWith('player');
  const image = (large ? LARGE_CARD_IMAGES : SMALL_CARD_IMAGES)
    .map((key) => values.get(key)?.image_value)
    .find((img) => !!img?.url);
  const domain = str('vanity_url') ?? str('domain') ?? new URL(url).hostname;

  return {
    url,
    title,
    description: str('description'),
    domain: domain.replace(/^www\./, ''),
    image: image ? { url: image.url, width: image.width ?? null, height: image.height ?? null } : null,
    large: large && !!image,
  };
}

/** A tweet as a feed post. Its id is the tweet id, which markets are keyed by. */
export function tweetToPost(tweet: RawTweet, username: string): PostDto | null {
  const media = mapMedia(tweet);
  const externalQuote = toQuote(tweet);
  const linkPreview = media.length ? null : toLinkPreview(tweet);
  let content = cleanText(tweet, !!externalQuote);
  if (linkPreview && content.endsWith(linkPreview.url)) {
    content = content.slice(0, -linkPreview.url.length).trim();
  }
  if (!content && !media.length && !externalQuote && !linkPreview) return null;

  return {
    id: tweet.id,
    content,
    createdAt: (parseDate(tweet.createdAt) ?? new Date()).toISOString(),
    author: {
      id: `x:${username}`,
      username: tweet.author?.name || username,
      displayName: tweet.author?.name || username,
      handle: username,
      avatar: fullSizeAvatar(tweet.author?.profilePicture),
    },
    media,
    source: 'x',
    externalUrl: tweetUrl(username, tweet.id),
    externalQuote,
    linkPreview,
  };
}
