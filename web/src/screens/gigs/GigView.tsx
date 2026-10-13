import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { type AttendanceAnswer, AttendanceChoices } from '../../components/AttendanceChoices.tsx';
import { Button } from '../../components/Button.tsx';
import { Chip } from '../../components/Chip.tsx';
import { GigHeader } from '../../components/GigHeader.tsx';
import { GigInfos } from '../../components/GigInfos.tsx';
import { GigMeeting } from '../../components/GigMeeting.tsx';
import { GigMeetingMap } from '../../components/GigMeetingMap.tsx';
import { GigPicture } from '../../components/GigPicture.tsx';
import { GigSlotCard } from '../../components/GigSlotCard.tsx';
import { AnswerShares, GigSlotWhoComes } from '../../components/GigSlotWhoComes.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { MemberMention } from '../../components/MemberMention.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { SectionAttendanceRow } from '../../components/SectionAttendanceRow.tsx';
import {
  type Gig,
  type GigSlot,
  isOpen,
  momentOf,
  nearestSlot,
  sectionNames,
  showsPlayable,
  useGig,
} from '../../gigs.ts';
import { instrumentsOf, useMembers, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { useIsTablet } from '../songs/device.ts';
import { type Attendance, attendanceOf } from './attendance.ts';
import { AnswerChip, MomentChip, StatusChip } from './chips.tsx';
import { addressText, inSentence, timeText, whenText, whereText } from './format.ts';
import { GigSetlists } from './GigSetlists.tsx';
import { ManagePanel } from './ManagePanel.tsx';

type Props = {
  gigId: number;
  /** Where the way back leads, when the gig takes the whole screen. */
  back?: string;
  /** The level of the name of the gig: 1 when it is the page, 2 beside the list. */
  headingLevel?: 1 | 2;
};

/** Saves an answer of the member and puts what the API answers in the memory of the page. */
function useAnswer(gigId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, answer }: { slotId: number; answer: AttendanceAnswer }) =>
      api<Gig>(`/api/gigs/${gigId}/slots/${slotId}/answer`, { method: 'PUT', body: { answer } }),
    onSuccess: (gig) => {
      queryClient.setQueryData(['gig', gigId], gig);
      queryClient.invalidateQueries({ queryKey: ['gigs'] });
    },
  });
}

/** The address that opens the maps of the device on the place of a gig. */
function mapsUrl(gig: Gig): string | null {
  const address = whereText(gig);
  const point =
    gig.latitude !== null && gig.longitude !== null ? `${gig.latitude},${gig.longitude}` : null;
  if (!point && !address) return null;

  const target = encodeURIComponent(point ?? address);
  // With a point, the address in words names it in the maps app.
  const name = point && address ? encodeURIComponent(address) : null;
  const platform = navigator.userAgent;
  if (/iPhone|iPad|Macintosh/.test(platform)) {
    return `https://maps.apple.com/?daddr=${target}${name ? `&q=${name}` : ''}`;
  }
  if (/Android/.test(platform)) {
    return name ? `geo:${point}?q=${point}(${name})` : `geo:0,0?q=${target}`;
  }
  return point
    ? `https://www.openstreetmap.org/?mlat=${gig.latitude}&mlon=${gig.longitude}#map=17/${gig.latitude}/${gig.longitude}`
    : `https://www.openstreetmap.org/search?query=${target}`;
}

