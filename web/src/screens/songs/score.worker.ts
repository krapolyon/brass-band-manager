import { withTrackNames } from './midi.ts';

// Reads a MuseScore file with the MuseScore engine (webmscore) and gives back
// what the app keeps beside it: the MIDI file, its tracks named after the
// staves, and the score as compressed MusicXML (model/songs.md, "Generated
// files").
//
// It runs apart from the page, in a worker of its own for each file: the
// engine is large (about 17 MB, loaded from /webmscore/ only here) and does
// not open a second score once it has closed one.

export type ScoreFiles = { midi: Uint8Array; musicXml: Uint8Array };
export type ScoreAnswer = ({ ok: true } & ScoreFiles) | { ok: false };

type Score = {
  metadata(): Promise<{ parts: { name: string }[] }>;
  saveMidi(): Promise<Uint8Array>;
  saveMxl(): Promise<Uint8Array>;
};
type Engine = {
  ready: Promise<void>;
  // The last argument lays the score out: MusicXML is empty without it.
  load(format: 'mscz', data: Uint8Array, fonts: Uint8Array[], doLayout: boolean): Promise<Score>;
};

self.onmessage = async (message: MessageEvent<Uint8Array>) => {
  let answer: ScoreAnswer = { ok: false };
  try {
    // Outside the bundle on purpose (vite.config.ts): the engine finds its
    // own files beside itself.
    const address = new URL('/webmscore/webmscore.mjs', self.location.origin).href;
    const engine: Engine = (await import(/* @vite-ignore */ address)).default;
    await engine.ready;

    const score = await engine.load('mscz', message.data, [], true);
    const { parts } = await score.metadata();
    const midi = withTrackNames(
      await score.saveMidi(),
      parts.map((part) => part.name),
    );
    answer = { ok: true, midi, musicXml: await score.saveMxl() };
  } catch {
    // A file the engine cannot read: the song keeps its MuseScore file alone.
  }
  self.postMessage(answer);
};
