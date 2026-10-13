import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { SongSummary } from '../songs.ts';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import { SongTile } from './SongTile.tsx';
import './SongHeader.css';

type Props = {
  song: Pick<SongSummary, 'name' | 'originalArtist' | 'coverUrl'>;
  /** Large: a phone, the cover across the top. Compact: a tablet and the pane of a desktop, the cover beside the name. */
  size: 'large' | 'compact';
  /** What leads back to the list. Absent on a desktop, where the list is beside the song. */
  back?: { to: string; label: string };
  /** The button that opens the other actions of the song. */
  more?: { label: string; onPress: () => void };
  /** The ModeBar of the song. */
  modeBar: ReactNode;
  /** The level of the heading that carries the name: 2 beside a list that already has the title of the page. */
  headingLevel?: 1 | 2;
  /** Large: the content of the panel, under the name. Compact: what follows the mode bar. */
  children?: ReactNode;
};

// Figma: Song/Header. The top of the screen of a song, which has no
// ScreenTop: its header is the cover.
//
// Large: the cover fills the width; the back and more buttons and the mode
// bar float over it in glass; the name and the artist are on a panel whose
// rounded top corners overlap the cover, and the content of the screen
// follows on that panel. Compact: the cover beside the name, then the mode
// bar, over the halo of the screen.
//
// Whatever floats over the cover is set to the Dark scheme in Figma, since a
// cover can be of any colour: the element carries data-scheme, which
// tokens.css reads, and becomes dark high contrast when high contrast is on.
export function SongHeader({ song, size, back, more, modeBar, headingLevel = 1, children }: Props) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const bar = (back || more) && (
    <div className="SongHeader-bar">
      {back && (
        // An IconButton that leads somewhere: a link drawn as the button.
        <Link className="IconButton" data-kind="glass" to={back.to} aria-label={back.label}>
          <Icon name="ChevronLeft" />
        </Link>
      )}
      {more && <IconButton kind="glass" icon="More" label={more.label} onClick={more.onPress} />}
    </div>
  );

  if (size === 'compact') {
    return (
      <div className="SongHeader" data-size="compact">
        <div className="SongHeader-top" data-scheme="dark">
          {/* The halo of a song: its cover, heavily blurred, lights the top.
              Decoration; the high contrast modes remove it. */}
          {song.coverUrl && (
            <span
              className="SongHeader-halo"
              aria-hidden="true"
              style={{ backgroundImage: `url("${song.coverUrl}")` }}
            />
          )}
          {bar}
          <div className="SongHeader-identity">
            <SongTile coverUrl={song.coverUrl} size="large" />
            <div className="SongHeader-titles">
              <Heading className="textTitle">{song.name}</Heading>
              <p className="textBody">{song.originalArtist}</p>
            </div>
          </div>
          {modeBar}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="SongHeader" data-size="large">
      <div className="SongHeader-hero" data-scheme="dark">
        <SongTile coverUrl={song.coverUrl} size="hero" />
        {bar}
        <div className="SongHeader-modes">{modeBar}</div>
      </div>
      <div className="SongHeader-panel">
        <div className="SongHeader-titles">
          <Heading className="textDisplay">{song.name}</Heading>
          <p className="textBodyLarge">{song.originalArtist}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
