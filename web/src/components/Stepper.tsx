import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton.tsx';
import './Stepper.css';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

// Figma: Stepper. A small whole number changed one by one, with its bounds:
// how many songs a proposed setlist holds. In code a number field, so that
// the value can also be typed and a screen reader says it with its bounds;
// at a bound, its button is disabled. What is typed is kept as it is until
// the field is left, so that "15" can be typed through "1".
export function Stepper({ label, value, min, max, onChange }: Props) {
  const { t } = useTranslation();
  const [typing, setTyping] = useState<string | null>(null);
  const set = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next))));

  return (
    <div className="Stepper">
      <IconButton
        icon="Minus"
        kind="control"
        label={t('stepper.fewer')}
        disabled={value <= min}
        onClick={() => {
          setTyping(null);
          set(value - 1);
        }}
      />
      <input
        className="Stepper-value textTitle"
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={typing ?? value}
        onChange={(event) => {
          setTyping(event.target.value);
          const typed = Number(event.target.value);
          // Within the bounds, the value follows at once.
          if (event.target.value !== '' && typed >= min && typed <= max) set(typed);
        }}
        onBlur={() => {
          const typed = Number(typing);
          if (typing !== null && typing !== '' && Number.isFinite(typed)) set(typed);
          setTyping(null);
        }}
      />
      <IconButton
        icon="Plus"
        kind="control"
        label={t('stepper.more')}
        disabled={value >= max}
        onClick={() => {
          setTyping(null);
          set(value + 1);
        }}
      />
    </div>
  );
}
