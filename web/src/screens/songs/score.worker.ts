import { rehearsalMarks, withMarks, withTrackNames } from './midi.ts';
import { unzipped } from './score.ts';

// Reads a MuseScore file with the MuseScore engine (webmscore) and gives back
// what the app keeps beside it: the MIDI file, its tracks named after the
// staves and its rehearsal marks written as markers, and the score as
// compressed MusicXML (model/songs.md, "Generated files").
//
// It runs apart from the page, in a worker of its own for each file: the
// engine is large (about 17 MB, loaded from /webmscore/ only here) and does
// not open a second score once it has closed one.

export type ScoreFiles = { midi: Uint8Array; musicXml: Uint8Array };
export type ScoreAnswer = ({ ok: true } & ScoreFiles) | { ok: false };

type Score = {
  metadata(): Promise<{ parts: { name: string }[] }>;
  saveMidi(): Promise<Uint8Array>;
  saveXml(): Promise<string>;
  /** The measures in the order they are played, repeats included: which one, and when (ms). */
  measurePositions(): Promise<{ events: { elid: number; position: number }[] }>;
  saveMxl(): Promise<Uint8Array>;
};
type Engine = {
  ready: Promise<void>;
  // The last argument lays the score out: MusicXML is empty without it.
  load(
    format: 'mscz' | 'mscx',
    data: Uint8Array,
    fonts: Uint8Array[],
    doLayout: boolean,
  ): Promise<Score>;
};

// Some versions of MuseScore (4.4 for one) write a line, <LastEID>, that the
// engine does not know: it then opens the file as an empty score, with no
// error. Such a file is given to the engine as its score alone (the .mscx at
// the root of the archive), without that line. Its styles and its separate
// parts are left behind: neither the MIDI file nor the MusicXML needs them.
const UNKNOWN_LINE = /<LastEID>[^<]*<\/LastEID>\s*/;

async function whatToLoad(file: Uint8Array): Promise<['mscz' | 'mscx', Uint8Array]> {
  try {
    const main = await unzipped(file, (name) => !name.includes('/') && name.endsWith('.mscx'));
    const text = new TextDecoder().decode(main);
    if (!UNKNOWN_LINE.test(text)) return ['mscz', file];
    return ['mscx', new TextEncoder().encode(text.replace(UNKNOWN_LINE, ''))];
  } catch {
    // Not an archive the app can open by itself: the engine has the last word.
    return ['mscz', file];
  }
}

self.onmessage = async (message: MessageEvent<Uint8Array>) => {
  let answer: ScoreAnswer = { ok: false };
  try {
    // Outside the bundle on purpose (vite.config.ts): the engine finds its
    // own files beside itself.
    const address = new URL('/webmscore/webmscore.mjs', self.location.origin).href;
    const engine: Engine = (await import(/* @vite-ignore */ address)).default;
    await engine.ready;

    const [format, data] = await whatToLoad(message.data);
    const score = await engine.load(format, data, [], true);
    const { parts } = await score.metadata();
    const named = withTrackNames(
      await score.saveMidi(),
      parts.map((part) => part.name),
    );
    answer = { ok: true, midi: await marked(score, named), musicXml: await score.saveMxl() };
  } catch {
    // A file the engine cannot read: the song keeps its MuseScore file alone.
  }
  self.postMessage(answer);
};

// The MIDI file with the rehearsal marks of the score. They are a comfort:
// when they cannot be read, the file goes without them.
async function marked(score: Score, midi: Uint8Array): Promise<Uint8Array> {
  try {
    const marks = rehearsalMarks(await score.saveXml());
    if (marks.length === 0) return midi;
    const { events } = await score.measurePositions();
    return withMarks(
      midi,
      events.flatMap((played) =>
        marks
          .filter((mark) => mark.measure === played.elid)
          .map((mark) => ({ seconds: played.position / 1000, name: mark.name })),
      ),
    );
  } catch {
    return midi;
  }
}
