import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import { Pictogram } from './Pictogram.tsx';
import './FilterChip.css';

type Props = {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  /** Figma: "Icon": what the filter is about, shown while it is off. */
  icon?: IconName;
  /** The pictogram of a section (section.icon), in the place of the icon; null: the generic one. */
  pictogram?: string | null;
  /** A chip that cannot change now (a channel of a device that does not receive). */
  disabled?: boolean;
  /** Disabled without standing back: the last channel of a kind that cannot be off. */
  locked?: boolean;
  children: ReactNode;
};

// Figma: FilterChip. A filter that narrows a list: on or off, several at
// once. The tick carries the state, not the colour alone; the mark keeps its
// place when off, so the width never changes.
export function FilterChip({
  pressed,
  onChange,
  icon,
  pictogram,
  disabled,
  locked,
  children,
}: Props) {
  return (
    <button
      type="button"
      className="FilterChip textLabel"
      aria-pressed={pressed}
      disabled={disabled}
      // Locked stays in the tab order, so that the description of its group
      // (why it cannot be off) is still read on reaching it.
      aria-disabled={locked && !disabled ? true : undefined}
      data-locked={locked && !disabled ? '' : undefined}
      onClick={() => {
        if (!locked) onChange(!pressed);
      }}
    >
      {pressed ? (
        <Icon name="Check" size={20} />
      ) : pictogram !== undefined ? (
        <Pictogram name={pictogram} size={20} />
      ) : icon ? (
        <Icon name={icon} size={20} />
      ) : (
        <span className="FilterChip-mark" />
      )}
      {children}
    </button>
  );
}
