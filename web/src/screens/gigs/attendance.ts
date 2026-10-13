import type { AttendanceAnswer } from '../../components/AttendanceChoices.tsx';
import type { GigSlot } from '../../gigs.ts';
import { instrumentsOf, type Member, type Section } from '../../members.ts';

// Who comes to a slot, section by section: what the API answers (the answers
// given) put together with the directory (who could answer).

export type Attendee = {
  memberId: number;
  nickname: string;
  /** The instrument of the member; empty for a member who left. */
  instrument: string;
  photoUrl: string | null;
  /** Null: no answer yet. */
  answer: AttendanceAnswer | null;
};

export type SectionAttendance = { section: Section; attendees: Attendee[]; yesCount: number };

export type Attendance = {
  sections: SectionAttendance[];
  /** How many current members there are, and how many of them gave each answer. */
  memberCount: number;
  counts: Record<AttendanceAnswer | 'NONE', number>;
};

const rank: Record<AttendanceAnswer | 'NONE', number> = {
  YES: 0,
  MAYBE: 1,
  IF_NEEDED: 2,
  NO: 3,
  NONE: 4,
};

/**
 * @param withFormer Also the members who left and had answered: who played a gig already over.
 */
export function attendanceOf(
  slot: GigSlot,
  members: Member[],
  sections: Section[],
  language: string,
  withFormer = false,
): Attendance {
  const instruments = instrumentsOf(sections);
  const current = members.filter(
    (member) => member.status === 'ACTIVE' || member.status === 'POWER_MEMBER',
  );
  const answers = new Map(slot.answers.map((answer) => [answer.memberId, answer]));

  const attendees: (Attendee & { sectionId: number })[] = current.map((member) => {
    const instrument = instruments.find((one) => one.id === member.instrumentId);
    return {
      memberId: member.id,
      nickname: member.nickname,
      instrument: instrument?.name ?? '',
      photoUrl: member.photoUrl,
      answer: answers.get(member.id)?.answer ?? null,
      sectionId: instrument?.sectionId ?? 0,
    };
  });
  if (withFormer) {
    for (const answer of slot.answers.filter((one) => !one.isCurrentMember)) {
      attendees.push({
        memberId: answer.memberId,
        nickname: answer.nickname,
        instrument: '',
        photoUrl: null,
        answer: answer.answer,
        sectionId: answer.sectionId,
      });
    }
  }

  const counts = { YES: 0, NO: 0, MAYBE: 0, IF_NEEDED: 0, NONE: 0 };
  for (const attendee of attendees) counts[attendee.answer ?? 'NONE'] += 1;

  return {
    memberCount: attendees.length,
    counts,
    // Only the sections someone plays in: an empty section blocks nothing.
    sections: sections
      .map((section) => {
        const inSection = attendees
          .filter((attendee) => attendee.sectionId === section.id)
          .sort(
            (a, b) =>
              rank[a.answer ?? 'NONE'] - rank[b.answer ?? 'NONE'] ||
              a.nickname.localeCompare(b.nickname, language),
          );
        return {
          section,
          attendees: inSection,
          yesCount: inSection.filter((attendee) => attendee.answer === 'YES').length,
        };
      })
      .filter(({ attendees: inSection }) => inSection.length > 0),
  };
}
