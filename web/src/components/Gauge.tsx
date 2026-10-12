import { type CSSProperties, useId } from 'react';
import './Gauge.css';

type Props = {
  /** The part of the whole: 7. */
  value: number;
  /** The whole: 10. */
  total: number;
  /** Figma: Value. The numbers in words, written under the bar: "7 sur 10". */
  text: string;
  /** What is measured, for screen readers: "Partitions". Without it the text is the name of the gauge. */
  label?: string;
};

// Figma: Gauge. A share of a whole: a bar filled at the exact ratio (Figma
// draws it by tens), and the numbers in words under it. For screen readers
// it is a meter, whose value is read as the words.
export function Gauge({ value, total, text, label }: Props) {
  const id = useId();
  const whole = Math.max(0, total);
  const part = Math.min(Math.max(0, value), whole);
  const ratio = whole > 0 ? part / whole : 0;

  return (
    <span className="Gauge">
      {/* biome-ignore lint/a11y/useSemanticElements: the browser's own meter cannot be drawn the same in every browser */}
      <span
        className="Gauge-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={whole}
        aria-valuenow={part}
        aria-valuetext={text}
        aria-label={label}
        aria-labelledby={label ? undefined : id}
        style={{ '--gaugeFill': ratio } as CSSProperties}
      >
        <span className="Gauge-filled" />
      </span>
      {/* Already read as the value of the meter. */}
      <span id={id} className="Gauge-value textCaption" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
