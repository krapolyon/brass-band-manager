import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, api } from './api.ts';
import type { AccentTheme } from './themes.ts';

// What GET /api/band answers (api/src/Band/Bands.php): what the app shows
// without signing in.
export type Band = {
  name: string;
  /** The language of the screens shown before sign-in, and of new members. */
  defaultLanguage: string;
  /** The accent theme shown before sign-in, and to members who have chosen none. */
  defaultAccentTheme: AccentTheme;
  /** The country a phone number typed without its prefix belongs to. */
  defaultCountryCode: string;
  /** Null when the band has no logo. */
  logoUrl: string | null;
  /** The square icons made from the logo, by size in pixels. */
  icons: Record<'180' | '192' | '512', string> | null;
};

/** The band of this instance; null while the app is not installed. */
export function useBand() {
  return useQuery({
    queryKey: ['band'],
    queryFn: async (): Promise<Band | null> => {
      try {
        return await api<Band>('/api/band');
      } catch (error) {
        if (error instanceof ApiError && error.error === 'notInstalled') return null;
        throw error;
      }
    },
  });
}

// Gives the page the name and the icon of the band: the title of the tab, the
// icon of the tab, and the icon an iPhone takes when the app is added to its
// home screen. Without a band, or without a logo, index.html keeps its own.
export function BandIdentity() {
  const band = useBand().data;

  useEffect(() => {
    if (!band) return;
    document.title = band.name;
    if (!band.icons) return;
    document.querySelector('link[rel="icon"]')?.setAttribute('href', band.icons['192']);
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', band.icons['180']);
  }, [band]);

  return null;
}
