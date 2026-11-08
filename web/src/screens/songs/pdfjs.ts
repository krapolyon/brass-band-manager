// Which build of pdf.js this browser gets (1.1.0). The modern build uses
// JavaScript added to browsers in 2025 (Map.getOrInsertComputed,
// Math.sumPrecise, Uint8Array.fromBase64, Promise.try) without a stand-in:
// an iPhone a year or two old cannot run it. The legacy build brings those
// stand-ins and runs from Safari 16.4, the oldest browser the app is built
// for. The modern one is smaller and faster, so it stays the first choice.
//
// On an upgrade of pdfjs-dist, check that this list still names what the
// modern build uses (docs/architecture.md, "The PDF reader").

type Recent = {
  getOrInsertComputed?: unknown;
  sumPrecise?: unknown;
  fromBase64?: unknown;
  try?: unknown;
};

/** True when the browser has everything the modern build of pdf.js uses. */
export function runsModernPdfjs(): boolean {
  return (
    typeof (Map.prototype as Recent).getOrInsertComputed === 'function' &&
    typeof (Math as Recent).sumPrecise === 'function' &&
    typeof (Uint8Array as Recent).fromBase64 === 'function' &&
    typeof (Promise as Recent).try === 'function'
  );
}

/** pdf.js, with its worker set, in the build this browser can run. */
export async function loadPdfjs() {
  const [pdfjs, worker] = runsModernPdfjs()
    ? await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    : await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}
