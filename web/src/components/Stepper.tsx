import { type CSSProperties, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton.tsx';
import './Stepper.css';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  /** How much a press changes the value; a typed value goes to the nearest step. 1 by default. */
  step?: number;
  /** Written after the number, as Figma writes the value ("45 min"). */
  unit?: string;
  /** The id of a hint that explains the value, read with the field. */
  describedBy?: string;
  onChange: (value: number) => void;
};

// Figma: Stepper. A small whole number changed step by step, with its
// bounds: the length of a proposed setlist, by 5 minutes (0.4.0, issue #60). In code a number field, so that
// the value can also be typed and a screen reader says it with its bounds;
// at a bound, its button is disabled. What is typed is kept as it is until
// the field is left, so that "15" can be typed through "1".
export function Stepper({ label, value, min, max, step = 1, unit, describedBy, onChange }: Props) {
  const { t } = useTranslation();
  const [typing, setTyping] = useState<string | null>(null);
  const set = (next: number) =>
    onChange(Math.min(max, Math.max(min, Math.round(next / step) * step)));

  return (
    <div className="Stepper">
      <IconButton
        icon="Minus"
        kind="control"
        label={unit ? t('stepper.fewerBy', { step, unit }) : t('stepper.fewer')}
        disabled={value <= min}
        onClick={() => {
          setTyping(null);
          set(value - step);
        }}
      />
      <input
        className="Stepper-value textTitle"
        type="number"
        inputMode="numeric"
        aria-label={label}
        aria-describedby={describedBy}
        min={min}
        max={max}
        step={step}
        value={typing ?? value}
        // As wide as the number it shows, so that a unit follows it closely.
        style={{ '--digits': String(typing ?? value).length || 1 } as CSSProperties}
        onChange={(event) => {
          setTyping(event.target.value);
          const typed = Number(event.target.value);
          // Within the bounds and on a step, the value follows at once.
          if (event.target.value !== '' && typed >= min && typed <= max && typed % step === 0) {
            set(typed);
          }
        }}
        onBlur={() => {
          const typed = Number(typing);
          if (typing !== null && typing !== '' && Number.isFinite(typed)) set(typed);
          setTyping(null);
        }}
      />
      {unit && (
        <span className="Stepper-unit textTitle" aria-hidden="true">
          {unit}
        </span>
      )}
      <IconButton
        icon="Plus"
        kind="control"
        label={unit ? t('stepper.moreBy', { step, unit }) : t('stepper.more')}
        disabled={value >= max}
        onClick={() => {
          setTyping(null);
          set(value + step);
        }}
      />
    </div>
  );
}
