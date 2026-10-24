// The setlist generator (model/gigs.md v1.11, entry 4, "Proposing a setlist";
// model/songs.md v1.9, "Setlist attributes"; issues #25, #47 and #60). It
// asks for a length (proposeForLength), and places the songs by the rules of
// the model (propose). It runs in the browser,
// from the songs the editor already has: nothing is asked of the server and
// nothing about a draw is stored.
//
// No import of React or of the app here: the tests run it as it is, with a
// fixed random seed (tests/generator.spec.ts).

export type SongMood = 'CHILL' | 'MEDIUM' | 'PARTY';
export type SetPosition = 'START' | 'FIRST_HALF' | 'MIDDLE' | 'SECOND_HALF' | 'END';

/** The positions in the order of a set. */
export const setPositions: SetPosition[] = ['START', 'FIRST_HALF', 'MIDDLE', 'SECOND_HALF', 'END'];

/** What the generator reads of a song. */
export type CandidateSong = {
  id: number;
  status: string;
  mood: SongMood;
  positions: SetPosition[];
  tiringSectionIds: number[];
  trickySectionIds: number[];
  /** "2026-09-01"; null: not new. */
  inRepertoireOn: string | null;
};

/**
 * The rules, in the order of the model (gigs.md v1.9, entry 4): when they
 * cannot all be kept, the last ones are dropped first. The mood is not one:
 * it weighs the draw and never blocks it.
 */
export const rules = ['positions', 'tiring', 'tricky'] as const;
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
// How many places at each end only take Début, or Fin.
const ENDS = 3;

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

/**
 * The positions a place of a set takes (model/songs.md, "Setlist
 * attributes"). Place `place` (0 is the first) of `count` is counted at its
 * centre: the first half is below 0.5, the middle from 0.35 to 0.65. The
 * first three take Début only, the last three Fin only; in a set of five or
 * fewer, a place among both takes either.
 */
export function positionsOf(place: number, count: number): SetPosition[] {
  const isFirst = place < ENDS;
  const isLast = place >= count - ENDS;
  if (isFirst && isLast) return ['START', 'END'];
  if (isFirst) return ['START'];
  if (isLast) return ['END'];
  const centre = (place + 0.5) / count;
  return [
    centre < 0.5 ? 'FIRST_HALF' : 'SECOND_HALF',
    ...(centre >= 0.35 && centre <= 0.65 ? (['MIDDLE'] as const) : []),
  ];
}

/** Whether a song may stand at a place under the first `kept` rules; its neighbours are checked apart. */
function fits(song: CandidateSong, place: number, count: number, kept: number) {
  const taken = positionsOf(place, count);
  // 1. Only where one of its positions allows.
  if (kept >= 1 && !song.positions.some((position) => taken.includes(position))) return false;
  // 2. A tiring song stays in the first half, except among the last three
  //    when it has Fin: Fin wins.
  const isSecondHalf = (place + 0.5) / count >= 0.5;
  const isLastWithEnd = place >= count - ENDS && song.positions.includes('END');
  if (kept >= 2 && song.tiringSectionIds.length > 0 && isSecondHalf && !isLastWithEnd) {
    return false;
  }
  return true;
}

// 3. Two songs tricky for the same section never follow each other.
const clashes = (one: CandidateSong, other: CandidateSong | undefined) =>
  other !== undefined &&
  one.trickySectionIds.some((section) => other.trickySectionIds.includes(section));

/**
 * How likely a song is drawn at a place (gigs.md, entry 4): Chill near the
 * start, Teuf near the end, Normal (MEDIUM) anywhere. A preference only: a song of
 * any mood can be drawn anywhere.
 */
function weightOf(song: CandidateSong, place: number, count: number): number {
  const centre = (place + 0.5) / count;
  if (song.mood === 'CHILL') return 0.25 + 2 * (1 - centre);
  if (song.mood === 'PARTY') return 0.25 + 2 * centre;
  return 1;
}

/**
 * The songs in a random order drawn with their weights at a place: a song
 * twice as likely comes first twice as often (Efraimidis and Spirakis).
 */
