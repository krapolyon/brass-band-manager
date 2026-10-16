import { Icon } from './Icon.tsx';
import { PlayedDots } from './PlayedDots.tsx';
import './SongPickerRow.css';

type Props = {
  name: string;
  /** Figma: State=InSetlist. The song is already in this setlist: a tick instead of the plus. */
  inSetlist: boolean;
  /** Figma: Show played. The times the song is in every setlist of the gig, this one included. */
  played: number;
  /** The whole row says what a tap does, the state included, to screen readers. */
  label: string;
  onPick: () => void;
};

// Figma: Song/PickerRow. A song in the list that adds songs to a setlist: a
// plus, or a filled tick in the accent when the song is already in this
// setlist; the name; the dots of the gig. A tap appends the song, and a
// second tap appends it again.
export function SongPickerRow({ name, inSetlist, played, label, onPick }: Props) {
  return (
    <li className="SongPickerRow">
      <button
        type="button"
        data-state={inSetlist ? 'inSetlist' : 'default'}
        aria-label={label}
        onClick={onPick}
      >
        {inSetlist ? <Icon name="Check" filled /> : <Icon name="Plus" />}
        <span className="SongPickerRow-name textBodyLarge">{name}</span>
        <PlayedDots count={played} />
      </button>
    </li>
  );
}
