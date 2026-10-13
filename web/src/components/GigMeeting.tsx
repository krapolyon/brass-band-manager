import type { ReactNode } from 'react';
import './GigMeeting.css';

type Props = {
  /** The heading of the card: "Rendez-vous". */
  label: string;
  /** Figma: "Time": "9 h 30". */
  time: string;
  /** Figma: "Spot" and "Show spot": the name of the place. */
  spot?: string;
  /** Figma: "Address". */
  address?: string;
  /** Figma: "Show map": the map of the meeting point, a GigMeetingMap. */
  map?: ReactNode;
  /** "Y aller" and "Copier l'adresse", as Buttons. */
  children?: ReactNode;
  /** The level of its heading: 2 on the screen of the gig, 3 beside the list. */
  headingLevel?: 2 | 3;
};

// Figma: Gig/Meeting. Where and when the band meets: first on a confirmed
// gig, with the map of the place when the gig has coordinates.
export function GigMeeting({ label, time, spot, address, map, children, headingLevel = 2 }: Props) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="GigMeeting">
      <div className="GigMeeting-texts">
        <Heading className="GigMeeting-label textLabel">{label}</Heading>
        <p className="textDisplay">{time}</p>
        {spot && <p className="textBodyStrong">{spot}</p>}
        {address && <p className="GigMeeting-address textBody">{address}</p>}
      </div>
      {map}
      {children && <div className="GigMeeting-actions">{children}</div>}
    </section>
  );
}
