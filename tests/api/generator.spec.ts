import { expect, test } from '@playwright/test';
import {
  type CandidateSong,
  isNew,
  lengthOf,
  meanLengthOf,
  positionsOf,
  propose,
  proposeForLength,
  type Rule,
  type SetPosition,
  seeded,
  songsThatFit,
  type TimedSong,
} from '../../web/src/screens/gigs/generator.ts';

// The setlist generator (model/gigs.md v1.9, entry 4; model/songs.md v1.9,
// "Setlist attributes"; issues #25 and #47), run as it is, without a browser,
// with a fixed random seed: the same draw each time. The songs are made-up
// rows; their names do not matter here.

const today = '2026-10-18';
let lastId = 0;
function song(changes: Partial<CandidateSong> = {}): CandidateSong {
  lastId += 1;
  return {
    id: lastId,
    status: 'IN_REPERTOIRE',
    mood: 'MEDIUM',
    positions: ['FIRST_HALF', 'MIDDLE', 'SECOND_HALF'],
    tiringSectionIds: [],
    trickySectionIds: [],
    inRepertoireOn: '2015-01-01',
    ...changes,
  };
}

/**
 * A repertoire of `size` songs where every rule can be kept for a set of up
 * to `size` songs: enough openers and closers, some tiring, some tricky.
 */
function repertoire(size = 36): CandidateSong[] {
  return Array.from({ length: size }, (_, index) => {
    const positions: SetPosition[] =
      index % 6 === 0
        ? ['START', 'FIRST_HALF']
        : index % 6 === 1
          ? ['SECOND_HALF', 'END']
          : index % 6 === 2
            ? ['START', 'END', 'MIDDLE']
            : ['FIRST_HALF', 'MIDDLE', 'SECOND_HALF'];
    return song({
      positions,
      mood: index % 3 === 0 ? 'CHILL' : index % 3 === 1 ? 'PARTY' : 'MEDIUM',
      tiringSectionIds: index % 7 === 3 ? [1] : [],
      trickySectionIds: index % 5 === 4 ? [2] : [],
    });
  });
}

/** Every rule a proposal breaks, checked apart from the generator. */
function broken(songIds: number[], songs: CandidateSong[]): Rule[] {
  const order = songIds.map((id) => songs.find((one) => one.id === id) as CandidateSong);
  const count = order.length;
  const found = new Set<Rule>();
  order.forEach((one, place) => {
    const isFirst = place < 3;
    const isLast = place >= count - 3;
    const centre = (place + 0.5) / count;
    const allowed: SetPosition[] =
      isFirst && isLast
        ? ['START', 'END']
        : isFirst
          ? ['START']
          : isLast
            ? ['END']
            : [
                centre < 0.5 ? 'FIRST_HALF' : 'SECOND_HALF',
                ...(centre >= 0.35 && centre <= 0.65 ? (['MIDDLE'] as const) : []),
              ];
    if (!one.positions.some((position) => allowed.includes(position))) found.add('positions');
    if (
      one.tiringSectionIds.length > 0 &&
      centre >= 0.5 &&
      !(isLast && one.positions.includes('END'))
    ) {
      found.add('tiring');
    }
    const before = order[place - 1];
    if (
      before &&
      one.trickySectionIds.some((section) => before.trickySectionIds.includes(section))
    ) {
      found.add('tricky');
    }
  });
  return [...found];
}

test('the places of a set: Début for the first three, Fin for the last three, halves and middle counted at the centre', () => {
  // 10 songs: centres 0.05 … 0.95.
  expect(Array.from({ length: 10 }, (_, place) => positionsOf(place, 10))).toEqual([
    ['START'],
    ['START'],
    ['START'],
    ['FIRST_HALF', 'MIDDLE'], // 0.35
    ['FIRST_HALF', 'MIDDLE'], // 0.45
    ['SECOND_HALF', 'MIDDLE'], // 0.55
    ['SECOND_HALF', 'MIDDLE'], // 0.65
    ['END'],
    ['END'],
    ['END'],
  ]);
  // 5 songs or fewer: a place among the first three and the last three takes either.
  expect(Array.from({ length: 5 }, (_, place) => positionsOf(place, 5))).toEqual([
    ['START'],
    ['START'],
    ['START', 'END'],
    ['END'],
    ['END'],
  ]);
  expect(positionsOf(1, 3)).toEqual(['START', 'END']);
  // 30 songs: place 4 (centre 0.15) is the first half only.
  expect(positionsOf(4, 30)).toEqual(['FIRST_HALF']);
});

