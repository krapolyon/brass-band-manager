import { useQuery } from '@tanstack/react-query';
import { ApiError, api, SESSION_ENDED } from './api.ts';

// The songs of the band, as the API answers them (api/src/Songs/Songs.php).
// Rules: model/songs.md.

export const songStatuses = [
  'PROPOSED',
  'IN_PROGRESS',
  'IN_REPERTOIRE',
  'TEMPORARY',
  'ABANDONED',
] as const;
export type SongStatus = (typeof songStatuses)[number];

/** The average of the band on a song, and how many current members answered. */
export type LevelAverage = { average: number | null; count: number };

/** A song in the list and in the table of songs. */
export type SongSummary = {
  id: number;
  /** The name the band gives to the song, shown everywhere. */
  name: string;
  originalTitle: string;
  originalArtist: string;
  /** The tempo of the band, when it differs from the one of the MuseScore file. */
  bpm: number | null;
  status: SongStatus;
  /** The day the arrangement last changed, "2026-09-14". */
  versionOn: string | null;
  coverUrl: string | null;
  partCount: number;
  /** The weight of each file in bytes, null when the song has none. ownPart: the part of the member's instrument. */
  fileSizes: {
    ownPart: number | null;
    audio: number | null;
    midi: number | null;
    museScore: number | null;
  };
  mastery: LevelAverage;
  enjoyment: LevelAverage;
};

export type SongFile = { url: string; size: number };

/** A song with everything its screen shows. */
export type Song = SongSummary & {
  versionNote: string | null;
  clipUrl: string | null;
  /** The identifier of the YouTube video, as the server read it from the address. */
  clipVideoId: string | null;
  /** The thumbnail of the clip, kept by the server. Null: the cover art stands in. */
  clipThumbnailUrl: string | null;
  /** peaks: how loud each slice of the recording is, from 0 to 100; null until it was computed. */
  audio: (SongFile & { format: 'mp3' | 'm4a'; peaks: number[] | null }) | null;
  midi: SongFile | null;
  /** The score as MusicXML, what the reading mode shows. */
  musicXml: SongFile | null;
  museScore: SongFile | null;
  /** In the order of the sections and instruments of the band. */
  parts: (SongFile & { instrumentId: number })[];
  /** The levels of the signed-in member, seen by them only. */
  ownLevels: { masteryLevel: number | null; enjoymentLevel: number | null };
  /** For who manages songs only. */
  discordChannelId?: string | null;
};

/** What the form of a song sends: the whole record. */
export type SongRecord = {
  name: string;
  originalTitle: string;
  originalArtist: string;
  status: SongStatus;
  bpm: number | null;
  versionOn: string | null;
  versionNote: string | null;
  clipUrl: string | null;
  discordChannelId: string | null;
};

/** The kinds of file a song holds itself; a part is one per instrument. */
export type SongFileKind = 'cover' | 'museScore' | 'midi' | 'musicXml' | 'audio';
export type SongFileRole = SongFileKind | 'part';

/** Where a dropped file would go, from its name (POST /api/songs/fileNames). */
export type PlacedFileName = {
  name: string;
  role: SongFileRole | null;
  instrumentId: number | null;
  problem: 'unknownKind' | 'noInstrument' | 'severalInstruments' | null;
};

/** Every song, by name, whatever its status. */
export function useSongs() {
  return useQuery({ queryKey: ['songs'], queryFn: () => api<SongSummary[]>('/api/songs') });
}

export function useSong(songId: number) {
  return useQuery({
    queryKey: ['songs', songId],
    queryFn: () => api<Song>(`/api/songs/${songId}`),
  });
}

/** The address a file of a song is sent to or removed from. */
export function songFileAddress(songId: number, role: SongFileRole, instrumentId?: number | null) {
  return role === 'part'
    ? `/api/songs/${songId}/parts/${instrumentId}`
    : `/api/songs/${songId}/${role}`;
}

/**
 * Sends a file of a song: alone, as it is, as the body of the request. The
 * one call of the API that does not send JSON (api/src/Http/FileBody.php).
 */
export async function sendSongFile(address: string, file: Blob): Promise<Song> {
  let response: Response;
  try {
    response = await fetch(address, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'unreachable');
  }
  const data = await response.json().catch(() => null);
  if (response.status === 401) {
    window.dispatchEvent(new Event(SESSION_ENDED));
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? 'serverError', data?.fields);
  }

  return data as Song;
}

/** The address that saves a file on the device under a readable name. */
export function downloadAddress(file: SongFile) {
  return `${file.url}&download`;
}

/** The statuses the list shows before any filter: what the band plays or is learning. */
export function isPlayed(status: SongStatus) {
  return status !== 'PROPOSED' && status !== 'ABANDONED';
}
