import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { SongSummary } from '../songs.ts';
import { SongTile } from './SongTile.tsx';
import './SongRow.css';

type Props = {
  song: SongSummary;
  /** The screen of the song: the whole row opens it. */
  to: string;
  /** Figma: State. Selected: the song open beside the list, on a desktop. */
  state?: 'default' | 'selected';
  /** Figma: "Show status". A Chip, given only when the status is not the ordinary one. */
  status?: ReactNode;
};

// Figma: Song/Row. A song in the list: its cover, the name the band gives it
// and the original artist. The status never moves the texts: it sits at the
// end of the row, and from a text size of 160 % under the artist, so that the
// name keeps its room (SongRow.css).
export function SongRow({ song, to, state = 'default', status }: Props) {
  return (
    <Link
      className="SongRow"
      to={to}
      data-state={state}
      aria-current={state === 'selected' ? 'true' : undefined}
    >
      <SongTile coverUrl={song.coverUrl} size="medium" />
      <span className="SongRow-texts">
        <span className="SongRow-name textBodyStrong">{song.name}</span>
        <span className="SongRow-artist textCaption">{song.originalArtist}</span>
      </span>
      {status && <span className="SongRow-status">{status}</span>}
    </Link>
  );
}