test('sets of 3, 5, 10 and 30 songs keep every rule; the same seed gives the same set', () => {
  const songs = repertoire();
  for (const count of [3, 5, 10, 30]) {
    for (let seed = 1; seed <= 40; seed++) {
      const proposal = propose({
        songs,
        count,
        includeNew: false,
        avoid: [],
        today,
        random: seeded(seed),
      });
      expect(proposal.songIds, `${count} songs, seed ${seed}`).toHaveLength(count);
      expect(new Set(proposal.songIds).size).toBe(count);
      expect(proposal.dropped, `${count} songs, seed ${seed}`).toEqual([]);
      expect(broken(proposal.songIds, songs), `${count} songs, seed ${seed}`).toEqual([]);
    }
    const options = { songs, count, includeNew: false, avoid: [], today };
    expect(propose({ ...options, random: seeded(42) }).songIds).toEqual(
      propose({ ...options, random: seeded(42) }).songIds,
    );
    expect(propose({ ...options, random: seeded(42) }).songIds).not.toEqual(
      propose({ ...options, random: seeded(7) }).songIds,
    );
  }
});

test('a repertoire where no song has Début: the positions are dropped, and said', () => {
  const songs = repertoire().map((one) => ({
    ...one,
    positions: one.positions.filter((position) => position !== 'START'),
  }));
  const proposal = propose({
    songs,
    count: 10,
    includeNew: false,
    avoid: [],
    today,
    random: seeded(5),
  });
  expect(proposal.songIds).toHaveLength(10);
  expect(proposal.dropped).toEqual(['positions', 'tiring', 'tricky']);
});

test('a tiring song with Fin may close the set; without Fin it stays in the first half', () => {
  const tiringEnd = song({ positions: ['END'], tiringSectionIds: [1] });
  const tiringMiddle = song({
    positions: ['FIRST_HALF', 'MIDDLE', 'SECOND_HALF'],
    tiringSectionIds: [1],
  });
  const songs = [...repertoire(), tiringEnd, tiringMiddle];
  let tiringEndPlayed = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const proposal = propose({
      songs,
      count: 10,
      includeNew: false,
      avoid: [],
      today,
      random: seeded(seed),
    });
    expect(proposal.dropped).toEqual([]);
    expect(broken(proposal.songIds, songs), `seed ${seed}`).toEqual([]);
    const at = proposal.songIds.indexOf(tiringEnd.id);
    if (at >= 0) {
      tiringEndPlayed++;
      expect(at).toBeGreaterThanOrEqual(7);
    }
    const middleAt = proposal.songIds.indexOf(tiringMiddle.id);
    if (middleAt >= 0) expect(middleAt).toBeLessThan(5);
  }
  expect(tiringEndPlayed).toBeGreaterThan(0);
});

test('two songs tricky for the same section never follow each other; for two sections they may', () => {
  const songs = Array.from({ length: 12 }, (_, index) =>
    song({
      positions: ['START', 'FIRST_HALF', 'MIDDLE', 'SECOND_HALF', 'END'],
      trickySectionIds: index < 6 ? [index % 2 === 0 ? 1 : 2] : [],
    }),
  );
  for (let seed = 1; seed <= 40; seed++) {
    const proposal = propose({
      songs,
      count: 12,
      includeNew: false,
      avoid: [],
      today,
      random: seeded(seed),
    });
    expect(proposal.dropped).toEqual([]);
    expect(broken(proposal.songIds, songs), `seed ${seed}`).toEqual([]);
  }
});

