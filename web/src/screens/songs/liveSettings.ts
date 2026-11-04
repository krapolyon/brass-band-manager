import { useEffect, useState } from 'react';

// The reading settings of the Live mode (model/songs.md, "The reading
// settings", 1.1.0): kept in the storage of the browser, for the member
// signed in on this device, and never sent to the server, as the install
// guide is. The switch "Jouer avec le MIDI" and the tempo are not kept: they
// start again at each opening.

export type Scrolling = 'continuous' | 'quickJump' | 'slowJump';

export type LiveSettings = {
  scrolling: Scrolling;
  /** The size of the score, in percent of the size drawn on a phone: 50 to 150, by 10. */
  size: number;
  /** Null until the member chooses: it then follows the switch "Jouer avec le MIDI". */
  hasMetronome: boolean | null;
  hidesControls: boolean;
};

export const SIZE_MIN = 50;
export const SIZE_MAX = 150;
export const SIZE_STEP = 10;

const DEFAULTS: LiveSettings = {
  scrolling: 'quickJump',
  size: 100,
  hasMetronome: null,
  hidesControls: false,
};

const keyOf = (memberId: number) => `liveReading:${memberId}`;

/** What is kept, each value checked: a value of another version or another hand is ignored. */
function read(memberId: number | undefined): LiveSettings {
  if (memberId === undefined) return DEFAULTS;
  try {
    const kept = JSON.parse(localStorage.getItem(keyOf(memberId)) ?? '{}') as Partial<LiveSettings>;
    const size = Number(kept.size);
    return {
      scrolling: ['continuous', 'quickJump', 'slowJump'].includes(kept.scrolling as string)
        ? (kept.scrolling as Scrolling)
        : DEFAULTS.scrolling,
      size: size >= SIZE_MIN && size <= SIZE_MAX && size % SIZE_STEP === 0 ? size : DEFAULTS.size,
      hasMetronome: typeof kept.hasMetronome === 'boolean' ? kept.hasMetronome : null,
      hidesControls: kept.hidesControls === true,
    };
  } catch {
    // No storage (a private window), or something else in it: the defaults.
    return DEFAULTS;
  }
}

export function useLiveSettings(
  memberId: number | undefined,
): [LiveSettings, (changes: Partial<LiveSettings>) => void] {
  const [settings, setSettings] = useState(() => read(memberId));
  // The member may be known only after the mode opened.
  useEffect(() => setSettings(read(memberId)), [memberId]);
  const change = (changes: Partial<LiveSettings>) => {
    const next = { ...settings, ...changes };
    setSettings(next);
    if (memberId === undefined) return;
    try {
      localStorage.setItem(keyOf(memberId), JSON.stringify(next));
    } catch {
      // Not kept on this device: it applies until the mode closes.
    }
  };
  return [settings, change];
}

/** Less motion, asked by the member or by the device (appearance.ts sets it on the root). */
export const isMotionReduced = () => document.documentElement.dataset.motion === 'reduced';
