import { Link } from 'react-router';
import type { SongSummary } from '../songs.ts';
import { IconButton } from './IconButton.tsx';
import { SongTile } from './SongTile.tsx';
import './SongMention.css';

type Props = {
  song: Pick<SongSummary, 'name' | 'coverUrl'>;
  /** Figma: Progress. "1:12 sur 3:52". */
  detail: string;
  /** The screen of the song: the cover and the name open it. */
  to: string;
  playing: boolean;
  onToggle: () => void;
  /** What the first button does now: "Mettre en pause" while playing, "Lire" otherwise. */
  toggleLabel: string;
  onClose: () => void;
  closeLabel: string;
};

// Figma: Song/Mention. The song that is playing, kept above the tab bar
// while the member moves around the app: the cover, the name, the progress,
// play or pause, close. In glass. Where it stands is decided by what shows it.
export function SongMention({
  song,
  detail,
  to,
  playing,
  onToggle,
  toggleLabel,
  onClose,
  closeLabel,
}: Props) {
  return (
    <div className="SongMention">
      <Link className="SongMention-song" to={to}>
        <SongTile coverUrl={song.coverUrl} size="small" />
        <span className="SongMention-texts">
          <span className="SongMention-name textBodyStrong">{song.name}</span>
          <span className="SongMention-detail textCaption">{detail}</span>
        </span>
      </Link>
      <IconButton icon={playing ? 'Pause' : 'Play'} label={toggleLabel} onClick={onToggle} />
      <IconButton icon="Close" label={closeLabel} onClick={onClose} />
    </div>
  );
}
