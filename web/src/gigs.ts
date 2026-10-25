import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';
import type { AttendanceAnswer } from './components/AttendanceChoices.tsx';
import type { Section } from './members.ts';
import type { DiscordMessage } from './songs.ts';

// The gigs of the band, as the API answers them (api/src/Gigs/Gigs.php), and
// what the screens read from them. Rules: model/gigs.md.

export const gigStatuses = ['DRAFT', 'PROPOSED', 'ACCEPTED', 'CONFIRMED', 'CANCELLED'] as const;
export type GigStatus = (typeof gigStatuses)[number];

/** The statuses a gig can be changed to by hand (model/gigs.md, "Life cycle"). The API decides. */
export const nextStatuses: Record<GigStatus, GigStatus[]> = {
  DRAFT: ['PROPOSED', 'CANCELLED'],
  PROPOSED: ['ACCEPTED', 'CONFIRMED', 'CANCELLED'],
  ACCEPTED: ['CONFIRMED', 'CANCELLED'],
  // Put back by hand, for a confirmation made by mistake.
  CONFIRMED: ['ACCEPTED', 'PROPOSED', 'CANCELLED'],
  CANCELLED: ['DRAFT', 'PROPOSED'],
};

/** A slot of a gig in the list: the answer of the member who asks, and whether it is playable. */
export type GigSlotSummary = {
  id: number;
  /** Null for the only slot of a gig. */
  name: string | null;
  position: number;
  costumeId: number | null;
  ownAnswer: AttendanceAnswer | null;
  /** Every section has someone who answered yes or if needed (model/gigs.md, "Playable", #37). */
  isPlayable: boolean;
  /** The sections with nobody who answered yes or if needed. */
  missingSectionIds: number[];
  /** Who the slot counts on without a yes in their section: those who answered if needed. */
  playableThanksTo: { memberId: number; nickname: string; sectionId: number }[];
  /** The section of the member is the last one without anyone. */
  ownYesMakesPlayable: boolean;
};

export type GigAnswer = {
  memberId: number;
  nickname: string;
  sectionId: number;
  answer: AttendanceAnswer;
  /** False for a member who left: their answer no longer counts. */
  isCurrentMember: boolean;
};

export type GigSlot = GigSlotSummary & { note: string | null; answers: GigAnswer[] };

/** A gig in the list. */
export type GigSummary = {
  id: number;
  name: string;
  status: GigStatus;
  /** A day, "2026-12-04". */
  startsOn: string;
  /** The last day of a gig of several days; null for one day. */
  endsOn: string | null;
  /** "18:30", on the clock of the place. */
  meetingTime: string | null;
  placeName: string | null;
  postalCode: string | null;
  city: string | null;
  isPlayable: boolean;
  /** An instant in UTC: when members first saw the gig. Null for a gig that has only been a draft. */
  proposedAt: string | null;
  /** The member manages gigs, or organises this one. */
  canEdit: boolean;
  slots: GigSlotSummary[];
};

export type GigCostume = { id: number; name: string; pictureUrl: string | null };

/** A gig with everything its screen shows. */
export type Gig = Omit<GigSummary, 'slots'> & {
  placeUrl: string | null;
  streetAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Where the map of the meeting point reads its tiles; null when the gig shows no map. */
  mapTilesUrl: string | null;
  notes: string | null;
  /** An instant in UTC; null when the members were never reminded. */
  remindedAt: string | null;
  organizers: { id: number; nickname: string }[];
  costumes: GigCostume[];
  slots: GigSlot[];
  /** Shown from "Validé" on; empty before. */
  setlists: Setlist[];
  /** The Discord channel of the gig, for every member who sees it (since 0.3.0). */
  discordChannelId: string | null;
  /** The link that opens it in Discord; null without a channel or while the band has no server. */
  discordUrl: string | null;
  /** The time counted between two songs of a setlist (band.setlistGapSeconds). */
  setlistGapSeconds: number;
  /** The length the setlist generator proposes first, in minutes (band.setlistTargetMinutes). */
  setlistTargetMinutes: number;
};

export type SetlistSong = {
  position: number;
  songId: number;
  name: string;
  /** How long the song lasts, in seconds; null: not known. For the length of the setlist. */
  durationSeconds: number | null;
};

/** A setlist of a gig: its songs in order, and where its live session is. */
export type Setlist = {
  id: number;
  gigId: number;
  /** The slot it is played at: its members who said yes follow it live. */
  gigSlotId: number;
  /** Given by the app, within its gig: 1, 2, 3… */
  number: number;
  description: string | null;
  /** An instant in UTC; null when the setlist is not live. */
  liveStartedAt: string | null;
  /** The position of the song being played; null when the setlist is not live. */
  livePosition: number | null;
  songs: SetlistSong[];
};

export type Costume = {
  id: number;
  name: string;
  position: number;
  pictureUrl: string | null;
  /** How many gigs have it, those already played included: it cannot be deleted while one does. */
  gigCount: number;
};

