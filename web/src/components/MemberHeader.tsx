import type { ReactNode } from 'react';
import { Avatar, initialsOf } from './Avatar.tsx';
import { Pictogram } from './Pictogram.tsx';
import './MemberHeader.css';

type Props = {
  /** Large: the member's own sheet. Medium: the top of the settings. */
  size?: 'large' | 'medium';
  /** What the initials are made from when there is no photo. */
  nickname: string;
  title: string;
  /** Figma: "Subtitle" and "Show subtitle". */
  subtitle?: string;
  instrument: string;
  /** The pictogram of the section of the instrument. */
  sectionIcon: string | null;
  photoUrl: string | null;
  /** Figma: "Power member": a Chip under the instrument. */
  status?: ReactNode;
};

// Figma: Member/Header. A member at the top of their own sheet or of the
// settings: the photo, a title, the instrument with the pictogram of its section.
export function MemberHeader({
  size = 'large',
  nickname,
  title,
  subtitle,
  instrument,
  sectionIcon,
  photoUrl,
  status,
}: Props) {
  return (
    <div className="MemberHeader" data-size={size}>
      <Avatar photoUrl={photoUrl} initials={initialsOf(nickname)} size={size} />
      <div className="MemberHeader-texts">
        <span className={size === 'large' ? 'textBodyStrong' : 'textHeading'}>{title}</span>
        {subtitle && <span className="MemberHeader-muted textCaption">{subtitle}</span>}
        <span
          className={`MemberHeader-instrument ${size === 'large' ? 'textBody' : 'textCaption'}`}
        >
          <Pictogram name={sectionIcon} size={20} />
          {instrument}
        </span>
        {status && <span>{status}</span>}
      </div>
    </div>
  );
}
