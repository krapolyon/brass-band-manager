import type { GigStatus } from '../gigs.ts';
import './GigPicture.css';

type Props = {
  status: GigStatus;
  /** The pictures of the costumes of the gig, in costume order. Empty: the picture of the status. */
  costumePictures?: string[];
};

/** The picture of each status, shipped with the app (web/public/gigPictures). */
const statusPictures: Record<GigStatus, string> = {
  DRAFT: '/gigPictures/draft.webp',
  PROPOSED: '/gigPictures/proposed.webp',
  ACCEPTED: '/gigPictures/accepted.webp',
  CONFIRMED: '/gigPictures/confirmed.webp',
  CANCELLED: '/gigPictures/cancelled.webp',
};

// Figma: Gig/Picture and Gig/Pictures. The picture at the top of a gig,
// cropped to fill: its costume when it has one, two or three costumes split
// by diagonals with a line of ground between them (the first three beyond),
// otherwise the picture of its status. A cancelled gig always shows the
// cancelled picture. Decoration: the status and the costumes are written in
// words beside it.
export function GigPicture({ status, costumePictures = [] }: Props) {
  const pictures =
    status === 'CANCELLED' || costumePictures.length === 0
      ? [statusPictures[status]]
      : costumePictures.slice(0, 3);

  return (
    <div className="GigPicture" data-count={pictures.length} aria-hidden="true">
      {pictures.map((picture) => (
        <span key={picture} className="GigPicture-part">
          <img src={picture} alt="" />
        </span>
      ))}
    </div>
  );
}
