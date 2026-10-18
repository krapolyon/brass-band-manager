import { expect, test } from '@playwright/test';
import { marksIn, namesOf, tickedAfter } from '../../web/src/screens/songs/midi.ts';

// The loop of the MIDI player over several rehearsal marks (model/songs.md,
// "A loop over several rehearsal marks", 0.3.0), run without a browser. The
// score of the end-to-end tests has a single mark; these have four.

const marks = [
  { name: 'A', from: 1, to: 16 },
  { name: 'B', from: 17, to: 32 },
  { name: 'Pont', from: 33, to: 40 },
  { name: 'Coda', from: 89, to: 96 },
];

test('ticking a mark further on ticks those between: the range has no hole', () => {
  expect(tickedAfter([], 1, true)).toEqual([1, 1]);
  expect(tickedAfter([1], 3, true)).toEqual([1, 3]);
  expect(tickedAfter([2, 3], 0, true)).toEqual([0, 3]);
});

test('unticking the first or the last shortens the range; one in the middle ends it just before', () => {
  expect(tickedAfter([0, 1, 2, 3], 0, false)).toEqual([1, 3]);
  expect(tickedAfter([0, 1, 2, 3], 3, false)).toEqual([0, 2]);
  expect(tickedAfter([0, 1, 2, 3], 2, false)).toEqual([0, 1]);
  expect(tickedAfter([2], 2, false)).toBeNull();
});

test('the marks a range holds whole are the ones ticked; their names say the loop', () => {
  expect(marksIn(marks, { from: 17, to: 40 })).toEqual([1, 2]);
  expect(namesOf(marks, { from: 17, to: 40 })).toEqual(['B', 'Pont']);
  // Typed measures that do not fall on marks tick none, and say no name.
  expect(marksIn(marks, { from: 18, to: 40 })).toEqual([]);
  expect(namesOf(marks, { from: 18, to: 40 })).toEqual([]);
  expect(marksIn(marks, { from: 1, to: 50 })).toEqual([]);
});
