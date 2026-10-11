import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './FilterChip.css';

type Props = {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  children: ReactNode;
};

// Figma: FilterChip. A filter that narrows a list: on or off, several at
// once. The tick carries the state, not the colour alone; the mark keeps its
// place when off, so the width never changes.
export function FilterChip({ pressed, onChange, children }: Props) {
  return (
    <button
      type="button"
      className="FilterChip textLabel"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
    >
      {pressed ? <Icon name="Check" size={20} /> : <span className="FilterChip-mark" />}
      {children}
    </button>
  );
}
