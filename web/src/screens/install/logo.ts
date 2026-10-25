import type { LogoInput } from './installApi.ts';

// Prepares a logo for the API: the file itself, and the three square icons of
// the installed app, drawn here from it (model/band.md: "the logo fitted in a
// square, on a plain background").
//
// The browser draws them because it reads the four formats of a logo, SVG
// included; the server then needs no image library. The API checks what it
// receives (api/src/Band/LogoStore.php).

// The rules of model/band.md for the name and the logo, at install and in
// the band settings. The API checks them again.
export const BAND_NAME_MAX_LENGTH = 80;
export const LOGO_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1000 * 1000;

/**
 * Checks a logo the member chose and prepares it for the API, or says why it
 * is refused: not an image the app takes, or too large (with its size, for
 * the message).
 */
export async function readLogo(
  file: File,
): Promise<{ input: LogoInput } | { problem: 'wrongType' } | { problem: 'tooBig'; bytes: number }> {
  // Some systems give no type to an SVG file: its name then says what it is.
  const type = file.type || (file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '');
  if (!LOGO_TYPES.includes(type)) return { problem: 'wrongType' };
  if (file.size > LOGO_MAX_BYTES) return { problem: 'tooBig', bytes: file.size };
  try {
    // Drawn into its icons at once: a file the browser cannot read is refused here.
    return { input: await prepareLogo(file) };
  } catch {
    return { problem: 'wrongType' };
  }
}

// The share of the square left empty around the logo, on each side. Phones
// round or crop the corners of an icon: what matters stays in the middle.
const MARGIN = 0.125;
// White: no colour of the band is modelled yet.
const BACKGROUND = '#ffffff';

// 180 is the icon of an iPhone home screen, 192 and 512 those of the manifest.
/** Throws when the browser cannot read the file as an image. */
export async function prepareLogo(file: File): Promise<LogoInput> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    return {
      image: await base64(file),
      icon180: drawIcon(image, 180),
      icon192: drawIcon(image, 192),
      icon512: drawIcon(image, 512),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawIcon(image: HTMLImageElement, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw the icons');

  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, size, size);

  // An SVG may give no size of its own: it is then drawn as a square.
  const width = image.naturalWidth || size;
  const height = image.naturalHeight || size;
  const room = size * (1 - 2 * MARGIN);
  const scale = Math.min(room / width, room / height);
  const [drawnWidth, drawnHeight] = [width * scale, height * scale];
  context.drawImage(
    image,
    (size - drawnWidth) / 2,
    (size - drawnHeight) / 2,
    drawnWidth,
    drawnHeight,
  );

  // "data:image/png;base64,...": the API wants what follows the comma.
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
