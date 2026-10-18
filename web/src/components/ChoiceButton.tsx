import type { InputHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './ChoiceButton.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  /** Large: 52, a single slot. Small: 44, inside a slot card. */
  size?: 'large' | 'small';
  /** Several on at once (a ChoiceGroup of several choices): a checkbox under the drawing. */
  multiple?: boolean;
  children: ReactNode;
};

// Figma: ChoiceButton. One answer among a few, drawn as a button. It is the
// browser's own radio button under the drawing: the arrows move inside its
// group and screen readers say "2 of 4". On (Figma: State=On) is `checked`:
// the accent and a filled check, so that the state never rests on colour
// alone. The choices of one question share a `name`, inside a `radiogroup`.
// With `multiple`, it is a checkbox: several can be on, each shows its tick.
export function ChoiceButton({ size = 'large', multiple = false, children, ...input }: Props) {
  return (
    <label
      className={`ChoiceButton ${size === 'large' ? 'textButton' : 'textLabel'}`}
      data-size={size}
    >
      <input type={multiple ? 'checkbox' : 'radio'} {...input} />
      <Icon name="Check" size={size === 'large' ? 20 : 16} filled />
      <span>{children}</span>
    </label>
  );
}
