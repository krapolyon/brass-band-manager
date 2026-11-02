import { useId } from 'react';
import { Switch } from './Switch.tsx';
import './SwitchRow.css';

type Props = {
  label: string;
  /** Figma: "Description" and "Show description". */
  description?: string;
  /** Off: the description is not shown, and screen readers still hear it. */
  showDescription?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The choice is kept but cannot be changed here; the screen says why. */
  disabled?: boolean;
};

// Figma: SwitchRow. An option that is on or off and applies at once: one
// control, with its label and its description tied to it. The whole row is
// the touch target.
export function SwitchRow({
  label,
  description,
  showDescription = true,
  checked,
  onChange,
  disabled,
}: Props) {
  const id = useId();
  const descriptionId = useId();

  return (
    <label className="SwitchRow" htmlFor={id}>
      <span className="SwitchRow-texts">
        <span className="textBodyStrong">{label}</span>
        {description && (
          <span
            className={showDescription ? 'SwitchRow-description textCaption' : 'visuallyHidden'}
            id={descriptionId}
          >
            {description}
          </span>
        )}
      </span>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={description ? descriptionId : undefined}
      />
    </label>
  );
}
