import { Icon } from './Icon.tsx';
import './ThemeSwatch.css';

type Props = {
  /** The accent theme the swatch shows: a mode of the Theme collection. */
  theme: string;
  /** Band: the colour of the band, which a member follows by default. */
  kind?: 'theme' | 'band';
  label: string;
  /** The name shared by the swatches of one choice. */
  name: string;
  checked: boolean;
  onChange: () => void;
};

// Figma: ThemeSwatch. One accent theme among the others: a radio button of
// the browser, drawn as a disc of the colour. The ring and the tick carry the
// state. The disc takes its colour from the Theme variables of the theme it
// shows, set on the element: it is the one component that reads Theme
// directly, since it must show a theme that is not the one in use.
export function ThemeSwatch({ theme, kind = 'theme', label, name, checked, onChange }: Props) {
  return (
    <label className="ThemeSwatch" data-theme={theme}>
      <span className="ThemeSwatch-ring">
        <input type="radio" name={name} checked={checked} onChange={onChange} />
        <span className="ThemeSwatch-disc">
          {kind === 'band' ? (
            <Icon name="Music" size={20} />
          ) : (
            checked && <Icon name="Check" size={20} />
          )}
        </span>
      </span>
      <span className="ThemeSwatch-label textCaption">{label}</span>
    </label>
  );
}
