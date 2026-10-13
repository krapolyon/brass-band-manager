import { type ReactNode, useId } from 'react';
import './LevelScale.css';

const levels = [1, 2, 3, 4, 5];

type Props = {
  /** Figma: Label. What is rated: "Maîtrise". */
  label: string;
  /** The name of the radio group in its form. */
  name: string;
  /** Figma: Value. Null: no answer. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Figma: "Low end" and "High end": what 1 and 5 mean. */
  lowLabel: string;
  highLabel: string;
  disabled?: boolean;
  /** Figma: "Average" and "Show average": a line under the scale. */
  children?: ReactNode;
};

// Figma: LevelScale. A level from 1 to 5, or no answer. It is a group of the
// browser's own radio buttons: the arrow keys move the choice. Pressing the
// level already chosen takes the answer back, since a radio button alone
// cannot be emptied.
export function LevelScale({
  label,
  name,
  value,
  onChange,
  lowLabel,
  highLabel,
  disabled,
  children,
}: Props) {
  const id = useId();

  return (
    <div
      className="LevelScale"
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      data-disabled={disabled ? 'true' : undefined}
    >
      <span id={`${id}-label`} className="LevelScale-label textLabel">
        {label}
      </span>
      <span className="LevelScale-scale">
        {levels.map((level) => (
          <label key={level} className="textButton">
            <input
              type="radio"
              name={name}
              value={level}
              checked={value === level}
              disabled={disabled}
              onChange={() => onChange(level)}
              onClick={() => {
                if (value === level) onChange(null);
              }}
              // What the two ends mean is read with the first and the last level.
              aria-describedby={
                level === 1 ? `${id}-low` : level === levels.length ? `${id}-high` : undefined
              }
            />
            <span>{level}</span>
          </label>
        ))}
      </span>
      <span className="LevelScale-ends textCaption">
        <span id={`${id}-low`}>{lowLabel}</span>
        <span id={`${id}-high`}>{highLabel}</span>
      </span>
      {children && <span className="LevelScale-average textCaption">{children}</span>}
    </div>
  );
}
