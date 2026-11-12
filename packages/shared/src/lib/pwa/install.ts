/**
 * When to offer "install the app", as pure functions. The
 * browser state they read is gathered by store/install-prompt.store.ts.
 */

/**
 * - android             Chrome & co. — install via the deferred
 *                       `beforeinstallprompt`
 * - ios                 Safari — Share → Add to Home Screen, by hand; there
 *                       is no install event
 * - unsupported-in-app  an iOS browser that isn't Safari: an app's in-app
 *                       browser (Telegram, Instagram, Gmail, a wallet…) or
 *                       Chrome / Firefox / Edge for iOS. No Add to Home Screen
 *                       to rely on — the hint is "Open in Safari to install"
 * - desktop             install via the deferred prompt, from the account
 *                       menu only
 * - other               in-app browsers elsewhere (Android webviews), which
 *                       can't install at all
 */
export type InstallPlatform = 'android' | 'ios' | 'unsupported-in-app' | 'desktop' | 'other';

/** What the banner and the settings say where installing needs Safari. */
export const OPEN_IN_SAFARI_HINT = 'Open in Safari to install';

/** "Not now" hides the banner for this long. */
export const INSTALL_DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Apps' in-app browsers. Most append a marker to the system webview's UA;
 * on iOS the ones that add none are still caught by the missing `Safari/`
 * token (see below).
 */
const IN_APP_BROWSER = new RegExp(
  [
    'FBAN', // Facebook, Messenger (iOS)
    'FBAV',
    'FB_IAB', // Facebook, Messenger (Android)
    'Instagram',
    'Line\\/', // LINE ("Safari Line/14.10.0")
    'Twitter', // X ("Twitter for iPhone")
    'TwitterAndroid',
    'TikTok',
    'BytedanceWebview',
    'musical_ly',
    'Snapchat',
    'LinkedInApp',
    'Pinterest',
    'Telegram', // "Telegram-Android/…", "TelegramBot"
    'Discord',
    'Slack', // "Slack/…", "Slack_SSB"
    'GSA\\/', // the Google app, and Gmail's link viewer on iOS
    'Gmail',
    'MicroMessenger', // WeChat
    'KAKAOTALK',
  ].join('|'),
  'i',
);

/** iOS browsers that aren't Safari, though they carry its `Safari/` token. */
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|Ddg\//;

export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  // iPadOS reports itself as a Mac; touch gives it away.
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (ios) {
    // Safari proper: a real `Safari/<build>` token (a bare WKWebView — what
    // most in-app browsers are — has none), and no other browser's or app's
    // marker. Only Safari has the Add to Home Screen this relies on.
    const safari =
      /\bSafari\/\d/.test(userAgent) &&
      !IOS_OTHER_BROWSER.test(userAgent) &&
      !IN_APP_BROWSER.test(userAgent);
    return safari ? 'ios' : 'unsupported-in-app';
  }
  if (IN_APP_BROWSER.test(userAgent)) return 'other';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}

export interface InstallState {
  platform: InstallPlatform;
  /** Running as the installed app, or installed from this tab already. */
  standalone: boolean;
  /** A deferred `beforeinstallprompt` is in hand. */
  canPrompt: boolean;
}

/**
 * How this browser can install the app now, if at all. `open-in-safari`:
 * nothing to install with here — only the hint to switch browsers.
 */
export function installMethod({ platform, standalone, canPrompt }: InstallState) {
  if (standalone) return null;
  if (canPrompt) return 'prompt' as const;
  if (platform === 'ios') return 'ios-guide' as const;
  if (platform === 'unsupported-in-app') return 'open-in-safari' as const;
  return null;
}

export interface InstallBannerInput extends InstallState {
  /** App opens so far, this one included. */
  visits: number;
  firstTradeDone: boolean;
  /** When "Not now" was last pressed (ms), if ever. */
  dismissedAt: number | null;
  now: number;
}

/**
 * Mobile only, not installed, from the second visit or right after the first
 * successful trade, and not within 14 days of "Not now". Android needs the
 * browser's prompt in hand — without it the button would do nothing. An iOS
 * in-app browser gets the banner as a hint ("Open in Safari to install").
 */
export function shouldShowInstallBanner(input: InstallBannerInput): boolean {
  const mobile =
    input.platform === 'android' || input.platform === 'ios' || input.platform === 'unsupported-in-app';
  if (!mobile) return false;
  if (!installMethod(input)) return false;
  if (input.dismissedAt !== null && input.now - input.dismissedAt < INSTALL_DISMISS_MS) {
    return false;
  }
  return input.visits >= 2 || input.firstTradeDone;
}
