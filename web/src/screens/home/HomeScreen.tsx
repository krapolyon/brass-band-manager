import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCard } from '../../components/AlertCard.tsx';
import { AttendanceChoices } from '../../components/AttendanceChoices.tsx';
import { Button } from '../../components/Button.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { GigCardLoading } from '../../components/GigCard.tsx';
import { GigHero } from '../../components/GigHero.tsx';
import { GigPicture } from '../../components/GigPicture.tsx';
import { Icon } from '../../components/Icon.tsx';
import { Message } from '../../components/Message.tsx';
import { SongLatest } from '../../components/SongLatest.tsx';
import { SongRow } from '../../components/SongRow.tsx';
import { dayOf, type GigSummary, isOpen, isOver, momentOf, useGig, useGigs } from '../../gigs.ts';
import { type Section, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { useSongs } from '../../songs.ts';
import { AppLayout } from '../AppLayout.tsx';
import { PendingMigrationsNotice } from '../band/BandMigrationsScreen.tsx';
import { OwnAnswerChip, StatusChip } from '../gigs/chips.tsx';
import { meetingText, shortPlace, whereText } from '../gigs/format.ts';
import { mapsUrl, useAnswer } from '../gigs/GigView.tsx';
import { ListedGig } from '../gigs/ListedGig.tsx';
import { MiniPlayer, usePlayer } from '../songs/Player.tsx';
import './home.css';

/** A gig is new for 15 days after members first saw it (model/gigs.md, "New"). */
const NEW_FOR = 15 * 86_400_000;

/** How many songs the panel of the latest songs shows. */
const LATEST_SONGS = 3;

// The cross of the latest songs hides them until the app is opened again:
// kept in the memory of the page, so that it holds from one tab to another,
// and stored nowhere.
let hasClosedLatestSongs = false;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** The clock of the device, read again from time to time: the day changes, a gig stops being new. */
function useNow(every = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

/** A gig behind us: played, or never played and its date passed. */
const isBehind = (gig: GigSummary, now: Date) => {
  const moment = momentOf(gig, now);
  return moment === 'past' || moment === 'toClose' || moment === 'outdated';
};

/** The confirmed gig of the day: from the start of its first day until it is past. */
const isToday = (gig: GigSummary, now: Date) =>
  gig.status === 'CONFIRMED' && dayOf(gig.startsOn) <= now && !isOver(gig, now);

/** The member owes an answer for one slot at least. */
const waits = (gig: GigSummary, now: Date) =>
  isOpen(gig, now) && gig.slots.some((slot) => slot.ownAnswer === null);

const isNew = (gig: GigSummary, now: Date) =>
  gig.status !== 'DRAFT' &&
  gig.proposedAt !== null &&
  now.getTime() - Date.parse(gig.proposedAt) < NEW_FOR;

/** "Proposé hier": the day members first saw the gig, in relative words. */
function proposedText(t: TFunction, proposedAt: string, now: Date, language: string): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(proposedAt))) / 86_400_000);
  const when = new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(-days, 'day');
  return t('gig.proposed', { when });
}

