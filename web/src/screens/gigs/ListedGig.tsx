import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { GigCard } from '../../components/GigCard.tsx';
import { type GigSummary, momentOf, nearestSlot, sectionNames, showsPlayable } from '../../gigs.ts';
import type { Section } from '../../members.ts';
import { OwnAnswerChip, StatusChip } from './chips.tsx';
import { dateBlock, meetingText, playableText as playableTextOf, shortPlace } from './format.ts';

type Props = {
  gig: GigSummary;
  sections: Section[] | undefined;
  language: string;
  selected?: boolean;
  /** What the home screen adds to the card: its own link, the line "Nouveau", the answers. */
  home?: Pick<
    ComponentProps<typeof GigCard>,
    'to' | 'showNew' | 'newLabel' | 'newText' | 'showAnswers' | 'answers'
  >;
};

// A gig as its card in a list, in the list of gigs and on the home screen:
// what the card says is decided here.
export function ListedGig({ gig, sections, language, selected = false, home }: Props) {
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
        count > 1
          ? t('gigs.playable.onSlots', { count: playableSlots })
          : playableTextOf(t, gig.slots[0] ?? { playableThanksTo: [] }, language);
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
      {...home}
    >
      <StatusChip gig={gig} />
      <OwnAnswerChip gig={gig} />
    </GigCard>
  );
}
