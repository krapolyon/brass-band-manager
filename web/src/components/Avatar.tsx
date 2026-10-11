import './Avatar.css';

type Props = {
  /** The address of the photo; null when the member has none. */
  photoUrl: string | null;
  /** Shown when there is no photo: one or two letters of the nickname. */
  initials: string;
  /** Small 40 (rows), medium 56 (headers of a list), large 96 (the member's own sheet). */
  size?: 'small' | 'medium' | 'large';
};

const textStyle = { small: 'textLabel', medium: 'textHeading', large: 'textTitle' };

/** The initials of a nickname: the first letter of its first two words ("Le Grand Jacques" gives "LG"). */
export function initialsOf(nickname: string): string {
  const words = nickname.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toUpperCase();
}

// Figma: Avatar. The face of a member: their photo, or their initials when
// they have none. Decoration for assistive technology: the nickname beside it
// names the member.
export function Avatar({ photoUrl, initials, size = 'small' }: Props) {
  return (
    <span className={`Avatar ${textStyle[size]}`} data-size={size} aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" /> : initials}
    </span>
  );
}
