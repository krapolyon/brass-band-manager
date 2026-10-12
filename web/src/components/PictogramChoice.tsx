import { Pictogram } from './Pictogram.tsx';
import './PictogramChoice.css';

type Props = {
  /** The value of section.icon; null for the generic pictogram. */
  icon: string | null;
  /** The name of the pictogram, for screen readers. */
  label: string;
  /** The name shared by the choices of one group. */
  name: string;
  checked: boolean;
  onChange: () => void;
};

// Figma: PictogramChoice. One pictogram to choose for a section: a radio
// button of the browser, whose accessible name is the name of the pictogram.
export function PictogramChoice({ icon, label, name, checked, onChange }: Props) {
  return (
    <label className="PictogramChoice">
      <input type="radio" name={name} checked={checked} onChange={onChange} aria-label={label} />
      <Pictogram name={icon} />
    </label>
  );
}
