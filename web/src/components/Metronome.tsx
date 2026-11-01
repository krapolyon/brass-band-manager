import './Metronome.css';

type Props = {
  /** The counted beats of the time signature: 4 in 4/4, 2 in 6/8 (the dotted quarter). */
  beats: number;
  /** The beat being played, counted from 0; null when nothing plays. */
  current: number | null;
};

// Figma: Metronome, and Metronome/Beat inside it. The visual metronome of the
// Live mode (1.1.0, issue #76): one beat per counted beat, the first a short
// bar so that it is never told by colour alone, the others dots; the beat
// being played is larger, in the accent. It is decoration for the eyes: a
// screen reader that said every beat would never stop.
export function Metronome({ beats, current }: Props) {
  return (
    <div className="Metronome" aria-hidden="true">
      {Array.from({ length: Math.max(1, beats) }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the beats of a measure never change places
          key={index}
          className="Metronome-beat"
          data-kind={index === 0 ? 'first' : 'other'}
          data-state={index === current ? 'now' : 'idle'}
        />
      ))}
    </div>
  );
}
