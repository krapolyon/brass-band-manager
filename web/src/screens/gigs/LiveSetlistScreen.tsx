import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { Halo } from '../../components/Halo.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { ScreenTop } from '../../components/ScreenTop.tsx';
import { type Setlist, useSetlist } from '../../gigs.ts';
import { useMe } from '../../session.ts';
import { useSong } from '../../songs.ts';
import { LivePart, preloadLive } from '../songs/SoundParts.tsx';
import './gigs.css';

// How long the list must rest before the song on the focus line becomes the
// one being played.
const SCROLL_REST_MS = 350;

/** The text style of a song, by its distance from the one being played (Figma, section 15). */
const styleAt = (offset: number) =>
  offset === 0
    ? 'textDisplay'
    : Math.abs(offset) === 1
      ? 'textTitle'
      : offset === 2 || offset < 0
        ? 'textHeading'
        : 'textBodyLarge';

/** Keeps the screen on while the live screen is shown, where the device allows it. */
function useScreenOn(isOn: boolean) {
  useEffect(() => {
    if (!isOn) return;
    let lock: WakeLockSentinel | null = null;
    let isGone = false;
    const ask = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        const taken = await navigator.wakeLock.request('screen');
        if (isGone) taken.release();
        else lock = taken;
      } catch {
        // Refused (low battery): the screen follows the setting of the device.
      }
    };
    ask();
    // The device takes the lock back when the page is hidden.
    document.addEventListener('visibilitychange', ask);
    return () => {
      isGone = true;
      document.removeEventListener('visibilitychange', ask);
      lock?.release();
    };
  }, [isOn]);
}

