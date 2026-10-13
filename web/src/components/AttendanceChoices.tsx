import { type KeyboardEvent, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceButton } from './ChoiceButton.tsx';
import './AttendanceChoices.css';

/** The four answers of the model (attendanceAnswer in model/gigs.dbml). */
export type AttendanceAnswer = 'YES' | 'NO' | 'MAYBE' | 'IF_NEEDED';

const ANSWERS: AttendanceAnswer[] = ['YES', 'NO', 'MAYBE', 'IF_NEEDED'];

type Props = {
  /** Large: a gig with one slot, or a sheet. Small: a slot card. */
  size?: 'large' | 'small';
  /** Figma: "Answer". null is None: no answer yet, never shown as a no. */
  answer: AttendanceAnswer | null;
  onChange: (answer: AttendanceAnswer) => void;
  /** What is answered, for screen readers: the name of the slot, or of the member answered for. */
  label: string;
  disabled?: boolean;
};

// Figma: Attendance/Choices. The four answers to a gig slot, two by two. One
// word each, the same everywhere in the app. An answer is changed, never
// taken back: there is no way to go back to none.
//
// An answer is saved as soon as it is chosen, and one answer can confirm a
// gig for good. So the arrows only move between the four, unlike the radio
// buttons of the browser, which choose as they move: Space chooses.
export function AttendanceChoices({ size = 'large', answer, onChange, label, disabled }: Props) {
  const { t } = useTranslation();
  const name = useId();

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const inputs = [...event.currentTarget.querySelectorAll('input')];
    const index = inputs.indexOf(document.activeElement as HTMLInputElement);
    inputs[(index + step + inputs.length) % inputs.length]?.focus();
  };

  return (
    <div
      className="AttendanceChoices"
      data-size={size}
      role="radiogroup"
      aria-label={label}
      onKeyDown={move}
    >
      {ANSWERS.map((value) => (
        <ChoiceButton
          key={value}
          size={size}
          name={name}
          value={value}
          checked={answer === value}
          disabled={disabled}
          onChange={() => onChange(value)}
        >
          {t(`gigs.answer.${value}`)}
        </ChoiceButton>
      ))}
    </div>
  );
}
