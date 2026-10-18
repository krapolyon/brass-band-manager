import type { ReactNode } from 'react';
import './ChoiceGroup.css';

type Props = {
  label: string;
  /** Figma: "Hint" and "Show hint": the rule of the choice. */
  hint?: string;
  /** Figma: the Choices slot: ChoiceButton Small, or FilterChip for sections. */
  children: ReactNode;
};

// Figma: ChoiceGroup. A labelled set of choices that wrap: the category of a
// song, the sections it tires. In code a fieldset, its legend the label, so
// that a screen reader names the group with each choice.
export function ChoiceGroup({ label, hint, children }: Props) {
  return (
    <fieldset className="ChoiceGroup">
      <legend className="textLabel">{label}</legend>
      <div className="ChoiceGroup-choices">{children}</div>
      {hint && <p className="ChoiceGroup-hint textCaption">{hint}</p>}
    </fieldset>
  );
}
