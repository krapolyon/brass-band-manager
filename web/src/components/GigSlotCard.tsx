import type { ReactNode } from 'react';
import { Chip } from './Chip.tsx';
import { Icon } from './Icon.tsx';
import './GigSlotCard.css';

type Props = {
  name: string;
  /** Figma: "Show costume": the name of the costume worn at this slot. */
  costume?: string;
  /** Figma: "Note" and "Show note". */
  note?: string;
  /** The four answers of the member: an AttendanceChoices, size small. */
  children: ReactNode;
  /** Figma: "Playable": Yes, or Missing (also "jouable si besoin"). */
  playable: 'yes' | 'missing';
  playableText: string;
  /** The count of yes, which opens who comes for this slot: a quiet Button. */
  whoComes?: ReactNode;
  /** The level of its name: 3 on the screen of the gig, 4 beside the list. */
  headingLevel?: 3 | 4;
};

// Figma: GigSlot/Card. A slot of a gig of several days (a "présence"),
// stacked on the gig.
export function GigSlotCard({
  name,
  costume,
  note,
  children,
  playable,
  playableText,
  whoComes,
  headingLevel = 3,
}: Props) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="GigSlotCard">
      <div className="GigSlotCard-heading">
        <Heading className="textBodyStrong">{name}</Heading>
        {costume && <Chip>{costume}</Chip>}
      </div>
      {note && <p className="GigSlotCard-note textCaption">{note}</p>}
      {children}
      <div className="GigSlotCard-footer">
        <span className="GigSlotCard-playable textCaption" data-playable={playable}>
          <Icon name={playable === 'yes' ? 'Check' : 'Alert'} size={16} />
          <span>{playableText}</span>
        </span>
        {whoComes}
      </div>
    </section>
  );
}
