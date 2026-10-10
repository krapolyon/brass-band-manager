import type { InputHTMLAttributes } from 'react';
import { Icon } from './Icon.tsx';
import './Checkbox.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

// Figma: Checkbox. The browser's own checkbox, drawn as in Figma: it keeps
// the keyboard, the focus and what screen readers say. Its name comes from
// the <label> around it (see ListRow).
export function Checkbox(props: Props) {
  return (
    <span className="Checkbox">
      <input type="checkbox" {...props} />
      <Icon name="Check" size={20} />
    </span>
  );
}
