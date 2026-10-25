import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { Chip } from '../../components/Chip.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { Icon } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Pictogram } from '../../components/Pictogram.tsx';
import { SongPartRow } from '../../components/SongPartRow.tsx';
import { SongPartTrack } from '../../components/SongPartTrack.tsx';
import { TextField } from '../../components/TextField.tsx';
import { instrumentsOf, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import type { Song } from '../../songs.ts';
import { mutedVolumeOf, TempoAndVolume, tempoRange, useTracks } from './MidiView.tsx';
import { countedBpm, type MidiSong, readMidi, tickOfPlace, writtenAt } from './midi.ts';
import { MidiEngine } from './midiEngine.ts';
import { useMidiSettings } from './midiSettings.ts';
import { usePlayer } from './Player.tsx';
import { isCompound, partAlone, partsOf, readScore, type Timeline, timelineOf } from './score.ts';
import './songs.css';

// Figma: Songs / Song — Live. The part of the member's instrument, drawn for
// the width of the screen, rising line by line at the tempo: no cursor,
// because a band never keeps a perfect tempo. The lines already played stand
// back, and the member drags the score to catch up with the band. A repeat
// brings the score back down to where it starts.
//
// The score is the MusicXML kept with the song (model/songs.md, "Generated
// files"), drawn by Verovio, which is loaded only here.
//
// The Live mode can also be driven by the MIDI player (issue #10, Songs ›
// 14): the piano button opens the settings the MIDI mode shares, and the
// score then follows the position of the player, measure by measure, repeats
// and jumps included, instead of the clock of the tempo.

type TrackName = { name: string; instrumentId: number | null };

// How large the score is drawn, in the unit of Verovio.
const SCALE = 45;
// Figma: one line of the score across a phone, two side by side from the
// tablet, three from the desktop. Each stays as narrow as on a phone, so that
// it holds the two or three measures a glance takes in.
const columnsFor = (width: number) => (width >= 1024 ? 3 : width >= 768 ? 2 : 1);
// Between two rows of lines, in pixels.
const ROW_GAP = 12;
// Where the line being played sits in the height of the score: the line
// before it stays whole above, standing back.
const READING_LINE = 0.27;
// The wheel moves the score one line for this much of a turn, and no faster
// than this: a trackpad sends dozens of small turns for one gesture.
const WHEEL_LINE = 60;
const WHEEL_REST_MS = 180;
// The lines are laid out again once the width has stopped changing.
const RESIZE_REST_MS = 150;

// Verovio is one large program: it is started once, the first time a score is drawn.
type Toolkit = InstanceType<typeof import('verovio/esm').VerovioToolkit>;
let verovio: Promise<() => Toolkit> | null = null;
function newToolkit(): Promise<Toolkit> {
  verovio ??= Promise.all([import('verovio/wasm'), import('verovio/esm')]).then(
    async ([{ default: createVerovioModule }, { VerovioToolkit }]) => {
      const module = await createVerovioModule();
      return () => new VerovioToolkit(module);
    },
  );
  // A failure is not kept: the next opening tries again.
  verovio.catch(() => {
    verovio = null;
  });
  return verovio.then((create) => create());
}
// A member who stops tapping for this long starts counting again.
const TAP_RESET_MS = 3000;

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
  const [panel, setPanel] = useState<'parts' | 'start' | 'midi' | null>(null);

  // ---- Where the song is ----
  const { measures, played, marks } = timeline;
  const firstBpm = song.bpm ?? timeline.bpm ?? 120;
  const [bpm, setBpm] = useState(firstBpm);
  const [state, setState] = useState<'ready' | 'tapping' | 'playing'>('ready');
  // What moves the score while it plays: the clock of the tempo, or the MIDI player.
  const [driver, setDriver] = useState<'clock' | 'midi'>('clock');
  // The place in the played order: the measure the song is at, or starts from.
  const [at, setAt] = useState(0);
  const atNow = useRef(0);
  atNow.current = at;
  const origin = useRef({ at: 0, time: 0 });
  const written = played[at] ?? 0;
  const label = measures[written]?.label ?? '1';
  const startMark = marks.find((mark) => mark.measure === written);

  // The tempo is counted in the beat of the start; the measures in quarter notes.
  const secondsOf = useCallback(
    (index: number) =>
      ((measures[played[index] ?? 0]?.quarters ?? 4) * 60) / (bpm * timeline.beatQuarters),
    [measures, played, bpm, timeline.beatQuarters],
  );

  // ---- The MIDI player, when it drives the score ----
  const engine = useRef<MidiEngine | null>(null);
  const fileBpm = midi ? countedBpm(midi) : 120;
  const midiBandBpm = song.bpm ?? Math.round(fileBpm);
  const [settings, setSettings] = useMidiSettings(song.id, midiBandBpm, midi?.tracks.length ?? 0);
  const [sounds, setSounds] = useState<'loading' | 'ready' | 'failed'>('loading');
  // One engine, made when the member first opens the sheet, kept until the
  // Live mode closes: its sounds load while the member sets the tracks.
  const engineFor = (file: MidiSong) => {
    if (engine.current) return engine.current;
    const created = new MidiEngine(file);
    // What was set before, here or in the MIDI mode, from the first note.
    settings.muted.forEach((isMuted, index) => {
      created.setMuted(index, isMuted);
    });
    created.setMutedVolume(mutedVolumeOf(settings.mutedStep));
    created.setSpeed(settings.bpm / fileBpm);
    created.loaded.then(
      () => setSounds('ready'),
      () => setSounds('failed'),
    );
    created.onEnd = () => {
      setState('ready');
      setDriver('clock');
      setAt(0);
    };
    engine.current = created;
    return created;
  };
  useEffect(
    () => () => {
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );
  // The settings shared with the MIDI mode reach the engine as they change.
  useEffect(() => {
    const player = engine.current;
    if (!player) return;
    settings.muted.forEach((isMuted, index) => {
      player.setMuted(index, isMuted);
    });
    player.setMutedVolume(mutedVolumeOf(settings.mutedStep));
    player.setSpeed(settings.bpm / fileBpm);
  }, [settings, fileBpm]);

  const playWithMidi = async () => {
    if (!midi) return;
    const player = engineFor(midi);
    recording.pause();
    player.seek(tickOfPlace(midi, at, played));
    setDriver('midi');
    setState('playing');
    setPanel(null);
    try {
      await player.play();
    } catch {
      setSounds('failed');
      setState('ready');
      setDriver('clock');
    }
  };
  // The chip of the MIDI player: the player pauses, and the sheet opens again.
  const pauseMidi = () => {
    engine.current?.pause();
    setState('ready');
    setDriver('clock');
  };

  // While the MIDI player drives it, the score follows where the player is.
  useEffect(() => {
    if (state !== 'playing' || driver !== 'midi' || !midi) return;
    let frame = 0;
    const follow = () => {
      const player = engine.current;
      if (player) {
        const measure = writtenAt(midi, player.position(), played);
        const from = atNow.current;
        // The same written measure nearest to where the score is, going on:
        // inside a repeat this keeps the pass the player is in.
        const after = played.indexOf(measure, from);
        const place = after !== -1 ? after : Math.max(0, played.lastIndexOf(measure, from));
        if (place !== from) setAt(place);
      }
      frame = window.requestAnimationFrame(follow);
    };
    frame = window.requestAnimationFrame(follow);
    return () => window.cancelAnimationFrame(frame);
  }, [state, driver, midi, played]);

  // While playing, the clock says which measure the song is at.
  useEffect(() => {
    if (state !== 'playing' || driver !== 'clock') return;
    let frame = 0;
    const follow = () => {
      let index = origin.current.at;
      let left = (performance.now() - origin.current.time) / 1000;
      while (index < played.length && left >= secondsOf(index)) {
        left -= secondsOf(index);
        index += 1;
      }
      if (index >= played.length) {
        // The end: back to the start, ready to play again.
        setState('ready');
        setAt(0);
        return;
      }
      setAt(index);
      frame = window.requestAnimationFrame(follow);
    };
    frame = window.requestAnimationFrame(follow);
    return () => window.cancelAnimationFrame(frame);
  }, [state, driver, played, secondsOf]);

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

  const playFrom = (index: number, delayMs = 0) => {
    recording.pause();
    origin.current = { at: index, time: performance.now() + delayMs };
    setAt(index);
    setState('playing');
  };
  const pause = () => {
    if (driver === 'midi') {
      pauseMidi();
      return;
    }
    setState('ready');
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

  // ---- The drawing ----
  const viewport = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<'drawing' | 'drawn' | 'failed'>('drawing');
  // For each line of the score: where it is, and the written measures it holds.
  const [lines, setLines] = useState<{ top: number; height: number; measures: number[] }[]>([]);
  const [width, setWidth] = useState(0);
  const columns = columnsFor(width);
  const topBar = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let rest = 0;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => {
      window.clearTimeout(rest);
      rest = window.setTimeout(() => setWidth(element.clientWidth), RESIZE_REST_MS);
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

  const partId = shown?.id;
  useEffect(() => {
    if (!partId || width === 0) return;
    let isCurrent = true;
    setDrawing('drawing');
    (async () => {
      const toolkit = await newToolkit();
      let svg = '';
      try {
        const scale = SCALE;
        toolkit.setOptions({
          // A score and nothing else: Verovio reads other formats too.
          inputFrom: 'musicxml',
          scale,
          pageWidth: Math.round((width * 100) / scale / columns),
          // One page as tall as the score: the screen does the scrolling.
          pageHeight: 60000,
          adjustPageHeight: true,
          breaks: 'auto',
          header: 'none',
          footer: 'none',
          pageMarginTop: 60,
          pageMarginBottom: 60,
          pageMarginLeft: 60,
          pageMarginRight: 30,
          spacingSystem: 4,
          spacingStaff: 4,
          justifyVertically: false,
          // The number of every measure, as on the screens of Figma.
          mnumInterval: 1,
        });
        // A score too long for one page would be cut: said, not shown in part.
        if (toolkit.loadData(partAlone(score, partId)) && toolkit.getPageCount() === 1) {
          svg = toolkit.renderToSVG(1);
        }
      } finally {
        toolkit.destroy();
      }
      if (!isCurrent || !sheet.current) return;
      if (svg === '') {
        setDrawing('failed');
        return;
      }
      sheet.current.replaceChildren(safeDrawing(svg));
      keepMarksInside(sheet.current);

      // The lines as they were laid out for this width, each with its
      // measures; from the tablet they are put side by side, row after row.
      const base = sheet.current.getBoundingClientRect();
      const systems = [...sheet.current.querySelectorAll<SVGGraphicsElement>('g.system')];
      const drawn = sheet.current.querySelectorAll('g.measure').length;
      const boxes = systems.map((system) => system.getBoundingClientRect());
      const rows: { top: number; height: number; measures: number[] }[] = [];
      let measure = 0;
      let rowTop = (boxes[0]?.top ?? base.top) - base.top;
      systems.forEach((system, index) => {
        const box = boxes[index] as DOMRect;
        const column = index % columns;
        if (column === 0 && index > 0) {
          rowTop += (rows[rows.length - 1]?.height ?? 0) + ROW_GAP;
        }
        if (column === 0) rows.push({ top: rowTop, height: 0, measures: [] });
        const row = rows[rows.length - 1];
        if (!row) return;
        row.height = Math.max(row.height, box.height);

        if (columns > 1) {
          // From pixels of the screen to the units the drawing is written in.
          const unit = system.getBBox().width / Math.max(1, box.width);
          const right = (column * width) / columns;
          const down = rowTop - (box.top - base.top);
          system.setAttribute('transform', `translate(${right * unit}, ${down * unit})`);
        }
        // Should the drawing hold another number of measures than the score,
        // each line takes its share of them.
        const count = system.querySelectorAll('g.measure').length;
        const from = Math.round((measure * measures.length) / Math.max(1, drawn));
        measure += count;
        const to = Math.round((measure * measures.length) / Math.max(1, drawn));
        for (let held = from; held < Math.max(to, from + 1); held++) row.measures.push(held);
      });
      setLines(rows);
      setDrawing('drawn');
    })().catch(() => isCurrent && setDrawing('failed'));
    return () => {
      isCurrent = false;
    };
  }, [score, partId, width, columns, measures.length]);

  const currentIndex = lines.findIndex((line) => line.measures.includes(written));
  const currentLine = currentIndex === -1 ? 0 : currentIndex;

  // The score is moved so that the line being played sits at the reading
  // line; a drag adds to it until the member lets go.
  const [dragged, setDragged] = useState(0);
  const anchor = (viewport.current?.clientHeight ?? 0) * READING_LINE;
  const offset = anchor - (lines[currentLine]?.top ?? 0) + dragged;

  // The lines already played stand back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: marked again when the lines are drawn again, for another part or another width
  useEffect(() => {
    sheet.current?.querySelectorAll('g.system').forEach((system, index) => {
      // Every line of a row already played, when lines sit side by side.
      const row = Math.floor(index / columns);
      system.toggleAttribute('data-played', state === 'playing' && row < currentLine);
    });
  }, [currentLine, state, lines]);

  // Letting go of the score: the line now at the reading line is the one the
  // band is at.
  const settle = (moved: number) => {
    setDragged(0);
    if (lines.length === 0 || moved === 0) return;
    const wanted = (lines[currentLine]?.top ?? 0) - moved;
    let nearest = 0;
    lines.forEach((line, index) => {
      if (Math.abs(line.top - wanted) < Math.abs((lines[nearest]?.top ?? 0) - wanted)) {
        nearest = index;
      }
    });
    const first = lines[nearest]?.measures[0];
    if (nearest !== currentLine && first !== undefined) {
      moveTo(placeOf(first, nearest < currentLine));
    }
  };
  const drag = useRef<{ from: number; moved: number } | null>(null);
  const moveLines = (by: number) => {
    const first = lines[Math.min(Math.max(0, currentLine + by), lines.length - 1)]?.measures[0];
    if (first !== undefined) moveTo(placeOf(first, by < 0));
  };
  const wheel = useRef({ turned: 0, movedAt: 0 });
  const turn = (deltaY: number) => {
    const now = performance.now();
    wheel.current.turned += deltaY;
    if (Math.abs(wheel.current.turned) < WHEEL_LINE) return;
    const by = wheel.current.turned > 0 ? 1 : -1;
    wheel.current.turned = 0;
    if (now - wheel.current.movedAt < WHEEL_REST_MS) return;
    wheel.current.movedAt = now;
    moveLines(by);
  };

  // ---- Giving the tempo by tapping ----
  const { signature } = timeline;
  // One measure of taps; two at least, to hear a tempo.
  const tapsNeeded = Math.max(2, signature.beats);
  const [taps, setTaps] = useState<number[]>([]);
  // What the taps say so far, in counted beats a minute.
  const tappedBpm = (() => {
    if (taps.length < 2) return null;
    const first = taps[0] ?? 0;
    const last = taps[taps.length - 1] ?? 0;
    const perTap = 60000 / ((last - first) / (taps.length - 1));
    // In compound time the taps are eighths: three to a beat.
    return Math.round(isCompound(signature) ? perTap / 3 : perTap);
  })();
  const tap = () => {
    const now = performance.now();
    const last = taps[taps.length - 1];
    const next = last !== undefined && now - last > TAP_RESET_MS ? [now] : [...taps, now];
    if (next.length < tapsNeeded) {
      setTaps(next);
      return;
    }
    // The measure is counted: the song starts on the next 1, at that tempo.
    const interval = (now - (next[0] ?? now)) / (next.length - 1);
    const perTap = 60000 / interval;
    setTaps([]);
    // Two taps at the same instant say no tempo: the member starts again.
    if (!Number.isFinite(perTap)) return;
    setBpm(Math.max(20, Math.min(400, Math.round(isCompound(signature) ? perTap / 3 : perTap))));
    playFrom(at, interval);
  };

  if (!shown) return null;
  const isTapping = state === 'tapping';

  return (
    <>
      <header className="songs-liveTop" ref={topBar}>
        <IconButton kind="glass" icon="Close" label={t('songs.live.close')} onClick={onClose} />
        <div className="songs-liveTitle">
          <h1 className="textHeading">{song.name}</h1>
          <p className="textCaption songs-muted">{t('songs.live.mode')}</p>
        </div>
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

      {/* The score stays in place while the tempo is given: it is drawn once
          for its width, and the taps are counted over it. */}
      <div className="songs-liveBody">
        <section
          className="songs-liveScore"
          ref={viewport}
          // The score is moved with the arrow keys, as it is dragged with a finger.
          tabIndex={isTapping ? -1 : 0}
          inert={isTapping}
          aria-label={t('songs.live.score', { name: shown.name })}
          aria-busy={drawing === 'drawing'}
          onPointerDown={(event) => {
            drag.current = { from: event.clientY, moved: 0 };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            drag.current.moved = event.clientY - drag.current.from;
            setDragged(drag.current.moved);
          }}
          onPointerUp={() => {
            settle(drag.current?.moved ?? 0);
            drag.current = null;
          }}
          onPointerCancel={() => {
            setDragged(0);
            drag.current = null;
          }}
          onWheel={(event) => turn(event.deltaY)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') moveLines(1);
            if (event.key === 'ArrowUp') moveLines(-1);
          }}
        >
          {drawing === 'failed' && <Message kind="danger">{t('songs.live.error')}</Message>}
          <div
            className="songs-liveSheet"
            ref={sheet}
            data-dragging={dragged !== 0}
            style={{ transform: `translateY(${offset}px)` }}
            aria-hidden="true"
          />
        </section>

        <div className="songs-liveControls" inert={isTapping}>
          {state === 'playing' ? (
            <>
              <p className="songs-liveHint textCaption">{t('songs.live.dragHint')}</p>
              {driver === 'midi' && (
                <button
                  type="button"
                  className="songs-liveMidiChip"
                  aria-haspopup="dialog"
                  aria-describedby="songs-liveMidiChipDoes"
                  onClick={() => {
                    pauseMidi();
                    setPanel('midi');
                  }}
                >
                  <Chip kind="accent" icon="Piano">
                    {t('songs.live.midi.following', {
                      bpm: settings.bpm,
                      count: settings.muted.filter((isMuted) => !isMuted).length,
                    })}
                  </Chip>
                  <span className="visuallyHidden" id="songs-liveMidiChipDoes">
                    {t('songs.live.midi.chipDoes')}
                  </span>
                </button>
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
                  aria-label={t('songs.player.pause')}
                  onClick={pause}
                >
                  <Icon name="Pause" size={32} />
                </button>
                <p className="songs-liveTile" data-tile="tempo">
                  <span className="textMicro songs-muted">{t('songs.midi.tempo')}</span>
                  <span className="textTitle">{driver === 'midi' ? settings.bpm : bpm}</span>
                </p>
              </div>
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
              <IconButton
                kind="glass"
                icon="Piano"
                label={t('songs.live.midi.open')}
                aria-haspopup="dialog"
                aria-describedby={
                  !midi && (song.midi === null || midiFailed) ? 'songs-liveNoMidi' : undefined
                }
                disabled={!midi || drawing !== 'drawn'}
                onClick={() => {
                  if (!midi) return;
                  engineFor(midi);
                  setPanel('midi');
                }}
              />
              {!midi && (song.midi === null || midiFailed) && (
                <p className="songs-liveNoMidi textCaption songs-muted" id="songs-liveNoMidi">
                  {t(midiFailed ? 'songs.live.midi.failed' : 'songs.live.midi.none')}
                </p>
              )}
              <div className="songs-liveBar">
                <p className="songs-liveTile" data-tile="tempo">
                  <span className="textMicro songs-muted">{t('songs.midi.tempo')}</span>
                  <span className="textTitle">{bpm}</span>
                  <span className="textMicro songs-muted">{t('songs.midi.bpmUnit')}</span>
                </p>
                <button
                  type="button"
                  className="songs-audioPlay"
                  aria-label={t('songs.player.play')}
                  disabled={drawing !== 'drawn'}
                  onClick={() => playFrom(at)}
                >
                  <Icon name="Play" size={32} />
                </button>
                <button
                  type="button"
                  className="songs-liveTile"
                  disabled={drawing !== 'drawn'}
                  onClick={() => {
                    setTaps([]);
                    setState('tapping');
                  }}
                >
                  <Icon name="Timer" size={20} />
                  <span className="textMicro">{t('songs.live.giveTempo')}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {isTapping && (
          <div className="songs-liveTapping">
            <button type="button" className="songs-liveTap" onClick={tap}>
              <span className="textTitle">{t('songs.live.tapTitle')}</span>
              {isCompound(signature) && (
                <span className="songs-muted">{t('songs.live.tapEighths')}</span>
              )}
              <span className="songs-liveTapCount textDisplay" aria-hidden="true">
                {taps.length === 0 ? '' : taps.length}
              </span>
              <span className="songs-liveTapDots" aria-hidden="true">
                {Array.from({ length: tapsNeeded }, (_, index) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: the dots of a measure never change places
                    key={index}
                    className="songs-liveTapDot"
                    data-done={index < taps.length}
                  />
                ))}
              </span>
            </button>
            {/* Beside the button, not in it: said when it changes, not as its name. */}
            <p className="songs-liveTapSaid" role="status">
              {tappedBpm === null
                ? t('songs.live.tapStart', { count: tapsNeeded })
                : t('songs.live.tapSoFar', { bpm: tappedBpm, count: tapsNeeded - taps.length })}
            </p>
            <div className="songs-liveCancel">
              <Button
                kind="secondary"
                onClick={() => {
                  setTaps([]);
                  setState('ready');
                }}
              >
                {t('songs.live.cancel')}
              </Button>
            </div>
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
        open={panel === 'midi'}
        onClose={() => setPanel(null)}
        title={t('songs.live.midi.title')}
      >
        {panel === 'midi' && midi && (
          <MidiChoice
            midi={midi}
            settings={settings}
            onChange={setSettings}
            bandBpm={midiBandBpm}
            fileBpm={fileBpm}
            measure={label}
            total={measures.length}
            sounds={sounds}
            onPlay={playWithMidi}
          />
        )}
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
    </>
  );
}

type MidiChoiceProps = {
  midi: MidiSong;
  settings: ReturnType<typeof useMidiSettings>[0];
  onChange: ReturnType<typeof useMidiSettings>[1];
  bandBpm: number;
  fileBpm: number;
  /** The measure the score starts from, as it is written: "33". */
  measure: string;
  total: number;
  sounds: 'loading' | 'ready' | 'failed';
  onPlay: () => void;
};

// Figma: Songs / Song — Live, the MIDI sheet (Songs › 14). The settings of
// the MIDI mode, shared with it: the tracks and their mute, one line each
// (no lane of notes here, owner, 2026-10-16), the tempo, the volume of the cut
// tracks; the loop is not offered. Its button starts the player from the
// measure chosen.
function MidiChoice(props: MidiChoiceProps) {
  const { midi, settings, onChange, bandBpm, fileBpm, measure, total, sounds, onPlay } = props;
  const { t } = useTranslation();
  const { tracks } = useTracks(midi);
  const { slowest, fastest } = tempoRange(fileBpm, bandBpm);
  const hasMuted = settings.muted.some(Boolean);

  return (
    <div className="songs-panel songs-liveMidi">
      <p className="songs-muted">{t('songs.live.midi.lead')}</p>
      {sounds === 'failed' && <Message kind="danger">{t('songs.midi.soundsError')}</Message>}
      <section className="songs-midiTracks" aria-label={t('songs.midi.tracks')}>
        <div className="songs-midiHeading">
          <span className="textLabel songs-muted">
            {t('songs.midi.measure', { measure, total })}
          </span>
          {hasMuted && (
            <button
              type="button"
              className="songs-textButton textLabel"
              onClick={() => onChange({ muted: settings.muted.map(() => false) })}
            >
              {t('songs.midi.unmuteAll')}
            </button>
          )}
        </div>
        <ul className="songs-liveMidiTracks">
          {tracks.map(({ name, pictogram, own }, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: two tracks may carry the same name
            <li key={index}>
              <SongPartTrack
                name={name}
                pictogram={pictogram}
                own={own}
                muted={settings.muted[index]}
                onToggleMute={() =>
                  onChange({
                    muted: settings.muted.map((value, at) => (at === index ? !value : value)),
                  })
                }
                ownLabel={t('songs.midi.ownTrack')}
                muteLabel={t('songs.midi.mute', { name })}
              />
            </li>
          ))}
        </ul>
      </section>
      <TempoAndVolume
        bandBpm={bandBpm}
        bpm={settings.bpm}
        onBpm={(bpm) => onChange({ bpm: Math.min(Math.max(bpm, slowest), fastest) })}
        mutedStep={settings.mutedStep}
        onMutedStep={(mutedStep) => onChange({ mutedStep })}
      />
      <Button icon="Piano" disabled={sounds === 'failed'} onClick={onPlay}>
        {t('songs.live.midi.play')}
      </Button>
      {sounds === 'loading' && (
        <p role="status" className="textCaption songs-muted">
          {t('songs.midi.soundsLoading')}
        </p>
      )}
    </div>
  );
}

type StartChoiceProps = {
  timeline: Timeline;
  /** The written measure the song would start from now. */
  current: number;
  onStart: (measure: number) => void;
};

// Figma: Songs / Song — Live, choosing where to start. The number of the
// measure is typed, or adjusted; the rehearsal marks of the score are offered
// when it has some.
function StartChoice({ timeline, current, onStart }: StartChoiceProps) {
  const { t } = useTranslation();
  const { measures, marks } = timeline;
  const [typed, setTyped] = useState(measures[current]?.label ?? '1');
  const found = measures.findIndex((measure) => measure.label === typed.trim());
  const step = (by: number) => {
    const to = Math.min(Math.max(0, (found === -1 ? current : found) + by), measures.length - 1);
    setTyped(measures[to]?.label ?? typed);
  };
  const places = [{ name: t('songs.live.beginning'), measure: 0 }, ...marks];

  return (
    <form
      className="songs-panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (found !== -1) onStart(found);
      }}
    >
      <div className="songs-liveMeasure">
        <TextField
          label={t('songs.live.measure')}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          inputMode="numeric"
          error={
            found === -1 ? t('songs.live.noSuchMeasure', { count: measures.length }) : undefined
          }
        />
        <IconButton
          kind="control"
          icon="Minus"
          label={t('songs.live.measureBefore')}
          onClick={() => step(-1)}
        />
        <IconButton
          kind="control"
          icon="Plus"
          label={t('songs.live.measureAfter')}
          onClick={() => step(1)}
        />
      </div>
      {marks.length > 0 && (
        <>
          <h3 className="textLabel">{t('songs.live.marks')}</h3>
          <div className="songs-liveMarks">
            {places.map((place) => (
              <FilterChip
                key={`${place.measure}-${place.name}`}
                pressed={found === place.measure}
                onChange={() => setTyped(measures[place.measure]?.label ?? '1')}
              >
                {t('songs.live.markAt', {
                  mark: place.name,
                  measure: measures[place.measure]?.label ?? '1',
                })}
              </FilterChip>
            ))}
          </div>
        </>
      )}
      <Button type="submit" disabled={found === -1}>
        {found === -1
          ? t('songs.live.startChoose')
          : t('songs.live.startAt', { measure: measures[found]?.label })}
      </Button>
    </form>
  );
}

// What a drawing of a score is made of. Anything else has no place in it.
const DRAWN = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'path',
  'rect',
  'ellipse',
  'circle',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
]);
const DRAWN_ATTRIBUTES = new Set([
  'id',
  'class',
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'dx',
  'dy',
  'width',
  'height',
  'points',
  'transform',
  'viewBox',
  'overflow',
  'version',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-anchor',
  'text-decoration',
  'xml:space',
  'data-id',
]);

/**
 * The drawing of Verovio as elements of the page. It is built from a file a
 * member sent, so nothing is trusted: only the shapes and the texts of a
 * drawing are kept, with the attributes that draw them. No style, no link out
 * of the drawing, nothing that runs.
 */
function safeDrawing(svg: string): Node {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const SVG = 'http://www.w3.org/2000/svg';
  for (const element of [...parsed.querySelectorAll('*')]) {
    if (element.namespaceURI !== SVG || !DRAWN.has(element.localName)) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const isOwnLink =
        (attribute.name === 'href' || attribute.name === 'xlink:href') &&
        element.localName === 'use' &&
        attribute.value.startsWith('#');
      if (!isOwnLink && !DRAWN_ATTRIBUTES.has(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return document.importNode(parsed.documentElement, true);
}

// A rehearsal mark is centred on the start of its measure: at the start or
// at the end of a line it would be cut by the edge of the screen. It is moved
// just enough to be read whole.
function keepMarksInside(sheet: HTMLElement) {
  // The page Verovio drew: one column of the screen from the tablet.
  const edge = (sheet.querySelector('svg') ?? sheet).getBoundingClientRect();
  const margin = 8;
  for (const mark of sheet.querySelectorAll<SVGGraphicsElement>('g.reh')) {
    const box = mark.getBoundingClientRect();
    const drawn = mark.getBBox();
    if (box.width === 0 || drawn.width === 0) continue;
    const overLeft = edge.left + margin - box.left;
    const overRight = box.right - (edge.right - margin);
    const move = overLeft > 0 ? overLeft : overRight > 0 ? -overRight : 0;
    // From pixels of the screen to the units the drawing is written in.
    if (move !== 0) {
      mark.setAttribute('transform', `translate(${(move * drawn.width) / box.width}, 0)`);
    }
  }
}
