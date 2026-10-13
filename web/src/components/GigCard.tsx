import type { ReactNode } from 'react';
import { Link } from 'react-router';
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
  /** Figma: "Show new". A line above the card, for 15 days after the gig leaves the draft. */
  showNew?: boolean;
  /** The word of the chip of that line: "Nouveau". */
  newLabel?: string;
  /** Figma: "New text": "Proposé hier". */
  newText?: string;
  /** Figma: "Show answers". The four answers under the card, on the home screen. */
  showAnswers?: boolean;
  /** The nested Attendance/Choices, Small. */
  answers?: ReactNode;
  /**
   * The screen of the gig. With it the card is its own link, and the answers
   * stay outside the link; without it, the card is drawn inside the link of
   * whoever lists it.
   */
  to?: string;
};

// Figma: Gig/Card. A gig in the list: its own card. The link that opens the
// gig gives it its name for screen readers: the one it is drawn in, or its
// own (`to`), which then covers the whole card but its answers.
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
  showNew = false,
  newLabel,
  newText,
  showAnswers = false,
  answers,
  to,
}: Props) {
  const card = (
    <>
      {showNew && (
        <span className="GigCard-new textCaption">
          <span className="GigCard-newChip">{newLabel}</span>
          <span>{newText}</span>
        </span>
      )}
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
    </>
  );

  if (!to) {
    return (
      <span className="GigCard" data-state={state}>
        {card}
      </span>
    );
  }
  return (
    <div className="GigCard" data-state={state}>
      <Link className="GigCard-link" to={to}>
        {card}
      </Link>
      {showAnswers && <div className="GigCard-answers">{answers}</div>}
    </div>
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
