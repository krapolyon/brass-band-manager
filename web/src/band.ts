import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, api } from './api.ts';
import { applyBandTheme } from './appearance.ts';
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
  /** False on an instance without a mail server: no forgotten password by email. */
  canSendEmail: boolean;
  /** Whether the band has a Discord server: the forms of songs and gigs then take the link of a channel. */
  hasDiscord: boolean;
  /** Null when the band has no logo. */
  logoUrl: string | null;
  /** The square icons of the installed app, by size in pixels: made from its own icon, else from the logo. */
  icons: Record<'180' | '192' | '512', string> | null;
  /** The icon the band gave for the installed app (its largest icon); null: the icons come from the logo. */
  appIconUrl: string | null;
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

// What GET /api/band/gigReminders answers, to who manages the band.
export type GigReminders = {
  /** How many days before a gig its two reminders are sent; null for a reminder that is not sent. */
  gigFirstReminderDays: number | null;
  gigSecondReminderDays: number | null;
  /** The hour of the day from which the reminders are sent, 0 to 23. */
  gigReminderHour: number;
  /** The time counted between two songs of a setlist, 0 to 300 seconds. */
  setlistGapSeconds: number;
};

export function useGigReminders(enabled: boolean) {
  return useQuery({
    queryKey: ['gigReminders'],
    queryFn: () => api<GigReminders>('/api/band/gigReminders'),
    enabled,
  });
}

// What GET /api/band/discord answers, to who manages the band
// (api/src/Band/DiscordSettingsAction.php).
export type DiscordSettings = {
  serverId: string | null;
  /** Whether the server configuration holds the token of a bot. */
  hasBot: boolean;
  /** none: no server, no bot, or not asked; refused: Discord said no; unreachable: no answer. */
  bot: 'none' | 'connected' | 'refused' | 'unreachable';
  serverName: string | null;
  /** The name of the app on Discord, the name of the bot (#45); null when Discord does not say. */
  botName: string | null;
  /** The roles a section can be tagged with; null when the bot could not read them. */
  roles: { id: string; name: string }[] | null;
  sections: { id: number; name: string; icon: string | null; discordRoleId: string | null }[];
};

/** The Discord settings of the band. `withBot` false: whether a server is set, without asking Discord. */
export function useDiscordSettings(enabled: boolean, withBot = true) {
  return useQuery({
    queryKey: ['discordSettings', withBot],
    queryFn: () => api<DiscordSettings>(`/api/band/discord${withBot ? '' : '?withoutBot'}`),
    enabled,
  });
}

// Gives the page the name, the accent theme and the icon of the band: the title of the tab, the
// icon of the tab, and the icon an iPhone takes when the app is added to its
// home screen. Without a band, or without a logo, index.html keeps its own.
export function BandIdentity() {
  const band = useBand().data;

  useEffect(() => {
    if (!band) return;
    document.title = band.name;
    applyBandTheme(band.defaultAccentTheme);
    if (!band.icons) return;
    document.querySelector('link[rel="icon"]')?.setAttribute('href', band.icons['192']);
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', band.icons['180']);
  }, [band]);

  return null;
}