// Figma: Gigs / Gig (sections 2, 4, 5 and 8). One gig, whatever its state:
// what comes first changes with it. While the gig is not confirmed, the
// answers; once confirmed, the meeting; a draft, a gig to close, a cancelled
// and a past gig say what they are and offer what can still be done.
export function GigView({ gigId, back, headingLevel = 1 }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const gigQuery = useGig(gigId);
  const members = useMembers().data ?? [];
  const sections = useSections().data ?? [];
  const isTablet = useIsTablet();
  const answer = useAnswer(gigId);
  const [isManaging, setManaging] = useState(false);
  const [manageStart, setManageStart] = useState<'menu' | 'status' | 'delete'>('menu');
  const [openSlotId, setOpenSlot] = useState<number | null>(null);
  const [isChanging, setChanging] = useState(false);
  const [wasConfirmed, setConfirmed] = useState(false);
  const [hasCopied, setCopied] = useState(false);
  const [someFailed, setSomeFailed] = useState(false);
  const ownAnswer = useRef<HTMLDivElement>(null);
  const movesFocus = useRef(false);

  // The answer given and the four choices take each other's place: the focus
  // follows, instead of being lost with the control that was pressed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when one takes the place of the other
  useEffect(() => {
    if (!movesFocus.current) return;
    movesFocus.current = false;
    const within = ownAnswer.current;
    (within?.querySelector('input:checked') ?? within?.querySelector('input, button'))
      ?.closest<HTMLElement>('input, button')
      ?.focus();
  }, [isChanging]);

  // "Adresse copiée" goes back to the name of the button after a moment.
  useEffect(() => {
    if (!hasCopied) return;
    const timer = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(timer);
  }, [hasCopied]);

  // "Relancer": a notification at once to who has not answered, and when it left.
  const remind = useMutation({
    mutationFn: () => api<Gig>(`/api/gigs/${gigId}/reminder`, { method: 'POST' }),
    onSuccess: (saved) => queryClient.setQueryData(['gig', gigId], saved),
  });
  const status = useMutation({
    mutationFn: (next: string) =>
      api<Gig>(`/api/gigs/${gigId}/status`, { method: 'PUT', body: { status: next } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['gig', gigId], saved);
      queryClient.invalidateQueries({ queryKey: ['gigs'] });
    },
  });

  const size = isTablet ? 'compact' : 'large';
  const cardLevel = headingLevel === 1 ? 2 : 3;
  const CardHeading = `h${cardLevel}` as const;
  const gig = gigQuery.data;
  if (!gig) {
    const isGone = gigQuery.error instanceof ApiError && gigQuery.error.status === 404;
    return (
      <div className="gigs-view" data-size={size}>
        {back && (
          <div className="gigs-panel">
            <div className="gigs-topBar">
              <IconButton
                kind="glass"
                icon="ChevronLeft"
                label={t('gigs.gig.back')}
                onClick={() => navigate(back)}
              />
            </div>
          </div>
        )}
        <div className="gigs-panel">
          {gigQuery.isError ? (
            <Message kind="danger">
              {t(isGone ? 'gigs.gig.notFound' : 'errors.unreachable')}
            </Message>
          ) : (
            <p role="status" className="gigs-muted">
              {t('gigs.gig.loading')}
            </p>
          )}
        </div>
      </div>
    );
  }

  const language = i18n.language;
  const moment = momentOf(gig);
  const open = isOpen(gig);
  const isConfirmed = gig.status === 'CONFIRMED';
  const canDelete = me?.permissions.includes('manageGigs') ?? false;
  const ownSectionId = instrumentsOf(sections).find(
    (one) => one.id === me?.instrumentId,
  )?.sectionId;
  const attendance = (slot: GigSlot) => attendanceOf(slot, members, sections, language, !open);
  const single = gig.slots.length === 1 ? gig.slots[0] : undefined;
  const best = nearestSlot(gig.slots);
  const missing = sectionNames(sections, best?.missingSectionIds ?? []);

  // The answer just pressed shows in the same instant, before the server has
  // answered; it goes back to what is saved if the server refuses.
  const shown = (slot: GigSlot) =>
    answer.isPending && answer.variables.slotId === slot.id
      ? answer.variables.answer
      : slot.ownAnswer;

  const say = (slotId: number, value: AttendanceAnswer) => {
    const before = gig.status;
    answer.mutate(
      { slotId, answer: value },
      {
        onSuccess: (saved) => {
          movesFocus.current = isChanging;
          setChanging(false);
          setSomeFailed(false);
          // An accepted gig that this answer made playable is confirmed by the app.
          setConfirmed(before === 'ACCEPTED' && saved.status === 'CONFIRMED');
        },
      },
    );
  };

  // The second chip of the header: what the dates say of a confirmed gig, or
  // whether the gig is playable while that matters.
  const playableSlots = gig.slots.filter((slot) => slot.isPlayable).length;
  const playableChip =
    moment === 'inProgress' || moment === 'past' ? (
      <MomentChip moment={moment} />
    ) : showsPlayable(gig) ? (
      playableSlots > 0 ? (
        <Chip kind="success" icon="Check">
          {gig.slots.length > 1
            ? t('gigs.playable.onSlots', { count: playableSlots })
            : t('gigs.playable.yes')}
        </Chip>
      ) : (
        <Chip kind="warning" icon="Alert">
          {t('gigs.playable.notYet')}
        </Chip>
      )
    ) : null;

  const picture = (
    <GigPicture
      status={gig.status}
      costumePictures={gig.costumes.flatMap((costume) =>
        costume.pictureUrl ? [costume.pictureUrl] : [],
      )}
    />
  );
  const actions = (
    <>
      {back ? (
        <IconButton
          kind="glass"
          icon="ChevronLeft"
          label={t('gigs.gig.back')}
          onClick={() => navigate(back)}
        />
      ) : (
        <span />
      )}
      {gig.canEdit && (
        <IconButton
          kind="glass"
          icon="More"
          label={t('gigs.gig.manage')}
          aria-haspopup="dialog"
          onClick={() => setManaging(true)}
        />
      )}
    </>
  );

  const organisers = gig.organizers.map((organiser) => {
    const member = members.find((one) => one.id === organiser.id);
    const instrument = instrumentsOf(sections).find((one) => one.id === member?.instrumentId);
    return (
      <MemberMention
        key={organiser.id}
        nickname={organiser.nickname}
        detail={instrument?.name}
        photoUrl={member?.photoUrl ?? null}
      />
    );
  });

  // ---------------------------------------------------------------
  // The cards
  // ---------------------------------------------------------------

  const failed = (answer.isError || someFailed) && (
    <Message kind="danger">{t('gigs.gig.saveFailed')}</Message>
  );
  // Said to screen readers: the answer is saved as soon as it is chosen.
  const saved = (
    <p className="visuallyHidden" role="status">
      {answer.isSuccess ? t('gigs.gig.saved') : ''}
    </p>
  );
  const confirmedNow = wasConfirmed && (
    <Message kind="success">{t('gigs.gig.nowConfirmed')}</Message>
  );

  // One slot: the four answers, large; or, once confirmed, the answer given
  // and a way to change it.
  const ownAnswerCard = single && open && (
    <section className="gigs-card">
      <div className="gigs-cardHeading">
        <CardHeading className="textHeading">{t('gigs.gig.yourAnswer')}</CardHeading>
      </div>
      {isConfirmed && single.ownAnswer && !isChanging ? (
        <div className="gigs-inline" ref={ownAnswer}>
          <AnswerChip
            answer={single.ownAnswer}
            kind={single.ownAnswer === 'YES' ? 'success' : 'neutral'}
          />
          <p className="gigs-muted textBody">{t(`gigs.gig.summary.${single.ownAnswer}`)}</p>
          <Button
            kind="quiet"
            size="small"
            onClick={() => {
              movesFocus.current = true;
              setChanging(true);
            }}
          >
            {t('gigs.gig.change')}
          </Button>
        </div>
      ) : (
        <div ref={ownAnswer}>
          <AttendanceChoices
            answer={shown(single)}
            onChange={(value) => say(single.id, value)}
            label={t('gigs.answer.label')}
          />
        </div>
      )}
      {single.ownYesMakesPlayable && showsPlayable(gig) && (
        <Message>
          {t('gigs.gig.yourYesMakesPlayable', {
            section: sectionNames(sections, single.missingSectionIds).join(', '),
          })}
        </Message>
      )}
      {confirmedNow}
      {failed}
      {saved}
    </section>
  );

  // Several slots: one card per slot, each with its four answers.
  const unanswered = gig.slots.filter((slot) => slot.ownAnswer === null);
  const ownAnswersCard = !single && open && (
    <section className="gigs-card">
      <div className="gigs-cardHeading">
        <CardHeading className="textHeading">{t('gigs.gig.yourAnswers')}</CardHeading>
        <span className="gigs-muted textCaption">
          {t('gigs.gig.answeredOf', {
            answered: gig.slots.length - unanswered.length,
            count: gig.slots.length,
          })}
        </span>
      </div>
      {unanswered.length > 0 && (
        <div className="gigs-inline">
          <p className="gigs-muted textBody">{t('gigs.gig.left', { count: unanswered.length })}</p>
          <Button
            kind="secondary"
            size="small"
            icon="Check"
            disabled={answer.isPending}
            onClick={async () => {
              // Yes to the slots not answered yet, one after the other.
              const before = gig.status;
              let failures = 0;
              let last: Gig | undefined;
              for (const slot of unanswered) {
                try {
                  last = await answer.mutateAsync({ slotId: slot.id, answer: 'YES' });
                } catch {
                  failures += 1;
                }
              }
              setSomeFailed(failures > 0);
              setConfirmed(before === 'ACCEPTED' && last?.status === 'CONFIRMED');
            }}
          >
            {t('gigs.gig.yesEverywhere')}
          </Button>
        </div>
      )}
      {confirmedNow}
      {failed}
      {saved}
      {gig.slots.map((slot) => {
        const name = slot.name ?? t('gigs.gig.onlySlot');
        const slotMissing = sectionNames(sections, slot.missingSectionIds);
        // "Jouable si Riton vient (si besoin)": who would fill the sections without a yes.
        const ifNeeded = attendance(slot)
          .sections.filter(({ section }) => slot.missingSectionIds.includes(section.id))
          .flatMap(({ attendees }) => attendees)
          .filter((one) => one.answer === 'IF_NEEDED')
          .map((one) => one.nickname);
        return (
          <GigSlotCard
            key={slot.id}
            name={name}
            costume={gig.costumes.find((costume) => costume.id === slot.costumeId)?.name}
            note={slot.note ?? undefined}
            headingLevel={cardLevel === 2 ? 3 : 4}
            playable={slot.isPlayable ? 'yes' : 'missing'}
            playableText={
              slot.isPlayable
                ? t('gigs.playable.yes')
                : slot.isPlayableIfNeeded
                  ? t('gigs.playable.ifNeeded', {
                      count: ifNeeded.length,
                      names: inSentence(ifNeeded, language),
                    })
                  : t('gigs.playable.missing', { sections: slotMissing.join(', ') })
            }
            whoComes={
              <Button
                kind="quiet"
                size="small"
                icon="Users"
                aria-haspopup="dialog"
                onClick={() => setOpenSlot(slot.id)}
              >
                {t('gigs.whoComes.yesCount', { count: attendance(slot).counts.YES })}
              </Button>
            }
          >
            <AttendanceChoices
              size="small"
              answer={shown(slot)}
              onChange={(value) => say(slot.id, value)}
              label={t('gigs.answer.labelFor', { slot: name })}
            />
          </GigSlotCard>
        );
      })}
    </section>
  );

  const remindedAt = gig.remindedAt ? new Date(gig.remindedAt) : null;
  const lastReminder = remindedAt
    ? t('gigs.whoComes.lastReminder', {
        day: remindedAt.toLocaleDateString(i18n.language, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
        time: timeText(
          t,
          `${String(remindedAt.getHours()).padStart(2, '0')}:${String(remindedAt.getMinutes()).padStart(2, '0')}`,
        ),
      })
    : undefined;

  const allAnswers = (slot?: GigSlot) => (
    <Button
      kind="secondary"
      icon="Users"
      onClick={() =>
        navigate(`/gigs/${gig.id}/answers${slot && !single ? `?slot=${slot.id}` : ''}`)
      }
    >
      {t('gigs.whoComes.all')}
    </Button>
  );

  const whoComes = (slot: GigSlot, collapsed: boolean, title = t('gigs.whoComes.title')) => {
    const who = attendance(slot);
    return (
      <GigSlotWhoComes
        title={title}
        count={t('gigs.whoComes.yesOf', { yes: who.counts.YES, count: who.memberCount })}
        message={
          <PlayableMessage slot={slot} names={sectionNames(sections, slot.missingSectionIds)} />
        }
        reminder={
          gig.canEdit && isOpen(gig) && who.counts.NONE > 0
            ? {
                pending: t('gigs.whoComes.pending', { count: who.counts.NONE }),
                last: lastReminder,
                action: (
                  <Button
                    kind="secondary"
                    size="small"
                    icon="Send"
                    disabled={remind.isPending}
                    onClick={() => remind.mutate()}
                  >
                    {t('gigs.whoComes.remind')}
                  </Button>
                ),
              }
            : undefined
        }
        action={
          <>
            {remind.isError && <Message kind="danger">{t('gigs.whoComes.remindFailed')}</Message>}
            <p className="visuallyHidden" role="status">
              {remind.isSuccess ? t('gigs.whoComes.reminded') : ''}
            </p>
            {allAnswers(slot)}
          </>
        }
        headingLevel={cardLevel}
      >
        {!collapsed && <WhoComesContent attendance={who} ownSectionId={ownSectionId} />}
      </GigSlotWhoComes>
    );
  };

  const infos = (
    <GigInfos
      title={t('gigs.gig.infos')}
      headingLevel={cardLevel}
      rows={[
        {
          label: t('gigs.gig.costumes'),
          strong: true,
          value:
            gig.costumes.length > 0
              ? gig.costumes.map((costume) => costume.name).join(', ')
              : t('gigs.gig.noCostume'),
        },
        ...(organisers.length > 0 ? [{ label: t('gigs.gig.organisers'), value: organisers }] : []),
        ...(gig.notes ? [{ label: t('gigs.gig.notes'), value: gig.notes }] : []),
      ]}
    />
  );
  const notesCard = (title: string) =>
    gig.notes && (
      <section className="gigs-card">
        <CardHeading className="textHeading">{title}</CardHeading>
        <p className="gigs-notes textBody">{gig.notes}</p>
      </section>
    );

  const maps = mapsUrl(gig);
  const address = addressText(gig);
  const meeting = (
    <GigMeeting
      label={t('gigs.gig.meeting')}
      time={gig.meetingTime ? timeText(t, gig.meetingTime) : t('gigs.time.toCome')}
      spot={gig.placeName ?? undefined}
      address={address || undefined}
      headingLevel={cardLevel}
      map={
        gig.mapTilesUrl !== null &&
        gig.latitude !== null &&
        gig.longitude !== null &&
        maps && (
          <GigMeetingMap
            latitude={gig.latitude}
            longitude={gig.longitude}
            tilesUrl={gig.mapTilesUrl}
            onOpen={() => window.open(maps, '_blank', 'noopener,noreferrer')}
            zoomInLabel={t('gigs.gig.zoomIn')}
            zoomOutLabel={t('gigs.gig.zoomOut')}
          />
        )
      }
    >
      {maps && (
        <Button icon="MapPin" onClick={() => window.open(maps, '_blank', 'noopener,noreferrer')}>
          {t('gigs.gig.go')}
        </Button>
      )}
      {address && (
        <Button
          kind="secondary"
          icon={hasCopied ? 'Check' : 'Copy'}
          onClick={() =>
            navigator.clipboard.writeText(address).then(
              () => setCopied(true),
              () => {},
            )
          }
        >
          {t(hasCopied ? 'gigs.gig.addressCopied' : 'gigs.gig.copyAddress')}
        </Button>
      )}
      {gig.placeUrl && (
        <Button
          kind="quiet"
          icon="ExternalLink"
          onClick={() => window.open(gig.placeUrl ?? '', '_blank', 'noopener,noreferrer')}
        >
          {t('gigs.gig.placeLink')}
        </Button>
      )}
      <p className="visuallyHidden" role="status">
        {hasCopied ? t('gigs.gig.addressCopied') : ''}
      </p>
    </GigMeeting>
  );

  // What a gig already over says of its answers.
  const outcome = (title: string, text: string) => (
    <section className="gigs-card" data-gap="small">
      <CardHeading className="textHeading">{title}</CardHeading>
      <p className="gigs-muted textBody">{text}</p>
    </section>
  );
  const yesOfBest = best ? attendance(best).counts.YES : 0;
  const memberCount = best ? attendance(best).memberCount : 0;

  // ---------------------------------------------------------------
  // What comes first, state by state
  // ---------------------------------------------------------------

  let cards: React.ReactNode;
  let columns: 1 | 2 = 1;
  if (gig.status === 'DRAFT') {
    cards = (
      <>
        <Message>{t(moment === 'outdated' ? 'gigs.gig.outdated' : 'gigs.gig.draft')}</Message>
        {gig.canEdit && moment !== 'outdated' && (
          <Button icon="Send" disabled={status.isPending} onClick={() => status.mutate('PROPOSED')}>
            {t('gigs.gig.propose')}
          </Button>
        )}
        {notesCard(t('gigs.gig.infos'))}
        {canDelete && (
          <Button
            kind="danger"
            icon="Trash"
            aria-haspopup="dialog"
            onClick={() => {
              setManageStart('delete');
              setManaging(true);
            }}
          >
            {t('gigs.gig.deleteDraft')}
          </Button>
        )}
      </>
    );
  } else if (gig.status === 'CANCELLED') {
    cards = (
      <>
        <Message>{t('gigs.gig.cancelled')}</Message>
        {notesCard(t('gigs.gig.infos'))}
        {gig.canEdit && (
          <Button
            kind="secondary"
            icon="Undo"
            aria-haspopup="dialog"
            onClick={() => {
              setManageStart('status');
              setManaging(true);
            }}
          >
            {t('gigs.gig.reopen')}
          </Button>
        )}
      </>
    );
  } else if (moment === 'toClose') {
    const count = t('gigs.whoComes.yesOf', { yes: yesOfBest, count: memberCount });
    cards = (
      <>
        {gig.canEdit ? (
          <Message kind="warning">{t('gigs.gig.toClose')}</Message>
        ) : (
          <Message>{t('gigs.gig.notPlayed')}</Message>
        )}
        {gig.canEdit && (
          <Button
            kind="secondary"
            icon="CalendarRemove"
            disabled={status.isPending}
            onClick={() => status.mutate('CANCELLED')}
          >
            {t('gigs.gig.cancel')}
          </Button>
        )}
        {outcome(
          t('gigs.gig.whoAnswered'),
          missing.length > 0
            ? t('gigs.gig.whoAnsweredMissing', { count, sections: inSentence(missing, language) })
            : t('gigs.gig.whoAnsweredDetail', { count }),
        )}
        {allAnswers()}
      </>
    );
  } else if (moment === 'past') {
    const ownAnswer = best?.ownAnswer;
    cards = (
      <>
        <Message>{t('gigs.gig.past')}</Message>
        {outcome(
          t('gigs.gig.whoCame'),
          [
            t(missing.length === 0 ? 'gigs.gig.whoCameAll' : 'gigs.gig.whoCame', {
              count: yesOfBest,
            }),
            ownAnswer
              ? t('gigs.gig.yourAnswerWas', {
                  answer: t(`gigs.answer.${ownAnswer}`).toLocaleLowerCase(language),
                })
              : t('gigs.gig.youDidNotAnswer'),
          ].join(' '),
        )}
        <GigSetlists gig={gig} headingLevel={cardLevel} canGoLive={false} />
        {allAnswers()}
      </>
    );
  } else if (isConfirmed) {
    // Confirmed, to come or in progress: the meeting first.
    cards = (
      <>
        {!gig.isPlayable && (
          <Message kind="warning">
            {t('gigs.gig.notPlayableAnymore', { sections: inSentence(missing, language) })}
          </Message>
        )}
        {meeting}
        <GigSetlists gig={gig} headingLevel={cardLevel} canGoLive />
        {notesCard(t('gigs.gig.notes'))}
        {gig.costumes.length > 0 && (
          <section className="gigs-card">
            <CardHeading className="textHeading">{t('gigs.gig.costumes')}</CardHeading>
            {gig.costumes.map((costume) => {
              const wornAt = gig.slots.filter((slot) => slot.costumeId === costume.id);
              const when = single
                ? wornAt.length > 0
                  ? t('gigs.gig.allDay')
                  : ''
                : wornAt.map((slot) => slot.name).join(', ');
              return (
                <div key={costume.id} className="gigs-costume">
                  {costume.pictureUrl && (
                    <span className="gigs-costumePicture">
                      <GigPicture status={gig.status} costumePictures={[costume.pictureUrl]} />
                    </span>
                  )}
                  <span className="gigs-costumeTexts">
                    <span className="textBodyStrong">{costume.name}</span>
                    {when && <span className="gigs-muted textCaption">{when}</span>}
                  </span>
                </div>
              );
            })}
          </section>
        )}
        {organisers.length > 0 && (
          <section className="gigs-card">
            <CardHeading className="textHeading">{t('gigs.gig.organisers')}</CardHeading>
            <div className="gigs-mentions">{organisers}</div>
          </section>
        )}
        {ownAnswerCard}
        {ownAnswersCard}
        {single && whoComes(single, true)}
      </>
    );
  } else {
    // Proposed or accepted, to come: the answers first.
    columns = single ? 2 : 1;
    cards = single ? (
      <>
        <div className="gigs-column">
          {ownAnswerCard}
          {infos}
        </div>
        <div className="gigs-column">{whoComes(single, false)}</div>
      </>
    ) : (
      <>
        {ownAnswersCard}
        {infos}
      </>
    );
  }

  const openSlot = gig.slots.find((slot) => slot.id === openSlotId);

  return (
    <div className="gigs-view" data-size={size}>
      {size === 'compact' && (
        <>
          <div className="gigs-halo" aria-hidden="true">
            {picture}
          </div>
          {(back || gig.canEdit) && <div className="gigs-topBar">{actions}</div>}
        </>
      )}
      <GigHeader
        size={size}
        picture={picture}
        top={actions}
        marks={
          <>
            <StatusChip gig={gig} />
            {playableChip}
          </>
        }
        name={gig.name}
        when={whenText(t, gig, language, !isConfirmed)}
        where={
          isConfirmed && moment !== 'past' && moment !== 'inProgress'
            ? undefined
            : whereText(gig) || undefined
        }
        headingLevel={headingLevel}
      />
      <div className="gigs-panel" data-columns={columns}>
        {status.isError && <Message kind="danger">{t('gigs.statusPanel.failed')}</Message>}
        {cards}
      </div>

      {/* Who comes to one slot of a gig of several days. */}
      <Panel
        open={openSlot !== undefined}
        onClose={() => setOpenSlot(null)}
        title={t('gigs.whoComes.titleFor', { slot: openSlot?.name ?? '' })}
      >
        {openSlot && (
          <div className="gigs-sheet">
            <PlayableMessage
              slot={openSlot}
              names={sectionNames(sections, openSlot.missingSectionIds)}
            />
            <WhoComesContent attendance={attendance(openSlot)} ownSectionId={ownSectionId} />
            {allAnswers(openSlot)}
          </div>
        )}
      </Panel>

      {gig.canEdit && (
        <ManagePanel
          gig={gig}
          open={isManaging}
          start={manageStart}
          onClose={() => {
            setManaging(false);
            setManageStart('menu');
          }}
        />
      )}
    </div>
  );
}

// Whether a slot is playable, in a sentence: what GigSlot/WhoComes says first.
function PlayableMessage({ slot, names }: { slot: GigSlot; names: string[] }) {
  const { t, i18n } = useTranslation();
  if (slot.isPlayable) return <Message kind="success">{t('gigs.whoComes.playable')}</Message>;

  const sections = inSentence(names, i18n.language);
  return (
    <Message kind="warning">
      {t(slot.isPlayableIfNeeded ? 'gigs.whoComes.playableIfNeeded' : 'gigs.whoComes.notPlayable', {
        sections,
      })}
    </Message>
  );
}

// The share of answers and one row per section: the content of GigSlot/WhoComes.
function WhoComesContent({
  attendance,
  ownSectionId,
}: {
  attendance: Attendance;
  ownSectionId?: number;
}) {
  const { t } = useTranslation();
  const { counts } = attendance;

  return (
    <>
      <AnswerShares
        shares={[
          {
            key: 'yes',
            count: counts.YES,
            label: t('gigs.whoComes.share.yes', { count: counts.YES }),
          },
          {
            key: 'maybe',
            count: counts.MAYBE,
            label: t('gigs.whoComes.share.maybe', { count: counts.MAYBE }),
          },
          {
            key: 'ifNeeded',
            count: counts.IF_NEEDED,
            label: t('gigs.whoComes.share.ifNeeded', { count: counts.IF_NEEDED }),
          },
          { key: 'no', count: counts.NO, label: t('gigs.whoComes.share.no', { count: counts.NO }) },
          {
            key: 'none',
            count: counts.NONE,
            label: t('gigs.whoComes.share.none', { count: counts.NONE }),
          },
        ]}
      />
      {attendance.sections.map(({ section, attendees, yesCount }) => {
        // Who said yes, then who may come.
        const yes = attendees.filter((one) => one.answer === 'YES').map((one) => one.nickname);
        const others = attendees.flatMap((one) =>
          one.answer === 'MAYBE'
            ? [t('gigs.whoComes.maybe', { nickname: one.nickname })]
            : one.answer === 'IF_NEEDED'
              ? [t('gigs.whoComes.ifNeeded', { nickname: one.nickname })]
              : [],
        );
        const names = [yes.join(', '), others.join(', ')].filter(Boolean).join(' · ');

        return (
          <SectionAttendanceRow
            key={section.id}
            icon={section.icon}
            name={
              section.id === ownSectionId
                ? t('gigs.whoComes.yourSection', { section: section.name })
                : section.name
            }
            members={names || t('gigs.whoComes.nobodyYet')}
            yesCount={yesCount}
          />
        );
      })}
    </>
  );
}
