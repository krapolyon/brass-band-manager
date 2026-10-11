import { Avatar, initialsOf } from './Avatar.tsx';
import { Icon } from './Icon.tsx';
import { SectionBadge } from './SectionBadge.tsx';
import './MemberCard.css';

type Props = {
  nickname: string;
  instrument: string;
  /** The pictogram of the section of the instrument. */
  sectionIcon: string | null;
  photoUrl: string | null;
  /** Figma: "Power member": the mark beside the nickname, with its name for screen readers. */
  powerMemberLabel?: string;
  onPress: () => void;
};

// Figma: Member/Card. A member in the directory: a round photo with the
// pictogram of the section as a badge, the nickname, the instrument. The
// whole card opens the member's sheet.
export function MemberCard({
  nickname,
  instrument,
  sectionIcon,
  photoUrl,
  powerMemberLabel,
  onPress,
}: Props) {
  return (
    <button type="button" className="MemberCard" aria-haspopup="dialog" onClick={onPress}>
      <span className="MemberCard-portrait">
        <Avatar photoUrl={photoUrl} initials={initialsOf(nickname)} size="large" />
        <SectionBadge icon={sectionIcon} />
      </span>
      <span className="MemberCard-texts">
        <span className="MemberCard-nickname textBodyStrong">
          {nickname}
          {powerMemberLabel && (
            <>
              <Icon name="Biceps" size={20} />
              <span className="visuallyHidden">{powerMemberLabel}</span>
            </>
          )}
        </span>
        <span className="MemberCard-instrument textCaption">{instrument}</span>
      </span>
    </button>
  );
}
