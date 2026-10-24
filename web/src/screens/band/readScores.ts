import { ApiError, api } from '../../api.ts';
import { type Song, sendSongFile, songFileAddress } from '../../songs.ts';
import { scoreFilesOf } from '../songs/files.ts';
import { duration } from '../songs/format.ts';
import { lengthOf, readMidi } from '../songs/midi.ts';
import { draftOf, recordOf } from '../songs/SongForm.tsx';

// The MIDI file and the MusicXML of the songs a reprise gave a MuseScore file
// alone (0.4.0, #43). MuseScore cannot run on the host, so, as when a
// MuseScore file is dropped on a song, the browser of whoever loads reads
// each score and sends what it gives (model/songs.md, "Generated files").
// The songs that wait are those with a MuseScore file and neither of the two
// (GET /api/transfer, "scoresToRead"): a page closed halfway leaves the rest
// for the next visit.

/** The length a song gets from its MIDI file, within the bounds of the field (10 s to 20 min). */
function lengthFrom(midi: Uint8Array, bpm: number | null): number | null {
  try {
    const seconds = lengthOf(readMidi(midi), bpm);
    return seconds === null ? null : Math.min(1200, Math.max(10, Math.round(seconds)));
  } catch {
    return null;
  }
}

/**
 * Reads the score of a song and sends its MIDI file and its MusicXML; gives
 * it the length of the MIDI file when it has none. False when the score
 * cannot be read: the song keeps its MuseScore file alone, as in the app.
 */
export async function readScoreOf(songId: number): Promise<boolean> {
  const song = await api<Song>(`/api/songs/${songId}`);
  if (!song.museScore) return true;
  let score: Blob;
  try {
    const response = await fetch(song.museScore.url);
    if (!response.ok) throw new Error();
    score = await response.blob();
  } catch {
    throw new ApiError(0, 'unreachable');
  }
  const files = await scoreFilesOf(score);
  if (!files) return false;
  await sendSongFile(songFileAddress(songId, 'midi'), new Blob([files.midi as BlobPart]));
  await sendSongFile(songFileAddress(songId, 'musicXml'), new Blob([files.musicXml as BlobPart]));
  // A length already saved, typed or read, is never replaced.
  const length = (song.durationSeconds ?? null) === null ? lengthFrom(files.midi, song.bpm) : null;
  if (length !== null) {
    await api(`/api/songs/${songId}`, {
      method: 'PUT',
      body: recordOf({ ...draftOf(song), duration: duration(length) }),
    });
  }
  return true;
}
