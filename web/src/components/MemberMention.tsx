import { Avatar, initialsOf } from './Avatar.tsx';
import './MemberMention.css';

type Props = {
  nickname: string;
  /** Figma: "Detail" and "Show detail": the instrument, most often. */
  detail?: string;
  photoUrl: string | null;
};

// Figma: Member/Mention. A member named inside another component: the
// signed-in member at the foot of the menu, later the organisers of a gig.
export function MemberMention({ nickname, detail, photoUrl }: Props) {
  return (
    <span className="MemberMention">
      <Avatar photoUrl={photoUrl} initials={initialsOf(nickname)} />
      <span className="MemberMention-texts">
        <span className="textBodyStrong">{nickname}</span>
        {detail && <span className="MemberMention-detail textCaption">{detail}</span>}
      </span>
    </span>
  );
}
