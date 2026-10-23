import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon.tsx';
import { Pictogram } from './Pictogram.tsx';
import './NavRow.css';

type Props = {
  /** Figma: "Icon" and "Show icon". */
  icon?: IconName;
  /** The pictogram of a section (section.icon) in the place of the icon; null: the generic one. */
  pictogram?: string | null;
  label: string;
  /** Figma: "Detail" and "Show detail". */
  detail?: string;
  /** Danger: an action that removes something. */
  tone?: 'default' | 'danger';
  /** Opens a screen: the row is a link, with a chevron at its end. */
  to?: string;
  /** With `to`: what the screen it opens is told, such as where to go back. */
  state?: unknown;
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
  /** With `href`: the browser saves what the link leads to, under this name. */
  download?: string;
};

// Figma: NavRow. A row that leads somewhere or does one thing. With neither
// `to`, `href` nor `onClick`, it only informs.
export function NavRow({
  icon,
  pictogram,
  label,
  detail,
  tone = 'default',
  to,
  state,
  onClick,
  href,
  trailing,
  disabled,
  opensPanel,
  chevron,
  download,
}: Props) {
  const content = (
    <>
      {icon && <Icon name={icon} />}
      {pictogram !== undefined && <Pictogram name={pictogram} />}
      <span className="NavRow-texts">
        <span className="NavRow-label textBodyLarge">{label}</span>
        {detail && <span className="NavRow-detail textCaption">{detail}</span>}
      </span>
      {(to || chevron) && <Icon name="ChevronRight" />}
    </>
  );

  if (to) {
    return (
      <Link className="NavRow" data-tone={tone} to={to} state={state}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a className="NavRow" data-tone={tone} href={href} download={download}>
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
        // Not the `disabled` attribute: the row would leave the keyboard, and
        // its reason, written in its detail, could not be reached.
        aria-disabled={disabled ? true : undefined}
        onClick={disabled ? undefined : onClick}
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
