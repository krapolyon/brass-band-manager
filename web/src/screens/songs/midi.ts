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
};

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
  };
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