test('the mood weighs the draw: Chill near the start, Teuf near the end, never a rule', () => {
  // Every song can stand anywhere: only the mood can tell them apart.
  const anywhere: SetPosition[] = ['START', 'FIRST_HALF', 'MIDDLE', 'SECOND_HALF', 'END'];
  const songs = Array.from({ length: 30 }, (_, index) =>
    song({ positions: anywhere, mood: index < 10 ? 'CHILL' : index < 20 ? 'PARTY' : 'MEDIUM' }),
  );
  const moodAt = { start: { CHILL: 0, PARTY: 0 }, end: { CHILL: 0, PARTY: 0 } };
  for (let seed = 1; seed <= 200; seed++) {
    const ids = propose({
      songs,
      count: 10,
      includeNew: false,
      avoid: [],
      today,
      random: seeded(seed),
    }).songIds;
    const mood = (id: number | undefined) => songs.find((one) => one.id === id)?.mood;
    for (const id of ids.slice(0, 3)) {
      const one = mood(id);
      if (one === 'CHILL' || one === 'PARTY') moodAt.start[one]++;
    }
    for (const id of ids.slice(-3)) {
      const one = mood(id);
      if (one === 'CHILL' || one === 'PARTY') moodAt.end[one]++;
    }
  }
  expect(moodAt.start.CHILL).toBeGreaterThan(moodAt.start.PARTY * 1.5);
  expect(moodAt.end.PARTY).toBeGreaterThan(moodAt.end.CHILL * 1.5);
  // A preference only: a Teuf song still opens a set now and then.
  expect(moodAt.start.PARTY).toBeGreaterThan(0);
});

test('the songs a setlist cannot hold, and the new ones unless asked, are left out', () => {
  const songs = [
    ...repertoire(),
    song({ status: 'PROPOSED' }),
    song({ status: 'ABANDONED' }),
    song({ inRepertoireOn: '2026-09-01' }),
  ];
  const left = songs.slice(-3).map((one) => one.id);
  for (let seed = 1; seed <= 50; seed++) {
    const proposal = propose({
      songs,
      count: 10,
      includeNew: false,
      avoid: [],
      today,
      random: seeded(seed),
    });
    expect(
      proposal.songIds.some((id) => left.includes(id)),
      `seed ${seed}`,
    ).toBe(false);
  }
  // Asked for, the new song can come; the others never.
  const withNew = Array.from(
    { length: 80 },
    (_, seed) =>
      propose({ songs, count: 30, includeNew: true, avoid: [], today, random: seeded(seed) })
        .songIds,
  ).flat();
  expect(withNew).toContain(songs.at(-1)?.id);
  expect(withNew).not.toContain(left[0]);
  expect(withNew).not.toContain(left[1]);
});

test('a song is new for 2 months after it entered the repertoire; without a day, it is not', () => {
  expect(isNew({ inRepertoireOn: '2026-08-19' }, today)).toBe(true);
  expect(isNew({ inRepertoireOn: '2026-08-18' }, today)).toBe(false);
  expect(isNew({ inRepertoireOn: null }, today)).toBe(false);
});

test('the songs of the other setlists of the gig are avoided as long as there are enough', () => {
  const songs = repertoire(24);
  const avoid = songs.slice(3, 9).map((one) => one.id);
  for (let seed = 1; seed <= 30; seed++) {
    const proposal = propose({
      songs,
      count: 10,
      includeNew: false,
      avoid,
      today,
      random: seeded(seed),
    });
    expect(
      proposal.songIds.some((id) => avoid.includes(id)),
      `seed ${seed}`,
    ).toBe(false);
    // Twenty asked: the avoided ones come back to fill, only as many as are missing.
    const full = propose({
      songs,
      count: 20,
      includeNew: false,
      avoid,
      today,
      random: seeded(seed),
    });
    expect(full.songIds).toHaveLength(20);
    expect(
      full.songIds.filter((id) => avoid.includes(id)),
      `seed ${seed}`,
    ).toHaveLength(2);
  }
});

test('a song of another setlist of the gig does not come back to keep a rule', () => {
  // The only songs that can open are in another setlist of the gig.
  const openers = [
    song({ positions: ['START'] }),
    song({ positions: ['START'] }),
    song({ positions: ['START'] }),
  ];
  const songs = [
    ...openers,
    ...Array.from({ length: 8 }, () =>
      song({ positions: ['FIRST_HALF', 'MIDDLE', 'SECOND_HALF', 'END'] }),
    ),
  ];
  const avoid = openers.map((one) => one.id);
  const proposal = propose({ songs, count: 8, includeNew: false, avoid, today, random: seeded(5) });
  expect(proposal.songIds.some((id) => avoid.includes(id))).toBe(false);
  expect(proposal.dropped[0]).toBe('positions');
});