// Figma: page Home. The first screen after sign-in: the gig of the day, the
// gigs that wait for an answer of the member, every gig to come the member
// sees, the nearest first, and the latest songs of the repertoire pinned
// above the tab bar (model/gigs.md, "The home screen"; model/songs.md, "The
// latest songs").
export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const gigs = useGigs(false);
  const sections = useSections().data;
  const songs = useSongs().data;
  const player = usePlayer();
  const now = useNow();
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [hasClosedSongs, setClosedSongs] = useState(hasClosedLatestSongs);
  // The gig just answered for: the focus follows it once the list has changed.
  const [answeredId, setAnsweredId] = useState<number | null>(null);
  const [hasSaved, setSaved] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);

  // As in the list of gigs, without the gigs to close: they are not to come.
  const coming = (gigs.data ?? []).filter(
    (gig) => gig.status !== 'CANCELLED' && !isBehind(gig, now),
  );
  // Two gigs on the same day: the one that meets first comes first.
  const heroes = coming
    .filter((gig) => isToday(gig, now))
    .sort((a, b) => (a.meetingTime ?? '').localeCompare(b.meetingTime ?? ''));
  // The gig of the day is not in the list, so the alert and its filter leave
  // it out: its answer is given on its own screen.
  const waiting = coming.filter((gig) => !isToday(gig, now) && waits(gig, now));
  const newCount = waiting.filter((gig) => isNew(gig, now)).length;
  const isFiltered = onlyWaiting && waiting.length > 0;
  const listed = coming.filter((gig) => !isToday(gig, now) && (!isFiltered || waits(gig, now)));

  // The filter leaves with the alert: it does not come back on by itself
  // with the next gig to answer.
  const nothingWaits = gigs.isSuccess && waiting.length === 0;
  useEffect(() => {
    if (nothingWaits) setOnlyWaiting(false);
  }, [nothingWaits]);

  // The four answers leave the card once one is given, and the card leaves
  // the list when the filter is on: the focus goes to the card, else to the
  // title of the list, never nowhere.
  useEffect(() => {
    if (answeredId === null) return;
    const card = document.getElementById(`home-gig-${answeredId}`);
    (card?.querySelector('a') ?? title.current)?.focus();
    setAnsweredId(null);
  }, [answeredId]);

  const latest = (songs ?? [])
    .filter((song) => song.status === 'IN_REPERTOIRE')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .slice(0, LATEST_SONGS);
  const showsLatest = gigs.isSuccess && latest.length > 0 && !hasClosedSongs && !player.song;

  const subtitle = !gigs.isSuccess
    ? undefined
    : heroes.length > 0
      ? t('home.gigDay')
      : waiting.length === 0
        ? t('home.upToDate')
        : undefined;

  return (
    <AppLayout
      current="home"
      title={t('home.greeting', { nickname: me?.nickname ?? '' })}
      subtitle={subtitle}
      width="centred"
    >
      <div className="home" data-playing={player.song ? 'true' : undefined}>
        <div className="home-main">
          {/* For an admin, while the database is behind the code. Not drawn in Figma. */}
          <PendingMigrationsNotice />

          {heroes.map((gig) => (
            <HomeHero key={gig.id} gig={gig} language={i18n.language} now={now} />
          ))}

          {waiting.length > 0 && (
            <AlertCard
              text={t('home.toAnswer.count', { count: waiting.length })}
              detail={newCount > 0 ? t('home.toAnswer.new', { count: newCount }) : undefined}
            >
              <FilterChip icon="Filter" pressed={isFiltered} onChange={setOnlyWaiting}>
                {t('home.toAnswer.filter')}
              </FilterChip>
            </AlertCard>
          )}

          {/* A day when the gig of the day is the only one to come has no list. */}
          {!(gigs.isSuccess && heroes.length > 0 && listed.length === 0) && (
            <section className="home-gigs" aria-labelledby="home-gigs-title">
              <h2 className="textHeading" id="home-gigs-title" ref={title} tabIndex={-1}>
                {t(isFiltered ? 'home.gigs.titleFiltered' : 'home.gigs.title')}
              </h2>

              {gigs.isPending && (
                <div className="home-cards">
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
              {gigs.isSuccess && coming.length === 0 && (
                <div className="home-nothing">
                  <Icon name="Calendar" size={32} />
                  <h3 className="textHeading">{t('gigs.list.emptyTitle')}</h3>
                  <p className="textBody">{t('gigs.list.emptyMember')}</p>
                </div>
              )}
              {listed.length > 0 && (
                <ul className="home-cards">
                  {listed.map((gig) => (
                    <HomeGig
                      key={gig.id}
                      gig={gig}
                      sections={sections}
                      language={i18n.language}
                      now={now}
                      onAnswered={() => {
                        setAnsweredId(gig.id);
                        setSaved(true);
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
          {/* Said to screen readers: the answer is saved as soon as it is chosen.
              Here, not in the card: the card can leave with its answer. */}
          <p className="visuallyHidden" role="status">
            {hasSaved ? t('gigs.gig.saved') : ''}
          </p>
        </div>

        {showsLatest && (
          <div className="home-latest">
            <SongLatest
              title={t('home.latestSongs.title')}
              closeLabel={t('home.latestSongs.close')}
              onClose={() => {
                hasClosedLatestSongs = true;
                setClosedSongs(true);
              }}
            >
              {latest.map((song) => (
                <SongRow key={song.id} song={song} to={`/songs/${song.id}`} />
              ))}
            </SongLatest>
          </div>
        )}
      </div>
      {/* While a song plays, the mini-player takes the place of the latest songs. */}
      <MiniPlayer />
    </AppLayout>
  );
}

type HomeGigProps = {
  gig: GigSummary;
  sections: Section[] | undefined;
  language: string;
  now: Date;
  onAnswered: () => void;
};

// A gig of the list. The member answers in place when the gig has one slot
// and they have not answered yet; a gig with several slots opens the gig.
function HomeGig({ gig, sections, language, now, onAnswered }: HomeGigProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const answer = useAnswer(gig.id);
  const slot = gig.slots.length === 1 ? gig.slots[0] : undefined;
  const asks = slot !== undefined && slot.ownAnswer === null && isOpen(gig, now);
  const showNew = isNew(gig, now);

  return (
    <li id={`home-gig-${gig.id}`}>
      <ListedGig
        gig={gig}
        sections={sections}
        language={language}
        home={{
          to: `/gigs/${gig.id}`,
          showNew,
          newLabel: t('gig.new'),
          newText: gig.proposedAt ? proposedText(t, gig.proposedAt, now, language) : undefined,
          showAnswers: asks,
          answers: slot && (
            <AttendanceChoices
              size="small"
              // The answer just pressed shows at once, before the server has answered.
              answer={answer.isPending ? answer.variables.answer : null}
              disabled={answer.isPending}
              label={t('gigs.answer.labelFor', { slot: gig.name })}
              onChange={(value) =>
                answer.mutate(
                  { slotId: slot.id, answer: value },
                  {
                    onSuccess: (saved) => {
                      // The list says it in the same instant: the pill, the
                      // count of the alert, and the card that leaves when
                      // the filter is on. An answer can also confirm the gig.
                      queryClient.setQueryData<GigSummary[]>(['gigs', 'coming'], (list) =>
                        list?.map((one) =>
                          one.id === saved.id
                            ? {
                                ...one,
                                status: saved.status,
                                isPlayable: saved.isPlayable,
                                slots: saved.slots,
                              }
                            : one,
                        ),
                      );
                      onAnswered();
                    },
                  },
                )
              }
            />
          ),
        }}
      />
      {answer.isError && <Message kind="danger">{t('gigs.gig.saveFailed')}</Message>}
    </li>
  );
}

type HomeHeroProps = { gig: GigSummary; language: string; now: Date };

// The confirmed gig of the day. The list of gigs does not carry its
// costumes, its address nor its coordinates: they are asked with the gig.
function HomeHero({ gig, language, now }: HomeHeroProps) {
  const { t } = useTranslation();
  const full = useGig(gig.id).data;
  const maps = full ? mapsUrl(full) : null;

  // "Aujourd'hui", and how long before the band meets on the first day; once
  // the time has come, and on the next days of a gig of several days, that
  // the gig is in progress.
  const isFirstDay = dayOf(gig.startsOn).getTime() === startOfDay(now);
  let moment: string | null = null;
  if (!isFirstDay) {
    moment = t('gigs.status.inProgress');
  } else if (gig.meetingTime) {
    const [hours, minutes] = gig.meetingTime.split(':').map(Number);
    const meeting = dayOf(gig.startsOn);
    meeting.setHours(hours ?? 0, minutes ?? 0);
    const left = Math.round((meeting.getTime() - now.getTime()) / 60_000);
    const relative = new Intl.RelativeTimeFormat(language, { style: 'short' });
    moment =
      left <= 0
        ? t('gigs.status.inProgress')
        : t('home.hero.meetingIn', {
            when:
              left < 60
                ? relative.format(left, 'minute')
                : relative.format(Math.round(left / 60), 'hour'),
          });
  }

  return (
    <GigHero
      kicker={[t('home.hero.today'), moment].filter(Boolean).join(' · ')}
      name={gig.name}
      when={meetingText(t, gig, language) ?? undefined}
      where={(full ? whereText(full) : shortPlace(gig)) || undefined}
      to={`/gigs/${gig.id}`}
      picture={
        full && (
          <GigPicture
            status={full.status}
            costumePictures={full.costumes.flatMap((costume) =>
              costume.pictureUrl ? [costume.pictureUrl] : [],
            )}
          />
        )
      }
      action={
        maps && (
          <Button
            size="small"
            icon="MapPin"
            onClick={() => window.open(maps, '_blank', 'noopener,noreferrer')}
          >
            {t('gigs.gig.go')}
          </Button>
        )
      }
    >
      <StatusChip gig={gig} />
      <OwnAnswerChip gig={gig} />
    </GigHero>
  );
}
