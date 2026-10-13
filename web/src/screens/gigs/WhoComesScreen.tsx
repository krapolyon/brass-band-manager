import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { api } from '../../api.ts';
import { type AttendanceAnswer, AttendanceChoices } from '../../components/AttendanceChoices.tsx';
import { Chip } from '../../components/Chip.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { MemberMention } from '../../components/MemberMention.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { type Gig, isOpen, useGig } from '../../gigs.ts';
import { useMembers, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { type Attendee, attendanceOf } from './attendance.ts';
import { AnswerChip } from './chips.tsx';
import { dayText } from './format.ts';
import './gigs.css';

// Figma: Gigs / Who comes — in detail (section 3). Every answer of a slot,
// section by section. Who may edit the gig touches a member to note the
// answer they were given: it counts at once, as if the member had given it.
export function WhoComesScreen() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const gigId = Number(params.id);
  const gigQuery = useGig(gigId);
  const members = useMembers().data ?? [];
  const sections = useSections().data ?? [];
  const [answeredFor, setAnsweredFor] = useState<Attendee | null>(null);

  const gig = gigQuery.data;
  const slot = gig?.slots.find((one) => one.id === Number(search.get('slot'))) ?? gig?.slots[0];
  const canAnswerForOthers = gig ? gig.canEdit && isOpen(gig) : false;

  const answer = useMutation({
    mutationFn: ({ memberId, value }: { memberId: number; value: AttendanceAnswer }) =>
      api<Gig>(`/api/gigs/${gigId}/slots/${slot?.id}/answers/${memberId}`, {
        method: 'PUT',
        body: { answer: value },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['gig', gigId], saved);
      queryClient.invalidateQueries({ queryKey: ['gigs'] });
      setAnsweredFor(null);
    },
  });

  const title = slot?.name
    ? t('gigs.whoComes.titleFor', { slot: slot.name })
    : t('gigs.whoComes.title');
  const organises = gig?.organizers.some((organiser) => organiser.id === me?.id) ?? false;
  const subtitle = gig
    ? t(
        !canAnswerForOthers
          ? 'gigs.whoComes.detailSubtitle'
          : organises
            ? 'gigs.whoComes.detailSubtitleEditor'
            : 'gigs.whoComes.detailSubtitleManager',
        {
          gig: gig.name,
          date: dayText(gig.startsOn, i18n.language),
        },
      )
    : undefined;
  const attendance =
    gig && slot ? attendanceOf(slot, members, sections, i18n.language, !isOpen(gig)) : null;

  const row = (attendee: Attendee) => {
    const content = (
      <>
        <MemberMention
          nickname={attendee.nickname}
          suffix={attendee.memberId === me?.id ? t('gigs.whoComes.you') : undefined}
          detail={attendee.instrument || undefined}
          photoUrl={attendee.photoUrl}
        />
        {attendee.answer ? (
          <AnswerChip
            answer={attendee.answer}
            kind={attendee.answer === 'YES' ? 'success' : 'neutral'}
          />
        ) : (
          <Chip kind="warning" icon="Alert">
            {t('gigs.answer.none')}
          </Chip>
        )}
      </>
    );
    return (
      <li key={attendee.memberId}>
        {canAnswerForOthers ? (
          <button
            type="button"
            className="gigs-member"
            aria-haspopup="dialog"
            aria-label={t('gigs.whoComes.noteAnswer', {
              nickname: attendee.nickname,
              answer: t(`gigs.answer.${attendee.answer ?? 'none'}`),
            })}
            onClick={() => {
              answer.reset();
              setAnsweredFor(attendee);
            }}
          >
            {content}
          </button>
        ) : (
          <div className="gigs-member">{content}</div>
        )}
      </li>
    );
  };

  return (
    <AppLayout
      current="gigs"
      back={`/gigs/${gigId}`}
      backLabel={gig?.name}
      width="form"
      title={title}
      subtitle={subtitle}
    >
      {gigQuery.isError && <Message kind="danger">{t('gigs.gig.notFound')}</Message>}
      {gigQuery.isPending && (
        <p role="status" className="gigs-muted">
          {t('gigs.gig.loading')}
        </p>
      )}
      {/* The slots of a gig of several days, one at a time. */}
      {gig && gig.slots.length > 1 && (
        <fieldset className="gigs-filters">
          <legend className="visuallyHidden">{t('gigs.whoComes.slots')}</legend>
          {gig.slots.map((one) => (
            <FilterChip
              key={one.id}
              pressed={one.id === slot?.id}
              onChange={() => setSearch({ slot: String(one.id) }, { replace: true })}
            >
              {one.name}
            </FilterChip>
          ))}
        </fieldset>
      )}
      {attendance && (
        <div className="gigs-answers">
          {attendance.sections.map(({ section, attendees, yesCount }) => (
            <section
              key={section.id}
              className="gigs-section"
              aria-labelledby={`gigs-section-${section.id}`}
            >
              <div className="gigs-sectionHeading">
                <h2 className="textLabel" id={`gigs-section-${section.id}`}>
                  {section.name}
                </h2>
                {yesCount > 0 ? (
                  <Chip kind="success" icon="Check">
                    {t('gigs.whoComes.yesCount', { count: yesCount })}
                  </Chip>
                ) : (
                  <Chip kind="warning" icon="Alert">
                    {t('gigs.whoComes.nobodyYes')}
                  </Chip>
                )}
              </div>
              <ul className="gigs-members">{attendees.map(row)}</ul>
            </section>
          ))}
        </div>
      )}

      <Panel
        open={answeredFor !== null}
        onClose={() => setAnsweredFor(null)}
        title={t('gigs.whoComes.answerOf', { nickname: answeredFor?.nickname ?? '' })}
      >
        {answeredFor && (
          <div className="gigs-sheet">
            <p className="gigs-muted textBody">
              {t('gigs.whoComes.answerFor', { nickname: answeredFor.nickname })}
            </p>
            <AttendanceChoices
              answer={answeredFor.answer}
              onChange={(value) => answer.mutate({ memberId: answeredFor.memberId, value })}
              label={t('gigs.whoComes.answerOf', { nickname: answeredFor.nickname })}
              disabled={answer.isPending}
            />
            {answer.isError && <Message kind="danger">{t('gigs.gig.saveFailed')}</Message>}
            <p className="gigs-muted textCaption">
              {answeredFor.answer
                ? t('gigs.whoComes.currentAnswer', {
                    answer: t(`gigs.answer.${answeredFor.answer}`).toLocaleLowerCase(i18n.language),
                  })
                : t('gigs.whoComes.noCurrentAnswer')}
            </p>
          </div>
        )}
      </Panel>
    </AppLayout>
  );
}
