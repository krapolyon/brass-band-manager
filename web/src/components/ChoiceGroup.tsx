import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './ChoiceGroup.css';

type Props = {
  label: string;
  /** Figma: "Hint" and "Show hint": the rule of the choice. */
  hint?: string;
  /** What is wrong with the choice: replaces the hint, as on a TextField. */
  error?: string;
  /** Figma: the Choices slot: ChoiceButton Small, or FilterChip for sections. */
  children: ReactNode;
};

// Figma: ChoiceGroup. A labelled set of choices that wrap: the mood of a
// song, the places it can be played at, the sections it tires. In code a
// fieldset, its legend the label, so that a screen reader names the group
// with each choice.
export function ChoiceGroup({ label, hint, error, children }: Props) {
  const message = error ?? hint;
  return (
    <fieldset className="ChoiceGroup" data-error={error ? 'true' : undefined}>
      <legend className="textLabel">{label}</legend>
      <div className="ChoiceGroup-choices">{children}</div>
      {/* Announced when it changes, so that an error is heard as well as seen. */}
      <p className="ChoiceGroup-hint textCaption" aria-live="polite">
        {error && <Icon name="Alert" size={16} />}
        {message && <span>{message}</span>}
      </p>
    </fieldset>
  );
}
