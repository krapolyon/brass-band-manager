import { Children, type ReactNode, useId } from 'react';
import { IconButton } from './IconButton.tsx';
import './SongLatest.css';

type Props = {
  /** Figma: "Title": "Derniers morceaux au répertoire". */
  title: string;
  /** What the cross does, in words. */
  closeLabel: string;
  onClose: () => void;
  /** Figma: the slot "Songs": the SongRows, without their status. */
  children: ReactNode;
  /** The level of its title: 2 on the home screen. */
  headingLevel?: 2 | 3;
};

// Figma: Song/Latest. The latest songs of the repertoire, pinned on the home
// screen. Opaque: the ground with a border line, never glass. The songs
// scroll sideways; the cross closes the panel.
export function SongLatest({ title, closeLabel, onClose, children, headingLevel = 2 }: Props) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as const;

  return (
    <section className="SongLatest" aria-labelledby={titleId}>
      <div className="SongLatest-title">
        <Heading className="textLabel" id={titleId}>
          {title}
        </Heading>
        <IconButton icon="Close" label={closeLabel} onClick={onClose} />
      </div>
      <ul className="SongLatest-songs">
        {Children.map(children, (song) => (
          <li>{song}</li>
        ))}
      </ul>
    </section>
  );
}
