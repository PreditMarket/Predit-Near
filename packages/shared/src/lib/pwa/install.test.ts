import { describe, expect, it } from 'vitest';
import {
  detectInstallPlatform,
  INSTALL_DISMISS_MS,
  OPEN_IN_SAFARI_HINT,
  installMethod,
  shouldShowInstallBanner,
  type InstallBannerInput,
} from './install';

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0',
};

/** iOS browsers that can't Add to Home Screen the Safari way (real UAs). */
const IOS_NOT_SAFARI: Record<string, string> = {
  chrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/135.0.7049.83 Mobile/15E148 Safari/604.1',
  firefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  edge:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.2592.86 Mobile/15E148 Safari/605.1.15',
  facebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.106;FBBV/636066133;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 614079958)',
  // The Google app — and Gmail opens links in it: GSA, with a Safari token.
  googleApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/321.0.648017867 Mobile/15E148 Safari/604.1',
  line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0',
  x: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.48',
  // Telegram, Discord, Slack: a plain WKWebView — no Safari/ token at all.
  telegram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  discord:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Discord/232.0',
  slack:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Slack/24.06.10',
  phantom:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 Phantom/ios',
  solflare:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Solflare/1.70',
};

describe('detectInstallPlatform', () => {
  it('tells the install paths apart', () => {
    expect(detectInstallPlatform(UA.androidChrome)).toBe('android');
    expect(detectInstallPlatform(UA.iphoneSafari)).toBe('ios');
    expect(detectInstallPlatform(UA.ipadOs, 5)).toBe('ios');
    expect(detectInstallPlatform(UA.ipadOs, 0)).toBe('desktop');
    expect(detectInstallPlatform(UA.macChrome)).toBe('desktop');
    expect(detectInstallPlatform(UA.iphoneInstagram)).toBe('unsupported-in-app');
  });

  it("takes only Safari proper for iOS's installable browser", () => {
    for (const [name, ua] of Object.entries(IOS_NOT_SAFARI)) {
      expect(detectInstallPlatform(ua), name).toBe('unsupported-in-app');
    }
    // iPadOS in desktop mode, inside an app, too.
    expect(detectInstallPlatform(`${UA.ipadOs} Telegram`, 5)).toBe('unsupported-in-app');
  });

  it('leaves in-app browsers elsewhere as "other"', () => {
    expect(
      detectInstallPlatform(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Instagram 337.0.0.35.102 Android',
      ),
    ).toBe('other');
    expect(
      detectInstallPlatform(
        'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.43.108;]',
      ),
    ).toBe('other');
    expect(detectInstallPlatform(UA.androidChrome)).toBe('android');
  });
});

describe('installMethod', () => {
  it('prompts when the browser handed over its prompt, guides on iOS', () => {
    expect(installMethod({ platform: 'android', standalone: false, canPrompt: true })).toBe('prompt');
    expect(installMethod({ platform: 'desktop', standalone: false, canPrompt: true })).toBe('prompt');
    expect(installMethod({ platform: 'ios', standalone: false, canPrompt: false })).toBe('ios-guide');
    expect(installMethod({ platform: 'android', standalone: false, canPrompt: false })).toBeNull();
    expect(installMethod({ platform: 'ios', standalone: true, canPrompt: false })).toBeNull();
  });

  it('only hints "Open in Safari" in an iOS in-app browser', () => {
    expect(installMethod({ platform: 'unsupported-in-app', standalone: false, canPrompt: false })).toBe(
      'open-in-safari',
    );
    expect(OPEN_IN_SAFARI_HINT).toBe('Open in Safari to install');
  });
});

describe('shouldShowInstallBanner', () => {
  const now = Date.UTC(2026, 9, 9);
  const base: InstallBannerInput = {
    platform: 'android',
    standalone: false,
    canPrompt: true,
    visits: 2,
    firstTradeDone: false,
    dismissedAt: null,
    now,
  };
  const show = (o: Partial<InstallBannerInput>) => shouldShowInstallBanner({ ...base, ...o });

  it('shows from the second visit', () => {
    expect(show({ visits: 1 })).toBe(false);
    expect(show({ visits: 2 })).toBe(true);
    expect(show({ visits: 9 })).toBe(true);
  });

  it('shows on the first visit once a trade went through', () => {
    expect(show({ visits: 1, firstTradeDone: true })).toBe(true);
  });

  it('is mobile only', () => {
    expect(show({ platform: 'desktop' })).toBe(false);
    expect(show({ platform: 'other' })).toBe(false);
    expect(show({ platform: 'ios', canPrompt: false })).toBe(true);
    // The hint banner, on the same rule.
    expect(show({ platform: 'unsupported-in-app', canPrompt: false })).toBe(true);
    expect(show({ platform: 'unsupported-in-app', canPrompt: false, visits: 1 })).toBe(false);
  });

  it('hides once installed, or with nothing to install with', () => {
    expect(show({ standalone: true })).toBe(false);
    expect(show({ platform: 'ios', canPrompt: false, standalone: true })).toBe(false);
    expect(show({ canPrompt: false })).toBe(false);
  });

  it('stays hidden for 14 days after "Not now"', () => {
    expect(show({ dismissedAt: now - 1000 })).toBe(false);
    expect(show({ dismissedAt: now - INSTALL_DISMISS_MS + 1 })).toBe(false);
    expect(show({ dismissedAt: now - INSTALL_DISMISS_MS })).toBe(true);
    expect(show({ dismissedAt: now - INSTALL_DISMISS_MS, firstTradeDone: true, visits: 1 })).toBe(true);
  });
});
