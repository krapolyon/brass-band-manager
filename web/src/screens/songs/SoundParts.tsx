import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { lazyPart, PartFailed } from '../../lazyPart.tsx';
import type { Song } from '../../songs.ts';

// The Live mode and the MIDI player, loaded only when they are opened: they
// bring the sound engine (web/src/lazyPart.tsx). While they load, and if they
// cannot, they show the same lines as when their file loads or fails.
const LiveView = lazyPart(
  () => import('./LiveView.tsx'),
  (module) => module.LiveView,
);
const MidiView = lazyPart(
  () => import('./MidiView.tsx'),
  (module) => module.MidiView,
);

/** Fetches the Live mode ahead, so that a gig never waits for the network to open a song. */
export const preloadLive = LiveView.preload;

export function LivePart({ song, onClose }: { song: Song; onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <PartFailed
      failed={
        <div className="songs-liveWait">
          <Message kind="danger">{t('songs.live.error')}</Message>
          <Button kind="secondary" onClick={onClose}>
            {t('songs.live.close')}
          </Button>
        </div>
      }
    >
      <Suspense
        fallback={
          <p role="status" className="songs-liveWait songs-muted">
            {t('songs.live.loading')}
          </p>
        }
      >
        <LiveView song={song} onClose={onClose} />
      </Suspense>
    </PartFailed>
  );
}

export function MidiPart({ song }: { song: Song }) {
  const { t } = useTranslation();

  return (
    <PartFailed failed={<Message kind="danger">{t('songs.midi.error')}</Message>}>
      <Suspense
        fallback={
          <div aria-busy="true">
            <p role="status" className="visuallyHidden">
              {t('songs.midi.loading')}
            </p>
            <div className="songs-skeleton" data-shape="card" />
          </div>
        }
      >
        <MidiView song={song} />
      </Suspense>
    </PartFailed>
  );
}
