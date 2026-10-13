import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import { Pictogram } from './Pictogram.tsx';
import './SongPartTrack.css';

type Props = {
  /** The instrument, or the name the file gives to a track nobody recognises. */
  name: string;
  /** The pictogram of the section of the instrument (section.icon). */
  pictogram: string | null;
  /** The track of the member's own instrument: its pictogram on the accent, its name stronger, its notes thicker and in the accent. */
  own?: boolean;
  /** Said to screen readers after the name of the member's own track: the accent alone tells nobody. */
  ownLabel?: string;
  /** Cut: the others go on, this one is silent or nearly. */
  muted?: boolean;
  onToggleMute: () => void;
  /** What the mute button does, with the name of the track: "Couper Trompette". */
  muteLabel: string;
  /** The lane: the notes of the track around where the song is. */
  children?: ReactNode;
};

// Figma: SongPart/Track. One instrument in the MIDI player: its pictogram,
// its name, the lane of its notes and its mute. The lane is a drawing, said
// to no screen reader; what it tells (which track is cut) is carried by the
// button, pressed or not.
export function SongPartTrack(props: Props) {
  const { name, pictogram, own = false, ownLabel, muted = false } = props;
  const { onToggleMute, muteLabel, children } = props;

  return (
    <div className="SongPartTrack" data-own={own} data-muted={muted}>
      <span className="SongPartTrack-pictogram">
        <Pictogram name={pictogram} size={16} />
      </span>
      <span className={`SongPartTrack-name ${own ? 'textBodyStrong' : 'textLabel'}`}>
        {name}
        {own && ownLabel && <span className="visuallyHidden">, {ownLabel}</span>}
      </span>
      <span className="SongPartTrack-lane" aria-hidden="true">
        {children}
      </span>
      <button
        className="SongPartTrack-mute"
        type="button"
        aria-pressed={muted}
        aria-label={muteLabel}
        onClick={onToggleMute}
      >
        <Icon name={muted ? 'VolumeOff' : 'Volume'} size={20} />
      </button>
    </div>
  );
}
