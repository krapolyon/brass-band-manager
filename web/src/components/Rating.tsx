import { RatingStar } from './RatingStar.tsx';
import './Rating.css';

const stars = [1, 2, 3, 4, 5];

type Props = {
  /** From 1 to 5, drawn rounded to the half. Null: nobody answered, the five stars are empty. */
  average: number | null;
  /** Figma: Value. What is written under the stars: "4,1 · 12 rép.", or "pas de réponse". */
  text: string;
  /** The whole of it in one sentence, for screen readers: "Maîtrise : 4,1 sur 5, 12 réponses". */
  label: string;
};

function fillOf(star: number, halves: number) {
  if (halves >= star * 2) return 'full';

  return halves === star * 2 - 1 ? 'half' : 'empty';
}

// Figma: Rating. An average of the band as five stars, then the value and
// the number of answers. For screen readers it is one image with one
// sentence: the stars and the short text are not read one by one.
export function Rating({ average, text, label }: Props) {
  // In halves of a star: 4.6 is nine halves, four stars and a half.
  const halves = average === null ? 0 : Math.round(Math.min(5, Math.max(0, average)) * 2);

  return (
    <span className="Rating" role="img" aria-label={label}>
      <span className="Rating-stars" aria-hidden="true">
        {stars.map((star) => (
          <RatingStar key={star} fill={fillOf(star, halves)} />
        ))}
      </span>
      <span className="Rating-value textCaption" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
