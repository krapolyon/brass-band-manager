// The setlist generator (model/gigs.md, entry 4, "Proposing a setlist";
// model/songs.md, "Setlist attributes"; issue #25). It runs in the browser,
// from the songs the editor already has: nothing is asked of the server and
// nothing about a draw is stored.
//
// No import of React or of the app here: the tests run it as it is, with a
// fixed random seed (tests/generator.spec.ts).

export type SetCategory =
  | 'OPENER'
  | 'PARTY'
  | 'KNOWN'
  | 'CHOREOGRAPHY'
  | 'CHILL'
  | 'ENCORE'
  | 'STANDARD';

/** What the generator reads of a song. */
export type CandidateSong = {
  id: number;
  status: string;
  setCategory: SetCategory;
  otherCategories: SetCategory[];
  isNeverFirst: boolean;
  tiringSectionIds: number[];
  trickySectionIds: number[];
  /** "2026-09-01"; null: not new. */
  inRepertoireOn: string | null;
};

/**
 * The rules, in the order of the model: when they cannot all be kept, the
 * last ones are dropped first.
 */
export const rules = ['opener', 'closer', 'halves', 'tiring', 'neighbours', 'alternate'] as const;
export type Rule = (typeof rules)[number];

export type Proposal = {
  songIds: number[];
  /** The rules that could not be kept, in the order of the model. */
  dropped: Rule[];
  /** Fewer songs could be proposed than asked: the repertoire has no more. */
  isShort: boolean;
};

type Options = {
  songs: CandidateSong[];
  count: number;
  includeNew: boolean;
  /** The songs already in the other setlists of the gig: left out as long as there are enough. */
  avoid: number[];
  /** Today, "2026-10-18": a song is new for 2 months after it entered the repertoire. */
  today: string;
  /** A number from 0 to 1, as Math.random gives; the tests give a seeded one. */
  random: () => number;
};

// A song a setlist can hold (model/gigs.md, entry 4).
const PLAYABLE = ['IN_REPERTOIRE', 'TEMPORARY'];
// Many tries, then one rule fewer: a small repertoire is decided fast.
const TRIES = 400;

/** True when the song entered the repertoire less than 2 months before `today`. */
export function isNew(song: Pick<CandidateSong, 'inRepertoireOn'>, today: string): boolean {
  if (!song.inRepertoireOn) return false;
  const [year, month, day] = today.split('-').map(Number);
  const limit = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 - 2, day ?? 1));
  return song.inRepertoireOn > limit.toISOString().slice(0, 10);
}

/** The songs the generator may draw from, with or without the new ones. */
export function candidatesOf<Song extends CandidateSong>(
  songs: Song[],
  includeNew: boolean,
  today: string,
): Song[] {
  return songs.filter(
    (song) => PLAYABLE.includes(song.status) && (includeNew || !isNew(song, today)),
  );
}

const serves = (song: CandidateSong, category: SetCategory) =>
  song.setCategory === category || song.otherCategories.includes(category);

/** Whether a song may stand at a place, with the song before it, under the first `kept` rules. */
function fits(
  song: CandidateSong,
  place: number,
  count: number,
  before: CandidateSong | undefined,
  kept: number,
) {
  const isFirst = place === 0;
  const isLast = place === count - 1;
  const inFirstHalf = place < count / 2;
  // 1. The first song is an opener, never one that is never first.
  if (kept >= 1 && isFirst && (!serves(song, 'OPENER') || song.isNeverFirst)) return false;
  // 2. The last is a party song or an encore (an encore is preferred when it is drawn).
  if (kept >= 2 && isLast && !serves(song, 'PARTY') && !serves(song, 'ENCORE')) return false;
  // 3. The main category places the song: opener in the first half, party in
  //    the second, encore at the end only.
  if (kept >= 3) {
    if (song.setCategory === 'OPENER' && !inFirstHalf) return false;
    if (song.setCategory === 'PARTY' && inFirstHalf && count > 1) return false;
    if (song.setCategory === 'ENCORE' && !isLast) return false;
  }
  // 4. A tiring song stays in the first half.
  if (kept >= 4 && song.tiringSectionIds.length > 0 && !inFirstHalf) return false;
  if (!before) return true;
  // 5. Two choreographies never follow each other, nor two songs tricky for the same section.
  if (kept >= 5) {
    if (serves(song, 'CHOREOGRAPHY') && serves(before, 'CHOREOGRAPHY')) return false;
    if (song.trickySectionIds.some((section) => before.trickySectionIds.includes(section))) {
      return false;
    }
  }
  // 6. The categories alternate: two songs of the same main category do not
  //    follow each other (Standard is no category).
  if (kept >= 6 && song.setCategory !== 'STANDARD' && song.setCategory === before.setCategory) {
    return false;
  }
  return true;
}

