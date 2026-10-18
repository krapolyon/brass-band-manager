import { expect, test } from '@playwright/test';
import { parseMidi, writeMidi } from 'midi-file';
import { withoutNotes } from '../../web/src/screens/songs/midi.ts';

// A part hidden in the MuseScore file goes quiet (model/songs.md, "Display",
// issue #35), found by its place among the parts. Run without a browser: the
// end-to-end test (songs.spec.ts) has a score with one staff per part.

/** A made-up MIDI file: one track per entry, each with one note. */
function midiWith(trackCount: number): Uint8Array {
  const track = () => [
    { deltaTime: 0, type: 'noteOn' as const, channel: 0, noteNumber: 60, velocity: 80 },
    { deltaTime: 480, type: 'noteOff' as const, channel: 0, noteNumber: 60, velocity: 0 },
    { deltaTime: 0, type: 'endOfTrack' as const, meta: true as const },
  ];
  return new Uint8Array(
    writeMidi({
      header: { format: 1, numTracks: trackCount, ticksPerBeat: 480 },
      tracks: Array.from({ length: trackCount }, track),
    }),
  );
}
const notesPerTrack = (file: Uint8Array) =>
  parseMidi(file).tracks.map((events) => events.filter((event) => event.type === 'noteOn').length);

test('the track at the place of a hidden part loses its notes, the others keep theirs', () => {
  const quiet = withoutNotes(midiWith(3), [1], 3);
  expect(notesPerTrack(quiet)).toEqual([1, 0, 1]);
  // Its time stays: the end of the track is where it was.
  const second = parseMidi(quiet).tracks[1] ?? [];
  expect(second.reduce((sum, event) => sum + event.deltaTime, 0)).toBe(480);
});

test('a file with more tracks than the score has parts is left alone: the places would not match', () => {
  // A part on two staves gives two tracks: emptying track 1 would quiet the wrong one.
  const file = midiWith(4);
  expect(withoutNotes(file, [1], 3)).toBe(file);
});
