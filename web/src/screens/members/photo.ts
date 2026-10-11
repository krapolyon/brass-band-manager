// Prepares a profile photo for the API (model/members.md, "Profile photo"):
// cropped to a centred square, reduced to 512 pixels a side, and drawn again
// as a JPEG. A photo straight from a phone, of several megabytes, becomes a
// few tens of kilobytes; and drawing it again removes what a phone writes
// inside it, the place where it was taken in particular.

const SIDE = 512;

export type PreparedPhoto = {
  /** What the API receives: the content of the file, in base64. */
  image: string;
  /** The same image as an address the page can show. */
  preview: string;
};

/** Throws when the browser cannot read the file as an image. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const square = Math.min(image.naturalWidth, image.naturalHeight);
    if (square === 0) throw new Error('This image has no size');
    const side = Math.min(SIDE, square);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot draw the photo');
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

    const preview = canvas.toDataURL('image/jpeg', 0.85);
    return { image: preview.split(',')[1] ?? '', preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}
