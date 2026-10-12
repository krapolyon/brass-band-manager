import type { InputHTMLAttributes } from 'react';
import { Icon } from './Icon.tsx';
import './Switch.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>;

// Figma: Switch. An option that is on or off and applies at once. It is the
// browser's own checkbox, announced as a switch: it keeps the keyboard and
// the focus. The position of the knob and its tick carry the state, not the
// colour alone. Its name comes from the label around it (see SwitchRow).
export function Switch(props: Props) {
  return (
    <span className="Switch">
      {/* biome-ignore lint/a11y/useAriaPropsForRole: a checkbox of the browser gives its checked state by itself */}
      <input type="checkbox" role="switch" {...props} />
      <span className="Switch-knob">
        <Icon name="Check" size={16} />
      </span>
    </span>
  );
}
