// The score of a song as the Live mode needs it, read from its MusicXML: the
// parts, one part alone ready to be drawn, and the order and the length of
// the measures as the band plays them, repeats included.
//
// MusicXML comes as it is or compressed (.mxl, a zip archive). Everything
// here is plain reading of a document: the drawing is done elsewhere
// (LiveView.tsx, with Verovio).

export type ScorePart = { id: string; name: string };

export type WrittenMeasure = {
  /** The number printed on the score. */
  label: string;
  /** How long it lasts, in quarter notes. */
  quarters: number;
};

export type Timeline = {
  measures: WrittenMeasure[];
  /** The measures in the order they are played: each is an index in `measures`. */
  played: number[];
  /** The rehearsal marks, each on a written measure. */
  marks: { name: string; measure: number }[];
  /** The time signature the score starts with. */
  signature: { beats: number; beatType: number };
  /** The tempo written at the start, in counted beats a minute; null when the score gives none. */
  bpm: number | null;
  /** The beat a musician counts at the start, in quarter notes: 1.5 in 6/8. */
  beatQuarters: number;
};

/** True when the beat is a dotted quarter: 6/8, 9/8, 12/8. */
export const isCompound = ({ beats, beatType }: { beats: number; beatType: number }) =>
  beatType === 8 && beats % 3 === 0 && beats > 3;

// ---- Reading the file ----

// A score is a few megabytes of text at most: an archive that claims more is
// not one, and reading it to the end would only fill the memory.
const MAX_SCORE_BYTES = 50_000_000;

async function inflated(data: Uint8Array): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const pieces: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_SCORE_BYTES) {
      await reader.cancel();
      throw new Error('This score is too large');
    }
    pieces.push(value);
  }
  const whole = new Uint8Array(size);
  let at = 0;
  for (const piece of pieces) {
    whole.set(piece, at);
    at += piece.length;
  }
  return whole;
}

/**
 * The first file of a zip archive whose name is the one wanted. An archive
 * ends with the list of what it holds, and that list is what is read.
 */
export async function unzipped(
  file: Uint8Array,
  isWanted: (name: string) => boolean,
): Promise<Uint8Array> {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let end = file.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('Not a zip archive');

  let at = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true);
  for (let entry = 0; entry < count; entry++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(file.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (!isWanted(name)) continue;

    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = file.subarray(start, start + size);
    if (method === 0) return data;
    if (method === 8) return inflated(data);
    throw new Error('This archive is compressed in a way the app does not read');
  }
  throw new Error('This archive holds no score');
}

/** The MusicXML document of a file, compressed or not. */
export async function readScore(file: ArrayBuffer): Promise<Document> {
  let bytes: Uint8Array = new Uint8Array(file);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    // Compressed MusicXML: the score is the first file outside META-INF.
    bytes = await unzipped(
      bytes,
      (name) => !name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(name),
    );
  }
  const document = new DOMParser().parseFromString(
    new TextDecoder().decode(bytes),
    'application/xml',
  );
  // A score and nothing else: its first element says so.
  if (document.documentElement.localName !== 'score-partwise') {
    throw new Error('This file is not a score the app can read');
  }
  return document;
}

const childrenOf = (parent: Element, tag: string) =>
  [...parent.children].filter((child) => child.tagName === tag);

const partElements = (score: Document) =>
  childrenOf(score.documentElement, 'part').filter((part) => part.getAttribute('id') !== null);

/** The parts of a score, in its order. */
export function partsOf(score: Document): ScorePart[] {
  return [...score.querySelectorAll('part-list > score-part')].map((part) => ({
    id: part.getAttribute('id') ?? '',
    name: part.querySelector('part-name')?.textContent?.trim() ?? '',
  }));
}

/**
 * The score with one part only, as MusicXML. The rehearsal marks belong to
 * the whole score and are written in the first part alone: they are copied
 * into the part kept. Several measures of rest stay one measure each,
 * so that every written measure is drawn.
 */
export function partAlone(score: Document, partId: string): string {
  const alone = score.cloneNode(true) as Document;
  const parts = partElements(alone);
  const top = parts[0];
  const kept = parts.find((part) => part.getAttribute('id') === partId);
  if (!top || !kept) throw new Error('This score has no such part');

  if (top !== kept) {
    const targets = childrenOf(kept, 'measure');
    childrenOf(top, 'measure').forEach((measure, index) => {
      const target = targets[index];
      if (!target) return;
      // A file that writes them in every part already has them here.
      const has = (what: string) =>
        childrenOf(target, 'direction').some((direction) => direction.querySelector(what));
      const shared = childrenOf(measure, 'direction').filter(
        (direction) => direction.querySelector('rehearsal') && !has('rehearsal'),
      );
      // Before the first note: after what opens the measure (clef, key, time).
      const firstNote = childrenOf(target, 'note')[0] ?? null;
      for (const direction of shared) target.insertBefore(direction.cloneNode(true), firstNote);
    });
  }

  for (const part of parts) if (part !== kept) part.remove();
  for (const listed of alone.querySelectorAll('part-list > *')) {
    if (listed.getAttribute('id') !== partId) listed.remove();
  }
  // The name of the part is said by the screen, not at the start of every line.
  for (const name of alone.querySelectorAll(
    'part-name, part-abbreviation, part-name-display, part-abbreviation-display',
  )) {
    name.textContent = '';
  }
  // The tempo is said by the screen, which lets the member change it. Its
  // mark would also need the music font inside the drawing, which is shown
  // without anything it brings along (LiveView, safeDrawing).
  for (const direction of alone.querySelectorAll('direction')) {
    if (direction.querySelector('metronome')) direction.remove();
  }
  for (const style of alone.querySelectorAll('measure-style')) {
    if (style.querySelector('multiple-rest')) style.remove();
  }

  return new XMLSerializer().serializeToString(alone);
}

