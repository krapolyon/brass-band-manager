import { type MidiEvent, parseMidi, writeMidi } from 'midi-file';

// A MIDI file as the MIDI player needs it: its tracks with their notes, its
// tempo and its measures. Read with midi-file, which gives the events as they
// are written; everything here is counted in ticks, the unit of the file, so
// that the tempo can change without anything being read again.

export type MidiNote = {
  /** Where the note starts and how long it lasts, in ticks. */
  tick: number;
  ticks: number;
  /** The pitch, from 0 to 127; 60 is the middle C. */
  pitch: number;
  /** How hard it is played, from 1 to 127. */
  velocity: number;
};

export type MidiTrack = {
  /** The name the file gives to the track. Empty when it gives none. */
  name: string;
  /** The General MIDI sound of the track, from 0 to 127. */
  program: number;
  /** A drum kit: its pitches are drums, not notes. */
  isDrums: boolean;
  notes: MidiNote[];
  lowest: number;
  highest: number;
};

export type MidiSong = {
  ticksPerBeat: number;
  /** The tracks that play something, in the order of the file. */
  tracks: MidiTrack[];
  /** The tempo changes, in quarter notes per minute, from the start. */
  tempos: { tick: number; bpm: number }[];
  /** The tick each measure starts at; the last entry is the end of the last one. */
  measures: number[];
  /** The time signature the song starts with. */
  signature: { numerator: number; denominator: number };
  /** The rehearsal marks of the score, in the order they are played. */
  marks: { tick: number; name: string }[];
  /**
   * Where each written measure of the score is played, in the order it is
   * played, jumps included: the measure counted from 0, as in the MusicXML.
   * Written by the app since 0.2.0 (withMeasures); empty in an older file.
   */
  written: { tick: number; measure: number }[];
};

// How a measure of the score is written in the file: a cue point "m12".
const WRITTEN = /^m(\d+)$/;

const DRUM_CHANNEL = 9;
const DEFAULT_BPM = 120;

// A text of a MIDI file is a run of bytes; midi-file gives each byte as one
// character. The names are written in UTF-8.
function textOf(bytes: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(bytes, (character) => character.charCodeAt(0)),
    );
  } catch {
    return bytes;
  }
}

function bytesOf(text: string): string {
  return String.fromCharCode(...new TextEncoder().encode(text));
}

export function readMidi(file: ArrayBuffer | Uint8Array): MidiSong {
  const midi = parseMidi(file instanceof Uint8Array ? file : new Uint8Array(file));
  const ticksPerBeat = midi.header.ticksPerBeat ?? 480;

  const tracks: MidiTrack[] = [];
  const tempos: MidiSong['tempos'] = [];
  const signatures: { tick: number; numerator: number; denominator: number }[] = [];
  const marks: MidiSong['marks'] = [];
  const written: MidiSong['written'] = [];
  let end = 0;

  for (const events of midi.tracks) {
    let tick = 0;
    let name = '';
    let program = 0;
    let isDrums = false;
    const notes: MidiNote[] = [];
    // The notes that started and did not stop yet, by channel and pitch.
    const sounding = new Map<number, MidiNote>();

    for (const event of events) {
      tick += event.deltaTime;
      if (event.type === 'trackName' && name === '') {
        name = textOf(event.text).trim();
      } else if (event.type === 'marker') {
        const mark = textOf(event.text).trim();
        if (mark !== '') marks.push({ tick, name: mark });
      } else if (event.type === 'cuePoint') {
        const found = WRITTEN.exec(textOf(event.text).trim());
        if (found) written.push({ tick, measure: Number(found[1]) });
      } else if (event.type === 'setTempo') {
        tempos.push({ tick, bpm: 60_000_000 / event.microsecondsPerBeat });
      } else if (event.type === 'timeSignature') {
        // MuseScore writes several measures of rest as one long measure
        // ("54/8" for nine measures in 6/8): not a time signature anybody
        // counts, and the one in place goes on.
        const last = signatures[signatures.length - 1];
        const isRest =
          last !== undefined &&
          event.denominator === last.denominator &&
          event.numerator > 12 &&
          event.numerator % last.numerator === 0;
        if (!isRest && event.numerator <= 32) {
          signatures.push({ tick, numerator: event.numerator, denominator: event.denominator });
        }
      } else if (event.type === 'programChange' && notes.length === 0) {
        program = event.programNumber;
      } else if (event.type === 'noteOn' || event.type === 'noteOff') {
        const key = event.channel * 128 + event.noteNumber;
        const started = sounding.get(key);
        if (started) {
          started.ticks = Math.max(1, tick - started.tick);
          sounding.delete(key);
        }
        // A note played with no force is a note that stops.
        if (event.type === 'noteOn' && event.velocity > 0) {
          const note = { tick, ticks: 1, pitch: event.noteNumber, velocity: event.velocity };
          notes.push(note);
          sounding.set(key, note);
          if (event.channel === DRUM_CHANNEL) isDrums = true;
        }
      }
    }
    end = Math.max(end, tick);
    if (notes.length === 0) continue;

    let lowest = 127;
    let highest = 0;
    for (const note of notes) {
      lowest = Math.min(lowest, note.pitch);
      highest = Math.max(highest, note.pitch);
    }
    tracks.push({ name, program, isDrums, notes, lowest, highest });
  }

  tempos.sort((one, other) => one.tick - other.tick);
  // Until a file says its tempo, it is 120: the rule of MIDI.
  if (tempos[0]?.tick !== 0) tempos.unshift({ tick: 0, bpm: DEFAULT_BPM });
  signatures.sort((one, other) => one.tick - other.tick);
  if (signatures[0]?.tick !== 0) signatures.unshift({ tick: 0, numerator: 4, denominator: 4 });

  // The measures, one after the other, each as long as its time signature says.
  const measures = [0];
  let at = 0;
  let index = 0;
  while (at < end) {
    while (index + 1 < signatures.length && (signatures[index + 1]?.tick ?? 0) <= at) index += 1;
    const signature = signatures[index] ?? { numerator: 4, denominator: 4 };
    at += Math.max(1, Math.round((ticksPerBeat * 4 * signature.numerator) / signature.denominator));
    measures.push(at);
  }
  if (measures.length === 1) measures.push(ticksPerBeat * 4);

  const first = signatures[0] ?? { numerator: 4, denominator: 4 };
  return {
    ticksPerBeat,
    tracks,
    tempos,
    measures,
    signature: { numerator: first.numerator, denominator: first.denominator },
    marks: marks.sort((one, other) => one.tick - other.tick),
    written: written.sort((one, other) => one.tick - other.tick),
  };
}

