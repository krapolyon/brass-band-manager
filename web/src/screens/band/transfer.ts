import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../api.ts';

// The export, the import and the reprise of the data (0.4.0, #43;
// model/export-import.md), as the API answers them.

export const exportParts = ['settings', 'members', 'songs', 'gigs'] as const;
export type ExportPart = (typeof exportParts)[number];
export const repriseParts = ['members', 'songs', 'gigs', 'answers'] as const;
export type ReprisePart = (typeof repriseParts)[number];

/** What GET /api/transfer answers: how much each part holds, and the zips waiting. */
export type TransferState = {
  members: number;
  songs: number;
  songBytes: number;
  gigs: number;
  zips: { name: string; bytes: number; at: string }[];
  canSendEmail: boolean;
  /** The songs with a MuseScore file and neither a MIDI file nor a MusicXML: their scores wait to be read. */
  scoresToRead: { id: number; name: string }[];
};

export type Problem = {
  file: string;
  line: number | null;
  column: string | null;
  error: string;
  value: string | null;
};

type Counts = { total: number; new: number; updated: number; [more: string]: number };

/** What POST /api/transfer/read answers: an export, a reprise, or a file the app does not know. */
export type ReadFile = {
  name: string;
  kind: 'export' | 'reprise' | null;
  count: number;
  problems: Problem[];
  canSendEmail: boolean;
  invitations?: number;
  // An export
  format?: number;
  exportedAt?: string | null;
  inFile?: ExportPart[];
  parts?: Partial<Record<ExportPart, Counts>>;
  // A reprise
  files?: string[];
  fileCount?: number;
  members?: Counts;
  songs?: Counts;
  gigs?: Counts;
  answers?: Counts;
};

export function useTransfer() {
  return useQuery({
    queryKey: ['transfer'],
    queryFn: () => api<TransferState>('/api/transfer'),
  });
}

/** The largest zip the browser may send; a larger one goes by FTP (TransferFolder.php). */
export const MAX_UPLOAD_BYTES = 250_000_000;

/** Sends a zip as it is, as the body of its request; answers its name in the folder "import". */
export async function uploadZip(file: File): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`/api/transfer/upload?name=${encodeURIComponent(file.name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'unreachable');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error ?? 'serverError', data?.fields);
  return data.name as string;
}

/**
 * Asks for the export and hands it to the browser as a download. The server
 * names the file; nothing of it is kept in the page.
 */
export async function downloadExport(parts: ExportPart[], password: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/transfer/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts, password }),
    });
  } catch {
    throw new ApiError(0, 'unreachable');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error ?? 'serverError', data?.fields);
  }
  const name =
    response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'export.zip';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The parts an export part needs in the file (the screen ticks them with it). */
export const exportNeeds: Record<ExportPart, ExportPart[]> = {
  settings: [],
  members: ['settings'],
  songs: ['settings'],
  gigs: ['settings', 'members'],
};

/** "250 Mo": a weight, rounded as a person reads it. */
export function megabytes(bytes: number, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: bytes < 10_000_000 ? 1 : 0,
  }).format(bytes / 1_000_000);
}
