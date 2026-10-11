import { useId } from 'react';
import './SegmentedControl.css';

type Props<Value extends string> = {
  /** What is chosen, for screen readers: the visible title is elsewhere on the screen. */
  label: string;
  options: { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
};

// Figma: SegmentedControl. One choice among two or three short values, all
// visible at once. It is a group of the browser's own radio buttons: the
// arrow keys move the choice.
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
}: Props<Value>) {
  const name = useId();

  return (
    <div className="SegmentedControl" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className="textLabel">
          <input
            type="radio"
            name={name}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
