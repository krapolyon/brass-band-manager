import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar, initialsOf } from './Avatar.tsx';
import { Icon } from './Icon.tsx';
import './MemberRow.css';

type Props = {
  nickname: string;
  /** "Marie-Lou Fontaine · Trompette". */
  detail: string;
  photoUrl: string | null;
  /** The record of the member: the whole row opens it. */
  to: string;
  /** Figma: "Power member": the mark beside the nickname, named for screen readers. */
  powerMemberLabel?: string;
  /** Figma: "Has a role": the mark of a member who holds a role, named for screen readers. */
  roleLabel?: string;
  /** Figma: Status. A Chip, shown only when the status is not the ordinary one. */
  status?: ReactNode;
  /** A member who left: their name is shown muted. */
  muted?: boolean;
};

// Figma: Member/Row. A member in the list of those who manage members. The
// row keeps the same height whatever it shows: the marks and the status sit
// at its end.
export function MemberRow({
  nickname,
  detail,
  photoUrl,
  to,
  powerMemberLabel,
  roleLabel,
  status,
  muted,
}: Props) {
  return (
    <Link className="MemberRow" to={to} data-muted={muted ? 'true' : undefined}>
      <Avatar photoUrl={photoUrl} initials={initialsOf(nickname)} />
      <span className="MemberRow-texts">
        <span className="MemberRow-nickname textBodyLarge">{nickname}</span>
        <span className="MemberRow-detail textCaption">{detail}</span>
      </span>
      {powerMemberLabel && (
        <span className="MemberRow-mark" data-kind="power">
          <Icon name="Biceps" size={20} />
          <span className="visuallyHidden">{powerMemberLabel}</span>
        </span>
      )}
      {roleLabel && (
        <span className="MemberRow-mark">
          <Icon name="Shield" size={20} />
          <span className="visuallyHidden">{roleLabel}</span>
        </span>
      )}
      {status}
      <Icon name="ChevronRight" />
    </Link>
  );
}
