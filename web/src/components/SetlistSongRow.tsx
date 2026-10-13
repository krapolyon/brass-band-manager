import type { ReactNode } from 'react';
import { Link } from 'react-router';
import './SetlistSongRow.css';

type Props = {
  /** View: in a gig. Edit: in the form of a setlist, with its buttons. */
  mode?: 'view' | 'edit';
  position: number;
  name: string;
  /** View: where touching the song leads. */
  to?: string;
  /** Edit: the "more" button and the drag handle, as IconButtons. */
  children?: ReactNode;
};

// Figma: SetlistSong/Row. A song at its place in a setlist: its position and
// the name the band gives it, large enough to read on stage. No cover, no
// original artist.
export function SetlistSongRow({ mode = 'view', position, name, to, children }: Props) {
  const content = (
    <>
      <span className="SetlistSongRow-position textLabel">{position}</span>
      <span className="SetlistSongRow-name textBodyLarge">{name}</span>
    </>
  );

  return (
    <li className="SetlistSongRow" data-mode={mode}>
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