function weighted(songs: CandidateSong[], place: number, count: number, random: () => number) {
  return songs
    .map((song) => ({ song, key: random() ** (1 / weightOf(song, place, count)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ song }) => song);
}

function shuffled<T>(list: T[], random: () => number): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

type Draw = {
  pool: CandidateSong[];
  /** The songs of the other setlists of the gig. */
  avoided: Set<number>;
  /** How many of them the draw may take. */
  avoidedAllowed: number;
  count: number;
  kept: number;
  random: () => number;
};

/**
 * One draw. The last three places first, which the fewest songs can take,
 * then the others from the start; at each place the songs not avoided are
 * tried before the avoided ones. Null when the draw ends in a dead end.
 */
function draw({ pool, avoided, avoidedAllowed, count, kept, random }: Draw) {
  const order: (CandidateSong | undefined)[] = Array.from({ length: count });
  const used = new Set<number>();
  let avoidedLeft = avoidedAllowed;
  const lasts = Array.from({ length: Math.min(ENDS, count) }, (_, index) => count - 1 - index);
  const places = [...lasts, ...Array.from({ length: count }, (_, place) => place)].filter(
    (place, index, all) => all.indexOf(place) === index,
  );

  for (const place of places) {
    const mixed = weighted(pool, place, count, random);
    const next = [
      ...mixed.filter((song) => !avoided.has(song.id)),
      ...mixed.filter((song) => avoided.has(song.id) && avoidedLeft > 0),
    ].find(
      (song) =>
        !used.has(song.id) &&
        fits(song, place, count, kept) &&
        (kept < 3 || (!clashes(song, order[place - 1]) && !clashes(song, order[place + 1]))),
    );
    if (!next) return null;
    order[place] = next;
    used.add(next.id);
    if (avoided.has(next.id)) avoidedLeft -= 1;
  }
  return order as CandidateSong[];
}

/**
 * Proposes the songs of a setlist. Keeps every rule it can, dropping the last
 * ones first when the repertoire does not allow them all. The songs of the
 * other setlists of the gig come in only as many as are missing: a song
 * played twice in a gig weighs more than a rule dropped.
 */
export function propose({ songs, count, includeNew, avoid, today, random }: Options): Proposal {
  const pool = candidatesOf(songs, includeNew, today);
  const avoided = new Set(avoid.filter((id) => pool.some((song) => song.id === id)));
  const size = Math.min(count, pool.length);
  if (size === 0) return { songIds: [], dropped: [], isShort: count > 0 };
  const missing = Math.max(0, size - (pool.length - avoided.size));

  for (let kept = rules.length; kept >= 0; kept--) {
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const order = draw({ pool, avoided, avoidedAllowed: missing, count: size, kept, random });
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

/** What the generator by length reads of a song: the rest, and how long it lasts. */
export type TimedSong = CandidateSong & { durationSeconds: number | null };

/**
 * The mean length of the songs the generator can draw from, in seconds,
 * counted on those whose length is known. Null when none is known.
 */
export function meanLengthOf(songs: TimedSong[]): number | null {
  const known = songs.flatMap((song) => (song.durationSeconds ? [song.durationSeconds] : []));
  return known.length > 0 ? known.reduce((sum, one) => sum + one, 0) / known.length : null;
}

/**
 * How many songs should fit in a length (model/gigs.md v1.11, "Proposing a
 * setlist"): the length asked plus one gap, divided by the mean length of a
 * song plus one gap. One at least. Null when no length is known.
 */
export function songsThatFit(minutes: number, gapSeconds: number, mean: number | null) {
  if (mean === null) return null;
  return Math.max(1, Math.floor((minutes * 60 + gapSeconds) / (mean + gapSeconds)));
}

// When no song of the repertoire has a length, the generator cannot count in
// minutes: it proposes the number of songs it proposed before 0.4.0.
const COUNT_WITHOUT_LENGTHS = 10;
// How many draws a number of songs gets before the generator takes one fewer.
const DRAWS_PER_COUNT = 20;

/**
 * Proposes the songs of a setlist for a length, in minutes (issue #60): as
 * many songs as stay within it, counting the length of each song and the time
 * between two of them; a song without a length counts as the mean length of
 * the songs it can draw from. The number of songs starts from the estimate,
 * then moves by one while a draw stays within the length, or until it does:
 * the places of a set depend on how many songs it has, so each number is a
 * draw of its own.
 */
export function proposeForLength({
  songs,
  minutes,
  gapSeconds,
  ...options
}: Omit<Options, 'count' | 'songs'> & {
  songs: TimedSong[];
  minutes: number;
  gapSeconds: number;
}): Proposal & { count: number } {
  const pool = candidatesOf(songs, options.includeNew, options.today);
  const mean = meanLengthOf(pool);
  const byId = new Map(pool.map((song) => [song.id, song]));
  const secondsOf = (proposal: Proposal) =>
    proposal.songIds.reduce(
      (sum, id) => sum + (byId.get(id)?.durationSeconds ?? mean ?? 0),
      gapSeconds * Math.max(0, proposal.songIds.length - 1),
    );
  const fits = (proposal: Proposal) => secondsOf(proposal) <= minutes * 60;
  const draw = (count: number) => ({ ...propose({ ...options, songs, count }), count });
  // A few draws of the same number of songs: one of them may be short enough
  // where the first was not. The first that fits, or the last one drawn.
  const drawWithin = (count: number) => {
    let drawn = draw(count);
    for (let attempt = 1; attempt < DRAWS_PER_COUNT && !fits(drawn); attempt++) {
      drawn = draw(count);
    }
    return drawn;
  };

  const estimate = songsThatFit(minutes, gapSeconds, mean);
  if (estimate === null) return draw(COUNT_WITHOUT_LENGTHS);

  const most = Math.max(1, pool.length);
  let best = drawWithin(Math.min(estimate, most));
  // Too long: one song fewer, down to one.
  while (!fits(best) && best.count > 1) best = drawWithin(best.count - 1);
  // Room left: one song more while it still fits and the repertoire allows.
  while (fits(best) && best.count < most) {
    const more = drawWithin(best.count + 1);
    if (!fits(more)) break;
    best = more;
  }
  return best;
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
