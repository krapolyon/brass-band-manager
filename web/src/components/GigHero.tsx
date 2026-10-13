import type { ReactNode } from 'react';
import { Link } from 'react-router';
import './GigHero.css';

type Props = {
  /** Figma: "Kicker": "Aujourd’hui · RDV dans 2 h". */
  kicker: string;
  name: string;
  /** Figma: "When": "RDV 9 h 30". */
  when?: string;
  /** Figma: "Where": the place on one line. */
  where?: string;
  /** The screen of the gig: the whole card opens it. */
  to: string;
  /** Figma: "Picture", the nested Gig/Picture. */
  picture?: ReactNode;
  /** Figma: "Action", the nested Button: "Y aller". */
  action?: ReactNode;
  /** Figma: "Status" and "My answer", as Chips. */
  children?: ReactNode;
  /** The level of the name: 2 on the home screen. */
  headingLevel?: 2 | 3;
};

// Figma: Gig/Hero. The confirmed gig of the day, first on the home screen, on
// that day only: its picture, a line that says when the band meets, the name,
// the meeting, the place, the status and the member's answer, and "Y aller".
// The name is the link, and covers the card; the action stays above it.
export function GigHero({
  kicker,
  name,
  when,
  where,
  to,
  picture,
  action,
  children,
  headingLevel = 2,
}: Props) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className="GigHero">
      <div className="GigHero-picture">{picture}</div>
      <div className="GigHero-body">
        <div className="GigHero-texts">
          <p className="GigHero-kicker textLabel">{kicker}</p>
          <Heading className="textHeading">
            <Link className="GigHero-link" to={to}>
              {name}
            </Link>
          </Heading>
          {when && <p className="textBody">{when}</p>}
          {where && <p className="GigHero-where textBody">{where}</p>}
        </div>
        {children && <div className="GigHero-pills">{children}</div>}
        {action && <div className="GigHero-action">{action}</div>}
      </div>
    </article>
  );
}
