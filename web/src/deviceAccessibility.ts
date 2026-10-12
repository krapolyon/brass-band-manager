import { useSyncExternalStore } from 'react';
import { type AccessibilityOptions, noAccessibilityOption, textSizes } from './appearance.ts';

// The accessibility options chosen before sign-in (model/members.md,
// "Accessibility before sign-in"). They are kept on the device only, in the
// storage of the browser, and are sent to no one. They apply on this device
// whenever nobody is signed in on it.
//
// The options of an account are never written here: they can hint at a
// disability, and a device can be shared.

const KEY = 'accessibility';

let current = read();
// Options being chosen during an invitation: shown at once, kept in the
// memory of the page only, and saved with the account when it is completed.
let preview: AccessibilityOptions | null = null;
const listeners = new Set<() => void>();

function read(): AccessibilityOptions {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const flag = (name: keyof AccessibilityOptions) => stored[name] === true;
    return {
      textSizePercent: textSizes.find((size) => size === stored.textSizePercent) ?? 100,
      hasHighContrast: flag('hasHighContrast'),
      hasIncreasedSpacing: flag('hasIncreasedSpacing'),
      hasLegibleFont: flag('hasLegibleFont'),
      hasReducedMotion: flag('hasReducedMotion'),
      hasExtendedTimeouts: flag('hasExtendedTimeouts'),
    };
  } catch {
    // A browser that refuses storage, or a value someone else wrote: no option.
    return noAccessibilityOption;
  }
}

export function setDeviceAccessibility(options: AccessibilityOptions) {
  current = options;
  try {
    localStorage.setItem(KEY, JSON.stringify(options));
  } catch {
    // Without storage the options hold until the page is closed.
  }
  for (const listener of listeners) listener();
}

/** Shows options that are not saved anywhere yet; null goes back to those of the device. */
export function previewAccessibility(options: AccessibilityOptions | null) {
  preview = options;
  for (const listener of listeners) listener();
}

/** The options that apply while nobody is signed in: those being chosen, or those of this device. */
export function useAccessibilityBeforeSignIn(): AccessibilityOptions {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preview ?? current,
  );
}
