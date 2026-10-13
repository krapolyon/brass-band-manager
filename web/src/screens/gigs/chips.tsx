import { useTranslation } from 'react-i18next';
import type { AttendanceAnswer } from '../../components/AttendanceChoices.tsx';
import { Chip } from '../../components/Chip.tsx';
import type { IconName } from '../../components/Icon.tsx';
import {
  type GigMoment,
  type GigSlotSummary,
  type GigStatus,
  isOpen,
  momentOf,
} from '../../gigs.ts';

type Dated = Parameters<typeof momentOf>[0];

const statusLook: Record<
  GigStatus,
  { kind: 'neutral' | 'info' | 'success' | 'danger'; icon: IconName }
> = {
  DRAFT: { kind: 'neutral', icon: 'Pencil' },
  PROPOSED: { kind: 'neutral', icon: 'Message' },
  ACCEPTED: { kind: 'info', icon: 'Like' },
  CONFIRMED: { kind: 'success', icon: 'Check' },
  CANCELLED: { kind: 'danger', icon: 'CalendarRemove' },
};

// Figma: Gigs / Status chips. One icon per status, so that a status is never
// carried by colour alone. A gig that was not played and whose date has
// passed reads "À clore" instead of its status, for who may edit it: the
// others keep the status, they have nothing to close.
export function StatusChip({ gig }: { gig: Dated & { canEdit: boolean } }) {
  const { t } = useTranslation();

  if (gig.canEdit && momentOf(gig) === 'toClose') {
    return (
      <Chip kind="warning" icon="Alert">
        {t('gigs.status.toClose')}
      </Chip>
    );
  }
  const look = statusLook[gig.status];
  return (
    <Chip kind={look.kind} icon={look.icon}>
      {t(`gigs.status.${gig.status}`)}
    </Chip>
  );
}

// What the dates add to a confirmed gig: in progress, or past.
export function MomentChip({ moment }: { moment: GigMoment }) {
  const { t } = useTranslation();

  if (moment === 'inProgress') {
    return (
      <Chip kind="accent" icon="Play">
        {t('gigs.status.inProgress')}
      </Chip>
    );
  }
  if (moment === 'past') return <Chip icon="Archive">{t('gigs.status.past')}</Chip>;
  return null;
}

const answerIcon: Partial<Record<AttendanceAnswer, IconName>> = { YES: 'Check', NO: 'Close' };

// One answer as a chip: the same word everywhere.
export function AnswerChip({
  answer,
  kind = 'neutral',
}: {
  answer: AttendanceAnswer;
  kind?: 'neutral' | 'success';
}) {
  const { t } = useTranslation();
  return (
    <Chip kind={kind} icon={answerIcon[answer]}>
      {t(`gigs.answer.${answer}`)}
    </Chip>
  );
}

// The answer of the member on the card of a gig: "À répondre" in accent while
// they owe one, their answer otherwise, "Oui à 2 sur 5" for several slots.
// A draft and a cancelled gig ask nothing.
export function OwnAnswerChip({ gig }: { gig: Dated & { slots: GigSlotSummary[] } }) {
  const { t } = useTranslation();
  if (gig.status === 'DRAFT' || gig.status === 'CANCELLED') return null;

  const answers = gig.slots.map((slot) => slot.ownAnswer);
  const given = answers.filter((answer) => answer !== null);
  const owes = isOpen(gig) && given.length < answers.length;

  if (given.length === 0) {
    return owes ? (
      <Chip kind="accent" icon="Timer">
        {t('gigs.answer.toAnswer')}
      </Chip>
    ) : null;
  }
  const only = answers.length === 1 ? answers[0] : null;
  if (only) return <AnswerChip answer={only} />;

  return (
    <Chip kind={owes ? 'accent' : 'neutral'} icon="Check">
      {t('gigs.answer.yesOf', {
        yes: answers.filter((answer) => answer === 'YES').length,
        count: answers.length,
      })}
    </Chip>
  );
}
