import { expect, test } from '@playwright/test';
import {
  type CandidateSong,
  isNew,
  lengthOf,
  propose,
  type Rule,
  seeded,
} from '../../web/src/screens/gigs/generator.ts';

// The setlist generator (model/gigs.md, entry 4, issue #25), run as it is,
// without a browser, with a fixed random seed: the same draw each time. The
// songs are made-up rows; their names do not matter here.

const today = '2026-10-18';
let lastId = 0;
function song(changes: Partial<CandidateSong> = {}): CandidateSong {
  lastId += 1;
  return {
    id: lastId,
    status: 'IN_REPERTOIRE',
    setCategory: 'STANDARD',
    otherCategories: [],
    isNeverFirst: false,
    tiringSectionIds: [],
    trickySectionIds: [],
    inRepertoireOn: '2015-01-01',
    ...changes,
  };
}

/** A repertoire where every rule can be kept for ten songs. */
function repertoire(): CandidateSong[] {
  return [
    song({ setCategory: 'OPENER' }),
    song({ setCategory: 'OPENER', tiringSectionIds: [1] }),
    song({ setCategory: 'KNOWN', otherCategories: ['OPENER'] }),
    song({ setCategory: 'CHOREOGRAPHY' }),
    song({ setCategory: 'CHOREOGRAPHY', trickySectionIds: [2] }),
    song({ setCategory: 'CHILL' }),
    song({ setCategory: 'CHILL', trickySectionIds: [2] }),
    song({ setCategory: 'KNOWN' }),
    song({ setCategory: 'STANDARD' }),
    song({ setCategory: 'STANDARD', isNeverFirst: true }),
    song({ setCategory: 'PARTY' }),
    song({ setCategory: 'PARTY', otherCategories: ['ENCORE'] }),
    song({ setCategory: 'ENCORE' }),
    song({ setCategory: 'PARTY', tiringSectionIds: [3] }),
  ];
}

/** Every rule a proposal breaks, checked apart from the generator. */
function broken(songIds: number[], songs: CandidateSong[]): Rule[] {
  const order = songIds.map((id) => songs.find((one) => one.id === id) as CandidateSong);
  const serves = (one: CandidateSong, category: CandidateSong['setCategory']) =>
    one.setCategory === category || one.otherCategories.includes(category);
  const count = order.length;
  const found = new Set<Rule>();
  const first = order[0] as CandidateSong;
  const last = order[count - 1] as CandidateSong;
  if (!serves(first, 'OPENER') || first.isNeverFirst) found.add('opener');
  if (!serves(last, 'PARTY') && !serves(last, 'ENCORE')) found.add('closer');
  order.forEach((one, place) => {
    const inFirstHalf = place < count / 2;
    if (one.setCategory === 'OPENER' && !inFirstHalf) found.add('halves');
    if (one.setCategory === 'PARTY' && inFirstHalf) found.add('halves');
    if (one.setCategory === 'ENCORE' && place !== count - 1) found.add('halves');
    if (one.tiringSectionIds.length > 0 && !inFirstHalf) found.add('tiring');
    const before = order[place - 1];
    if (!before) return;
    if (serves(one, 'CHOREOGRAPHY') && serves(before, 'CHOREOGRAPHY')) found.add('neighbours');
    if (one.trickySectionIds.some((section) => before.trickySectionIds.includes(section))) {
      found.add('neighbours');
    }
    if (one.setCategory !== 'STANDARD' && one.setCategory === before.setCategory) {
      found.add('alternate');
    }
  });
  return [...found];
}

test('ten songs that keep every rule, the same for the same seed, another for another seed', () => {
  const songs = repertoire();
  const options = { songs, count: 10, includeNew: false, avoid: [], today };

  const first = propose({ ...options, random: seeded(42) });

  expect(first.songIds).toHaveLength(10);
  expect(new Set(first.songIds).size).toBe(10);
  expect(first).toMatchObject({ dropped: [], isShort: false });
  expect(broken(first.songIds, songs)).toEqual([]);
  expect(propose({ ...options, random: seeded(42) }).songIds).toEqual(first.songIds);
  expect(propose({ ...options, random: seeded(7) }).songIds).not.toEqual(first.songIds);
});

test('the rules hold over many draws, and an encore closes when one fits', () => {
  const songs = repertoire();
  for (let seed = 1; seed <= 200; seed++) {
    const proposal = propose({
      songs,
      count: 8,
      includeNew: false,
      avoid: [],
      today,
      random: seeded(seed),
    });
    expect(broken(proposal.songIds, songs), `seed ${seed}`).toEqual([]);
    const last = songs.find((one) => one.id === proposal.songIds.at(-1));
    expect(
      last?.setCategory === 'ENCORE' || last?.otherCategories.includes('ENCORE'),
      `seed ${seed}`,
    ).toBe(true);
  }
});

