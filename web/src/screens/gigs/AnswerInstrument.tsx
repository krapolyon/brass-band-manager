import { useState } from 'react';
import type { AttendanceAnswer } from '../../components/AttendanceChoices.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import type { Gig } from '../../gigs.ts';
import { instrumentsOf, type Section } from '../../members.ts';

// Figma: Gigs, section 26 (1.1.0). Under the answers of a member who holds a
// secondary instrument: the instrument they come with, their own first and by
// default. One choice for the gig (model/gigs.md, "Coming with the other
// instrument").

/** Who answers, as far as the instrument goes. */
export type Player = { id: number; instrumentId: number; secondaryInstrumentId: number | null };

/** The instrument a member comes with on this gig: the one they declared, else their own. */
export function declaredInstrument(gig: Gig, player: Player): number {
  for (const slot of gig.slots) {
    const declared = slot.answers.find((one) => one.memberId === player.id)?.instrumentId;
    // One that is no longer theirs (the secondary changed since) is
    // dropped: the next answer corrects it (model/gigs.md, "The server checks it").
    if (declared !== undefined && declared !== null && declared === player.secondaryInstrumentId) {
      return declared;
    }
  }
  return player.instrumentId;
}

/** Shown once the member said they come, maybe or if needed; never for a no, or before answering. */
export function showsInstrument(player: Player, answers: (AttendanceAnswer | null)[]): boolean {
  return (
    player.secondaryInstrumentId !== null &&
    answers.some((answer) => answer !== null && answer !== 'NO')
  );
}

type Props = {
  player: Player;
  sections: Section[];
  value: number;
  onChange: (instrumentId: number) => void;
  /** "Tu viens avec" for oneself, "Vient avec" for another member. */
  caption: string;
};

export function AnswerInstrument({ player, sections, value, onChange, caption }: Props) {
  // The instrument just pressed shows at once, before the server has answered;
  // the saved one takes its place when it comes back.
  const [pressed, setPressed] = useState<{ value: number; over: number } | null>(null);
  const shown = pressed !== null && pressed.over === value ? pressed.value : value;
  const instruments = instrumentsOf(sections);
  const ids = [player.instrumentId, player.secondaryInstrumentId ?? player.instrumentId];
  const options = ids.map((id) => ({
    value: String(id),
    label: instruments.find((one) => one.id === id)?.name ?? '',
  }));

  return (
    <div className="gigs-instrument">
      <p className="gigs-muted textCaption" aria-hidden="true">
        {caption}
      </p>
      <SegmentedControl
        label={caption}
        options={options}
        value={String(ids.includes(shown) ? shown : player.instrumentId)}
        onChange={(chosen) => {
          setPressed({ value: Number(chosen), over: value });
          onChange(Number(chosen));
        }}
      />
    </div>
  );
}