// Figma: Gigs / Live setlist (section 15). The setlist reads like the lyrics
// of a song: the song being played on the focus line, the ones played fading
// above it, the ones to come smaller and fainter below. Who manages setlists
// moves it on with one button, or corrects it by scrolling: the song that
// rests on the focus line becomes the one being played. A member sees the
// same list, follows it as it moves, and their scrolling changes nothing.
export function LiveSetlistScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setlistId = Number(useParams().id);
  const query = useSetlist(setlistId);
  const canManage = useMe().data?.permissions.includes('manageSetlists') ?? false;
  const list = useRef<HTMLOListElement>(null);
  const moving = useRef(false);
  const [openSongId, setOpenSongId] = useState<number | null>(null);
  const [isManaging, setManaging] = useState(false);
  // Counts the changes that failed: the list then goes back to the song being played.
  const [failures, setFailures] = useState(0);
  const touching = useRef(false);

  // Fetched while the network is there: a song opened during the gig does not depend on it.
  useEffect(preloadLive, []);

  const setlist = query.data;
  const position = setlist?.livePosition ?? null;
  const count = setlist?.songs.length ?? 0;
  const back = setlist ? `/gigs/${setlist.gigId}` : '/gigs';
  useScreenOn(position !== null);

  const keep = (saved: Setlist) => {
    queryClient.setQueryData(['setlist', setlistId], { ...setlist, ...saved });
    queryClient.invalidateQueries({ queryKey: ['gig', saved.gigId] });
  };
  // An answer to a question asked before the change must not put the old
  // position back: what was asked is dropped before the change leaves.
  const dropAsked = () => queryClient.cancelQueries({ queryKey: ['setlist', setlistId] });
  const moveTo = useMutation({
    mutationFn: (next: number) =>
      api<Setlist>(`/api/setlists/${setlistId}/live`, { method: 'PUT', body: { position: next } }),
    onMutate: dropAsked,
    onSuccess: keep,
    onError: () => setFailures((count) => count + 1),
  });
  const end = useMutation({
    mutationFn: () => api<Setlist>(`/api/setlists/${setlistId}/live`, { method: 'DELETE' }),
    onMutate: dropAsked,
    onSuccess: (saved) => {
      keep(saved);
      navigate(`/gigs/${saved.gigId}`);
    },
  });

  // The song being played comes to the focus line: when the screen opens, and
  // each time the setlist moves, here or on the phone of who manages it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the count is read when the position changes
  useEffect(() => {
    const row = list.current?.children[(position ?? 1) - 1];
    if (!(row instanceof HTMLElement) || !list.current) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    moving.current = true;
    list.current.scrollTo({
      top: row.offsetTop - list.current.offsetTop - focusLineOf(list.current),
      // Reduced motion: the list jumps instead of scrolling.
      behavior: still || document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth',
    });
    const timer = window.setTimeout(() => {
      moving.current = false;
    }, 800);
    return () => window.clearTimeout(timer);
  }, [position, count, openSongId, failures]);

  // Who manages setlists corrects by scrolling: once the list rests, the song
  // on the focus line is the one being played.
  const mutate = moveTo.mutate;
  const isSaving = moveTo.isPending;
  const rest = useRef(0);
  const onScroll = useCallback(() => {
    if (!canManage || position === null) return;
    window.clearTimeout(rest.current);
    const settle = () => {
      const within = list.current;
      if (!within) return;
      // Not yet: the screen is scrolling by itself, a finger still holds the
      // list, or a change is on its way. Looked at again in a moment.
      if (moving.current || touching.current || isSaving) {
        rest.current = window.setTimeout(settle, SCROLL_REST_MS);
        return;
      }
      const line = within.scrollTop + focusLineOf(within);
      let nearest = 1;
      let distance = Number.POSITIVE_INFINITY;
      [...within.children].forEach((row, index) => {
        const from = Math.abs((row as HTMLElement).offsetTop - within.offsetTop - line);
        if (from < distance) {
          distance = from;
          nearest = index + 1;
        }
      });
      if (nearest !== position) mutate(nearest);
    };
    rest.current = window.setTimeout(settle, SCROLL_REST_MS);
  }, [canManage, position, mutate, isSaving]);
  useEffect(() => () => window.clearTimeout(rest.current), []);

  if (openSongId !== null) {
    return <SongOver songId={openSongId} onClose={() => setOpenSongId(null)} />;
  }

  const isLast = position !== null && position >= count;
  const playing = position !== null ? setlist?.songs[position - 1] : undefined;
  const isGone = query.error instanceof ApiError && query.error.status === 404;

  return (
    <main className="gigs-live">
      <Halo />
      <div className="gigs-liveColumn">
        <ScreenTop
          leading={
            <IconButton
              kind="glass"
              icon="ChevronLeft"
              label={t('gigs.setlist.liveScreen.back')}
              onClick={() => navigate(back)}
            />
          }
          action={
            canManage &&
            position !== null && (
              <IconButton
                kind="glass"
                icon="More"
                label={t('gigs.setlist.liveScreen.manage')}
                aria-haspopup="dialog"
                onClick={() => setManaging(true)}
              />
            )
          }
          title={
            setlist && !isGone
              ? t('gigs.setlist.title', { number: setlist.number })
              : t('gigs.setlist.name')
          }
          subtitle={isGone ? undefined : setlist?.gigName}
        />
        {/* Also when the setlist was shown before: deleted since, or the network is lost. */}
        {query.isError && (
          <div className="gigs-liveNote">
            <Message kind={isGone ? 'danger' : 'warning'}>
              {t(
                isGone
                  ? 'gigs.setlist.liveScreen.notFound'
                  : setlist
                    ? 'gigs.setlist.liveScreen.stale'
                    : 'errors.unreachable',
              )}
            </Message>
          </div>
        )}
        {setlist && !isGone && position === null && (
          <div className="gigs-liveNote">
            <Message>{t('gigs.setlist.liveScreen.notStarted')}</Message>
          </div>
        )}
        {(moveTo.isError || end.isError) && (
          <div className="gigs-liveNote">
            <Message kind="danger">{t('gigs.setlist.liveScreen.failed')}</Message>
          </div>
        )}
        {setlist && !isGone && (
          <ol
            className="gigs-liveSongs"
            ref={list}
            aria-label={t('gigs.setlist.liveScreen.songs')}
            onScroll={onScroll}
            onTouchStart={() => {
              touching.current = true;
            }}
            onTouchEnd={() => {
              touching.current = false;
            }}
            onTouchCancel={() => {
              touching.current = false;
            }}
          >
            {setlist.songs.map((song) => {
              // Not live: the songs as a plain list, none in focus, none faded.
              const offset = position === null ? 3 : song.position - position;
              return (
                <li
                  key={song.position}
                  data-offset={position === null ? undefined : Math.max(-2, Math.min(3, offset))}
                  aria-current={offset === 0 ? 'true' : undefined}
                >
                  <span className={styleAt(offset)}>{song.name}</span>
                  {offset === 0 && (
                    <IconButton
                      icon="BookOpen"
                      label={t('gigs.setlist.liveScreen.openSong', { name: song.name })}
                      onClick={() => setOpenSongId(song.songId)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {/* Said to screen readers each time the setlist moves. */}
        <p className="visuallyHidden" role="status">
          {playing
            ? t('gigs.setlist.liveScreen.playing', { position, count, name: playing.name })
            : ''}
        </p>
        {canManage && position !== null && (
          <div className="gigs-liveBar">
            {/* The way back for the keyboard and screen readers: shown when it has the focus. */}
            <button
              type="button"
              className="gigs-livePrevious textLabel"
              // Not the `disabled` attribute: the button would lose the focus
              // that shows it.
              aria-disabled={position <= 1 ? true : undefined}
              onClick={() => {
                if (position > 1 && !moveTo.isPending) moveTo.mutate(position - 1);
              }}
            >
              {t('gigs.setlist.liveScreen.previous')}
            </button>
            {isLast ? (
              <Button icon="Flag" disabled={end.isPending} onClick={() => end.mutate()}>
                {t('gigs.setlist.liveScreen.end')}
              </Button>
            ) : (
              <Button
                icon="SkipForward"
                onClick={() => {
                  if (!moveTo.isPending) moveTo.mutate(position + 1);
                }}
              >
                {t('gigs.setlist.liveScreen.next')}
              </Button>
            )}
          </div>
        )}
      </div>

      <Panel
        open={isManaging}
        onClose={() => setManaging(false)}
        title={t('gigs.setlist.title', { number: setlist?.number ?? '' })}
      >
        <div className="gigs-sheet">
          <Button kind="danger" icon="Flag" disabled={end.isPending} onClick={() => end.mutate()}>
            {t('gigs.setlist.liveScreen.end')}
          </Button>
        </div>
      </Panel>
    </main>
  );
}

/** Where the focus line is under the top of the list: its top padding. */
function focusLineOf(list: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(list).paddingTop);
}

// Figma: Gigs / Live setlist — the song opened over it. The Live mode of the
// song alone, over the setlist: closing it comes back to the setlist.
function SongOver({ songId, onClose }: { songId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const song = useSong(songId);

  if (song.data?.musicXml) {
    return <LivePart song={song.data} onClose={onClose} />;
  }
  return (
    <main className="gigs-live">
      <div className="gigs-liveColumn">
        <ScreenTop
          leading={
            <IconButton kind="glass" icon="Close" label={t('songs.live.close')} onClick={onClose} />
          }
          title={song.data?.name ?? ''}
        />
        <div className="gigs-liveNote">
          {song.isError ? (
            <Message kind="danger">{t('errors.unreachable')}</Message>
          ) : song.data ? (
            <Message>{t('songs.song.noScoreMember')}</Message>
          ) : (
            <p role="status" className="gigs-muted">
              {t('gigs.gig.loading')}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
