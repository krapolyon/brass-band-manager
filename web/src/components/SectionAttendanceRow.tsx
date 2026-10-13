import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from './Chip.tsx';
import { SectionBadge } from './SectionBadge.tsx';
import './SectionAttendanceRow.css';

type Props = {
  /** The value of section.icon; null for the generic pictogram. */
  icon: string | null;
  /** Figma: "Name". The name of the section, followed by "· ton pupitre" for the member's own. */
  name: ReactNode;
  /** Figma: "Members". Who said yes, then maybe and if needed. */
  members?: ReactNode;
  /** How many members of the section said yes. */
  yesCount: number;
};

// Figma: Section/AttendanceRow. A section in the answers of a gig slot. A
// section without a yes is what keeps a slot from being playable: its count
// turns to a warning, with an icon, never by colour alone. The row wraps when
// the text grows: the count goes under the names.
export function SectionAttendanceRow({ icon, name, members, yesCount }: Props) {
  const { t } = useTranslation();

  return (
    <div className="SectionAttendanceRow">
      <SectionBadge icon={icon} />
      <div className="SectionAttendanceRow-texts">
        <span className="textBodyStrong">{name}</span>
        {members && <span className="textCaption">{members}</span>}
      </div>
      <Chip kind={yesCount > 0 ? 'success' : 'warning'} icon={yesCount > 0 ? 'Check' : 'Alert'}>
        {t('gigs.whoComes.yesCount', { count: yesCount })}
      </Chip>
    </div>
  );
}
