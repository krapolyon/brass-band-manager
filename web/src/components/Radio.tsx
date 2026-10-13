import type { InputHTMLAttributes } from 'react';
import './Radio.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

// Figma: Radio. The browser's own radio button, drawn as in Figma: it keeps
// the keyboard (the arrows move inside its group), the focus and what screen
// readers say. Its name comes from the <label> around it (see ListRow), and
// the radios of one choice share a `name`, inside a `radiogroup`.
export function Radio(props: Props) {
  return (
    <span className="Radio">
      <input type="radio" {...props} />
    </span>
  );
}
