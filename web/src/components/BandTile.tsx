import { Icon } from './Icon.tsx';
import './BandTile.css';

type Props = {
  name: string;
  /** The largest icon of the installed app; empty, the neutral icon. */
  iconUrl: string | null;
  caption: string;
};

// Figma: Band/Tile. The icon of the installed app as a phone shows it: the
// square image rounded, the name of the band under it, cut near 12
// characters as a phone cuts it (model/band.md, "Display").
export function BandTile({ name, iconUrl, caption }: Props) {
  return (
    <figure className="BandTile">
      <span className="BandTile-icon" aria-hidden="true">
        {iconUrl ? <img src={iconUrl} alt="" /> : <Icon name="Music" />}
      </span>
      <span className="BandTile-name textMicro">{name}</span>
      <figcaption className="BandTile-caption textCaption">{caption}</figcaption>
    </figure>
  );
}
