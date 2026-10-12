import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../components/IconButton.tsx';
import { Message } from '../../components/Message.tsx';
import './songs.css';

type PagesProps = { url: string };

// The pages of a part, drawn by pdf.js (pdfjs-dist) on canvases as wide as
// their column. A phone does not show a PDF inside a page by itself; pdf.js
// does, the same way everywhere. The library is loaded only when a part is
// opened.
function PdfPages({ url }: PagesProps) {
  const { t } = useTranslation();
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  // Follows the width of the column: the pages are drawn again when it changes.
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry?.contentRect.width ?? 0));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = holder.current;
    if (!element || width === 0) return;
    let isCurrent = true;
    setState('loading');

    (async () => {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const loading = pdfjs.getDocument({ url });
      const document = await loading.promise;
      const canvases: HTMLCanvasElement[] = [];
      const sharpness = Math.min(window.devicePixelRatio || 1, 3);

      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / natural.width) * sharpness });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', t('songs.song.pdfPage', { page: number }));
        await page.render({ canvas, viewport }).promise;
        canvases.push(canvas);
      }
      void loading.destroy();
      if (!isCurrent) return;
      element.replaceChildren(...canvases);
      setState('ready');
    })().catch(() => {
      if (isCurrent) setState('error');
    });

    return () => {
      isCurrent = false;
    };
  }, [url, width, t]);

  return (
    <>
      {state === 'error' && <Message kind="danger">{t('songs.song.pdfError')}</Message>}
      {state === 'loading' && <p role="status">{t('shell.loading')}</p>}
      <div className="songs-pdfPages" ref={holder} data-state={state} />
    </>
  );
}

type Props = {
  url: string;
  /** The part read full screen, from its own button. */
  isFullScreen: boolean;
  onLeaveFullScreen: () => void;
};

// Figma: Songs / Song — PDF. The part on the screen of the song, and the
// same part over the whole screen.
export function PdfView({ url, isFullScreen, onLeaveFullScreen }: Props) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isFullScreen && !element.open) element.showModal();
    if (!isFullScreen && element.open) element.close();
  }, [isFullScreen]);

  return (
    <>
      <div className="songs-pdf">
        <PdfPages url={url} />
      </div>
      <dialog
        className="songs-pdfFull"
        ref={dialog}
        aria-label={t('songs.song.fullScreenTitle')}
        onClose={onLeaveFullScreen}
      >
        <div className="songs-pdfFullClose">
          <IconButton
            kind="glass"
            icon="Close"
            label={t('songs.song.closeFullScreen')}
            onClick={onLeaveFullScreen}
          />
        </div>
        {isFullScreen && <PdfPages url={url} />}
      </dialog>
    </>
  );
}
