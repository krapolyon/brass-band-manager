import { useSyncExternalStore } from 'react';
import { HOME } from './session.ts';

// The install guide (model/members.md, entry 3, "Install guide"): putting the
// app on the home screen of a phone or a tablet. Everything happens in the
// browser: nothing is sent to the server, nothing is stored about the device
// but whether the guide was offered.

/** The address of the guide. */
export const INSTALL_GUIDE = '/install-app';

/**
 * Which guide this device gets, or null when it gets none:
 * - "android": an Android phone or tablet;
 * - "iosSafari": an iPhone or an iPad, in Safari;
 * - "iosOther": an iPhone or an iPad, in another browser (Chrome, Firefox, Edge,
 *   or the browser inside another app), which cannot install it.
 *
 * Null on a computer, where Chrome and Edge offer to install it themselves,
 * and when the app is already installed (opened from its icon).
 *
 * How a device is told apart, from what the browser says of itself:
 * - an iPhone says "iPhone" (or "iPod"); an iPad says "iPad", or since iPadOS 13
 *   says it is a Mac ("Macintosh"), and is then told by its touch screen: a
 *   Mac has no touch points, an iPad several;
 * - an Android phone or tablet says "Android";
 * - anything else is a computer: Windows, macOS, Linux, ChromeOS.
 * On an iPhone or an iPad, Safari is the browser that says "Safari" and none of
 * the names the others add: CriOS (Chrome), FxiOS (Firefox), EdgiOS (Edge),
 * OPiOS or OPT (Opera), GSA (the Google app), DuckDuckGo. The browser of
 * another app (Instagram, Facebook, Messenger) does not say "Safari".
 */
export type InstallPlatform = 'android' | 'iosSafari' | 'iosOther';

export function installPlatform(): InstallPlatform | null {
  if (isInstalled()) return null;
  const agent = navigator.userAgent;
  const isApple =
    /iPhone|iPad|iPod/.test(agent) || (agent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (isApple) {
    const isSafari =
      agent.includes('Safari/') && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo/.test(agent);
    return isSafari ? 'iosSafari' : 'iosOther';
  }
  return /Android/.test(agent) ? 'android' : null;
}

/** Opened from its icon on the home screen. `navigator.standalone` is the older word of Safari. */
export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Whether the guide was offered on this device. A comfort kept in the browser,
// like the text size: nothing personal, and losing it only offers it again.
const OFFERED = 'installGuideOffered';

const wasOffered = () => {
  try {
    return localStorage.getItem(OFFERED) !== null;
  } catch {
    // A browser that keeps nothing would offer it at every sign-in: never then.
    return true;
  }
};

export const rememberOffered = () => {
  try {
    localStorage.setItem(OFFERED, '1');
  } catch {
    // Nothing kept: wasOffered() says yes all the same.
  }
};

/** Where a member goes once signed in, or once their invitation is completed. */
export function afterSignIn(): string {
  return installPlatform() !== null && !wasOffered() ? INSTALL_GUIDE : HOME;
}

// The install window of the browser. Chrome on Android fires
// `beforeinstallprompt` when it would install the app, often before the guide
// is on the screen: it is listened for from the start of the app, and kept
// until it is used, once.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let installPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    // The guide offers it; the browser's own banner would offer it twice.
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    changed();
  });
}

/** Whether the browser offers its install window right now. */
export function useInstallPrompt(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => installPrompt !== null,
  );
}

/** Opens the install window of the browser. True when the member installed the app. */
export async function promptInstall(): Promise<boolean> {
  const event = installPrompt;
  if (!event) return false;
  // An event opens the window once: the guide falls back to the steps.
  installPrompt = null;
  changed();
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}
