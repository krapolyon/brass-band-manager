import { ApiError, api } from '../../api.ts';
import {
  type PlacedFileName,
  type Song,
  type SongFileRole,
  sendSongFile,
  songFileAddress,
} from '../../songs.ts';
import type { ScoreAnswer, ScoreFiles } from './score.worker.ts';

// The files dropped on a song, between the moment they are dropped and the
// moment they are sent. Rules: model/songs.md, "Import".
//
// Where a file goes is said by the server, from its name (POST
// /api/songs/fileNames): the rule that reads names is written once, there.
// Nothing is sent before the member has seen where each file goes.

export type DroppedFile = {
  /** Tells two files apart on the screen, whatever their names. */
  key: number;
  file: File;
  /** Null: not a file of a song. */
  role: SongFileRole | null;
  /** For a part. Null: the name does not tell, and the member is asked. */
  instrumentId: number | null;
  problem: PlacedFileName['problem'];
};

let lastKey = 0;

/** Asks where each file would go. */
export async function placeFiles(files: File[]): Promise<DroppedFile[]> {
  const placed = await api<PlacedFileName[]>('/api/songs/fileNames', {
    method: 'POST',
    // A Mac writes "é" as an "e" and an accent apart: sent as one letter.
    body: { names: files.map((file) => file.name.normalize('NFC')) },
  });

  return files.map((file, index) => {
    lastKey += 1;
    const place = placed[index];
    return {
      key: lastKey,
      file,
      role: place?.role ?? null,
      instrumentId: place?.instrumentId ?? null,
      problem: place?.problem ?? 'unknownKind',
    };
  });
}

/** The place a file takes: one per kind, and one per instrument for a part. */
export function placeOf(file: DroppedFile): string | null {
  if (file.role === null) return null;
  if (file.role !== 'part') return file.role;
  return file.instrumentId === null ? null : `part:${file.instrumentId}`;
}

/**
 * Adds files to those already dropped. Two files for the same place ask
 * nothing: the last one dropped wins.
 */
export function withDropped(current: DroppedFile[], added: DroppedFile[]): DroppedFile[] {
  const all = [...current, ...added];
  const last = new Map<string, number>();
  for (const file of all) {
    const place = placeOf(file);
    if (place !== null) last.set(place, file.key);
  }

  return all.filter((file) => {
    const place = placeOf(file);
    return place === null || last.get(place) === file.key;
  });
}

export const isPlaced = (file: DroppedFile) => placeOf(file) !== null;
export const isQuestion = (file: DroppedFile) => file.role === 'part' && file.instrumentId === null;
export const isIgnored = (file: DroppedFile) => file.role === null;

const COVER_SIDE = 1024;

/**
 * The cover art as the API takes it: cropped to a centred square, reduced to
 * 1024 pixels a side, drawn again as a JPEG.
 */
async function preparedCover(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const square = Math.min(image.naturalWidth, image.naturalHeight);
    if (square === 0) throw new Error('This image has no size');
    const side = Math.min(COVER_SIDE, square);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot draw the cover');
    context.drawImage(
      image,
      (image.naturalWidth - square) / 2,
      (image.naturalHeight - square) / 2,
      square,
      square,
      0,
      0,
      side,
      side,
    );

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('The cover could not be drawn'))),
        'image/jpeg',
        0.88,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PEAKS = 200;

/**
 * The outline of a recording: how loud each of 200 slices is, from 0 to 100.
 * Computed once, by the browser that sends the recording; null when this
 * browser cannot read it, and the screen then draws a plain line of bars.
 */
async function peaksOf(file: Blob): Promise<number[] | null> {
  const Context = window.AudioContext;
  if (!Context) return null;
  const context = new Context();
  try {
    const sound = await context.decodeAudioData(await file.arrayBuffer());
    const samples = sound.getChannelData(0);
    const slice = Math.max(1, Math.floor(samples.length / PEAKS));
    const loudest: number[] = [];
    for (let index = 0; index < PEAKS; index++) {
      let peak = 0;
      const end = Math.min(samples.length, (index + 1) * slice);
      for (let at = index * slice; at < end; at++) {
        const level = Math.abs(samples[at] ?? 0);
        if (level > peak) peak = level;
      }
      loudest.push(peak);
    }
    // Against the loudest slice: a quiet recording still fills the height.
    const top = Math.max(...loudest, 0.0001);
    return loudest.map((peak) => Math.round((peak / top) * 100));
  } catch {
    return null;
  } finally {
    void context.close();
  }
}

// Reading a large score takes a few seconds; past this, something is wrong.
const SCORE_TIMEOUT = 90_000;

/**
 * The MIDI file and the MusicXML of a MuseScore file, produced by the
 * MuseScore engine in a worker (score.worker.ts). Null when the engine cannot
 * read the file: the song then keeps its MuseScore file alone.
 */
