import { type ReactNode, useId } from 'react';
import './Sheet.css';

type Props = {
  /** Figma: "Title" and "Show title". */
  title?: string;
  /** Figma: the Content slot. */
  children: ReactNode;
  /** The place a Message sends to: it can then take the focus. */
  id?: string;
  /** Outlined with the accent: something to do here (a song not rated yet). */
  outlined?: boolean;
};

// Figma: Sheet. The opaque surface that carries content, as opposed to glass,
// which floats. Groups fields, rows or a summary.
export function Sheet({ title, children, id, outlined = false }: Props) {
  const headingId = useId();
  // A sheet a Message sends to is named by its title, so that the focus that
  // lands on it says where it is.
  const isNamed = id !== undefined && title !== undefined;

  return (
    <section
      className="Sheet"
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-labelledby={isNamed ? headingId : undefined}
      data-outlined={outlined || undefined}
    >
      {title && (
        <h2 className="textHeading" id={isNamed ? headingId : undefined}>
          {title}
        </h2>
      )}
      <div className="Sheet-content">{children}</div>
    </section>
  );
}
