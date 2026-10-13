import { Icon } from './Icon.tsx';
import './RatingStar.css';

type Props = {
  /** Figma: Fill. */
  fill: 'full' | 'half' | 'empty';
};

// Figma: RatingStar. One star of a Rating: the filled star in the accent,
// the outlined one muted, or the outlined one with its left half filled. The
// shape changes with the value, so it is never told by colour alone.
export function RatingStar({ fill }: Props) {
  return (
    <span className="RatingStar" data-fill={fill}>
      <Icon name="Star" size={16} filled={fill === 'full'} />
      {fill === 'half' && (
        <span className="RatingStar-half">
          <Icon name="Star" size={16} filled />
        </span>
      )}
    </span>
  );
}
