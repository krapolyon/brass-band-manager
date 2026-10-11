import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon.tsx';
import './NavRow.css';

type Props = {
  /** Figma: "Icon" and "Show icon". */
  icon?: IconName;
  label: string;
  /** Figma: "Detail" and "Show detail". */
  detail?: string;
  /** Danger: an action that removes something. */
  tone?: 'default' | 'danger';
  /** Opens a screen: the row is a link, with a chevron at its end. */
  to?: string;
  /** Acts in place: the row is a button. */
  onClick?: () => void;
  /** An address outside the app (a phone number, an email): the row is a link. */
  href?: string;
  /** A state or a small action at the end (Figma: Trailing=Chip, Trailing=Button). */
  trailing?: ReactNode;
  disabled?: boolean;
  /** The action opens a panel: said to screen readers. */
  opensPanel?: boolean;
  /** Figma: Trailing=Chevron on a row that is not a link: it leads to a choice. */
  chevron?: boolean;
};

// Figma: NavRow. A row that leads somewhere or does one thing. With neither
// `to`, `href` nor `onClick`, it only informs.
export function NavRow({
  icon,
  label,
  detail,
  tone = 'default',
  to,
  onClick,
  href,
  trailing,
  disabled,
  opensPanel,
  chevron,
}: Props) {
  const content = (
    <>
      {icon && <Icon name={icon} />}
      <span className="NavRow-texts">
        <span className="NavRow-label textBodyLarge">{label}</span>
        {detail && <span className="NavRow-detail textCaption">{detail}</span>}
      </span>
      {(to || chevron) && <Icon name="ChevronRight" />}
    </>
  );

  if (to) {
    return (
      <Link className="NavRow" data-tone={tone} to={to}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a className="NavRow" data-tone={tone} href={href}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        className="NavRow"
        aria-haspopup={opensPanel ? 'dialog' : undefined}
        data-tone={tone}
        onClick={onClick}
        disabled={disabled}
      >
        {content}
      </button>
    );
  }
  return (
    <div className="NavRow" data-tone={tone}>
      {content}
      {trailing}
    </div>
  );
}
