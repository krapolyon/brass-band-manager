import type { CSSProperties } from 'react';
import './Slider.css';

type Props = {
  /** How many stops the scale has. */
  steps: number;
  /** The stop chosen, starting at 0. */
  step: number;
  onChange: (step: number) => void;
  /** The id of the visible label of the setting. */
  labelledBy: string;
  describedBy?: string;
  /** The value in words, read out instead of the number of the stop: "120 %". */
  valueText: string;
};

// Figma: Slider. A value picked among a few stops; the part before the thumb
// takes the accent. It is the browser's own range input, so the arrow keys,
// Home and End work; the stops and the line are drawn behind it.
export function Slider({ steps, step, onChange, labelledBy, describedBy, valueText }: Props) {
  const stops = Array.from({ length: steps }, (_, index) => index);

  return (
    <span className="Slider" style={{ '--sliderFill': step / (steps - 1) } as CSSProperties}>
      <span className="Slider-track" aria-hidden="true">
        {stops.map((stop) => (
          <span
            key={stop}
            data-before={stop < step}
            style={{ '--sliderAt': stop / (steps - 1) } as CSSProperties}
          />
        ))}
      </span>
      <input
        type="range"
        min={0}
        max={steps - 1}
        step={1}
        value={step}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-valuetext={valueText}
      />
    </span>
  );
}
