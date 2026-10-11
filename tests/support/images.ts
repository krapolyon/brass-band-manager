import { crc32, deflateSync } from 'node:zlib';

// Made-up image files for the tests of the logo, built here so that no image
// file sits in the repository.

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, sum]);
}

/** A square PNG of one flat grey, of the side given. */
export function png(side: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header[8] = 8; // bits per channel
  header[9] = 0; // greyscale
  // One byte of filter then the pixels, for each line.
  const lines = Buffer.alloc(side * (side + 1), 128);
  for (let line = 0; line < side; line++) lines[line * (side + 1)] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(lines)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>',
);

/** What the front sends for a logo: the file and its three icons, in base64. */
export function logoInput(image: Buffer = svg) {
  return {
    image: image.toString('base64'),
    icon180: png(180).toString('base64'),
    icon192: png(192).toString('base64'),
    icon512: png(512).toString('base64'),
  };
}
