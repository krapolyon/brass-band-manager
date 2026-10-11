import { Pictogram } from './Pictogram.tsx';
import './SectionBadge.css';

type Props = {
  /** The value of section.icon; null for the generic pictogram. */
  icon: string | null;
};

// Figma: Section/Badge. The pictogram of a section on the accent colour, as
// a badge on the photo of a member. Decoration: the instrument is written
// beside it.
export function SectionBadge({ icon }: Props) {
  return (
    <span className="SectionBadge">
      <Pictogram name={icon} size={20} />
    </span>
  );
}
