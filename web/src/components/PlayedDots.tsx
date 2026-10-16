import './PlayedDots.css';

type Props = {
  /** How many times the song is played elsewhere in the gig. Three dots at most; none at 0. */
  count: number;
};

// Figma: PlayedDots. How many times a song is played elsewhere in a gig, as
// plain dots: one per time, three at most. Never alone: the row that holds it
// says the same in words to screen readers.
export function PlayedDots({ count }: Props) {
  const dots = Math.min(3, Math.max(0, count));
  if (dots === 0) return null;
  return (
    <span className="PlayedDots" aria-hidden="true">
      {Array.from({ length: dots }, (_, dot) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical dots, always in the same order
        <span key={dot} />
      ))}
    </span>
  );
}
