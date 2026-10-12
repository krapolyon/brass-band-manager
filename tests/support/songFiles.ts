import type { APIRequestContext } from '@playwright/test';
import { sql } from './database.ts';
import { png } from './images.ts';

// Made-up files of a song, built here so that no music file sits in the
// repository. Each holds just what tells its kind: none can be played.

export const pdf = Buffer.from('%PDF-1.4\n% a made-up part\n%%EOF\n');

export const midi = Buffer.concat([
  Buffer.from('MThd'),
  Buffer.from([0, 0, 0, 6, 0, 0, 0, 1, 0, 96]),
  Buffer.from('MTrk'),
  Buffer.from([0, 0, 0, 4, 0, 0xff, 0x2f, 0]),
]);

export const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200, 1)]);

export const m4a = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypM4A '),
  Buffer.alloc(40),
]);

// The start of a zip archive that holds "score.mscx".
export const museScore = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.alloc(22),
  Buffer.from('score.mscx'),
  Buffer.alloc(20),
]);

export const cover = png(64);

/** Sends a file as the front does: alone, as the body of the request. */
export function sendFile(request: APIRequestContext, address: string, file: Buffer) {
  return request.put(address, {
    data: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
}

/** A record of a song that can be saved, to change field by field. */
export function songRecord(changes: object = {}) {
  return {
    name: 'Seven Nation',
    originalTitle: 'Seven Nation Army',
    originalArtist: 'The White Stripes',
    status: 'IN_REPERTOIRE',
    ...changes,
  };
}

/** Creates a song straight in the database. Returns its id. */
export function addSong(name: string, status = 'IN_REPERTOIRE'): number {
  return Number(
    sql(`
      INSERT INTO song (name, originalTitle, originalArtist, status) VALUES ('${name}', 'Titre de ${name}', 'Artiste', '${status}');
      SELECT LAST_INSERT_ID();
    `),
  );
}

export function instrumentId(name: string): number {
  return Number(sql(`SELECT id FROM instrument WHERE name = '${name}'`));
}

/** A PDF of one page that a reader can draw: a few lines, as a score has staves. */
export function readablePdf(): Buffer {
  const lines = Array.from(
    { length: 6 },
    (_, at) => `40 ${700 - at * 90} m 555 ${700 - at * 90} l S`,
  );
  const content = lines.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;

  return Buffer.from(body, 'latin1');
}

/** An image that is not square: refused as a cover. */
export const notSquare = png(64, 48);