test('the songs a setlist cannot hold, and the new ones unless asked, are left out', () => {
  const songs = [
    ...repertoire(),
    song({ status: 'PROPOSED', setCategory: 'OPENER' }),
    song({ status: 'ABANDONED', setCategory: 'OPENER' }),
    song({ setCategory: 'OPENER', inRepertoireOn: '2026-09-01' }),
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
    { length: 50 },
    (_, seed) =>
      propose({ songs, count: 14, includeNew: true, avoid: [], today, random: seeded(seed) })
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
  const songs = repertoire();
  const avoid = songs.slice(5, 9).map((one) => one.id);
  const proposal = propose({
    songs,
    count: 10,
    includeNew: false,
    avoid,
    today,
    random: seeded(3),
  });
  expect(proposal.songIds.some((id) => avoid.includes(id))).toBe(false);
  // Twelve asked: the avoided ones come back to fill, only as many as are missing.
  for (let seed = 1; seed <= 30; seed++) {
    const full = propose({
      songs,
      count: 12,
      includeNew: false,
      avoid,
      today,
      random: seeded(seed),
    });
    expect(full.songIds).toHaveLength(12);
    expect(
      full.songIds.filter((id) => avoid.includes(id)),
      `seed ${seed}`,
    ).toHaveLength(2);
  }
});

test('a song of another setlist of the gig does not come back to keep a rule', () => {
  // The only song that can open is in another setlist of the gig.
  const opener = song({ setCategory: 'OPENER' });
  const songs = [
    opener,
    song({ setCategory: 'KNOWN' }),
    song({ setCategory: 'CHILL' }),
    song({ setCategory: 'STANDARD' }),
    song({ setCategory: 'PARTY' }),
  ];
  const proposal = propose({
    songs,
    count: 4,
    includeNew: false,
    avoid: [opener.id],
    today,
    random: seeded(5),
  });
  expect(proposal.songIds).not.toContain(opener.id);
  expect(proposal.dropped[0]).toBe('opener');
});

test('when the encore cannot close, a party song does, before any rule is dropped', () => {
  // The encore and the only song that can stand before it are both choreographies.
  const songs = [
    song({ setCategory: 'OPENER' }),
    song({ setCategory: 'CHOREOGRAPHY' }),
    song({ setCategory: 'ENCORE', otherCategories: ['CHOREOGRAPHY'] }),
    song({ setCategory: 'PARTY' }),
  ];
  const proposal = propose({
    songs,
    count: 3,
    includeNew: false,
    avoid: [],
    today,
    random: seeded(9),
  });
  expect(proposal.dropped).toEqual([]);
  expect(broken(proposal.songIds, songs)).toEqual([]);
});

test('a small repertoire drops the last rules first, and says which; too few songs say so', () => {
  // Two choreographies, two tricky for the same section, no other choice:
  // "neighbours" and "alternate" cannot hold, the first rules still do.
  const songs = [
    song({ setCategory: 'OPENER' }),
    song({ setCategory: 'CHOREOGRAPHY', trickySectionIds: [1] }),
    song({ setCategory: 'CHOREOGRAPHY', trickySectionIds: [1] }),
    song({ setCategory: 'PARTY' }),
  ];
  const proposal = propose({
    songs,
    count: 4,
    includeNew: false,
    avoid: [],
    today,
    random: seeded(1),
  });
  expect(proposal.dropped).toEqual(['neighbours', 'alternate']);
  expect(
    broken(proposal.songIds, songs).filter((rule) => !proposal.dropped.includes(rule)),
  ).toEqual([]);
  expect(proposal.songIds[0]).toBe(songs[0]?.id);
  expect(proposal.songIds.at(-1)).toBe(songs[3]?.id);

  // Without any opener: everything but the first rule could be kept, but
  // rules are dropped from the end, so all of them go.
  const noOpener = [
    song({ setCategory: 'KNOWN' }),
    song({ setCategory: 'PARTY' }),
    song({ setCategory: 'CHILL' }),
  ];
  const forced = propose({
    songs: noOpener,
    count: 3,
    includeNew: false,
    avoid: [],
    today,
    random: seeded(1),
  });
  expect(forced.dropped).toEqual([
    'opener',
    'closer',
    'halves',
    'tiring',
    'neighbours',
    'alternate',
  ]);
  expect(forced.songIds).toHaveLength(3);

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
  // 6 songs of 3:30 make 21:00, plus 5 × 0:30: 23:30, about 24 min (model/gigs.md).
  expect(lengthOf([210, 210, 210, 210, 210, 210], 30)).toEqual({ minutes: 24, withoutLength: 0 });
  expect(lengthOf([232, null, 180, null], 30)).toEqual({ minutes: 8, withoutLength: 2 });
  expect(lengthOf([], 30)).toEqual({ minutes: 0, withoutLength: 0 });
});
