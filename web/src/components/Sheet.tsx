import type { ReactNode } from 'react';
import './Sheet.css';

type Props = {
  /** Figma: "Title" and "Show title". */
  title?: string;
  /** Figma: the Content slot. */
  children: ReactNode;
};

// Figma: Sheet. The opaque surface that carries content, as opposed to glass,
// which floats. Groups fields, rows or a summary.
export function Sheet({ title, children }: Props) {
  return (
    <section className="Sheet">
      {title && <h2 className="textHeading">{title}</h2>}
      <div className="Sheet-content">{children}</div>
    </section>
  );
}
