import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './GigCard.css';

type Props = {
  /** Figma: "Playable". The banner on top, while it matters: not for a draft, a cancelled or a confirmed gig. */
  playable?: 'none' | 'playable' | 'missing';
  /** Figma: "Playable text": "Jouable", "Manque : Souba". */
  playableText?: string;
  /** Figma: "State". Selected: the gig open beside the list, on a desktop. */
  state?: 'default' | 'selected';
  /** The three lines of the date block: "sam.", "24" (or "4–6"), "oct.". */
  weekday: string;
  day: string;
  month: string;
  name: string;
  place?: string;
  time?: string;
  /** The pills: the status and the answer of the member, as Chips. */
  children?: ReactNode;
};

// Figma: Gig/Card. A gig in the list: its own card. It is drawn inside the
// link that opens the gig, which gives it its name for screen readers.
export function GigCard({
  playable = 'none',
  playableText,
  state = 'default',
  weekday,
  day,
  month,
  name,
  place,
  time,
  children,
}: Props) {
  return (
    <span className="GigCard" data-state={state}>
      {playable !== 'none' && (
        <span className="GigCard-playable textCaption" data-playable={playable}>
          <Icon name={playable === 'playable' ? 'Check' : 'Alert'} size={16} />
          <span>{playableText}</span>
        </span>
      )}
      <span className="GigCard-top">
        <span className="GigCard-date">
          <span className="textCaption">{weekday}</span>
          <span className="GigCard-day textHeading">{day}</span>
          <span className="textCaption">{month}</span>
        </span>
        <span className="GigCard-texts">
          <span className="GigCard-name textBodyLarge">{name}</span>
          {place && <span className="GigCard-place textCaption">{place}</span>}
          {time && <span className="GigCard-time textCaption">{time}</span>}
          {children && <span className="GigCard-pills">{children}</span>}
        </span>
      </span>
    </span>
  );
}

// Figma: Gig/Card, State=Loading. A card that is coming: grey shapes of its size.
export function GigCardLoading() {
  return (
    <span className="GigCard" data-state="loading" aria-hidden="true">
      <span className="GigCard-top">
        <span className="GigCard-date" />
        <span className="GigCard-texts">
          <span className="GigCard-line" data-width="long" />
          <span className="GigCard-line" data-width="medium" />
          <span className="GigCard-line" data-width="short" />
          <span className="GigCard-line" data-width="pills" />
        </span>
      </span>
    </span>
  );
}
