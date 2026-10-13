import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/Button.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { GigCard, GigCardLoading } from '../../components/GigCard.tsx';
import { Icon } from '../../components/Icon.tsx';
import { Message } from '../../components/Message.tsx';
import {
  type GigSummary,
  isOpen,
  momentOf,
  nearestSlot,
  sectionNames,
  showsPlayable,
  useGigs,
} from '../../gigs.ts';
import { type Section, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { useIsDesktop } from '../songs/device.ts';
import { OwnAnswerChip, StatusChip } from './chips.tsx';
import { dateBlock, meetingText, monthTitle, shortPlace } from './format.ts';
import { GigView } from './GigView.tsx';
import './gigs.css';

/** A gig that waits for who may edit it: a draft, or a gig that was not played and whose date has passed. */
const isToHandle = (gig: GigSummary) =>
  gig.canEdit && (gig.status === 'DRAFT' || momentOf(gig) === 'toClose');

/** A gig behind us: played, or never confirmed and seen by someone who cannot close it. */
const isBehind = (gig: GigSummary) => {
  const moment = momentOf(gig);
  return moment === 'past' || moment === 'toClose' || moment === 'outdated';
};

// Figma: Gigs / List (sections 1 and 8), and from the desktop width the list
// beside the gig (section 12). The gigs to come, by month, the nearest first;
// the cancelled and the past ones behind two filters, off when the screen
// opens; drafts and gigs to close first, under "À traiter", for who may edit
// them (model/gigs.md, entry 1, "The list").
export function GigsScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const isDesktop = useIsDesktop();
  const [withCancelled, setCancelled] = useState(false);
  const [withPast, setPast] = useState(false);
  const gigs = useGigs(withCancelled || withPast);
  const sections = useSections().data;

  const canManage = me?.permissions.includes('manageGigs') ?? false;
  const all = gigs.data ?? [];
  const toHandle = all.filter(isToHandle);
  const coming = all.filter(
    (gig) => !isToHandle(gig) && gig.status !== 'CANCELLED' && !isBehind(gig),
  );
  const others = all.filter(
    (gig) =>
      !isToHandle(gig) &&
      ((withCancelled && gig.status === 'CANCELLED') ||
        (withPast && gig.status !== 'CANCELLED' && isBehind(gig))),
  );
  const listed = [...coming, ...others].sort(
    (a, b) => a.startsOn.localeCompare(b.startsOn) || a.id - b.id,
  );
  const months = [...new Set(listed.map((gig) => gig.startsOn.slice(0, 7)))];

  // On a desktop a gig sits beside the list: the one the address names, or
  // the first of the list.
  const asked = params.id ? Number(params.id) : null;
  const first = toHandle[0] ?? listed[0];
  const openId = asked ?? (isDesktop ? (first?.id ?? null) : null);
  // It is written in the address, so that the gig stays open when an action
  // moves it in the list.
  const firstId = first?.id;
  useEffect(() => {
    if (isDesktop && asked === null && firstId !== undefined) {
      navigate(`/gigs/${firstId}`, { replace: true });
    }
  }, [isDesktop, asked, firstId, navigate]);

  // Below the desktop width a gig takes the whole screen.
  if (!isDesktop && asked !== null) {
    return (
      <main className="gigs-screen">
        <GigView key={asked} gigId={asked} back="/gigs" />
      </main>
    );
  }

  const comingText = t('gigs.list.coming', { count: coming.length });
  const owed = coming.filter(
    (gig) => isOpen(gig) && gig.slots.some((slot) => slot.ownAnswer === null),
  ).length;
  const subtitle = !gigs.isSuccess
    ? undefined
    : toHandle.length > 0
      ? t('gigs.list.toHandle', { coming: comingText, count: toHandle.length })
      : canManage
        ? t('gigs.list.noneToHandle', { coming: comingText })
        : owed > 0
          ? t('gigs.list.toAnswer', { coming: comingText, count: owed })
          : t('gigs.list.noneToAnswer', { coming: comingText });

  const card = (gig: GigSummary) => (
    <li key={gig.id}>
      <Link
        className="gigs-cardLink"
        to={`/gigs/${gig.id}`}
        aria-current={isDesktop && gig.id === openId ? 'true' : undefined}
      >
        <ListedGig
          gig={gig}
          sections={sections}
          language={i18n.language}
          selected={isDesktop && gig.id === openId}
        />
      </Link>
    </li>
  );
  const isEmpty = gigs.isSuccess && toHandle.length === 0 && listed.length === 0;

  return (
    <AppLayout
      current="gigs"
      title={t('gigs.list.title')}
      subtitle={subtitle}
      action={
        canManage && (
          <Button kind="secondary" size="small" icon="Plus" onClick={() => navigate('/gigs/new')}>
            {t('gigs.list.add')}
          </Button>
        )
      }
    >
      <div className="gigs-split">
        <div className="gigs-list">
          <div className="gigs-filters">
            <FilterChip pressed={withCancelled} onChange={setCancelled}>
              {t('gigs.list.filterCancelled')}
            </FilterChip>
            <FilterChip pressed={withPast} onChange={setPast}>
              {t('gigs.list.filterPast')}
            </FilterChip>
          </div>

          {gigs.isPending && (
            <div className="gigs-cards">
              <p role="status" className="visuallyHidden">
                {t('gigs.list.loading')}
              </p>
              <GigCardLoading />
              <GigCardLoading />
              <GigCardLoading />
            </div>
          )}
          {gigs.isError && (
            <>
              <Message kind="danger">{t('gigs.list.error')}</Message>
              <Button
                kind="secondary"
                icon="RotateCw"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['gigs'] })}
              >
                {t('gigs.list.retry')}
              </Button>
            </>
          )}
          {isEmpty && (
            <>
              <div className="gigs-nothing">
                <Icon name="Calendar" size={32} />
                <h2 className="textHeading">{t('gigs.list.emptyTitle')}</h2>
                <p className="textBody">
                  {t(canManage ? 'gigs.list.emptyManager' : 'gigs.list.emptyMember')}
                </p>
              </div>
              {canManage && (
                <Button icon="Plus" onClick={() => navigate('/gigs/new')}>
                  {t('gigs.list.emptyAdd')}
                </Button>
              )}
            </>
          )}

          {toHandle.length > 0 && (
            <section className="gigs-month" aria-labelledby="gigs-toHandle">
              <h2 className="textLabel" id="gigs-toHandle">
                {t('gigs.list.toHandle')}
              </h2>
              <ul className="gigs-cards">{toHandle.map(card)}</ul>
            </section>
          )}
          {months.map((month) => (
            <section key={month} className="gigs-month" aria-labelledby={`gigs-${month}`}>
              <h2 className="textLabel" id={`gigs-${month}`}>
                {monthTitle(`${month}-01`, i18n.language)}
              </h2>
              <ul className="gigs-cards">
                {listed.filter((gig) => gig.startsOn.startsWith(month)).map(card)}
              </ul>
            </section>
          ))}
        </div>
        {isDesktop && openId !== null && (
          <div className="gigs-pane">
            <GigView key={openId} gigId={openId} headingLevel={2} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

type ListedProps = {
  gig: GigSummary;
  sections: Section[] | undefined;
  language: string;
  selected: boolean;
};

// A gig as its card in the list: what the card says is decided here.
function ListedGig({ gig, sections, language, selected }: ListedProps) {
  const { t } = useTranslation();
  const moment = momentOf(gig);
  const place = shortPlace(gig);
  const count = gig.slots.length;

  // The place, with what makes this gig particular: several slots, a date behind us.
  const placeLine =
    moment === 'toClose' || moment === 'outdated'
      ? place
        ? t('gigs.card.datePassed', { place })
        : t('gigs.card.datePassedOnly')
      : count > 1
        ? place
          ? t('gigs.card.slots', { place, count })
          : t('gigs.card.slotsOnly', { count })
        : place;
  const timeLine =
    gig.status === 'DRAFT'
      ? t('gigs.card.draftSeenBy')
      : (meetingText(t, gig, language) ??
        (gig.status === 'CANCELLED' || moment !== null ? undefined : t('gigs.time.toCome')));

  // The banner, while playability matters.
  let playable: 'none' | 'playable' | 'missing' = 'none';
  let playableText: string | undefined;
  if (showsPlayable(gig)) {
    const playableSlots = gig.slots.filter((slot) => slot.isPlayable).length;
    if (playableSlots > 0) {
      playable = 'playable';
      playableText =
        count > 1 ? t('gigs.playable.onSlots', { count: playableSlots }) : t('gigs.playable.yes');
    } else {
      playable = 'missing';
      const missing = sectionNames(sections, nearestSlot(gig.slots)?.missingSectionIds ?? []);
      playableText =
        missing.length > 0
          ? t('gigs.playable.missing', { sections: missing.join(', ') })
          : t('gigs.playable.notYet');
    }
  }

  return (
    <GigCard
      {...dateBlock(gig, language)}
      name={gig.name}
      place={placeLine || undefined}
      time={timeLine}
      playable={playable}
      playableText={playableText}
      state={selected ? 'selected' : 'default'}
    >
      <StatusChip gig={gig} />
      <OwnAnswerChip gig={gig} />
    </GigCard>
  );
}
