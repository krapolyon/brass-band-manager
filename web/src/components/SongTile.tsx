import { Icon } from './Icon.tsx';
import './SongTile.css';

type Props = {
  /** The cover art of the song. Null: the placeholder (Figma: "Has cover" off). */
  coverUrl: string | null;
  /** Small: 44, the mini-player and the table. Medium: 56, a row. Large: the
   *  grid, as wide as its column. Hero: the top of the song, full width, no radius. */
  size?: 'small' | 'medium' | 'large' | 'hero';
};

// Figma: Song/Tile. The cover of a song, square, cropped by its centre. The
// image is decoration: the name of the song is always written next to it.
export function SongTile({ coverUrl, size = 'medium' }: Props) {
  return (
    <span className="SongTile" data-size={size}>
      {coverUrl ? (
        <img src={coverUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <Icon name="Music" size={size === 'small' ? 20 : 24} />
      )}
    </span>
  );
}