/** The gigs to come; with `everything`, the cancelled ones and those already played too. */
export function useGigs(everything: boolean) {
  return useQuery({
    queryKey: ['gigs', everything ? 'all' : 'coming'],
    queryFn: () => api<GigSummary[]>(everything ? '/api/gigs?all' : '/api/gigs'),
  });
}

/** The messages of the channel of a gig that tag the app (#45), read when its sheet opens. Never an error. */
export function useGigDiscord(gigId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['gig', gigId, 'discord'],
    queryFn: () => api<{ messages: DiscordMessage[] }>(`/api/gigs/${gigId}/discord`),
    enabled,
    // The server keeps what Discord said 10 minutes: asking more often brings nothing.
    staleTime: 60_000,
    retry: false,
  });
}

export function useGig(gigId: number, enabled = true) {
  return useQuery({
    queryKey: ['gig', gigId],
    queryFn: () => api<Gig>(`/api/gigs/${gigId}`),
    enabled,
    // On the days of a confirmed gig its setlists go live and move on: the
    // screen of the gig asks again from time to time.
    refetchInterval: (query) => {
      const gig = query.state.data;
      const isPlayed =
        gig?.status === 'CONFIRMED' && !isOver(gig) && dayOf(gig.startsOn) <= new Date();
      return isPlayed ? 15_000 : false;
    },
  });
}

/** One setlist, asked again every few seconds: the live screen follows it. */
export function useSetlist(setlistId: number) {
  return useQuery({
    queryKey: ['setlist', setlistId],
    queryFn: () => api<Setlist & { gigName: string }>(`/api/setlists/${setlistId}`),
    refetchInterval: 4000,
  });
}

export function useCostumes() {
  return useQuery({ queryKey: ['costumes'], queryFn: () => api<Costume[]>('/api/costumes') });
}

// ---------------------------------------------------------------
// What is read from the dates, on the clock of the device. "In progress" and
// "past" are never stored (model/gigs.md, "Life cycle").
// ---------------------------------------------------------------

/** A day of the model as a date of the device, at midnight. */
export function dayOf(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1);
}

const today = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

type Dated = Pick<GigSummary, 'status' | 'startsOn' | 'endsOn' | 'meetingTime'>;

/** The last day of the gig is behind us. */
export function isOver(gig: Dated, now = new Date()): boolean {
  return dayOf(gig.endsOn ?? gig.startsOn) < today(now);
}

/**
 * What the dates add to the status:
 * - inProgress: a confirmed gig, from 20 minutes after the meeting time on
 *   the first day (the start of the day without one) to the end of the last day
 * - past: a confirmed gig whose last day is behind us
 * - toClose: a gig proposed or accepted whose date has passed: it was not played
 * - outdated: a draft whose date has passed
 */
export type GigMoment = 'inProgress' | 'past' | 'toClose' | 'outdated' | null;

export function momentOf(gig: Dated, now = new Date()): GigMoment {
  if (gig.status === 'CANCELLED') return null;
  if (isOver(gig, now)) {
    return gig.status === 'CONFIRMED' ? 'past' : gig.status === 'DRAFT' ? 'outdated' : 'toClose';
  }
  if (gig.status !== 'CONFIRMED') return null;

  const start = dayOf(gig.startsOn);
  if (gig.meetingTime) {
    const [hours, minutes] = gig.meetingTime.split(':').map(Number);
    start.setHours(hours ?? 0, (minutes ?? 0) + 20);
  }
  return now >= start ? 'inProgress' : null;
}

/** A gig behind us: played, or not played and its date passed. */
export function isBehind(gig: Dated, now = new Date()): boolean {
  const moment = momentOf(gig, now);
  return moment === 'past' || moment === 'toClose' || moment === 'outdated';
}

/** Members answer while the gig is proposed, accepted or confirmed, until it is over. */
export function isOpen(gig: Dated, now = new Date()): boolean {
  return ['PROPOSED', 'ACCEPTED', 'CONFIRMED'].includes(gig.status) && !isOver(gig, now);
}

/** A gig whose playability matters: not a draft, not cancelled, not confirmed, not over. */
export function showsPlayable(gig: Dated, now = new Date()): boolean {
  return (gig.status === 'PROPOSED' || gig.status === 'ACCEPTED') && !isOver(gig, now);
}

// ---------------------------------------------------------------
// Sections
// ---------------------------------------------------------------

/** The names of these sections, in the order of the band. */
export function sectionNames(sections: Section[] | undefined, ids: number[]): string[] {
  return (sections ?? []).filter((section) => ids.includes(section.id)).map(({ name }) => name);
}

/** The slot of a gig that is nearest to playable: what a gig that is not playable lacks. */
export function nearestSlot<Slot extends GigSlotSummary>(slots: Slot[]): Slot | undefined {
  return [...slots].sort(
    (a, b) => a.missingSectionIds.length - b.missingSectionIds.length || a.position - b.position,
  )[0];
}
