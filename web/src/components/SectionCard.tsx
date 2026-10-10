import type { ReactNode } from 'react';
import { IconButton } from './IconButton.tsx';
import { ListRow } from './ListRow.tsx';
import './SectionCard.css';

type Props = {
  /** An id for the card, when a screen needs to find it. */
  id?: string;
  /** The band's own word for the section: never translated. */
  name: string;
  /** Figma: the Instruments slot. InstrumentRow elements, in the order of the band. */
  children?: ReactNode;
  /** Figma: "Show edit". The pencil, and what it does in words. */
  onEdit?: () => void;
  editLabel?: string;
  /** Figma: "Show add". The last line, which adds an instrument to the section. */
  onAdd?: () => void;
  addLabel?: string;
};

// Figma: Section/Card. A section of the band with its instruments. Leave out
// onEdit and onAdd where the member cannot manage sections.
export function SectionCard({ id, name, children, onEdit, editLabel, onAdd, addLabel }: Props) {
  return (
    <section className="SectionCard" id={id}>
      <header className="SectionCard-header">
        <h2 className="textHeading">{name}</h2>
        {onEdit && editLabel && (
          <IconButton icon="Pencil" tone="muted" label={editLabel} onClick={onEdit} />
        )}
      </header>
      <div className="SectionCard-instruments">{children}</div>
      {onAdd && addLabel && <ListRow add label={addLabel} onPress={onAdd} />}
    </section>
  );
}