function shuffled<T>(list: T[], random: () => number): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

/**
 * One draw: the last song first (an encore when one fits), then the others
 * from the start. Null when the draw ends in a dead end.
 */
function draw(
  pool: CandidateSong[],
  count: number,
  kept: number,
  random: () => number,
): CandidateSong[] | null {
  const order: (CandidateSong | undefined)[] = Array.from({ length: count });
  const used = new Set<number>();
  const last = count - 1;
  const lasts = shuffled(pool, random).filter((song) => fits(song, last, count, undefined, kept));
  const closer = (kept >= 2 ? lasts.find((song) => serves(song, 'ENCORE')) : undefined) ?? lasts[0];
  if (!closer) return null;
  order[last] = closer;
  used.add(closer.id);

  for (let place = 0; place < last; place++) {
    const before = order[place - 1];
    const next = shuffled(pool, random).find(
      (song) =>
        !used.has(song.id) &&
        fits(song, place, count, before, kept) &&
        // The song before the last must also let the last follow it.
        (place !== last - 1 || fits(closer, last, count, song, kept)),
    );
    if (!next) return null;
    order[place] = next;
    used.add(next.id);
  }
  return order as CandidateSong[];
}

/**
 * Proposes the songs of a setlist. Keeps every rule it can, dropping the last
 * ones first when the repertoire does not allow them all.
 */
export function propose({ songs, count, includeNew, avoid, today, random }: Options): Proposal {
  const candidates = candidatesOf(songs, includeNew, today);
  const fresh = candidates.filter((song) => !avoid.includes(song.id));
  // The songs of the other setlists of the gig only when the others are not enough.
  const pool = fresh.length >= count ? fresh : candidates;
  const size = Math.min(count, pool.length);
  if (size === 0) return { songIds: [], dropped: [], isShort: count > 0 };

  for (let kept = rules.length; kept >= 0; kept--) {
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const order = draw(pool, size, kept, random);
      if (order) {
        return {
          songIds: order.map((song) => song.id),
          dropped: rules.slice(kept),
          isShort: size < count,
        };
      }
    }
  }
  // Without any rule a draw always succeeds; this is never reached.
  return {
    songIds: shuffled(pool, random)
      .slice(0, size)
      .map((song) => song.id),
    dropped: [...rules],
    isShort: size < count,
  };
}

/** A random number from a seed, always the same series for the same seed (mulberry32). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How long a setlist lasts (model/gigs.md, entry 4): the lengths of its songs
 * plus the time between two songs, rounded to the minute. Songs without a
 * length are left out of the sum, and counted apart.
 */
export function lengthOf(
  durations: (number | null)[],
  gapSeconds: number,
): { minutes: number; withoutLength: number } {
  const known = durations.filter((seconds): seconds is number => seconds !== null);
  const seconds =
    known.reduce((sum, one) => sum + one, 0) + gapSeconds * Math.max(0, durations.length - 1);
  return { minutes: Math.round(seconds / 60), withoutLength: durations.length - known.length };
}