// ---- The order and the length of the measures ----

type Barlines = {
  forward: boolean;
  /** How many times the section is played when the measure ends with a repeat; 0 otherwise. */
  backward: number;
  /** The passes this measure is played at, inside a volta; null outside. */
  endings: number[] | null;
  /** The last measure of its volta. */
  closesEnding: boolean;
};

function barlinesOf(measures: Element[]): Barlines[] {
  let open: number[] | null = null;
  return measures.map((measure) => {
    const lines: Barlines = { forward: false, backward: 0, endings: null, closesEnding: false };
    for (const barline of childrenOf(measure, 'barline')) {
      const repeat = barline.querySelector('repeat');
      if (repeat?.getAttribute('direction') === 'forward') {
        lines.forward = true;
        // A volta left open by the file ends where another section starts.
        open = null;
      }
      if (repeat?.getAttribute('direction') === 'backward') {
        lines.backward = Math.max(2, Number(repeat.getAttribute('times')) || 2);
      }
      const ending = barline.querySelector('ending');
      if (ending?.getAttribute('type') === 'start') {
        open = (ending.getAttribute('number') ?? '')
          .split(/[,\s]+/)
          .map(Number)
          .filter((pass) => pass > 0);
      }
      if (ending && ending.getAttribute('type') !== 'start') lines.closesEnding = true;
    }
    lines.endings = open;
    if (lines.closesEnding) open = null;
    return lines;
  });
}

// Follows the repeats and the voltas. Jumps written in words (D.S., D.C., to
// the coda) are not followed: the member drags the score there.
function playedOrder(lines: Barlines[]): number[] {
  const played: number[] = [];
  let sectionStart = 0;
  let pass = 1;
  let at = 0;

  while (at < lines.length && played.length < 5000) {
    const line = lines[at];
    if (!line) break;
    if (line.forward && sectionStart !== at) {
      sectionStart = at;
      pass = 1;
    }
    // A volta for another pass is jumped over.
    if (line.endings && line.endings.length > 0 && !line.endings.includes(pass)) {
      while (at < lines.length && !lines[at]?.closesEnding) at += 1;
      at += 1;
      continue;
    }
    played.push(at);
    // A third volta asks for a third pass, whatever the repeat sign says.
    let passes = line.backward;
    for (let next = at + 1; passes > 0 && lines[next]?.endings; next++) {
      passes = Math.max(passes, ...(lines[next]?.endings ?? []));
    }
    if (passes > 0 && pass < passes) {
      pass += 1;
      at = sectionStart;
      continue;
    }
    if (line.backward > 0 || (line.closesEnding && pass > 1)) {
      pass = 1;
      sectionStart = at + 1;
    }
    at += 1;
  }
  return played;
}

/** What the Live mode follows: the measures, their order, the marks and the tempo. */
export function timelineOf(score: Document): Timeline {
  const top = partElements(score)[0];
  const elements = top ? childrenOf(top, 'measure') : [];

  let divisions = 1;
  let signature = { beats: 4, beatType: 4 };
  let first: Timeline['signature'] | null = null;
  const marks: Timeline['marks'] = [];

  const measures = elements.map((measure, index) => {
    for (const attributes of childrenOf(measure, 'attributes')) {
      divisions = Number(attributes.querySelector('divisions')?.textContent) || divisions;
      const time = attributes.querySelector('time');
      if (time) {
        signature = {
          beats: Number(time.querySelector('beats')?.textContent) || 4,
          beatType: Number(time.querySelector('beat-type')?.textContent) || 4,
        };
      }
    }
    first ??= signature;
    for (const mark of measure.querySelectorAll('direction rehearsal')) {
      const name = mark.textContent?.trim() ?? '';
      const isKnown = marks.some((other) => other.measure === index && other.name === name);
      if (name !== '' && !isKnown) marks.push({ name, measure: index });
    }

    let quarters = (signature.beats * 4) / signature.beatType;
    // A pickup is as long as its notes, not as its time signature.
    if (measure.getAttribute('implicit') === 'yes') {
      let length = 0;
      for (const child of measure.children) {
        if (child.tagName === 'backup') break;
        if (child.tagName === 'note' && !child.querySelector('chord, grace')) {
          length += Number(child.querySelector('duration')?.textContent) || 0;
        }
      }
      if (length > 0) quarters = Math.min(quarters, length / divisions);
    }
    return { label: measure.getAttribute('number') ?? String(index + 1), quarters };
  });

  const start = first ?? signature;
  const beatQuarters = isCompound(start) ? 1.5 : 4 / start.beatType;
  // The tempo of the first measure: as it is written (so many of a note
  // value a minute), else as it is played (quarter notes a minute).
  const opening = elements[0];
  const metronome = opening?.querySelector('metronome');
  const perMinute = Number(metronome?.querySelector('per-minute')?.textContent);
  const unit = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 }[
    metronome?.querySelector('beat-unit')?.textContent ?? ''
  ];
  const written = unit ? unit * (metronome?.querySelector('beat-unit-dot') ? 1.5 : 1) : null;
  const sounded = Number(opening?.querySelector('sound[tempo]')?.getAttribute('tempo'));
  const quartersPerMinute =
    written && perMinute > 0 ? perMinute * written : sounded > 0 ? sounded : null;

  return {
    measures,
    played: playedOrder(barlinesOf(elements)),
    marks,
    signature: start,
    bpm: quartersPerMinute === null ? null : Math.round(quartersPerMinute / beatQuarters),
    beatQuarters,
  };
}
