import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import { SongPartTrack } from '../../components/SongPartTrack.tsx';
import { Stepper } from '../../components/Stepper.tsx';
import { SwitchRow } from '../../components/SwitchRow.tsx';
import { TextField } from '../../components/TextField.tsx';
import {
  isMotionReduced,
  type LiveSettings,
  type Scrolling,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_STEP,
} from './liveSettings.ts';
import { drawLane, MutedVolume, TempoSetting, useTracks } from './MidiView.tsx';
import { type MidiSong, measureAt, measureTicks } from './midi.ts';
import type { useMidiSettings } from './midiSettings.ts';
import { isCompound, type Timeline } from './score.ts';

// The sheets of the Live mode (Figma: Songs, sections 5 and 20): where to
// start, the tempo, and the reading settings. Each is a BottomSheet below
// 1024 and a Dialog from there (Panel).

type StartChoiceProps = {
  timeline: Timeline;
  /** The written measure the song would start from now. */
  current: number;
  onStart: (measure: number) => void;
};

// Figma: Songs / Song — Live, choosing where to start. The number of the
// measure is typed, or adjusted; the rehearsal marks of the score are offered
// when it has some.
export function StartChoice({ timeline, current, onStart }: StartChoiceProps) {
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

// A member who stops tapping for this long starts counting again.
const TAP_RESET_MS = 3000;

type TempoSheetProps = {
  bpm: number;
  /** The tempo of the band, else the one of the file. */
  bandBpm: number;
  /** The tempo the score says. */
  fileBpm: number;
  signature: Timeline['signature'];
  /** Asked a tempo: by − / +, one step away; kept within the bounds by whoever owns it. */
  onBpm: (bpm: number) => void;
  /** The first tap of a measure: the sound can be woken now, inside the gesture. */
  onFirstTap: () => void;
  /** A measure was tapped: the reading starts at this tempo, after this wait (the next 1). */
  onTapped: (bpm: number, waitMs: number) => void;
};

// Figma: Songs / Song — Live, the Tempo sheet (1.1.0, issue #74). The tempo
// is set in one place: − and + by 4, or tapped, one measure of taps (the
// eighths in compound time), and the reading starts on the next 1.
export function TempoSheet(props: TempoSheetProps) {
  const { bpm, bandBpm, fileBpm, signature, onBpm, onFirstTap, onTapped } = props;
  const { t } = useTranslation();
  // One measure of taps; two at least, to hear a tempo.
  const tapsNeeded = Math.max(2, signature.beats);
  const [taps, setTaps] = useState<number[]>([]);
  const perTapOf = (from: number[]) => {
    if (from.length < 2) return null;
    const perTap = 60000 / (((from[from.length - 1] ?? 0) - (from[0] ?? 0)) / (from.length - 1));
    // In compound time the taps are eighths: three to a beat.
    return Number.isFinite(perTap) ? perTap : null;
  };
  const counted = (perTap: number) =>
    Math.max(20, Math.min(400, Math.round(isCompound(signature) ? perTap / 3 : perTap)));
  const sofar = perTapOf(taps);

  const tap = () => {
    const now = performance.now();
    const last = taps[taps.length - 1];
    const next = last !== undefined && now - last > TAP_RESET_MS ? [now] : [...taps, now];
    if (next.length === 1) onFirstTap();
    if (next.length < tapsNeeded) {
      setTaps(next);
      return;
    }
    setTaps([]);
    const perTap = perTapOf(next);
    // Two taps at the same instant say no tempo: the member starts again.
    if (perTap === null) return;
    onTapped(counted(perTap), 60000 / perTap);
  };

  return (
    <div className="songs-panel songs-liveTempo">
      <TempoSetting
        label={t('songs.live.tempo.set')}
        hint={t('songs.live.tempo.setHint', { band: bandBpm, file: fileBpm })}
        bpm={bpm}
        onBpm={onBpm}
      />
      <h3 className="textBodyStrong">{t('songs.live.tempo.orTap')}</h3>
      {/* The whole zone is the button. */}
      <button type="button" className="songs-liveTap" onClick={tap}>
        {isCompound(signature) && <span className="songs-muted">{t('songs.live.tapEighths')}</span>}
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
        <span className="visuallyHidden">{t('songs.live.tempo.tap')}</span>
      </button>
      {/* Beside the button, not in it: said when it changes, not as its name. */}
      <p className="songs-liveTapSaid textBodyLarge" role="status">
        {sofar === null
          ? t('songs.live.tapStart', { count: tapsNeeded })
          : t('songs.live.tempo.tapHint', { bpm: counted(sofar) })}
      </p>
    </div>
  );
}

type ReadingSettingsProps = {
  settings: LiveSettings;
  onChange: (changes: Partial<LiveSettings>) => void;
  /** The MIDI file of the song, when it has one that plays: its tracks are set here. */
  midi: MidiSong | null;
  midiSettings: ReturnType<typeof useMidiSettings>[0];
  onMidiChange: ReturnType<typeof useMidiSettings>[1];
  /** Where the song is, in ticks of the MIDI file: the lanes are drawn around it. */
  tickNow: () => number;
};

// Figma: Songs / Song — Live, the reading settings (1.1.0, issues #76 and
// #77). Kept on the device for the member (liveSettings.ts); the tracks of
// the MIDI file are the state shared with the MIDI mode of the song.
export function ReadingSettings(props: ReadingSettingsProps) {
  const { settings, onChange, midi, midiSettings, onMidiChange, tickNow } = props;
  const { t } = useTranslation();
  const sizeHint = useId();
  const isStill = isMotionReduced();

  return (
    <div className="songs-panel songs-liveSettings">
      <section className="songs-liveSetting">
        <h3 className="textBodyStrong">{t('songs.live.settings.scrolling')}</h3>
        <SegmentedControl<Scrolling>
          label={t('songs.live.settings.scrolling')}
          options={(['continuous', 'quickJump', 'slowJump'] as const).map((value) => ({
            value,
            label: t(`songs.live.settings.${value}`),
          }))}
          // Less motion: the quick jump, with no transition.
          value={isStill ? 'quickJump' : settings.scrolling}
          onChange={(scrolling) => onChange({ scrolling })}
        />
        <p className="textCaption songs-muted">{t('songs.live.settings.scrollingHint')}</p>
      </section>
      <section className="songs-liveSetting songs-liveSize">
        <span className="songs-liveSizeTexts">
          <h3 className="textBodyStrong">{t('songs.live.settings.size')}</h3>
          <span className="textCaption songs-muted" id={sizeHint}>
            {t('songs.live.settings.sizeHint')}
          </span>
        </span>
        <Stepper
          label={t('songs.live.settings.size')}
          value={settings.size}
          min={SIZE_MIN}
          max={SIZE_MAX}
          step={SIZE_STEP}
          unit="%"
          describedBy={sizeHint}
          onChange={(size) => onChange({ size })}
        />
      </section>
      <SwitchRow
        label={t('songs.live.settings.metronome')}
        description={t('songs.live.settings.metronomeHint')}
        checked={settings.hasMetronome}
        onChange={(hasMetronome) => onChange({ hasMetronome })}
      />
      <SwitchRow
        label={t('songs.live.settings.hideControls')}
        description={t('songs.live.settings.hideControlsHint')}
        checked={settings.hidesControls}
        onChange={(hidesControls) => onChange({ hidesControls })}
      />
      <p className="textCaption songs-muted">{t('songs.live.settings.kept')}</p>
      {midi && (
        <MidiTracks midi={midi} settings={midiSettings} onChange={onMidiChange} tickNow={tickNow} />
      )}
    </div>
  );
}

type MidiTracksProps = {
  midi: MidiSong;
  settings: ReturnType<typeof useMidiSettings>[0];
  onChange: ReturnType<typeof useMidiSettings>[1];
  tickNow: () => number;
};

// "Pistes du MIDI": the lanes of the MIDI mode with their mute, and the volume
// of the cut tracks; the loop is not offered here.
function MidiTracks({ midi, settings, onChange, tickNow }: MidiTracksProps) {
  const { t } = useTranslation();
  const { tracks } = useTracks(midi);
  const lanes = useRef<(HTMLCanvasElement | null)[]>([]);
  const [measure, setMeasure] = useState(1);
  const hasMuted = settings.muted.some(Boolean);

  // The lanes follow the song while the sheet is open, as in the MIDI mode.
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn again when a track is cut, or recognised as the member's own
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const tick = tickNow();
      const at = measureAt(midi, tick);
      const shown = isMotionReduced() ? measureTicks(midi, at).start : tick;
      lanes.current.forEach((canvas, index) => {
        const track = midi.tracks[index];
        if (canvas && track) drawLane(canvas, midi, track, shown);
      });
      setMeasure(at);
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [midi, tickNow, settings.muted, tracks.map((track) => track.own).join()]);

  return (
    <section className="songs-liveSetting">
      <h3 className="textBodyStrong">{t('songs.live.settings.tracks')}</h3>
      <p className="textCaption songs-muted">{t('songs.live.settings.tracksHint')}</p>
      <section className="songs-midiTracks" aria-label={t('songs.midi.tracks')}>
        <div className="songs-midiHeading">
          <span className="textLabel songs-muted">
            {t('songs.midi.measure', { measure, total: midi.measures.length - 1 })}
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
        <ul className="songs-midiLanes">
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
              >
                <canvas
                  ref={(canvas) => {
                    lanes.current[index] = canvas;
                  }}
                  data-own={own}
                  data-muted={settings.muted[index]}
                />
              </SongPartTrack>
            </li>
          ))}
          <li className="songs-midiPlayhead" aria-hidden="true" />
        </ul>
      </section>
      <MutedVolume step={settings.mutedStep} onStep={(mutedStep) => onChange({ mutedStep })} />
    </section>
  );
}
