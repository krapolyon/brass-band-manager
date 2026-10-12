import { ApiError, api } from '../../api.ts';
import {
  type PlacedFileName,
  type Song,
  type SongFileRole,
  sendSongFile,
  songFileAddress,
} from '../../songs.ts';

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

export type SendFailure = { file: DroppedFile; error: ApiError };

/**
 * Sends the placed files of a song, one request each. A file that is refused
 * does not stop the others: what failed is returned, with the reason.
 */
export async function sendFiles(
  songId: number,
  files: DroppedFile[],
  onProgress: (sent: number, total: number) => void = () => {},
): Promise<SendFailure[]> {
  const placed = files.filter(isPlaced);
  const failures: SendFailure[] = [];
  let sent = 0;
  onProgress(0, placed.length);

  for (const dropped of placed) {
    try {
      const role = dropped.role as SongFileRole;
      const content = role === 'cover' ? await preparedCover(dropped.file) : dropped.file;
      const song = await sendSongFile(songFileAddress(songId, role, dropped.instrumentId), content);
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
      });
    }
    sent += 1;
    onProgress(sent, placed.length);
  }

  return failures;
}
