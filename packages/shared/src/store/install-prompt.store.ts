import { create } from 'zustand';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/pwa/install';

/** Chrome / Edge's install event — not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY = 'deor.pwa.install';
/** Set for the rest of the tab's session once its visit is counted. */
const VISIT_COUNTED_KEY = 'deor.pwa.visitCounted';

interface Persisted {
  visits: number;
  firstTradeDone: boolean;
  dismissedAt: number | null;
}

interface InstallPromptState extends Persisted {
  /** Browser state has been read (never on the server). */
  ready: boolean;
  platform: InstallPlatform;
  /** Running as the installed app — or just installed from this tab. */
  standalone: boolean;
  /** The deferred `beforeinstallprompt`; usable once. */
  deferredPrompt: BeforeInstallPromptEvent | null;
  /** The iOS "Share → Add to Home Screen" sheet. */
  iosGuideOpen: boolean;
  setIosGuideOpen: (open: boolean) => void;
  /** Shows the browser's install dialog, or the iOS guide where there is none. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'ios-guide' | 'unavailable'>;
  /** "Not now": hides the banner for 14 days. */
  dismiss: () => void;
  markFirstTrade: () => void;
}

const EMPTY: Persisted = { visits: 0, firstTradeDone: false, dismissedAt: null };

const readPersisted = (): Persisted => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Persisted>) } : EMPTY;
  } catch {
    // Storage blocked (private mode, embedded) or junk: start over.
    return EMPTY;
  }
};

const writePersisted = ({ visits, firstTradeDone, dismissedAt }: Persisted) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ visits, firstTradeDone, dismissedAt }),
    );
  } catch {
    // Not persisted — the banner just shows a little later (or again).
  }
};

/** One per tab session, so reloads and in-app navigation don't count. */
const isNewVisit = () => {
  try {
    if (window.sessionStorage.getItem(VISIT_COUNTED_KEY)) return false;
    window.sessionStorage.setItem(VISIT_COUNTED_KEY, '1');
    return true;
  } catch {
    return true;
  }
};

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Install-prompt state (plan 5.4). The decision itself is the pure
 * shouldShowInstallBanner in lib/pwa/install.ts; this holds what it reads.
 */
export const useInstallPromptStore = create<InstallPromptState>((set, get) => ({
  ...EMPTY,
  ready: false,
  platform: 'other',
  standalone: false,
  deferredPrompt: null,
  iosGuideOpen: false,

  setIosGuideOpen: (open) => set({ iosGuideOpen: open }),

  promptInstall: async () => {
    const { deferredPrompt, platform, standalone } = get();
    if (deferredPrompt) {
      // A prompt can be shown once; the browser fires a new event if needed.
      set({ deferredPrompt: null });
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      return outcome;
    }
    if (platform === 'ios' && !standalone) {
      set({ iosGuideOpen: true });
      return 'ios-guide';
    }
    return 'unavailable';
  },

  dismiss: () => {
    set({ dismissedAt: Date.now() });
    writePersisted(get());
  },

  markFirstTrade: () => {
    if (get().firstTradeDone) return;
    set({ firstTradeDone: true });
    writePersisted(get());
  },
}));

/** Call after a trade confirms; the first one may surface the install banner. */
export const markFirstTrade = () => useInstallPromptStore.getState().markFirstTrade();

// Listening from module load, not from a component: Chrome can fire
// `beforeinstallprompt` before React has mounted anything.
if (typeof window !== 'undefined') {
  const persisted = readPersisted();
  if (isNewVisit()) {
    persisted.visits += 1;
    writePersisted(persisted);
  }
  useInstallPromptStore.setState({
    ...persisted,
    ready: true,
    platform: detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints),
    standalone: isStandalone(),
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep Chrome's own mini-infobar away; the banner / menu prompt instead.
    event.preventDefault();
    useInstallPromptStore.setState({ deferredPrompt: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    useInstallPromptStore.setState({ deferredPrompt: null, standalone: true });
  });
}
