import { useSyncExternalStore } from 'react';
import {
  type AccessibilityOptions,
  noAccessibilityOption,
  type TextSize,
  textSizes,
} from './appearance.ts';

// The accessibility options of this device (model/members.md,
// "Accessibility before sign-in" and "Accessibility options"). They are kept
// in the storage of the browser and are sent to no one.
//   - The text size belongs to the device, signed in or not: a bigger text is
//     wanted on a phone, rarely on a computer (issue #18). Signing in or out
//     does not change it.
//   - The five other options chosen before sign-in apply whenever nobody is
//     signed in on this device; once someone is, those of their account do.
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

/** Changes the text size of this device, whoever is signed in. */
export function setDeviceTextSize(size: TextSize) {
  setDeviceAccessibility({ ...current, textSizePercent: size });
}

/** The text size of this device, or the one being chosen during an invitation. */
export function useDeviceTextSize(): TextSize {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (preview ?? current).textSizePercent,
  );
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
