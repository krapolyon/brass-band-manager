import type { ReactNode } from 'react';
import './GigInfos.css';

type Row = { label: string; value: ReactNode; strong?: boolean };

type Props = {
  /** The heading of the card: "Infos". */
  title: string;
  /** Figma: the rows Déguiz, Brasseurs and Infos diverses. A row without a value is left out by the screen. */
  rows: Row[];
  /** The level of its heading: 2 on the screen of the gig, 3 beside the list. */
  headingLevel?: 2 | 3;
};

// Figma: Gig/Infos. What else to know about a gig: its costumes, its
// organisers (Member/Mention) and its free notes. A label and its value sit
// side by side, and the value goes under the label when the text grows.
export function GigInfos({ title, rows, headingLevel = 2 }: Props) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="GigInfos">
      <Heading className="textHeading">{title}</Heading>
      <dl>
        {rows.map((row) => (
          <div key={row.label} className="GigInfos-row">
            <dt className="textBody">{row.label}</dt>
            <dd className={row.strong ? 'textBodyStrong' : 'textBody'}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
