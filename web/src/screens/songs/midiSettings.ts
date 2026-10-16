import { useCallback, useSyncExternalStore } from 'react';

// The settings of the MIDI player of a song: which tracks are cut, the tempo,
// how loud the cut tracks stay. One state for the MIDI mode and for the Live
// mode driven by the MIDI player (model/songs.md, "The reading mode driven by
// the MIDI player"): what the member set in one is found in the other. Kept
// in the memory of the page while the app is open, nothing is saved.

export type MidiSettings = {
  /** The tempo chosen, in counted beats a minute. */
  bpm: number;
  /** One per track of the file: cut or not. */
  muted: boolean[];
  /** How loud a cut track stays, in steps of 5 % from 0. */
  mutedStep: number;
};

const settings = new Map<number, MidiSettings>();
// What a song whose file is not read yet answers: always the same object.
const NONE: MidiSettings = { bpm: 0, muted: [], mutedStep: 0 };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The settings of a song, started from the tempo of the band and every track
 * heard; and the way to change them.
 */
export function useMidiSettings(songId: number, bpm: number, tracks: number) {
  const read = useCallback(() => {
    const known = settings.get(songId);
    if (known && known.muted.length === tracks) return known;
    // The file is not read yet: nothing is stored, what is known stays.
    if (tracks === 0) return known ?? NONE;
    const first = { bpm, muted: Array.from({ length: tracks }, () => false), mutedStep: 0 };
    settings.set(songId, first);
    return first;
  }, [songId, bpm, tracks]);
  const current = useSyncExternalStore(subscribe, read);
  const change = useCallback(
    (changes: Partial<MidiSettings>) => {
      if (tracks === 0) return;
      settings.set(songId, { ...read(), ...changes });
      for (const listener of listeners) listener();
    },
    [songId, read, tracks],
  );
  return [current, change] as const;
}
