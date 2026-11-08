import SPLASH_SCREENS from './splash-screens.json';

/**
 * iOS ignores the manifest for its launch screen: a standalone web app shows
 * an `apple-touch-startup-image` whose media query matches the device exactly,
 * or a white screen. The sizes live in splash-screens.json so the generator
 * (apps/web/scripts/pwa-assets.mjs) and the <link> tags read the same list.
 * Portrait only — the manifest locks orientation to portrait.
 */
export interface SplashScreen {
  device: string;
  /** CSS px (device-width / device-height). */
  width: number;
  height: number;
  ratio: number;
}

export const splashScreens: SplashScreen[] = SPLASH_SCREENS;

export const splashPath = ({ width, height, ratio }: SplashScreen) =>
  `/splash/apple-splash-${width * ratio}x${height * ratio}.png`;

export const splashMedia = ({ width, height, ratio }: SplashScreen) =>
  `(device-width: ${width}px) and (device-height: ${height}px) and ` +
  `(-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;

/** `metadata.appleWebApp.startupImage`. */
export const appleStartupImages = () =>
  splashScreens.map((s) => ({ url: splashPath(s), media: splashMedia(s) }));