/**
 * The written measure the player is at, counted from 0 as in the score.
 * Read from the measures the app wrote in the file; for an older file, the
 * measure of the same rank in `played`, the order the reading mode works out
 * (repeats and voltas, no jump written in words).
 */
export function writtenAt(song: MidiSong, tick: number, played: number[]): number {
  if (song.written.length > 0) {
    let found = song.written[0]?.measure ?? 0;
    for (const place of song.written) {
      if (place.tick > tick) break;
      found = place.measure;
    }
    return found;
  }
  const rank = measureAt(song, tick) - 1;
  return played[Math.min(rank, played.length - 1)] ?? 0;
}

/**
 * The tick a place of the played order starts at: the same written measure,
 * played the same number of times before.
 */
export function tickOfPlace(song: MidiSong, place: number, played: number[]): number {
  if (song.written.length > 0) {
    const measure = played[place] ?? 0;
    const times = played.slice(0, place + 1).filter((one) => one === measure).length;
    const all = song.written.filter((one) => one.measure === measure);
    return (all[Math.min(times, all.length) - 1] ?? all[0])?.tick ?? 0;
  }
  return measureTicks(song, place + 1).start;
}

/** How many measures the song has. */
export const measureCount = (song: MidiSong) => song.measures.length - 1;

/** The measure a tick is in, counted from 1. */
export function measureAt(song: MidiSong, tick: number): number {
  let low = 0;
  let high = measureCount(song) - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((song.measures[middle] ?? 0) <= tick) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/** The ticks a measure starts and ends at, the measure counted from 1. */
export function measureTicks(song: MidiSong, measure: number): { start: number; end: number } {
  const index = Math.min(Math.max(1, measure), measureCount(song)) - 1;
  return { start: song.measures[index] ?? 0, end: song.measures[index + 1] ?? 0 };
}

/**
 * The seconds from the start of the song to a tick, at the tempo the file
 * says. The player divides by its own speed.
 */
export function secondsAt(song: MidiSong, tick: number): number {
  let seconds = 0;
  for (let index = 0; index < song.tempos.length; index++) {
    const tempo = song.tempos[index];
    if (!tempo || tempo.tick >= tick) break;
    const until = Math.min(tick, song.tempos[index + 1]?.tick ?? tick);
    seconds += ((until - tempo.tick) / song.ticksPerBeat) * (60 / tempo.bpm);
  }
  return seconds;
}

/** The tick reached after some seconds from the start, at the tempo of the file. */
export function tickAt(song: MidiSong, seconds: number): number {
  let left = seconds;
  for (let index = 0; index < song.tempos.length; index++) {
    const tempo = song.tempos[index];
    if (!tempo) break;
    const next = song.tempos[index + 1];
    const perTick = 60 / tempo.bpm / song.ticksPerBeat;
    if (!next || left <= (next.tick - tempo.tick) * perTick) return tempo.tick + left / perTick;
    left -= (next.tick - tempo.tick) * perTick;
  }
  return 0;
}

/**
 * The beats per minute a musician counts at the start of the song: the beat
 * of the time signature, a dotted quarter in 6/8 (model/songs.md, `bpm`).
 */
export function countedBpm(song: MidiSong): number {
  const quarters = song.tempos[0]?.bpm ?? DEFAULT_BPM;
  const { numerator, denominator } = song.signature;
  const isCompound = denominator === 8 && numerator % 3 === 0 && numerator > 3;
  return isCompound ? (quarters * 2) / 3 : quarters;
}

/**
 * How long the band plays the song, in seconds, read from its MIDI file:
 * repeats played (the file plays them already), to the end of its last note,
 * at the tempo of the band when it has one (model/songs.md, "Setlist
 * attributes": the length of the file times its tempo divided by `bpm`, both
 * counted on the beat). Null outside 0:10 to 20:00, the bounds of the model.
 */
export function lengthOf(song: MidiSong, bandBpm: number | null): number | null {
  let end = 0;
  for (const track of song.tracks) {
    for (const note of track.notes) end = Math.max(end, note.tick + note.ticks);
  }
  const fileSeconds = secondsAt(song, end);
  const seconds = Math.round(bandBpm ? (fileSeconds * countedBpm(song)) / bandBpm : fileSeconds);
  return seconds >= 10 && seconds <= 1200 ? seconds : null;
}

/**
 * The same MIDI file without the notes of some tracks, by their place from 0:
 * the parts hidden in the MuseScore file (model/songs.md, "Display", issue
 * #35). The tracks stay, with their tempos, time signatures and marks (the
 * first one carries them); without a note, the player does not show them.
 */
export function withoutNotes(file: Uint8Array, places: number[], partCount: number): Uint8Array {
  if (places.length === 0) return file;
  const midi = parseMidi(file);
  // One track per part, as withTrackNames() checks too: otherwise the places
  // would not be those of the tracks, and the wrong instrument would go quiet.
  if (midi.tracks.length !== partCount) return file;
  midi.tracks = midi.tracks.map((events, index) => {
    if (!places.includes(index)) return events;
    const kept: MidiEvent[] = [];
    let carried = 0;
    for (const event of events) {
      if (event.type === 'noteOn' || event.type === 'noteOff') {
        // Its time goes to the next event that stays.
        carried += event.deltaTime;
        continue;
      }
      kept.push({ ...event, deltaTime: event.deltaTime + carried });
      carried = 0;
    }
    return kept;
  });
  return new Uint8Array(writeMidi(midi));
}

/**
 * The same MIDI file with its tracks named again, one name per track in the
 * order of the file. Used when the file is produced from a MuseScore file:
 * the tracks then carry the names of the staves (model/songs.md, "Reading
 * the name of a track").
 */
export function withTrackNames(file: Uint8Array, names: string[]): Uint8Array {
  const midi = parseMidi(file);
  // Only when each track has its name: a file laid out another way is left alone.
  if (midi.tracks.length !== names.length) return file;

  midi.tracks.forEach((events, index) => {
    const text = bytesOf(names[index] ?? '');
    const named = events.find((event) => event.type === 'trackName');
    if (named && named.type === 'trackName') {
      named.text = text;
    } else {
      events.unshift({ deltaTime: 0, meta: true, type: 'trackName', text } as MidiEvent);
    }
  });

  return Uint8Array.from(writeMidi(midi));
}

/** A rehearsal mark as the loop offers it: its name, and the measures up to the next mark. */
export type MarkRange = { name: string; from: number; to: number };

/** The rehearsal marks of a song, each with the measures it covers. */
export function markRanges(song: MidiSong): MarkRange[] {
  const starts = song.marks.map((mark) => ({ name: mark.name, from: measureAt(song, mark.tick) }));
  return starts.map((mark, index) => ({
    ...mark,
    to: Math.max(mark.from, (starts[index + 1]?.from ?? measureCount(song) + 1) - 1),
  }));
}

/**
 * The same MIDI file with the rehearsal marks of the score written in it as
 * markers, each at the second it is played at. A mark inside a repeat is
 * played twice, and written twice. MuseScore writes none in the MIDI files it
 * exports: the worker that reads the score adds them (score.worker.ts).
 */
export function withMarks(
  file: Uint8Array,
  marks: { seconds: number; name: string }[],
): Uint8Array {
  return withEvents(
    file,
    marks.map((mark) => ({ seconds: mark.seconds, type: 'marker', text: mark.name })),
  );
}

/**
 * The same MIDI file with each measure of the score written where it is
 * played, as a cue point ("m12", the measure counted from 0): the reading
 * mode follows the player with it, repeats and jumps included (model/songs.md,
 * "The reading mode driven by the MIDI player"). Like the marks, MuseScore
 * writes none: the worker adds them.
 */
export function withMeasures(
  file: Uint8Array,
  measures: { seconds: number; measure: number }[],
): Uint8Array {
  return withEvents(
    file,
    measures.map((one) => ({ seconds: one.seconds, type: 'cuePoint', text: `m${one.measure}` })),
  );
}

function withEvents(
  file: Uint8Array,
  added: { seconds: number; type: 'marker' | 'cuePoint'; text: string }[],
): Uint8Array {
  if (added.length === 0) return file;
  const song = readMidi(file);
  const midi = parseMidi(file);
  const first = midi.tracks[0];
  if (!first) return file;

  // A mark sits at the start of a measure: the seconds are rounded, the line is not.
  const nearMeasure = (tick: number) => {
    const line = measureTicks(song, measureAt(song, tick + song.ticksPerBeat / 4)).start;
    return Math.abs(line - tick) <= song.ticksPerBeat / 4 ? line : Math.round(tick);
  };
  let at = 0;
  const events = first.map((event) => {
    at += event.deltaTime;
    return { tick: at, event };
  });
  for (const one of added) {
    const event = { deltaTime: 0, meta: true, type: one.type, text: bytesOf(one.text) };
    events.push({ tick: nearMeasure(tickAt(song, one.seconds)), event: event as MidiEvent });
  }
  // The end of the track stays the last event.
  const isEnd = (event: MidiEvent) => (event.type === 'endOfTrack' ? 1 : 0);
  events.sort((one, other) => one.tick - other.tick || isEnd(one.event) - isEnd(other.event));
  const last = events[events.length - 1];
  const end = events.find(({ event }) => event.type === 'endOfTrack');
  if (end && last && end !== last) {
    end.tick = last.tick;
    events.sort((one, other) => one.tick - other.tick || isEnd(one.event) - isEnd(other.event));
  }
  let before = 0;
  midi.tracks[0] = events.map(({ tick, event }) => {
    const moved = { ...event, deltaTime: tick - before };
    before = tick;
    return moved;
  });

  return Uint8Array.from(writeMidi(midi));
}

/**
 * The rehearsal marks written in a MusicXML score: for each, its name and the
 * measure it sits on, counted from 0 in the first part. The marks belong to
 * the whole score, and MusicXML repeats them in every part.
 */
export function rehearsalMarks(musicXml: string): { measure: number; name: string }[] {
  const start = musicXml.indexOf('<part ');
  const end = musicXml.indexOf('</part>', start);
  if (start === -1 || end === -1) return [];

  const marks: { measure: number; name: string }[] = [];
  const measures = musicXml
    .slice(start, end)
    .split(/<measure[\s>]/)
    .slice(1);
  measures.forEach((measure, index) => {
    for (const found of measure.matchAll(/<rehearsal[^>]*>([^<]*)<\/rehearsal>/g)) {
      const name = (found[1] ?? '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
      // Written once per staff by some files: one mark all the same.
      const isKnown = marks.some((mark) => mark.measure === index && mark.name === name);
      if (name !== '' && !isKnown) marks.push({ measure: index, name });
    }
  });
  return marks;
}

/**
 * The marks a range of measures is made of, by their index in the order of
 * the score: those it holds whole, when it starts with the first of them and
 * ends with the last. Typed measures that do not fall on marks tick none.
 */
export function marksIn(marks: MarkRange[], range: { from: number; to: number }): number[] {
  const held = marks.flatMap((mark, index) =>
    mark.from >= range.from && mark.to <= range.to ? [index] : [],
  );
  const first = marks[held[0] ?? -1];
  const last = marks[held[held.length - 1] ?? -1];
  return first?.from === range.from && last?.to === range.to ? held : [];
}

/** The names of the marks a range is made of. */
export function namesOf(marks: MarkRange[], range: { from: number; to: number }): string[] {
  return marksIn(marks, range).flatMap((index) => marks[index]?.name ?? []);
}

/**
 * The marks ticked after one is ticked or unticked (model/songs.md, "A loop
 * over several rehearsal marks"): ticking a mark further on ticks those
 * between, so the range has no hole; unticking the first or the last
 * shortens it; unticking one in the middle ends it just before. Null: none.
 */
export function tickedAfter(ticked: number[], index: number, on: boolean): [number, number] | null {
  const first = ticked[0];
  const last = ticked[ticked.length - 1];
  if (first === undefined || last === undefined) return on ? [index, index] : null;
  if (on) return [Math.min(first, index), Math.max(last, index)];
  if (index === first && index === last) return null;
  if (index === first) return [first + 1, last];
  if (index === last) return [first, last - 1];
  return [first, index - 1];
}
