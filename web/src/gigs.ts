import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';
import type { AttendanceAnswer } from './components/AttendanceChoices.tsx';
import type { Section } from './members.ts';

// The gigs of the band, as the API answers them (api/src/Gigs/Gigs.php), and
// what the screens read from them. Rules: model/gigs.md.

export const gigStatuses = ['DRAFT', 'PROPOSED', 'ACCEPTED', 'CONFIRMED', 'CANCELLED'] as const;
export type GigStatus = (typeof gigStatuses)[number];

/** The statuses a gig can be changed to by hand (model/gigs.md, "Life cycle"). The API decides. */
export const nextStatuses: Record<GigStatus, GigStatus[]> = {
  DRAFT: ['PROPOSED', 'CANCELLED'],
  PROPOSED: ['ACCEPTED', 'CONFIRMED', 'CANCELLED'],
  ACCEPTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
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
  isPlayable: boolean;
  /** Playable if the members who answered "if needed" came. */
  isPlayableIfNeeded: boolean;
  /** The sections that have no yes. */
  missingSectionIds: number[];
  /** The section of the member is the last one without a yes. */
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
  notes: string | null;
  /** An instant in UTC; null when the members were never reminded. */
  remindedAt: string | null;
  organizers: { id: number; nickname: string }[];
  costumes: GigCostume[];
  slots: GigSlot[];
  /** Sent to who may edit the gig only. */
  discordChannelId?: string | null;
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

export function useGig(gigId: number, enabled = true) {
  return useQuery({
    queryKey: ['gig', gigId],
    queryFn: () => api<Gig>(`/api/gigs/${gigId}`),
    enabled,
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
