import type { LogoInput } from '../install/installApi.ts';

// Prepares the icon of the installed app for the API (model/band.md, "Icon
// of the installed app", issue #34): the file itself, and the three square
// PNG icons drawn here from it, the image filling the square, without a
// margin. The server checks what it receives (api/src/Band/LogoStore.php).

export const APP_ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const APP_ICON_MAX_BYTES = 2 * 1000 * 1000;
export const APP_ICON_MIN_SIDE = 512;

/** Why an image cannot be the icon, with what the message says of it. */
export type AppIconProblem =
  | { problem: 'wrongType' }
  | { problem: 'tooBig'; bytes: number }
  | { problem: 'notSquare'; width: number; height: number }
  | { problem: 'tooSmall'; size: number };

export async function prepareAppIcon(file: File): Promise<LogoInput | AppIconProblem> {
  if (!APP_ICON_TYPES.includes(file.type)) return { problem: 'wrongType' };
  if (file.size > APP_ICON_MAX_BYTES) return { problem: 'tooBig', bytes: file.size };

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      return { problem: 'wrongType' };
    }
    const [width, height] = [image.naturalWidth, image.naturalHeight];
    if (width !== height) return { problem: 'notSquare', width, height };
    if (width < APP_ICON_MIN_SIDE) return { problem: 'tooSmall', size: width };

    return {
      image: await base64(file),
      icon180: draw(image, 180),
      icon192: draw(image, 192),
      icon512: draw(image, 512),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(image: HTMLImageElement, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw the icons');
  context.drawImage(image, 0, 0, size, size);
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
