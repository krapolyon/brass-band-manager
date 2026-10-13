// Prepares the picture of a costume for the API (model/gigs.md, entry 3):
// reduced to 1200 pixels wide at most, which is what the top of a gig needs
// on the densest phone, and drawn again as a JPEG. A photo of several
// megabytes becomes about 150 kilobytes; and drawing it again removes what a
// phone writes inside it, the place where it was taken in particular.

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 2400;

/** What the API receives: the content of the file, in base64. Throws when the browser cannot read the file as an image. */
export async function prepareCostumePicture(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth === 0 || image.naturalHeight === 0)
      throw new Error('This image has no size');

    const scale = Math.min(1, MAX_WIDTH / image.naturalWidth, MAX_HEIGHT / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot draw the picture');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '';
  } finally {
    URL.revokeObjectURL(url);
  }
}
