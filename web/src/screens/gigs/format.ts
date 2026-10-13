import type { TFunction } from 'i18next';
import { dayOf, type Gig, type GigSummary, isOver } from '../../gigs.ts';

// How a gig is written on the screens: its dates through Intl, in the
// language of the member, and its time and place as the design writes them.

const capital = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** "18:30" as the locale says it: "18 h 30", "14 h". */
export function timeText(t: TFunction, time: string): string {
  const [hours, minutes] = time.split(':');
  return minutes === '00'
    ? t('gigs.time.sharp', { hours: Number(hours) })
    : t('gigs.time.withMinutes', { hours: Number(hours), minutes });
}

/** The three lines of the date block of a card: "sam.", "24" (or "4–6"), "oct.". */
export function dateBlock(gig: Pick<GigSummary, 'startsOn' | 'endsOn'>, language: string) {
  const start = dayOf(gig.startsOn);
  const end = gig.endsOn ? dayOf(gig.endsOn) : null;

  return {
    weekday: new Intl.DateTimeFormat(language, { weekday: 'short' }).format(start),
    day: end ? `${start.getDate()}–${end.getDate()}` : String(start.getDate()),
    month: new Intl.DateTimeFormat(language, { month: 'short' }).format(start),
  };
}

/** "Octobre", and "Février 2027" for another year than this one. */
export function monthTitle(day: string, language: string, now = new Date()): string {
  const date = dayOf(day);
  const year = date.getFullYear() === now.getFullYear() ? undefined : 'numeric';
  return capital(new Intl.DateTimeFormat(language, { month: 'long', year }).format(date));
}

/** "samedi 24 octobre"; with the year when it is not this one. */
export function dayText(day: string, language: string, now = new Date()): string {
  const date = dayOf(day);
  const year = date.getFullYear() === now.getFullYear() ? undefined : 'numeric';
  return new Intl.DateTimeFormat(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year,
  }).format(date);
}

/** The days of a gig: "Samedi 24 octobre", or "Du vendredi 4 au dimanche 6 décembre". */
export function daysText(
  t: TFunction,
  gig: Pick<GigSummary, 'startsOn' | 'endsOn'>,
  language: string,
) {
  if (!gig.endsOn) return capital(dayText(gig.startsOn, language));

  const start = dayOf(gig.startsOn);
  const end = dayOf(gig.endsOn);
  // The month is said once when both days are in the same one.
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const from = sameMonth
    ? new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric' }).format(start)
    : dayText(gig.startsOn, language);
  return t('gigs.time.range', { from, to: dayText(gig.endsOn, language) });
}

/** The meeting of a gig: "RDV 17 h 30", "RDV 18 h le vendredi" for several days; null without a time. */
export function meetingText(
  t: TFunction,
  gig: Pick<GigSummary, 'startsOn' | 'endsOn' | 'meetingTime'>,
  language: string,
): string | null {
  if (!gig.meetingTime) return null;
  const time = timeText(t, gig.meetingTime);
  if (!gig.endsOn) return t('gigs.time.meeting', { time });

  const weekday = new Intl.DateTimeFormat(language, { weekday: 'long' }).format(
    dayOf(gig.startsOn),
  );
  return t('gigs.time.meetingOn', { time, weekday });
}

/** The line under the name of a gig: "Samedi 24 octobre · RDV 17 h 30". */
export function whenText(
  t: TFunction,
  gig: Pick<GigSummary, 'status' | 'startsOn' | 'endsOn' | 'meetingTime'>,
  language: string,
  withMeeting = true,
): string {
  const days = daysText(t, gig, language);
  if (!withMeeting) return days;

  const meeting = meetingText(t, gig, language);
  if (meeting) return `${days} · ${meeting}`;
  // A time still to come is worth saying only while the gig is being set up.
  const settingUp = gig.status !== 'CANCELLED' && gig.status !== 'CONFIRMED' && !isOver(gig);
  return settingUp ? `${days} · ${t('gigs.time.toComeLower')}` : days;
}

/** The place of a gig on one line: its name, its street, its postal code and city. */
export function whereText(
  gig: Pick<Gig, 'placeName' | 'streetAddress' | 'postalCode' | 'city'>,
): string {
  return [gig.placeName, addressText(gig)].filter(Boolean).join(', ');
}

/** The address alone: "12 rue des Capucins, 69001 Lyon". */
export function addressText(gig: Pick<Gig, 'streetAddress' | 'postalCode' | 'city'>): string {
  const town = [gig.postalCode, gig.city].filter(Boolean).join(' ');
  return [gig.streetAddress?.replace(/\n+/g, ', '), town].filter(Boolean).join(', ');
}

/** The place of a gig in the list: its name, else its postal code and city. */
export function shortPlace(gig: Pick<GigSummary, 'placeName' | 'postalCode' | 'city'>): string {
  return gig.placeName ?? [gig.postalCode, gig.city].filter(Boolean).join(' ');
}

/** A list of sections inside a sentence. A section is named as it is, never in the plural: "Percu et Souba". */
export function inSentence(names: string[], language: string): string {
  return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(names);
}
