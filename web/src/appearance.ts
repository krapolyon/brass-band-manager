import { type AccentTheme, accentThemes } from './themes.ts';

// How the app looks for whoever is in front of it: the scheme, the accent
// theme and the six accessibility options (model/members.md). This module
// writes them on the root element, where styles/tokens.css and
// styles/base.css read them. It is the only place that does.

export const textSizes = [100, 120, 140, 160, 180, 200] as const;
export type TextSize = (typeof textSizes)[number];

/** The six accessibility options, named as in the model. */
export type AccessibilityOptions = {
  textSizePercent: TextSize;
  hasHighContrast: boolean;
  hasIncreasedSpacing: boolean;
  hasLegibleFont: boolean;
  hasReducedMotion: boolean;
  hasExtendedTimeouts: boolean;
};

export type Appearance = AccessibilityOptions & {
  colorScheme: 'AUTO' | 'LIGHT' | 'DARK';
  /** Null: the theme of the band. */
  accentTheme: AccentTheme | null;
};

export const noAccessibilityOption: AccessibilityOptions = {
  textSizePercent: 100,
  hasHighContrast: false,
  hasIncreasedSpacing: false,
  hasLegibleFont: false,
  hasReducedMotion: false,
  hasExtendedTimeouts: false,
};

// What applies now, and the theme of the band, which is known later than the rest.
let current: Appearance = { colorScheme: 'AUTO', accentTheme: null, ...noAccessibilityOption };
let bandTheme: AccentTheme | null = null;

const asks = (query: string) => window.matchMedia(query).matches;

function write() {
  const root = document.documentElement.dataset;
  const set = (name: string, value: string | null) => {
    if (value === null) delete root[name];
    else root[name] = value;
  };

  const light =
    current.colorScheme === 'LIGHT' ||
    (current.colorScheme === 'AUTO' && asks('(prefers-color-scheme: light)'));
  set('scheme', light ? 'light' : 'dark');
  // High contrast and reduced motion are also applied when the device asks for them.
  set('contrast', current.hasHighContrast || asks('(prefers-contrast: more)') ? 'more' : null);
  set(
    'motion',
    current.hasReducedMotion || asks('(prefers-reduced-motion: reduce)') ? 'reduced' : null,
  );
  set('theme', current.accentTheme ?? bandTheme);
  set('textSize', current.textSizePercent === 100 ? null : String(current.textSizePercent));
  set('typeface', current.hasLegibleFont ? 'legible' : null);
  set('spacing', current.hasIncreasedSpacing ? 'increased' : null);
  // Read by what shows a notification or a tooltip, when the app has some.
  set('timeouts', current.hasExtendedTimeouts ? 'extended' : null);
}

/** Applies the appearance and the accessibility options of whoever uses the app now. */
export function applyAppearance(appearance: Appearance) {
  current = appearance;
  write();
}

/** The theme of the band: the one of every screen before sign-in, and of a member who chose none. */
export function applyBandTheme(theme: string | null) {
  bandTheme = accentThemes.find((known) => known === theme) ?? null;
  write();
}

/** Follows the device when it changes its scheme, its contrast or its motion. Called once, at startup. */
export function followDevice() {
  for (const query of [
    '(prefers-color-scheme: light)',
    '(prefers-contrast: more)',
    '(prefers-reduced-motion: reduce)',
  ]) {
    window.matchMedia(query).addEventListener('change', write);
  }
  write();
}
