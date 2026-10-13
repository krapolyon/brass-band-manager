import type { CSSProperties, KeyboardEvent } from 'react';
import './Waveform.css';

// Figma draws 54 bars, whatever the length of the recording.
const BARS = 54;
// Figma: the arrow keys move 5 s.
const KEY_STEP = 5;
// The lowest bar of Figma is 8 high on 56: a silence still shows a bar.
const FLOOR = 14;

type Props = {
  /** How loud each slice of the recording is, from 0 to 100. Null: not computed yet, every bar is the lowest one. */
  peaks: number[] | null;
  /** In seconds. */
  duration: number;
  /** In seconds. */
  position: number;
  onSeek: (seconds: number) => void;
  /** What the slider moves, for screen readers. */
  label: string;
  /** The position in words, read out instead of the seconds: "1:12 sur 3:52". */
  valueText: string;
};

/** The loudest peak of each of the 54 slices, so that a short hit still shows. */
function barsOf(peaks: number[] | null): number[] {
  return Array.from({ length: BARS }, (_, bar) => {
    if (!peaks || peaks.length === 0) return FLOOR;
    const from = Math.floor((bar * peaks.length) / BARS);
    const to = Math.max(from + 1, Math.floor(((bar + 1) * peaks.length) / BARS));
    const loudest = Math.max(...peaks.slice(from, to));

    return Math.min(100, Math.max(FLOOR, Number.isFinite(loudest) ? loudest : FLOOR));
  });
}

// Figma: Waveform. The recording as bars; the part already played takes the
// accent. It is the browser's own range input, laid over the bars and not
// drawn itself: touching or dragging moves the position, the arrow keys move
// it by 5 s, Home and End go to the ends.
export function Waveform({ peaks, duration, position, onSeek, label, valueText }: Props) {
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const at = Math.min(Math.max(position, 0), length);
  const played = length > 0 ? at / length : 0;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
    if (!forward && !back) return;
    // The browser would move by one second.
    event.preventDefault();
    onSeek(Math.min(length, Math.max(0, at + (forward ? KEY_STEP : -KEY_STEP))));
  }

  return (
    <span className="Waveform">
      <input
        type="range"
        min={0}
        max={length}
        step={1}
        value={Math.round(at)}
        disabled={length === 0}
        onChange={(event) => onSeek(Number(event.target.value))}
        onKeyDown={onKeyDown}
        aria-label={label}
        aria-valuetext={valueText}
      />
      <span className="Waveform-bars" aria-hidden="true">
        {barsOf(peaks).map((peak, bar) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the bars are always the same 54, in the same order
            key={bar}
            data-played={bar / BARS < played ? 'true' : undefined}
            style={{ '--waveformPeak': peak } as CSSProperties}
          />
        ))}
      </span>
    </span>
  );
}
