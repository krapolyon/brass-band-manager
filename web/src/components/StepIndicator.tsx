import './StepIndicator.css';

type Props = {
  /** The step the member is on, starting at 1. */
  step: number;
  /** How many steps the flow has. */
  of: number;
  /** The same thing in words: "Étape 2 sur 3". */
  label: string;
};

// Figma: StepIndicator. Shows where the member is in a flow of several steps.
// The label carries the words; the line under it only repeats them.
export function StepIndicator({ step, of, label }: Props) {
  const bars = Array.from({ length: of }, (_, index) => index + 1);

  return (
    <div className="StepIndicator">
      <span className="textLabel">{label}</span>
      <span className="StepIndicator-progress" aria-hidden="true">
        {bars.map((bar) => (
          <span key={bar} data-done={bar <= step} />
        ))}
      </span>
    </div>
  );
}
