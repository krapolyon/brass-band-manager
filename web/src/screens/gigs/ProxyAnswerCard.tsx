import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api.ts';
import { type AttendanceAnswer, AttendanceChoices } from '../../components/AttendanceChoices.tsx';
import { Message } from '../../components/Message.tsx';
import type { Gig, GigSlot, ProxyMember } from '../../gigs.ts';
import type { Section } from '../../members.ts';
import { AnswerInstrument, declaredInstrument, showsInstrument } from './AnswerInstrument.tsx';

type Props = {
  gig: Gig;
  /** A member who let the signed-in member answer for them ("Peut répondre pour moi"). */
  member: ProxyMember;
  sections: Section[];
  headingLevel: 2 | 3;
};

// Figma: Gigs / Gig, one slot — answering for the member who designated me
// (section 26, 1.1.0). Under "Ta réponse": the answer of that member, with the
// same choices and the same instrument control, saved through the address an
// organiser uses (model/gigs.md, "Answering for the member who designated me").
export function ProxyAnswerCard({ gig, member, sections, headingLevel }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const Heading = `h${headingLevel}` as const;
  const instrumentId = declaredInstrument(gig, member);

  const answer = useMutation({
    mutationFn: ({
      slotId,
      value,
      instrument,
    }: {
      slotId: number;
      value: AttendanceAnswer;
      instrument: number;
    }) =>
      api<Gig>(`/api/gigs/${gig.id}/slots/${slotId}/answers/${member.id}`, {
        method: 'PUT',
        body: { answer: value, instrumentId: instrument },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['gig', gig.id], saved);
      queryClient.invalidateQueries({ queryKey: ['gigs'] });
    },
  });

  const answerOf = (slot: GigSlot): AttendanceAnswer | null =>
    answer.isPending && answer.variables.slotId === slot.id
      ? answer.variables.value
      : (slot.answers.find((one) => one.memberId === member.id)?.answer ?? null);
  const answers = gig.slots.map(answerOf);
  const answered = gig.slots.find((slot) => {
    const value = answerOf(slot);
    return value !== null && value !== 'NO';
  });
  const isSingle = gig.slots.length === 1;

  return (
    <section className="gigs-card">
      <div className="gigs-cardHeading">
        <Heading className="textHeading">
          {t('gigs.proxy.title', { nickname: member.nickname })}
        </Heading>
      </div>
      {gig.slots.map((slot) => (
        <AttendanceChoices
          key={slot.id}
          size={isSingle ? 'large' : 'small'}
          answer={answerOf(slot)}
          onChange={(value) => answer.mutate({ slotId: slot.id, value, instrument: instrumentId })}
          label={
            isSingle
              ? t('gigs.whoComes.answerOf', { nickname: member.nickname })
              : `${t('gigs.whoComes.answerOf', { nickname: member.nickname })} · ${slot.name ?? t('gigs.gig.onlySlot')}`
          }
          disabled={answer.isPending}
        />
      ))}
      {answered && showsInstrument(member, answers) && (
        <AnswerInstrument
          player={member}
          sections={sections}
          value={instrumentId}
          caption={t('gigs.answerFor.instrument')}
          onChange={(instrument) => {
            const value = answerOf(answered);
            if (value) answer.mutate({ slotId: answered.id, value, instrument });
          }}
        />
      )}
      {answers.every((value) => value === null) && (
        <Message>{t('gigs.proxy.unanswered', { nickname: member.nickname })}</Message>
      )}
      {answer.isError && <Message kind="danger">{t('gigs.gig.saveFailed')}</Message>}
    </section>
  );
}
