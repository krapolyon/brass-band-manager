import type { ReactNode } from 'react';
import './GigSlotWhoComes.css';

type Props = {
  /** Figma: "Title": "Qui vient". */
  title: string;
  /** Figma: "Count": "12 oui sur 24". */
  count: string;
  /** Figma: "Show message": a Message that says whether the slot is playable. */
  message?: ReactNode;
  /** Figma: the Content slot and "Show content": the share of answers, then one SectionAttendanceRow per section. */
  children?: ReactNode;
  /**
   * Figma: "Show reminder", "Pending" and "Last reminder": how many have not
   * answered, when they were last reminded, and "Relancer", a Button.
   */
  reminder?: { pending: string; last?: string; action: ReactNode };
  /** The way to every answer: a Button. */
  action?: ReactNode;
  /** The level of its heading: 2 on the screen of the gig, 3 beside the list. */
  headingLevel?: 2 | 3;
};

// Figma: GigSlot/WhoComes. Who comes to a slot. Used on a gig with one slot,
// and in the panel of a slot of a gig of several days. The reminder row is
// for who may edit the gig.
export function GigSlotWhoComes({
  title,
  count,
  message,
  children,
  reminder,
  action,
  headingLevel = 2,
}: Props) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="GigSlotWhoComes">
      <div className="GigSlotWhoComes-heading">
        <Heading className="textHeading">{title}</Heading>
        <span className="textCaption">{count}</span>
      </div>
      {message}
      {children && <div className="GigSlotWhoComes-content">{children}</div>}
      {reminder && (
        <div className="GigSlotWhoComes-reminder">
          <p>
            <span className="textBodyStrong">{reminder.pending}</span>
            {reminder.last && <span className="textCaption">{reminder.last}</span>}
          </p>
          {reminder.action}
        </div>
      )}
      {action}
    </section>
  );
}

export type AnswerShare = {
  key: 'yes' | 'maybe' | 'ifNeeded' | 'no' | 'none';
  count: number;
  /** The count in words: "12 oui", "3 pas répondu". */
  label: string;
};

// Figma: the share of answers, drawn by hand inside the slot of
// GigSlot/WhoComes. Each part is as wide as its share. The bar is a drawing:
// the legend under it says the same in words, with the numbers.
export function AnswerShares({ shares }: { shares: AnswerShare[] }) {
  const shown = shares.filter((share) => share.count > 0);

  return (
    <div className="AnswerShares">
      <div className="AnswerShares-bar" aria-hidden="true">
        {shown.map((share) => (
          <span key={share.key} data-answer={share.key} style={{ flexGrow: share.count }} />
        ))}
      </div>
      <ul className="AnswerShares-legend">
        {shown.map((share) => (
          <li key={share.key} className="textCaption">
            <span className="AnswerShares-dot" data-answer={share.key} />
            {share.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
