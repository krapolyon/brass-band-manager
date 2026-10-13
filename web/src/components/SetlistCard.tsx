import type { ReactNode } from 'react';
import { Chip } from './Chip.tsx';
import { Icon } from './Icon.tsx';
import './SetlistCard.css';

type Props = {
  /** Figma: "Open". One card is open at a time; touching its heading opens or closes it. */
  open: boolean;
  onToggle: () => void;
  /** "Setlist n° 1". */
  title: string;
  /** "Déambulation, 45 min · 6 morceaux". */
  description: string;
  /** Figma: "Show live": the chip "En direct · 3/6". */
  live?: string;
  /** The level of its title: 2 on the screen of the gig, 3 beside the list. */
  headingLevel?: 2 | 3;
  /** Figma: the Songs slot: one SetlistSongRow per song. */
  children?: ReactNode;
  /** Figma: "Show start live" and "Show edit": the Buttons under the songs. */
  actions?: ReactNode;
};

// Figma: Setlist/Card. A setlist of a gig, as an accordion. Open: its songs
// and its actions. Closed: its number, its description and its count of songs.
export function SetlistCard({
  open,
  onToggle,
  title,
  description,
  live,
  headingLevel = 2,
  children,
  actions,
}: Props) {
  const Heading = `h${headingLevel}` as const;

  return (
    <section className="SetlistCard">
      <Heading className="SetlistCard-heading">
        <button type="button" aria-expanded={open} onClick={onToggle}>
          <span className="SetlistCard-texts">
            {live && (
              <Chip kind="accent" icon="Play" iconFilled>
                {live}
              </Chip>
            )}
            <span className="textHeading">{title}</span>
            <span className="SetlistCard-description textCaption">{description}</span>
          </span>
          <span className="SetlistCard-toggle">
            <Icon name={open ? 'ChevronDown' : 'ChevronRight'} />
          </span>
        </button>
      </Heading>
      {open && (
        <>
          {children && <ol className="SetlistCard-songs">{children}</ol>}
          {actions && <div className="SetlistCard-actions">{actions}</div>}
        </>
      )}
    </section>
  );
}
