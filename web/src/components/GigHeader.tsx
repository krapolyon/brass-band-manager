import type { ReactNode } from 'react';
import './GigHeader.css';

type Props = {
  /** Large: a phone, the picture full width under the buttons. Compact: tablet and desktop, the picture beside the titles. */
  size?: 'large' | 'compact';
  /** The picture: a GigPicture. */
  picture: ReactNode;
  /** Large only: what floats over the picture, the back and more buttons. */
  top?: ReactNode;
  /** The status and whether the gig is playable (Figma: "Show playable"), as Chips. */
  marks?: ReactNode;
  name: string;
  /** Figma: "When": "Samedi 24 octobre · RDV 17 h 30". */
  when: string;
  /** Figma: "Where" and "Show where". */
  where?: string;
  /** The level of the name: 1 when the gig is the page, 2 beside the list. */
  headingLevel?: 1 | 2;
};

// Figma: Gig/Header. The top of a gig. Over the picture the scheme is dark,
// whatever the scheme of the app: a picture can be of any colour.
export function GigHeader({
  size = 'large',
  picture,
  top,
  marks,
  name,
  when,
  where,
  headingLevel = 1,
}: Props) {
  const Name = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <header className="GigHeader" data-size={size}>
      <div className="GigHeader-picture" data-scheme="dark">
        {picture}
        {size === 'large' && top && <div className="GigHeader-top">{top}</div>}
      </div>
      <div className="GigHeader-titles">
        {marks && <div className="GigHeader-marks">{marks}</div>}
        <Name className="textTitle">{name}</Name>
        <p className="textBodyLarge">{when}</p>
        {where && <p className="GigHeader-where textBody">{where}</p>}
      </div>
    </header>
  );
}