export async function scoreFilesOf(file: Blob): Promise<ScoreFiles | null> {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./score.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const answer = await new Promise<ScoreAnswer>((resolve) => {
      const giveUp = window.setTimeout(() => resolve({ ok: false }), SCORE_TIMEOUT);
      const settle = (result: ScoreAnswer) => {
        window.clearTimeout(giveUp);
        resolve(result);
      };
      worker.onmessage = (message: MessageEvent<ScoreAnswer>) => settle(message.data);
      worker.onerror = () => settle({ ok: false });
      worker.postMessage(bytes, [bytes.buffer]);
    });
    return answer.ok ? { midi: answer.midi, musicXml: answer.musicXml } : null;
  } catch {
    return null;
  } finally {
    worker.terminate();
  }
}

export type SendFailure = {
  file: DroppedFile;
  error: ApiError;
  /** The file that failed is one the MuseScore file gave, not the dropped file itself. */
  produced?: 'midi' | 'musicXml';
};
export type SendResult = {
  failures: SendFailure[];
  /** A MuseScore file was sent and the app could not read it: no MIDI file or no MusicXML came with it. */
  scoreNotRead: boolean;
};

type Sending = { dropped: DroppedFile; role: SongFileRole; content: Blob | null };

/**
 * Sends the placed files of a song, one request each. A file that is refused
 * does not stop the others: what failed is returned, with the reason.
 *
 * A MuseScore file is first read by the MuseScore engine: the MIDI file and
 * the MusicXML it gives are sent after it, in the place of the ones dropped by
 * hand, which count only when the engine gives none. Both follow the score:
 * they are not sent when it is refused, and when it cannot be read the ones
 * the song had from an earlier score are removed.
 */
export async function sendFiles(
  songId: number,
  files: DroppedFile[],
  onProgress: (sent: number, total: number) => void = () => {},
): Promise<SendResult> {
  const placed = files.filter(isPlaced);
  const score = placed.find((file) => file.role === 'museScore');
  // Counted before the score is read: it gives two files when it can be read.
  const total = placed.length + (score ? 2 : 0);
  onProgress(0, total);

  const read = score ? await scoreFilesOf(score.file) : null;
  const byHand = (role: SongFileRole) => placed.some((file) => file.role === role);
  // The score first: what it gives is sent only once it is saved.
  const sending: Sending[] = [
    ...placed.filter((file) => file === score),
    ...placed.filter(
      (file) =>
        file !== score && (read === null || (file.role !== 'midi' && file.role !== 'musicXml')),
    ),
  ].map((dropped) => ({ dropped, role: dropped.role as SongFileRole, content: null }));
  if (score && read) {
    sending.push(
      { dropped: score, role: 'midi', content: new Blob([read.midi as BlobPart]) },
      { dropped: score, role: 'musicXml', content: new Blob([read.musicXml as BlobPart]) },
    );
  }

  const failures: SendFailure[] = [];
  let isScoreSaved = false;
  let sent = 0;

  for (const { dropped, role, content: produced } of sending) {
    // What a refused score gave belongs to no file of the song.
    if (produced && !isScoreSaved) continue;
    try {
      const content =
        produced ?? (role === 'cover' ? await preparedCover(dropped.file) : dropped.file);
      const song = await sendSongFile(songFileAddress(songId, role, dropped.instrumentId), content);
      if (role === 'museScore') isScoreSaved = true;
      if (role === 'audio') {
        const peaks = await peaksOf(dropped.file);
        // Said for this recording, and no other: one sent meanwhile keeps its own.
        const version = /[?&]v=([0-9a-f]+)/.exec(song.audio?.url ?? '')?.[1];
        if (peaks && version) {
          await api<Song>(`/api/songs/${songId}/audio/peaks`, {
            method: 'PUT',
            body: { peaks, version },
          }).catch(() => {
            // The recording is saved; without its outline the screen draws plain bars.
          });
        }
      }
    } catch (error) {
      failures.push({
        file: dropped,
        error: error instanceof ApiError ? error : new ApiError(422, 'invalidFile'),
        ...(produced ? { produced: role as 'midi' | 'musicXml' } : {}),
      });
    }
    sent += 1;
    onProgress(sent, total);
  }

  // A new score the app cannot read: the MIDI file and the MusicXML of the
  // score it replaces would no longer be those of the song.
  const missing = (['midi', 'musicXml'] as const).filter((role) => !byHand(role));
  if (score && isScoreSaved && read === null) {
    for (const role of missing) {
      await api(songFileAddress(songId, role), { method: 'DELETE' }).catch(() => {
        // Nothing to remove, or the server is away: said with the rest.
      });
    }
  }
  onProgress(total, total);

  return { failures, scoreNotRead: isScoreSaved && read === null && missing.length > 0 };
}
