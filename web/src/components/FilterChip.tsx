import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import './FilterChip.css';

type Props = {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  /** Figma: "Icon": what the filter is about, shown while it is off. */
  icon?: IconName;
  children: ReactNode;
};

// Figma: FilterChip. A filter that narrows a list: on or off, several at
// once. The tick carries the state, not the colour alone; the mark keeps its
// place when off, so the width never changes.
export function FilterChip({ pressed, onChange, icon, children }: Props) {
  return (
    <button
      type="button"
      className="FilterChip textLabel"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
    >
      {pressed ? (
        <Icon name="Check" size={20} />
      ) : icon ? (
        <Icon name={icon} size={20} />
      ) : (
        <span className="FilterChip-mark" />
      )}
      {children}
    </button>
  );
}
