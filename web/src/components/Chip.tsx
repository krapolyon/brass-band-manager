import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import './Chip.css';

type Props = {
  /** Status kinds keep their colour whatever the accent theme. */
  kind?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  /** Figma: "Show icon" and "Icon". */
  icon?: IconName;
  children: ReactNode;
};

// Figma: Chip. A short status, a role or a count. A status always carries a
// word or an icon: its colour is never the only signal.
export function Chip({ kind = 'neutral', icon, children }: Props) {
  return (
    <span className="Chip textCaption" data-kind={kind}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  );
}
