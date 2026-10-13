import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { Link } from 'react-router';
import './SetlistSongRow.css';

type Props = {
  /** View: in a gig. Edit: in the form of a setlist, with its buttons. */
  mode?: 'view' | 'edit';
  position: number;
  name: string;
  /** View: where touching the song leads. */
  to?: string;
  /** Edit: the "more" button and the drag handle. */
  children?: ReactNode;
  /** Edit: what makes the row one of a SortableList (the `row` of useSortableRow). */
  row?: HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement> };
};

// Figma: SetlistSong/Row. A song at its place in a setlist: its position and
// the name the band gives it, large enough to read on stage. No cover, no
// original artist.
export function SetlistSongRow({ mode = 'view', position, name, to, children, row }: Props) {
  const content = (
    <>
      <span className="SetlistSongRow-position textLabel">{position}</span>
      <span className="SetlistSongRow-name textBodyLarge">{name}</span>
    </>
  );

  return (
    <li className="SetlistSongRow" data-mode={mode} {...row}>
      {to ? (
        <Link className="SetlistSongRow-link" to={to}>
          {content}
        </Link>
      ) : (
        content
      )}
      {children}
    </li>
  );
}
