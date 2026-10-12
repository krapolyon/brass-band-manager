import { useEffect, useState } from 'react';
import type { SongMode } from '../../components/ModeBar.tsx';

// What the screens of songs keep on the device, and nowhere else: how the
// list is shown and the mode a song was last opened in. Neither says
// anything about the member; both are comforts, and a browser that refuses
// to keep them changes nothing else.

type Kept = { 'songs.view': 'rows' | 'grid'; 'songs.mode': SongMode };

const allowed: { [Key in keyof Kept]: readonly Kept[Key][] } = {
  'songs.view': ['rows', 'grid'],
  'songs.mode': ['mp3', 'midi', 'pdf', 'clip', 'live'],
};

export function kept<Key extends keyof Kept>(key: Key, otherwise: Kept[Key]): Kept[Key] {
  try {
    const value = window.localStorage.getItem(key) as Kept[Key] | null;
    return value !== null && allowed[key].includes(value) ? value : otherwise;
  } catch {
    return otherwise;
  }
}

export function keep<Key extends keyof Kept>(key: Key, value: Kept[Key]): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing, or a full storage: the choice lasts as long as the page.
  }
}

/** True from the desktop width (1024), where the layouts of the app change. */
export function useIsDesktop(): boolean {
  return useMedia('(min-width: 1024px)');
}

/** True from the tablet width (768). */
export function useIsTablet(): boolean {
  return useMedia('(min-width: 768px)');
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const follow = () => setMatches(media.matches);
    follow();
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [query]);

  return matches;
}
