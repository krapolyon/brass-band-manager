import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { Chip } from '../../components/Chip.tsx';
import { Icon } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { Message } from '../../components/Message.tsx';
import { Metronome } from '../../components/Metronome.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Pictogram } from '../../components/Pictogram.tsx';
import { SongPartRow } from '../../components/SongPartRow.tsx';
import { SwitchRow } from '../../components/SwitchRow.tsx';
import { instrumentsOf, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import type { Song } from '../../songs.ts';
import { ReadingSettings, StartChoice, TempoSheet } from './LiveSheets.tsx';
import { type Drawn, drawPart, MAX_COLUMN, SCALE } from './liveDrawing.ts';
import { isMotionReduced, type Scrolling, useLiveSettings } from './liveSettings.ts';
import { mutedVolumeOf, SilentClock, type Sounds, tempoRange } from './MidiView.tsx';
import {
  countedBpm,
  type MidiSong,
  measureAt,
  measureTicks,
  readMidi,
  tickOfPlace,
  writtenAt,
} from './midi.ts';
import { ClockError, MidiEngine } from './midiEngine.ts';
import { useMidiSettings } from './midiSettings.ts';
import { usePlayer } from './Player.tsx';
import { partAlone, partsOf, readScore, type Timeline, timelineOf } from './score.ts';
import './songs.css';

// Figma: Songs / Song — Live (sections 5, 14 and 20). The part of the
// member's instrument, drawn for the width of the screen, moving at the tempo
// with no cursor, because a band never keeps a perfect tempo. The lines
// already played stand back, and the member drags the score to catch up with
// the band. A repeat brings the score back to where it starts.
//
// The score is the MusicXML kept with the song (model/songs.md, "Generated
// files"), drawn by Verovio (liveDrawing.ts).
//
// Three layouts (1.1.0): a phone in portrait reads lines that rise; a phone in
// landscape reads one line that scrolls to the left, its controls in a bar at
// the right; from 768 the score is one column at the width of the pane.
//
// What moves the score is the clock of the tempo, or the MIDI player when the
// switch "Jouer avec le MIDI" is on (issues #10 and #76): the score then
// follows the position of the player, repeats and jumps included, and a
// playhead shows where it is in the measure.

type TrackName = { name: string; instrumentId: number | null };

// Where the line being played sits in the height of the score: the line
// before it stays whole above, standing back.
const READING_LINE = 0.27;
// In landscape, where the music being played sits: 44 px from the left edge.
const READING_X = 44;
// The wheel moves the score one line for this much of a turn, and no faster
// than this: a trackpad sends dozens of small turns for one gesture.
const WHEEL_LINE = 60;
const WHEEL_REST_MS = 180;
// The lines are laid out again once the size has stopped changing.
const RESIZE_REST_MS = 150;
// A press on the score that moves less than this is a tap, not a drag.
const TAP_SLOP = 6;

/** Where the song is: a place of the played order, and how far into its measure (0 to 1). */
type Position = { index: number; fraction: number };

/**
 * A phone held sideways: wider than tall, and short. A phone in landscape is
 * at most about 430 px tall; a window of a laptop is rarely less than 600.
 */
const isLandscapeSize = (width: number, height: number) =>
  width > height && height < 600 && width < 1024;

type Props = { song: Song; onClose: () => void };

export function LiveView({ song, onClose }: Props) {
  const { t } = useTranslation();
  const url = song.musicXml?.url ?? '';
  const file = useQuery({
    queryKey: ['songs', song.id, 'musicXml', url],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('The score could not be loaded');
      const score = await readScore(await response.arrayBuffer());
      return { score, parts: partsOf(score), timeline: timelineOf(score) };
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  // The MIDI file, as the MIDI mode reads it: the same copy when it was opened.
  const midiUrl = song.midi?.url ?? '';
  const midi = useQuery({
    queryKey: ['songs', song.id, 'midi', midiUrl],
    queryFn: async () => {
      const response = await fetch(midiUrl);
      if (!response.ok) throw new Error('The MIDI file could not be loaded');
      return readMidi(await response.arrayBuffer());
    },
    enabled: midiUrl !== '',
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  // The Live mode takes the whole screen, in the dark scheme: a score is read
  // at night as well, and nothing else is on the screen. It is the browser's
  // own <dialog>, opened as a modal: the page behind cannot be reached, the
  // focus stays inside, and Escape leaves.
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      className="songs-live"
      data-scheme="dark"
      ref={dialog}
      aria-label={t('songs.live.title', { name: song.name })}
      onCancel={(event) => {
        // The Escape of a sheet open over the score closes the sheet alone:
        // its event comes up here too.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
    >
      {file.isPending && (
        <p role="status" className="songs-liveWait songs-muted">
          {t('songs.live.loading')}
        </p>
      )}
      {(file.isPending || file.isError || file.data.parts.length === 0) && (
        <div className="songs-liveWait">
          {!file.isPending && <Message kind="danger">{t('songs.live.error')}</Message>}
          <Button kind="secondary" onClick={onClose}>
            {t('songs.live.close')}
          </Button>
        </div>
      )}
      {file.data && file.data.parts.length > 0 && (
        <LiveScore
          key={url}
          song={song}
          onClose={onClose}
          midi={midi.data && midi.data.tracks.length > 0 ? midi.data : null}
          midiFailed={midiUrl !== '' && (midi.isError || midi.data?.tracks.length === 0)}
          {...file.data}
        />
      )}
    </dialog>
  );
}

type ScoreProps = Props & {
  /** The MIDI file of the song, when it has one that plays. */
  midi: MidiSong | null;
  /** The song has a MIDI file, and it could not be read. */
  midiFailed: boolean;
  score: Document;
  parts: { id: string; name: string }[];
  timeline: Timeline;
};

function LiveScore({ song, onClose, midi, midiFailed, score, parts, timeline }: ScoreProps) {
  const { t } = useTranslation();
  const me = useMe().data;
  const instruments = instrumentsOf(useSections().data);
  const recording = usePlayer();
  const [reading, setReading] = useLiveSettings(me?.id);

  // ---- The part shown: the one of the member's instrument first ----
  const names = parts.map((part) => part.name);
  const placed = useQuery({
    queryKey: ['songs', 'trackNames', names],
    queryFn: () => api<TrackName[]>('/api/songs/trackNames', { method: 'POST', body: { names } }),
  });
  const choices = parts.map((part, index) => {
    const instrument = instruments.find(
      (other) => other.id === (placed.data?.[index]?.instrumentId ?? null),
    );
    return {
      id: part.id,
      name: instrument?.name ?? (part.name || t('songs.midi.unnamedTrack', { number: index + 1 })),
      pictogram: instrument?.icon ?? null,
      own: instrument !== undefined && instrument.id === me?.instrumentId,
    };
  });
  const [chosenPart, setChosenPart] = useState<string | null>(null);
  const shown =
    choices.find((choice) => choice.id === chosenPart) ??
    choices.find((choice) => choice.own) ??
    choices[0];
  const [panel, setPanel] = useState<'parts' | 'start' | 'tempo' | 'settings' | null>(null);

  // ---- Where the song is ----
  const { measures, played, marks } = timeline;
  const [state, setState] = useState<'ready' | 'playing'>('ready');
  // What moves the score while it plays: the clock of the tempo, or the MIDI player.
  const [driver, setDriver] = useState<'clock' | 'midi'>('clock');
  // "Jouer avec le MIDI": off at each opening (model/songs.md, "Not kept").
  const [isMidiOn, setMidiOn] = useState(false);
  // The place in the played order: the measure the song is at, or starts from.
  const [at, setAt] = useState(0);
  const atNow = useRef(0);
  atNow.current = at;
  const written = played[at] ?? 0;
  const label = measures[written]?.label ?? '1';
  const startMark = marks.find((mark) => mark.measure === written);
  // The beat of the measure being played, for the visual metronome.
  const [beat, setBeat] = useState<number | null>(null);
  // Hidden by the chevron, or by the setting while it plays.
  const [barsHidden, setBarsHidden] = useState(false);

  // ---- The tempo: the band's, else the file's, at each opening ----
  const fileBpm = midi ? countedBpm(midi) : 120;
  const scoreBpm = timeline.bpm ?? Math.round(fileBpm);
  const bandBpm = song.bpm ?? scoreBpm;
  const [bpm, setBpm] = useState(bandBpm);
  const bpmNow = useRef(bpm);
  bpmNow.current = bpm;
  // With the MIDI the tempo takes the bounds of the player, the band's always within reach.
  const bounds = isMidiOn
    ? (({ slowest, fastest }) => ({ min: slowest, max: fastest }))(
        tempoRange(fileBpm, song.bpm ?? Math.round(fileBpm)),
      )
    : { min: 20, max: 400 };
  const inBounds = (value: number) => Math.min(Math.max(value, bounds.min), bounds.max);

  // How long a place of the played order lasts at a tempo, in seconds. The
  // tempo is counted in the beat of the start; the measures in quarter notes.
  const secondsAt = useCallback(
    (index: number, tempo: number) =>
      ((measures[played[index] ?? 0]?.quarters ?? 4) * 60) / (tempo * timeline.beatQuarters),
    [measures, played, timeline.beatQuarters],
  );
  const origin = useRef({ at: 0, time: 0 });

  // ---- The MIDI player, when it drives the score ----
  const engine = useRef<MidiEngine | null>(null);
  const [midiSettings, setMidiSettings] = useMidiSettings(
    song.id,
    song.bpm ?? Math.round(fileBpm),
    midi?.tracks.length ?? 0,
  );
  const [sounds, setSounds] = useState<Sounds>('waiting');
  // The clock of the device did not start (issue #70).
  const [isSilent, setSilent] = useState(false);
  // One engine, made when the member first turns the switch on, kept until
  // the Live mode closes.
  const engineFor = (file: MidiSong) => {
    if (engine.current) return engine.current;
    const created = new MidiEngine(file);
    created.onSounds = setSounds;
    // What was set before, here or in the MIDI mode, from the first note.
    midiSettings.muted.forEach((isMuted, index) => {
      created.setMuted(index, isMuted);
    });
    created.setMutedVolume(mutedVolumeOf(midiSettings.mutedStep));
    created.setSpeed(bpmNow.current / fileBpm);
    created.onEnd = () => {
      setState('ready');
      setDriver('clock');
      setAt(0);
      setBarsHidden(false);
    };
    engine.current = created;
    return created;
  };
  // The start of the MIDI on the next 1, after a tapped tempo: cancelled by
  // anything that starts, stops or leaves before it comes.
  const nextOne = useRef(0);
  const cancelNextOne = () => window.clearTimeout(nextOne.current);
  useEffect(
    () => () => {
      window.clearTimeout(nextOne.current);
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );
  // The tracks shared with the MIDI mode, and the tempo, reach the engine as they change.
  useEffect(() => {
    const player = engine.current;
    if (!player) return;
    midiSettings.muted.forEach((isMuted, index) => {
      player.setMuted(index, isMuted);
    });
    player.setMutedVolume(mutedVolumeOf(midiSettings.mutedStep));
  }, [midiSettings]);
  useEffect(() => {
    engine.current?.setSpeed(bpm / fileBpm);
  }, [bpm, fileBpm]);

  const startMidi = async (from: number) => {
    if (!midi) return;
    const player = engineFor(midi);
    recording.pause();
    player.seek(tickOfPlace(midi, from, played));
    setAt(from);
    setDriver('midi');
    setState('playing');
    setBarsHidden(reading.hidesControls);
    setSilent(false);
    try {
      await player.play();
    } catch (error) {
      if (error instanceof ClockError) setSilent(true);
      else setSounds('failed');
      setState('ready');
      setDriver('clock');
      setBarsHidden(false);
    }
  };

  const playFrom = (index: number, delayMs = 0) => {
    recording.pause();
    origin.current = { at: index, time: performance.now() + delayMs };
    setAt(index);
    setDriver('clock');
    setState('playing');
    setBarsHidden(reading.hidesControls);
  };
  const play = () => {
    cancelNextOne();
    if (isMidiOn) void startMidi(at);
    else playFrom(at);
  };
  const pause = () => {
    cancelNextOne();
    engine.current?.pause();
    setState('ready');
    setDriver('clock');
    setBarsHidden(false);
    setBeat(null);
  };

  // Where the clock says the song is.
  const clockNow = useCallback((): Position => {
    let index = origin.current.at;
    let left = (performance.now() - origin.current.time) / 1000;
    if (left < 0) return { index, fraction: 0 };
    while (index < played.length && left >= secondsAt(index, bpmNow.current)) {
      left -= secondsAt(index, bpmNow.current);
      index += 1;
    }
    if (index >= played.length) return { index: played.length, fraction: 0 };
    return { index, fraction: left / secondsAt(index, bpmNow.current) };
  }, [played, secondsAt]);

  // Where the MIDI player is: the same written measure nearest to where the
  // score is, going on, which keeps the pass of a repeat the player is in.
  const midiNow = useCallback((): Position => {
    const player = engine.current;
    if (!player || !midi) return { index: atNow.current, fraction: 0 };
    const tick = player.position();
    const measure = writtenAt(midi, tick, played);
    const from = atNow.current;
    const after = played.indexOf(measure, from);
    const index = after !== -1 ? after : Math.max(0, played.lastIndexOf(measure, from));
    const { start, end } = measureTicks(midi, measureAt(midi, tick));
    const fraction = end > start ? Math.min(1, Math.max(0, (tick - start) / (end - start))) : 0;
    return { index, fraction };
  }, [midi, played]);

  // A tempo changed while the clock plays goes on from where the song is.
  const changeBpm = (next: number) => {
    const value = inBounds(next);
    // During the count-in of a tapped tempo the song has not started: it still starts on the next 1.
    if (state === 'playing' && driver === 'clock' && origin.current.time <= performance.now()) {
      const now = clockNow();
      origin.current = {
        at: now.index,
        time: performance.now() - now.fraction * secondsAt(now.index, value) * 1000,
      };
    }
    bpmNow.current = value;
    setBpm(value);
  };

  // Moves to a place of the played order, playing or not. The MIDI player,
  // when it drives the score, goes there too.
  const moveTo = (index: number) => {
    const to = Math.min(Math.max(0, index), Math.max(0, played.length - 1));
    origin.current = { at: to, time: performance.now() };
    setAt(to);
    if (driver === 'midi' && midi) engine.current?.seek(tickOfPlace(midi, to, played));
  };
  // The place of a written measure nearest to where the song is: before it
  // when the member goes back, after it when they go on. Inside a repeat this
  // keeps the pass the band is in.
  const placeOf = (measure: number, back: boolean) => {
    const before = played.lastIndexOf(measure, at);
    const after = played.indexOf(measure, at);
    const [first, second] = back ? [before, after] : [after, before];
    return first !== -1 ? first : Math.max(0, second);
  };

  // The screen stays on while the song plays; the device takes it back after.
  // A browser lets go of it when the app is hidden: it is asked again on return.
  useEffect(() => {
    if (state !== 'playing' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let isOver = false;
    const hold = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (held) => {
          if (isOver) void held.release();
          else lock = held;
        },
        () => {},
      );
    };
    hold();
    document.addEventListener('visibilitychange', hold);
    return () => {
      isOver = true;
      document.removeEventListener('visibilitychange', hold);
      void lock?.release();
    };
  }, [state]);

  // ---- The drawing ----
  const viewport = useRef<HTMLElement>(null);
  // The drawing, and what moves it: the drawing and the playhead move together.
  const sheet = useRef<HTMLDivElement>(null);
  const mover = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<'drawing' | 'drawn' | 'failed'>('drawing');
  const [drawn, setDrawn] = useState<Drawn>({ lines: [], boxes: [] });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const isLandscape = isLandscapeSize(window.innerWidth, window.innerHeight);
  const [layout, setLayout] = useState<'lines' | 'ribbon'>(isLandscape ? 'ribbon' : 'lines');
  const topBar = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let rest = 0;
    const measure = () => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
      setLayout(isLandscapeSize(window.innerWidth, window.innerHeight) ? 'ribbon' : 'lines');
    };
    measure();
    const observer = new ResizeObserver(() => {
      window.clearTimeout(rest);
      rest = window.setTimeout(measure, RESIZE_REST_MS);
    });
    observer.observe(element);
    return () => {
      window.clearTimeout(rest);
      observer.disconnect();
    };
  }, []);

  // Opening the mode puts the focus on its first control, the way out.
  useEffect(() => {
    topBar.current?.querySelector('button')?.focus();
  }, []);

  const isRibbon = layout === 'ribbon';
  const partId = shown?.id;
  useEffect(() => {
    if (!partId || size.width === 0 || !sheet.current) return;
    let isCurrent = true;
    setDrawing('drawing');
    drawPart(
      sheet.current,
      partAlone(score, partId),
      {
        width: Math.min(size.width, MAX_COLUMN),
        scale: Math.round(((SCALE * reading.size) / 100) * (isRibbon ? 1.5 : 1)),
        isRibbon,
      },
      measures.length,
    )
      .then((done) => {
        if (!isCurrent) return;
        if (!done) {
          setDrawing('failed');
          return;
        }
        setDrawn(done);
        setDrawing('drawn');
      })
      .catch(() => isCurrent && setDrawing('failed'));
    return () => {
      isCurrent = false;
    };
  }, [score, partId, size.width, isRibbon, reading.size, measures.length]);

  const { lines, boxes } = drawn;
  const lineAt = useCallback(
    (index: number) => boxes[played[Math.min(index, played.length - 1)] ?? 0]?.line ?? 0,
    [boxes, played],
  );
  const currentLine = lineAt(at);

  // Less motion: the quick jump, with no transition (base.css stops it).
  const scrolling: Scrolling = isMotionReduced() ? 'quickJump' : reading.scrolling;

  // How far the drawing is moved: the line being played at the reading line
  // (or, in landscape, the music being played at the reading position), plus
  // a drag until the member lets go.
  const dragged = useRef(0);
  const offsetFor = useCallback(
    (now: Position) => {
      const box = boxes[played[Math.min(now.index, played.length - 1)] ?? 0];
      const fraction = isMotionReduced() ? 0 : now.fraction;
      if (isRibbon) {
        const x = box ? box.left + (box.right - box.left) * fraction : 0;
        return READING_X - x + dragged.current;
      }
      const anchor = (viewport.current?.clientHeight ?? 0) * READING_LINE;
      const line = lineAt(now.index);
      let top = lines[line]?.top ?? 0;
      if (scrolling === 'slowJump') {
        // The move starts one beat before the line ends.
        const quarters = measures[played[now.index] ?? 0]?.quarters ?? 4;
        if (fraction + timeline.beatQuarters / quarters >= 1) {
          top = lines[lineAt(now.index + 1)]?.top ?? top;
        }
      } else if (scrolling === 'continuous') {
        // Between the start of this line and the start of the next one, as the
        // measures of the line are played.
        let start = now.index;
        while (
          start > 0 &&
          lineAt(start - 1) === line &&
          (played[start - 1] ?? 0) < (played[start] ?? 0)
        ) {
          start -= 1;
        }
        let end = now.index;
        while (
          end + 1 < played.length &&
          lineAt(end + 1) === line &&
          (played[end + 1] ?? 0) > (played[end] ?? 0)
        ) {
          end += 1;
        }
        const next = lines[end + 1 < played.length ? lineAt(end + 1) : line]?.top ?? top;
        // A repeat goes back up at once: only going down is spread out.
        if (next > top) top += (next - top) * ((now.index - start + fraction) / (end - start + 1));
      }
      return anchor - top + dragged.current;
    },
    [boxes, played, isRibbon, lineAt, lines, scrolling, measures, timeline.beatQuarters],
  );

  // Writes where the drawing is, and the playhead of the MIDI player.
  const place = useCallback(
    (now: Position, isMidi: boolean) => {
      const element = mover.current;
      if (!element) return;
      const offset = offsetFor(now);
      element.style.transform = isRibbon ? `translateX(${offset}px)` : `translateY(${offset}px)`;
      const head = playhead.current;
      if (!head) return;
      const box = boxes[played[Math.min(now.index, played.length - 1)] ?? 0];
      const line = box ? lines[box.line] : undefined;
      head.hidden = !isMidi || isRibbon || !box || !line;
      if (head.hidden || !box || !line) return;
      head.style.transform = `translateX(${box.left + (box.right - box.left) * now.fraction}px)`;
      head.style.top = `${line.top}px`;
      head.style.height = `${line.height}px`;
    },
    [offsetFor, isRibbon, boxes, lines, played],
  );

  // While it plays, every frame: where the song is, the measure, the beat.
  useEffect(() => {
    if (state !== 'playing') return;
    let frame = 0;
    const follow = () => {
      const now = driver === 'midi' ? midiNow() : clockNow();
      if (now.index >= played.length) {
        // The end: back to the start, ready to play again.
        setState('ready');
        setAt(0);
        setBarsHidden(false);
        setBeat(null);
        return;
      }
      if (now.index !== atNow.current) {
        atNow.current = now.index;
        setAt(now.index);
      }
      const quarters = measures[played[now.index] ?? 0]?.quarters ?? 4;
      const beats = Math.max(1, Math.round(quarters / timeline.beatQuarters));
      setBeat(Math.min(beats - 1, Math.floor(now.fraction * beats)));
      place(now, driver === 'midi');
      frame = window.requestAnimationFrame(follow);
    };
    frame = window.requestAnimationFrame(follow);
    return () => window.cancelAnimationFrame(frame);
  }, [state, driver, midiNow, clockNow, played, measures, timeline.beatQuarters, place]);

  // Not playing: the drawing stands at the place the song starts from.
  useLayoutEffect(() => {
    if (state !== 'playing') place({ index: at, fraction: 0 }, false);
  }, [state, at, place]);

  // The lines already played stand back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: marked again when the lines are drawn again, for another part or another width
  useEffect(() => {
    sheet.current?.querySelectorAll('g.system').forEach((system, index) => {
      system.toggleAttribute(
        'data-played',
        state === 'playing' && !isRibbon && index < currentLine,
      );
    });
  }, [currentLine, state, lines, isRibbon]);

  // ---- Moving the score by hand ----
  const drag = useRef<{ from: number; moved: number } | null>(null);
  const moveNow = () =>
    place(
      state === 'playing'
        ? driver === 'midi'
          ? midiNow()
          : clockNow()
        : { index: at, fraction: 0 },
      driver === 'midi',
    );
  // Letting go of the score: the line (or, in landscape, the measure) now at
  // the reading place is the one the band is at.
  const settle = (moved: number) => {
    dragged.current = 0;
    if (moved === 0 || lines.length === 0) {
      moveNow();
      return;
    }
    if (isRibbon) {
      const box = boxes[written];
      const wanted = (box?.left ?? 0) - moved;
      let nearest = written;
      boxes.forEach((other, measure) => {
        if (
          other &&
          Math.abs(other.left - wanted) < Math.abs((boxes[nearest]?.left ?? 0) - wanted)
        ) {
          nearest = measure;
        }
      });
      if (nearest !== written) moveTo(placeOf(nearest, nearest < written));
      else moveNow();
      return;
    }
    const wanted = (lines[currentLine]?.top ?? 0) - moved;
    let nearest = 0;
    lines.forEach((line, index) => {
      if (Math.abs(line.top - wanted) < Math.abs((lines[nearest]?.top ?? 0) - wanted)) {
        nearest = index;
      }
    });
    const first = lines[nearest]?.measures[0];
    if (nearest !== currentLine && first !== undefined)
      moveTo(placeOf(first, nearest < currentLine));
    else moveNow();
  };
  const moveBy = (by: number) => {
    if (isRibbon) {
      moveTo(at + by);
      return;
    }
    const first = lines[Math.min(Math.max(0, currentLine + by), lines.length - 1)]?.measures[0];
    if (first !== undefined) moveTo(placeOf(first, by < 0));
  };
  const wheel = useRef({ turned: 0, movedAt: 0 });
  const turn = (delta: number) => {
    const now = performance.now();
    wheel.current.turned += delta;
    if (Math.abs(wheel.current.turned) < WHEEL_LINE) return;
    const by = wheel.current.turned > 0 ? 1 : -1;
    wheel.current.turned = 0;
    if (now - wheel.current.movedAt < WHEEL_REST_MS) return;
    wheel.current.movedAt = now;
    moveBy(by);
  };

  // ---- The tempo tapped in its sheet ----
  const tapped = (tempo: number, waitMs: number) => {
    const value = inBounds(tempo);
    bpmNow.current = value;
    setBpm(value);
    setPanel(null);
    // The reading starts on the next 1, at that tempo.
    if (isMidiOn) {
      engine.current?.pause();
      cancelNextOne();
      nextOne.current = window.setTimeout(() => void startMidi(atNow.current), waitMs);
    } else {
      playFrom(at, waitMs);
    }
  };

  // Hiding or showing the bars takes away the button that had the focus: the
  // focus goes to the handle, or back to the pause button, when it was lost.
  const showsBars = !(state === 'playing' && barsHidden);
  const handle = useRef<HTMLButtonElement>(null);
  const pauseButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const focused = document.activeElement;
    const isLost =
      focused === null || focused === document.body || focused?.classList.contains('songs-live');
    if (!isLost) return;
    (showsBars ? pauseButton.current : handle.current)?.focus();
  }, [showsBars]);

  // Where the song is, in ticks of the MIDI file: the lanes of the reading settings follow it.
  const tickNow = useCallback(() => {
    if (!midi) return 0;
    const player = engine.current;
    return player?.isPlaying ? player.position() : tickOfPlace(midi, atNow.current, played);
  }, [midi, played]);

  if (!shown) return null;
  const isPlaying = state === 'playing';
  const isReady = drawing === 'drawn';
  const hasMidiFile = midi !== null;
  const countedBeats = Math.max(
    1,
    Math.round((measures[written]?.quarters ?? 4) / timeline.beatQuarters),
  );
  const metronome = reading.hasMetronome && isPlaying && (
    <div className="songs-liveMetronome">
      <Metronome beats={countedBeats} current={beat} />
    </div>
  );
  const settingsButton = (
    <IconButton
      kind="glass"
      icon="Settings"
      label={t('songs.live.settings.title')}
      aria-haspopup="dialog"
      onClick={() => setPanel('settings')}
    />
  );

  return (
    <div
      className="songs-liveScreen"
      data-layout={layout}
      data-bars={showsBars ? 'shown' : 'hidden'}
    >
      {showsBars ? (
        <header className="songs-liveTop" ref={topBar}>
          <IconButton kind="glass" icon="Close" label={t('songs.live.close')} onClick={onClose} />
          <div className="songs-liveTitle">
            <h1 className="textHeading">{song.name}</h1>
            <p className="textCaption songs-muted">{t('songs.live.mode')}</p>
          </div>
          {isRibbon && metronome}
          {isRibbon && isPlaying && driver === 'midi' && (
            <MidiChip
              bpm={bpm}
              tracks={midiSettings.muted.filter((isMuted) => !isMuted).length}
              onPress={() => setPanel('settings')}
            />
          )}
          {isPlaying && settingsButton}
          <button
            type="button"
            className="songs-livePart textLabel"
            aria-haspopup="dialog"
            aria-label={t('songs.live.choosePart', { name: shown.name })}
            onClick={() => setPanel('parts')}
          >
            <Pictogram name={shown.pictogram} size={16} />
            <span>{shown.name}</span>
          </button>
        </header>
      ) : (
        isRibbon && <div className="songs-liveTop">{metronome}</div>
      )}
      {!isRibbon && metronome}

      <div className="songs-liveBody">
        <section
          className="songs-liveScore"
          ref={viewport}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the score is moved with the arrow keys, as it is dragged with a finger
          tabIndex={0}
          aria-label={t(isRibbon ? 'songs.live.scoreSideways' : 'songs.live.score', {
            name: shown.name,
          })}
          aria-busy={drawing === 'drawing'}
          onPointerDown={(event) => {
            drag.current = { from: isRibbon ? event.clientX : event.clientY, moved: 0 };
            event.currentTarget.setPointerCapture(event.pointerId);
            mover.current?.setAttribute('data-dragging', 'true');
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            drag.current.moved = (isRibbon ? event.clientX : event.clientY) - drag.current.from;
            dragged.current = drag.current.moved;
            if (state !== 'playing') moveNow();
          }}
          onPointerUp={() => {
            const moved = drag.current?.moved ?? 0;
            drag.current = null;
            mover.current?.removeAttribute('data-dragging');
            // A tap on the score shows the bars again.
            if (Math.abs(moved) < TAP_SLOP) {
              dragged.current = 0;
              if (!showsBars) setBarsHidden(false);
              return;
            }
            settle(moved);
          }}
          onPointerCancel={() => {
            dragged.current = 0;
            drag.current = null;
            mover.current?.removeAttribute('data-dragging');
            moveNow();
          }}
          onWheel={(event) => turn(isRibbon ? event.deltaX || event.deltaY : event.deltaY)}
          onKeyDown={(event) => {
            if (event.key === (isRibbon ? 'ArrowRight' : 'ArrowDown')) moveBy(1);
            if (event.key === (isRibbon ? 'ArrowLeft' : 'ArrowUp')) moveBy(-1);
          }}
        >
          {drawing === 'failed' && <Message kind="danger">{t('songs.live.error')}</Message>}
          <div
            className="songs-liveMover"
            ref={mover}
            data-scrolling={isRibbon ? 'continuous' : scrolling}
            aria-hidden="true"
          >
            <div className="songs-liveSheet" ref={sheet} />
            {/* Where the MIDI player is, inside the measure (1.1.0). */}
            <div className="songs-livePlayhead" ref={playhead} hidden />
          </div>
          {isRibbon && (
            <div
              className="songs-liveReadingPlace"
              data-midi={driver === 'midi' && isPlaying}
              aria-hidden="true"
            />
          )}
        </section>

        {showsBars ? (
          <div className="songs-liveControlsWrap">
            {isPlaying && driver === 'midi' && !isRibbon && (
              <MidiChip
                bpm={bpm}
                tracks={midiSettings.muted.filter((isMuted) => !isMuted).length}
                onPress={() => setPanel('settings')}
              />
            )}
            <div className="songs-liveControls">
              {isPlaying ? (
                <>
                  {!isRibbon && (
                    <div className="songs-liveHintRow">
                      <p className="songs-liveHint textCaption">{t('songs.live.dragHint')}</p>
                      <IconButton
                        kind="plain"
                        icon="ChevronDown"
                        label={t('songs.live.hideBars')}
                        onClick={() => setBarsHidden(true)}
                      />
                    </div>
                  )}
                  <div className="songs-liveBar">
                    {/* Not announced at each measure: a screen reader would never stop. */}
                    <p className="songs-liveTile" data-tile="measure">
                      <span className="textMicro songs-muted">{t('songs.live.measure')}</span>
                      <span className="textTitle">{label}</span>
                    </p>
                    <button
                      type="button"
                      className="songs-audioPlay"
                      ref={pauseButton}
                      aria-label={t('songs.player.pause')}
                      onClick={pause}
                    >
                      <Icon name="Pause" size={32} />
                    </button>
                    <TempoTile bpm={bpm} onPress={() => setPanel('tempo')} />
                  </div>
                  {isRibbon && (
                    <IconButton
                      kind="plain"
                      icon="ChevronRight"
                      label={t('songs.live.hideBars')}
                      onClick={() => setBarsHidden(true)}
                    />
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="songs-liveStart"
                    aria-haspopup="dialog"
                    onClick={() => setPanel('start')}
                  >
                    <Icon name="Flag" size={20} />
                    <span className="songs-liveStartTexts">
                      <span className="textMicro songs-muted">{t('songs.live.startsAt')}</span>
                      <span className="textLabel">
                        {startMark
                          ? t('songs.live.measureAndMark', { measure: label, mark: startMark.name })
                          : t('songs.live.measureNumber', { measure: label })}
                      </span>
                    </span>
                    <Icon name="ChevronDown" size={20} />
                  </button>
                  {!isRibbon && (
                    <SwitchRow
                      label={t('songs.live.midi.switch')}
                      description={
                        hasMidiFile
                          ? t('songs.live.midi.switchHint')
                          : t(midiFailed ? 'songs.live.midi.failed' : 'songs.live.midi.none')
                      }
                      checked={isMidiOn}
                      disabled={!hasMidiFile}
                      onChange={(isOn) => {
                        setMidiOn(isOn);
                        if (!isOn || !midi) return;
                        // Within the bounds of the player; its sounds start loading now.
                        const { slowest, fastest } = tempoRange(
                          fileBpm,
                          song.bpm ?? Math.round(fileBpm),
                        );
                        changeBpm(Math.min(Math.max(bpm, slowest), fastest));
                        engineFor(midi).prime();
                      }}
                    />
                  )}
                  {isMidiOn && sounds === 'failed' && (
                    <Message kind="danger">{t('songs.midi.soundsError')}</Message>
                  )}
                  {isMidiOn && isSilent && <SilentClock onRetry={play} />}
                  <div className="songs-liveBar">
                    <TempoTile
                      bpm={bpm}
                      withUnit
                      disabled={!isReady}
                      onPress={() => setPanel('tempo')}
                    />
                    <button
                      type="button"
                      className="songs-audioPlay"
                      aria-label={t('songs.player.play')}
                      disabled={!isReady || (isMidiOn && sounds === 'failed')}
                      onClick={play}
                    >
                      <Icon name="Play" size={32} />
                    </button>
                    <button
                      type="button"
                      className="songs-liveTile"
                      aria-haspopup="dialog"
                      data-tile="settings"
                      onClick={() => setPanel('settings')}
                    >
                      <Icon name="Settings" size={24} />
                      <span className="textMicro">{t('songs.live.settingsOpen')}</span>
                    </button>
                  </div>
                </>
              )}
              {isMidiOn && sounds === 'loading' && (isPlaying || engine.current) && (
                <p role="status" className="textCaption songs-muted songs-liveSounds">
                  {t('songs.midi.soundsLoading')}
                </p>
              )}
            </div>
          </div>
        ) : (
          // The bars hidden: a handle shows them again.
          <div className="songs-liveHandleWrap">
            <button
              type="button"
              className="songs-liveHandle"
              ref={handle}
              onClick={() => setBarsHidden(false)}
            >
              <span className="textMicro songs-muted">{t('songs.live.measure')}</span>
              <span className="textHeading">{label}</span>
              <span className="textMicro songs-muted">{t('songs.midi.tempo')}</span>
              <span className="textHeading">{bpm}</span>
              <Icon name="ChevronUp" size={24} />
              <span className="visuallyHidden">{t('songs.live.showBars')}</span>
            </button>
          </div>
        )}
      </div>

      <Panel
        open={panel === 'parts'}
        onClose={() => setPanel(null)}
        title={t('songs.song.choosePart')}
      >
        <div className="songs-panel">
          {choices.map((choice) => (
            <SongPartRow
              key={choice.id}
              state={choice.id === shown.id ? 'shown' : 'available'}
              name={choice.name}
              detail={choice.id === shown.id ? t('songs.song.partShown') : undefined}
              onPress={() => {
                setChosenPart(choice.id);
                setPanel(null);
              }}
            />
          ))}
        </div>
      </Panel>

      <Panel
        open={panel === 'start'}
        onClose={() => setPanel(null)}
        title={t('songs.live.startTitle')}
      >
        {panel === 'start' && (
          <StartChoice
            timeline={timeline}
            current={written}
            onStart={(measure) => {
              moveTo(Math.max(0, played.indexOf(measure)));
              setPanel(null);
            }}
          />
        )}
      </Panel>

      <Panel
        open={panel === 'tempo'}
        onClose={() => setPanel(null)}
        title={t('songs.live.tempo.title')}
      >
        {panel === 'tempo' && (
          <TempoSheet
            bpm={bpm}
            bandBpm={bandBpm}
            fileBpm={scoreBpm}
            signature={timeline.signature}
            onBpm={changeBpm}
            onFirstTap={() => {
              if (isMidiOn && midi) engineFor(midi).prime();
            }}
            onTapped={tapped}
          />
        )}
      </Panel>

      <Panel
        open={panel === 'settings'}
        onClose={() => setPanel(null)}
        title={t('songs.live.settings.title')}
      >
        {panel === 'settings' && (
          <ReadingSettings
            settings={reading}
            onChange={setReading}
            midi={midi}
            midiSettings={midiSettings}
            onMidiChange={setMidiSettings}
            tickNow={tickNow}
          />
        )}
      </Panel>
    </div>
  );
}

type TempoTileProps = {
  bpm: number;
  /** "bpm" under the number, when the song is ready to start. */
  withUnit?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** Figma: the Tempo tile, a button that opens the Tempo sheet (1.1.0, issue #74). */
function TempoTile({ bpm, withUnit, disabled, onPress }: TempoTileProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="songs-liveTile"
      data-tile="tempo"
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={onPress}
    >
      <span className="textMicro songs-muted">{t('songs.midi.tempo')}</span>
      <span className="textTitle">{bpm}</span>
      {withUnit && <span className="textMicro songs-muted">{t('songs.midi.bpmUnit')}</span>}
    </button>
  );
}

/** Figma: the chip "Suit le MIDI" above the controls; it opens the reading settings. */
function MidiChip({ bpm, tracks, onPress }: { bpm: number; tracks: number; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="songs-liveMidiChip"
      aria-haspopup="dialog"
      aria-describedby="songs-liveMidiChipDoes"
      onClick={onPress}
    >
      <Chip kind="accent" icon="Piano">
        {t('songs.live.midi.following', { bpm, count: tracks })}
      </Chip>
      <span className="visuallyHidden" id="songs-liveMidiChipDoes">
        {t('songs.live.midi.chipDoes')}
      </span>
    </button>
  );
}
