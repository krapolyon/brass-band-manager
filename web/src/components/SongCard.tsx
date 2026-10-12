import { Link } from 'react-router';
import type { SongSummary } from '../songs.ts';
import { SongTile } from './SongTile.tsx';
import './SongCard.css';

type Props = {
  song: SongSummary;
  /** The screen of the song: the whole card opens it. */
  to: string;
};

// Figma: Song/Card. A song in the grid: the cover takes the width of the
// column, then the name and the original artist. Figma gives it no status.
export function SongCard({ song, to }: Props) {
  return (
    <Link className="SongCard" to={to}>
      <SongTile coverUrl={song.coverUrl} size="large" />
      <span className="SongCard-texts">
        <span className="SongCard-name textBodyStrong">{song.name}</span>
        <span className="SongCard-artist textCaption">{song.originalArtist}</span>
      </span>
    </Link>
  );
}
