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
// at a bound, its button is disabled.
export function Stepper({ label, value, min, max, onChange }: Props) {
  const { t } = useTranslation();
  const set = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next))));

  return (
    <div className="Stepper">
      <IconButton
        icon="Minus"
        kind="control"
        label={t('stepper.fewer')}
        disabled={value <= min}
        onClick={() => set(value - 1)}
      />
      <input
        className="Stepper-value textTitle"
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const typed = Number(event.target.value);
          if (event.target.value !== '' && Number.isFinite(typed)) set(typed);
        }}
      />
      <IconButton
        icon="Plus"
        kind="control"
        label={t('stepper.more')}
        disabled={value >= max}
        onClick={() => set(value + 1)}
      />
    </div>
  );
}
