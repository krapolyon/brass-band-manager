import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Slider } from '../../components/Slider.tsx';
import { SongPartTrack } from '../../components/SongPartTrack.tsx';
import { TextField } from '../../components/TextField.tsx';
import { instrumentsOf, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import type { Song } from '../../songs.ts';
import {
  countedBpm,
  type MarkRange,
  type MidiSong,
  type MidiTrack,
  markRanges,
  marksIn,
  measureAt,
  measureCount,
  measureTicks,
  namesOf,
  readMidi,
  tickedAfter,
} from './midi.ts';
import { MidiEngine } from './midiEngine.ts';
import { useMidiSettings } from './midiSettings.ts';
import { usePlayer } from './Player.tsx';
import './songs.css';

// Figma: Songs / Song — MIDI. The MIDI file of the song, one lane per track:
// the member cuts the tracks they do not want to hear (or their own, to play
// in its place), slows the tempo down and plays a range again and again.
//
// A track is given its instrument by its name, read by the server with the
// known spellings (model/songs.md, "Reading the name of a track"). A track
// nobody recognises is shown and played under the name the file gives it.

type TrackName = { name: string; instrumentId: number | null };

// How loud a cut track may stay: from silent to 30 %, by steps of 5.
const MUTED_STEPS = 7;
const MUTED_STEP = 0.05;
// The tempo moves by 4 beats a minute, between a third and one and a half
// times the tempo of the file.
const BPM_STEP = 4;
const SLOWEST = 1 / 3;
const FASTEST = 1.5;
// A lane shows two measures of four beats, the playhead a little after its start.
const LANE_BEATS = 8;
const PLAYHEAD = 0.28;

type Props = { song: Song };

export function MidiView({ song }: Props) {
  const { t } = useTranslation();
  const url = song.midi?.url ?? '';
  const file = useQuery({
    queryKey: ['songs', song.id, 'midi', url],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('The MIDI file could not be loaded');
      return readMidi(await response.arrayBuffer());
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  if (file.isPending) {
    return (
      <div aria-busy="true">
        <p role="status" className="visuallyHidden">
          {t('songs.midi.loading')}
        </p>
        <div className="songs-skeleton" data-shape="card" />
      </div>
    );
  }
  if (file.isError || file.data.tracks.length === 0) {
    return <Message kind="danger">{t('songs.midi.error')}</Message>;
  }

  return <MidiPlayer key={url} song={song} midi={file.data} />;
}

/**
 * The tracks of a MIDI file as the member sees them: the instrument each one
 * is, from its name, and whether it is the member's own.
 */
export function useTracks(midi: MidiSong) {
  const { t } = useTranslation();
  const me = useMe().data;
  const instruments = instrumentsOf(useSections().data);
  const names = midi.tracks.map((track) => track.name);
  const placed = useQuery({
    queryKey: ['songs', 'trackNames', names],
    queryFn: () => api<TrackName[]>('/api/songs/trackNames', { method: 'POST', body: { names } }),
  });
  const tracks = midi.tracks.map((track, index) => {
    const instrument = instruments.find(
      (other) => other.id === (placed.data?.[index]?.instrumentId ?? null),
    );
    return {
      track,
      name: instrument?.name ?? (track.name || t('songs.midi.unnamedTrack', { number: index + 1 })),
      pictogram: instrument?.icon ?? null,
      own: instrument !== undefined && instrument.id === me?.instrumentId,
    };
  });
  return { tracks, placed };
}

/** The tempo of the band and the slowest and fastest the player goes, for a file. */
export function tempoRange(fileBpm: number, bandBpm: number) {
  return {
    slowest: Math.min(Math.ceil(fileBpm * SLOWEST), bandBpm),
    fastest: Math.max(Math.floor(fileBpm * FASTEST), bandBpm),
  };
}

type TempoAndVolumeProps = {
  bandBpm: number;
  bpm: number;
  onBpm: (bpm: number) => void;
  mutedStep: number;
  onMutedStep: (step: number) => void;
};

/** Figma: the tempo and the volume of the cut tracks, in the MIDI mode and in its sheet of the Live mode. */
export function TempoAndVolume({
  bandBpm,
  bpm,
  onBpm,
  mutedStep,
  onMutedStep,
}: TempoAndVolumeProps) {
  const { t } = useTranslation();
  const sliderLabel = useId();
  const mutedPercent = t('songs.midi.percent', { value: mutedStep * 5 });
  return (
    <>
      <div className="songs-midiTempo">
        <span className="songs-midiTempoTexts">
          <span className="textLabel">{t('songs.midi.tempo')}</span>
          <span className="textCaption songs-muted">
            {t('songs.midi.bandTempo', { bpm: bandBpm })}
          </span>
        </span>
        <IconButton
          kind="control"
          icon="Minus"
          label={t('songs.midi.slower')}
          onClick={() => onBpm(bpm - BPM_STEP)}
        />
        <output className="songs-midiTempoValue" aria-label={t('songs.midi.bpm', { bpm })}>
          <span className="textHeading">{bpm}</span>
          <span className="textMicro songs-muted">{t('songs.midi.bpmUnit')}</span>
        </output>
        <IconButton
          kind="control"
          icon="Plus"
          label={t('songs.midi.faster')}
          onClick={() => onBpm(bpm + BPM_STEP)}
        />
      </div>

      <div className="songs-midiVolume">
        <div className="songs-midiVolumeLabel">
          <span id={sliderLabel} className="textLabel">
            {t('songs.midi.mutedVolume')}
          </span>
          <span className="textLabel songs-accent">{mutedPercent}</span>
        </div>
        <Slider
          steps={MUTED_STEPS}
          step={mutedStep}
          onChange={onMutedStep}
          labelledBy={sliderLabel}
          valueText={mutedPercent}
        />
        <div className="songs-midiVolumeLabel textCaption songs-muted">
          <span>{t('songs.midi.silent')}</span>
          <span>{t('songs.midi.percent', { value: (MUTED_STEPS - 1) * 5 })}</span>
        </div>
      </div>
    </>
  );
}

/** How loud a cut track stays at a step of the volume slider, from 0 to 1. */
export const mutedVolumeOf = (step: number) => step * MUTED_STEP;

function MidiPlayer({ song, midi }: Props & { midi: MidiSong }) {
  const { t } = useTranslation();
  const me = useMe().data;
  const recording = usePlayer();

  const fileBpm = countedBpm(midi);
  const bandBpm = song.bpm ?? Math.round(fileBpm);
  const total = measureCount(midi);
  const marks = useMemo(() => markRanges(midi), [midi]);

  const engine = useRef<MidiEngine | null>(null);
  const [sounds, setSounds] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [isPlaying, setPlaying] = useState(false);
  const [measure, setMeasure] = useState(1);
  // Shared with the Live mode driven by the MIDI player.
  const [{ bpm, muted, mutedStep }, setSettings] = useMidiSettings(
    song.id,
    bandBpm,
    midi.tracks.length,
  );
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [isLooping, setLooping] = useState(false);
  const [isChoosing, setChoosing] = useState(false);

  const { tracks, placed } = useTracks(midi);

  const settingsNow = useRef({ muted, mutedStep });
  settingsNow.current = { muted, mutedStep };

  // One engine for the file: it holds the sound of the device until the
  // member leaves the mode.
  useEffect(() => {
    let isAlive = true;
    const created = new MidiEngine(midi);
    engine.current = created;
    created.onEnd = () => isAlive && setPlaying(false);
    created.loaded.then(
      () => isAlive && setSounds('ready'),
      () => isAlive && setSounds('failed'),
    );
    // What was set before, here or in the Live mode.
    const { muted: cut, mutedStep: step } = settingsNow.current;
    cut.forEach((isMuted, index) => {
      created.setMuted(index, isMuted);
    });
    created.setMutedVolume(mutedVolumeOf(step));
    return () => {
      isAlive = false;
      engine.current = null;
      created.dispose();
    };
  }, [midi]);

  // The tempo the member chose, as a speed against the tempo of the file.
  useEffect(() => {
    engine.current?.setSpeed(bpm / fileBpm);
  }, [bpm, fileBpm]);

  // The recording of the band and the MIDI file never play together.
  useEffect(() => {
    if (recording.isPlaying) {
      engine.current?.pause();
      setPlaying(false);
    }
  }, [recording.isPlaying]);

  const toggle = async () => {
    const player = engine.current;
    if (!player) return;
    // Pressed again while the sounds load: the member changed their mind.
    if (isPlaying) {
      player.pause();
      setPlaying(false);
      return;
    }
    recording.pause();
    setPlaying(true);
    try {
      await player.play();
    } catch {
      setPlaying(false);
      setSounds('failed');
    }
  };

  const toStart = () => {
    engine.current?.seek(isLooping && range ? measureTicks(midi, range.from).start : 0);
    setMeasure(isLooping && range ? range.from : 1);
  };

  const changeBpm = (next: number) => {
    // The tempo of the band is always within reach, whatever the file says.
    const { slowest, fastest } = tempoRange(fileBpm, bandBpm);
    setSettings({ bpm: Math.min(Math.max(next, slowest), fastest) });
  };

  const toggleMute = (index: number) => {
    const next = !muted[index];
    setSettings({ muted: muted.map((value, at) => (at === index ? next : value)) });
    engine.current?.setMuted(index, next);
  };
  const unmuteAll = () => {
    setSettings({ muted: midi.tracks.map(() => false) });
    midi.tracks.forEach((_, index) => {
      engine.current?.setMuted(index, false);
    });
  };
  const changeMutedStep = (step: number) => {
    setSettings({ mutedStep: step });
    engine.current?.setMutedVolume(mutedVolumeOf(step));
  };

  const loopOn = (from: number, to: number) => {
    setRange({ from, to });
    setLooping(true);
    engine.current?.setLoop({
      start: measureTicks(midi, from).start,
      end: measureTicks(midi, to).end,
    });
  };
  const loopOff = () => {
    setLooping(false);
    engine.current?.setLoop(null);
  };

  // What moves while the song plays: the lanes and the number of the measure.
  const lanes = useRef<(HTMLCanvasElement | null)[]>([]);
  const draw = useCallback(() => {
    const tick = engine.current?.position() ?? 0;
    const at = measureAt(midi, tick);
    // A member who asked for less motion sees the lanes move once per
    // measure, not slide all the time.
    const root = document.documentElement;
    const isStill =
      root.dataset.motion === 'reduced' ||
      (root.dataset.motion === undefined &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const shown = isStill ? measureTicks(midi, at).start : tick;
    lanes.current.forEach((canvas, index) => {
      const track = midi.tracks[index];
      if (canvas && track) drawLane(canvas, midi, track, shown);
    });
    setMeasure(at);
  }, [midi]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn again when a track is recognised as the member's own, and at each change of what is shown
  useEffect(() => {
    let frame = 0;
    const step = () => {
      draw();
      if (isPlaying) frame = window.requestAnimationFrame(step);
    };
    step();
    window.addEventListener('resize', draw);
    // The colours of the lanes are those of the screen: drawn again when the
    // scheme, the theme or the contrast changes.
    const look = new MutationObserver(draw);
    look.observe(document.documentElement, { attributes: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', draw);
      look.disconnect();
    };
  }, [draw, isPlaying, placed.data, me?.instrumentId, isLooping, range, bpm, muted]);

  const hasMuted = muted.some(Boolean);

  return (
    <div className="songs-midi">
      {sounds === 'failed' && <Message kind="danger">{t('songs.midi.soundsError')}</Message>}

      <section className="songs-midiTracks" aria-label={t('songs.midi.tracks')}>
        <div className="songs-midiHeading">
          <span className="textLabel songs-muted" aria-live="off">
            {t('songs.midi.measure', { measure, total })}
          </span>
          {hasMuted && (
            <button type="button" className="songs-textButton textLabel" onClick={unmuteAll}>
              {t('songs.midi.unmuteAll')}
            </button>
          )}
        </div>
        <ul className="songs-midiLanes">
          {tracks.map(({ name, pictogram, own }, index) => (
            // The tracks of a file never change places.
            // biome-ignore lint/suspicious/noArrayIndexKey: two tracks may carry the same name
            <li key={index}>
              <SongPartTrack
                name={name}
                pictogram={pictogram}
                own={own}
                muted={muted[index]}
                onToggleMute={() => toggleMute(index)}
                ownLabel={t('songs.midi.ownTrack')}
                muteLabel={t('songs.midi.mute', { name })}
              >
                <canvas
                  ref={(canvas) => {
                    lanes.current[index] = canvas;
                  }}
                  data-own={own}
                  data-muted={muted[index]}
                />
              </SongPartTrack>
            </li>
          ))}
          <li className="songs-midiPlayhead" aria-hidden="true" />
        </ul>
      </section>

      <div className="songs-midiControls">
        <div className="songs-midiTransport">
          <IconButton icon="SkipBack" label={t('songs.midi.toStart')} onClick={toStart} />
          <button
            type="button"
            className="songs-audioPlay songs-midiPlay"
            aria-label={t(isPlaying ? 'songs.player.pause' : 'songs.player.play')}
            disabled={sounds === 'failed'}
            onClick={toggle}
          >
            <Icon name={isPlaying ? 'Pause' : 'Play'} size={32} />
          </button>
          <button
            type="button"
            className="songs-midiLoop"
            aria-pressed={isLooping}
            aria-label={t('songs.midi.loopToggle')}
            onClick={() => {
              // With no range chosen yet, the whole song is played again.
              if (isLooping) loopOff();
              else loopOn(range?.from ?? 1, range?.to ?? total);
            }}
          >
            <Icon name="Repeat" size={20} />
          </button>
        </div>
        {isPlaying && sounds === 'loading' && (
          <p role="status" className="textCaption songs-muted songs-midiStatus">
            {t('songs.midi.soundsLoading')}
          </p>
        )}

        <section className="songs-midiSettings" aria-label={t('songs.midi.settings')}>
          <TempoAndVolume
            bandBpm={bandBpm}
            bpm={bpm}
            onBpm={changeBpm}
            mutedStep={mutedStep}
            onMutedStep={changeMutedStep}
          />

          <NavRow
            icon="Repeat"
            label={t('songs.midi.loop')}
            detail={
              isLooping && range
                ? [t('songs.midi.loopRange', range), ...namesOf(marks, range)].join(', ')
                : t('songs.midi.loopOff')
            }
            onClick={() => setChoosing(true)}
            opensPanel
            chevron
          />
        </section>
      </div>

      <Panel open={isChoosing} onClose={() => setChoosing(false)} title={t('songs.midi.loopTitle')}>
        {isChoosing && (
          <LoopChoice
            total={total}
            marks={marks}
            range={range ?? { from: measure, to: Math.min(total, measure + 7) }}
            isLooping={isLooping}
            onLoop={(from, to) => {
              loopOn(from, to);
              setChoosing(false);
            }}
            onStop={() => {
              loopOff();
              setChoosing(false);
            }}
          />
        )}
      </Panel>
    </div>
  );
}

type LoopChoiceProps = {
  total: number;
  marks: MarkRange[];
  range: { from: number; to: number };
  isLooping: boolean;
  onLoop: (from: number, to: number) => void;
  onStop: () => void;
};

// Figma: Songs / Song — MIDI, the loop over several marks (sections 15 and
// 16, 0.3.0). The rehearsal marks of the score come first, each with its
// measures, as boxes to tick: one, or several that follow each other. The
// loop goes from the first measure of the first mark to the last of the
// last, and the two measure fields follow; typing measures unticks the
// marks that no longer match.
function LoopChoice({ total, marks, range, isLooping, onLoop, onStop }: LoopChoiceProps) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(String(range.from));
  const [to, setTo] = useState(String(range.to));

  const first = Number(from);
  const last = Number(to);
  const ticked = marksIn(marks, { from: first, to: last });
  const tick = (index: number, on: boolean) => {
    const next = tickedAfter(ticked, index, on);
    if (!next) return;
    setFrom(String(marks[next[0]]?.from ?? first));
    setTo(String(marks[next[1]]?.to ?? last));
  };
  const isValid =
    Number.isInteger(first) &&
    Number.isInteger(last) &&
    first >= 1 &&
    last <= total &&
    first <= last;

  return (
    <form
      className="songs-panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (isValid) onLoop(first, last);
      }}
    >
      <p className="songs-muted">{t('songs.midi.loopIntro')}</p>
      {marks.length > 0 && (
        <>
          <fieldset className="songs-statuses songs-loopMarks">
            <legend className="textLabel">{t('songs.midi.loopMarks')}</legend>
            {marks.map((mark, index) => (
              // A mark played twice comes twice, from another measure.
              <ListRow
                key={`${mark.from}-${mark.name}`}
                label={mark.name}
                detail={t('songs.midi.loopRange', { from: mark.from, to: mark.to })}
                checked={ticked.includes(index)}
                onCheck={(on) => tick(index, on)}
              />
            ))}
          </fieldset>
          <h3 className="textLabel">{t('songs.midi.loopMeasures')}</h3>
        </>
      )}
      <div className="songs-midiRange">
        <TextField
          label={t('songs.midi.loopFrom')}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          inputMode="numeric"
        />
        <TextField
          label={t('songs.midi.loopTo')}
          value={to}
          onChange={(event) => setTo(event.target.value)}
          inputMode="numeric"
          error={isValid ? undefined : t('songs.midi.loopInvalid', { count: total })}
        />
      </div>
      <p className="textCaption songs-muted">
        {marks.length > 0
          ? `${t('songs.midi.loopMarksRule')} ${t('songs.midi.loopHintWithMarks', { count: total })}`
          : `${t('songs.midi.loopHint', { count: total })} ${t('songs.midi.loopMarksHint')}`}
      </p>
      <Button type="submit" disabled={!isValid}>
        {isValid
          ? t('songs.midi.loopStart', { from: first, to: last })
          : t('songs.midi.loopChoose')}
      </Button>
      {isLooping && (
        <Button type="button" kind="quiet" onClick={onStop}>
          {t('songs.midi.loopStop')}
        </Button>
      )}
    </form>
  );
}

// Draws the notes of a track around a tick: each a rounded bar, as long as
// the note lasts, placed by its pitch. The colours are those of the screen.
function drawLane(canvas: HTMLCanvasElement, song: MidiSong, track: MidiTrack, tick: number) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  const scale = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);

  const style = getComputedStyle(canvas);
  const isOwn = canvas.dataset.own === 'true';
  const isMuted = canvas.dataset.muted === 'true';
  context.fillStyle = style.getPropertyValue(isOwn ? '--accent' : '--text').trim();
  // Figma: the notes of the others stand back, those of a cut track more;
  // the member's own are whole. In high contrast nothing is dimmed.
  const isHighContrast = document.documentElement.dataset.contrast === 'more';
  context.globalAlpha = isHighContrast || (isOwn && !isMuted) ? 1 : isMuted ? 0.15 : 0.55;

  const span = song.ticksPerBeat * LANE_BEATS;
  const from = tick - span * PLAYHEAD;
  const perTick = width / span;
  // The notes of the member's own track are thicker: the accent alone tells nobody.
  const bar = isOwn ? 10 : 8;
  const pitches = Math.max(1, track.highest - track.lowest);

  for (const note of track.notes) {
    if (note.tick > from + span) break;
    if (note.tick + note.ticks < from) continue;
    const x = (note.tick - from) * perTick;
    // A drum has no length worth showing: a dot.
    const length = track.isDrums ? bar : Math.max(bar, note.ticks * perTick - 2);
    const y = (height - bar) * (1 - (note.pitch - track.lowest) / pitches);
    context.beginPath();
    context.roundRect(x, y, length, bar, bar / 2);
    context.fill();
  }
}
