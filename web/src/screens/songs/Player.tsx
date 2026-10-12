import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { SongMention } from '../../components/SongMention.tsx';
import type { Song } from '../../songs.ts';
import { duration as clock } from './format.ts';
import './songs.css';

// The recording that plays. There is one for the whole app, so that it goes
// on while the member moves from a screen to another: the song shows it in
// its MP3 mode, every other screen in the mini-player above the tab bar
// (Figma: Song/Mention).
//
// It lives around the screens of signed-in members only: signing out stops
// it, with everything else the member was shown.

type Playing = Pick<Song, 'id' | 'name' | 'coverUrl'> & { url: string };

type Player = {
  /** The song whose recording is loaded, playing or paused. */
  song: Playing | null;
  isPlaying: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  /** The recording could not be loaded or played. */
  hasFailed: boolean;
  /** Plays the recording of a song, from where it was if it is the one loaded. */
  play: (song: Playing) => void;
  pause: () => void;
  seek: (seconds: number) => void;
  /** Stops and forgets the recording: the mini-player leaves. */
  close: () => void;
};

const PlayerContext = createContext<Player | null>(null);

export function usePlayer(): Player {
  const player = useContext(PlayerContext);
  if (!player) throw new Error('usePlayer is used outside PlayerProvider');
  return player;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [song, setSong] = useState<Playing | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(0);
  const [hasFailed, setFailed] = useState(false);

  // The browser's own player, never shown: the screens draw their controls.
  useEffect(() => {
    const element = new Audio();
    element.preload = 'metadata';
    audio.current = element;
    const follow = {
      timeupdate: () => setPosition(element.currentTime),
      durationchange: () => setLength(Number.isFinite(element.duration) ? element.duration : 0),
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      ended: () => setPlaying(false),
      error: () => {
        setPlaying(false);
        setFailed(true);
      },
    };
    for (const [event, listener] of Object.entries(follow)) {
      element.addEventListener(event, listener);
    }
    return () => {
      for (const [event, listener] of Object.entries(follow)) {
        element.removeEventListener(event, listener);
      }
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, []);

  const play = useCallback(
    (next: Playing) => {
      const element = audio.current;
      if (!element) return;
      // Another recording, or the same one sent again: loaded afresh.
      if (song?.url !== next.url || hasFailed) {
        element.src = next.url;
        setPosition(0);
        setLength(0);
      }
      setFailed(false);
      setSong(next);
      element.play().catch(() => {
        // The browser refused to play (no gesture yet), or the file did not
        // come: the error event says which.
        setPlaying(false);
      });
    },
    [song, hasFailed],
  );

  const pause = useCallback(() => audio.current?.pause(), []);

  const seek = useCallback((seconds: number) => {
    const element = audio.current;
    if (!element || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.min(Math.max(0, seconds), element.duration);
    setPosition(element.currentTime);
  }, []);

  const close = useCallback(() => {
    const element = audio.current;
    if (element) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    setSong(null);
    setPosition(0);
    setLength(0);
    setFailed(false);
  }, []);

  const player = useMemo(
    () => ({ song, isPlaying, position, duration: length, hasFailed, play, pause, seek, close }),
    [song, isPlaying, position, length, hasFailed, play, pause, seek, close],
  );

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}

type MiniPlayerProps = {
  /** The song whose screen is open: its own player is on the screen already. */
  exceptSongId?: number;
};

// Figma: Songs / List — mini-player while a song plays. Above the tab bar on
// every screen of the app, as long as a recording is loaded.
export function MiniPlayer({ exceptSongId }: MiniPlayerProps) {
  const { t } = useTranslation();
  const player = usePlayer();
  const { song } = player;

  if (!song || song.id === exceptSongId) return null;

  return (
    <div className="songs-miniPlayer">
      <SongMention
        song={song}
        detail={t('songs.player.position', {
          position: clock(player.position),
          duration: clock(player.duration),
        })}
        to={`/songs/${song.id}?mode=mp3`}
        playing={player.isPlaying}
        onToggle={() => (player.isPlaying ? player.pause() : player.play(song))}
        toggleLabel={t(player.isPlaying ? 'songs.player.pause' : 'songs.player.play')}
        onClose={player.close}
        closeLabel={t('songs.player.close')}
      />
    </div>
  );
}