test('too few songs: all of them, and the proposal says it is short', () => {
  const songs = repertoire(4);
  const short = propose({
    songs,
    count: 10,
    includeNew: false,
    avoid: [],
    today,
    random: seeded(1),
  });
  expect(short).toMatchObject({ isShort: true });
  expect(short.songIds).toHaveLength(4);
  expect(
    propose({ songs: [], count: 10, includeNew: false, avoid: [], today, random: seeded(1) }),
  ).toEqual({
    songIds: [],
    dropped: [],
    isShort: true,
  });
});

test('the length of a setlist: its songs and the time between two, rounded to the minute', () => {
  expect(lengthOf([210, 210, 210, 210, 210, 210], 30)).toEqual({ minutes: 24, withoutLength: 0 });
  expect(lengthOf([232, null, 180, null], 30)).toEqual({ minutes: 8, withoutLength: 2 });
  expect(lengthOf([], 30)).toEqual({ minutes: 0, withoutLength: 0 });
});

// The generator asks for a length since 0.4.0 (model/gigs.md v1.11, "Proposing
// a setlist", issue #60).
test.describe('a proposal for a length', () => {
  /** The repertoire above, each song with a length; `unknown` of them without. */
  const timed = (lengths: number[], unknown = 0): TimedSong[] =>
    repertoire(lengths.length).map((one, index) => ({
      ...one,
      durationSeconds: index < unknown ? null : (lengths[index] as number),
    }));
  const seconds = (songIds: number[], songs: TimedSong[], gap: number, mean: number) =>
    songIds.reduce(
      (sum, id) => sum + (songs.find((one) => one.id === id)?.durationSeconds ?? mean),
      gap * (songIds.length - 1),
    );

  test('the songs that should fit: the length and one gap, over a mean song and one gap', () => {
    // 45 min, 30 s between two, songs of 3:30: (2700 + 30) / (210 + 30) = 11.4.
    expect(songsThatFit(45, 30, 210)).toBe(11);
    expect(songsThatFit(5, 30, 600)).toBe(1);
    expect(songsThatFit(45, 30, null)).toBeNull();
    // The mean counts the songs whose length is known.
    expect(meanLengthOf(timed([200, 220, 240], 1))).toBe(230);
  });

  test('as many songs as stay within the length, by the rules, whatever the draw', () => {
    const lengths = Array.from({ length: 36 }, (_, index) => 150 + ((index * 37) % 150));
    const songs = timed(lengths);
    const mean = meanLengthOf(songs) as number;
    for (const minutes of [10, 25, 45, 90]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const proposal = proposeForLength({
          songs,
          minutes,
          gapSeconds: 30,
          includeNew: false,
          avoid: [],
          today,
          random: seeded(seed),
        });
        const used = seconds(proposal.songIds, songs, 30, mean);
        const label = `${minutes} min, seed ${seed}`;
        expect(used, label).toBeLessThanOrEqual(minutes * 60);
        // Close to the length: less than one long song and a gap short of it.
        // Not always one short song away: the places of a set only take the
        // songs their positions allow.
        expect(used + 30 + Math.max(...lengths), label).toBeGreaterThan(minutes * 60);
        expect(broken(proposal.songIds, songs), label).toEqual([]);
        expect(proposal.count, label).toBe(proposal.songIds.length);
      }
    }
  });

  test('a song without a length counts as the mean of the others', () => {
    // Twelve songs of 4 min, six without a length: they count 4 min too.
    const songs = timed(Array(18).fill(240), 6);
    const proposal = proposeForLength({
      songs,
      minutes: 30,
      gapSeconds: 0,
      includeNew: false,
      avoid: [],
      today,
      random: seeded(7),
    });
    expect(proposal.songIds).toHaveLength(7);
  });

  test('the repertoire is the limit: every song, under the length asked', () => {
    const songs = timed([200, 200, 200, 200]);
    const proposal = proposeForLength({
      songs,
      minutes: 180,
      gapSeconds: 30,
      includeNew: false,
      avoid: [],
      today,
      random: seeded(1),
    });
    expect(proposal.songIds).toHaveLength(4);
  });

  test('without any length known, ten songs as before', () => {
    const songs = timed(Array(20).fill(0), 20);
    const proposal = proposeForLength({
      songs,
      minutes: 45,
      gapSeconds: 30,
      includeNew: false,
      avoid: [],
      today,
      random: seeded(1),
    });
    expect(proposal.songIds).toHaveLength(10);
  });
});
