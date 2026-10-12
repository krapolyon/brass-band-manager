import { useId } from 'react';
import { Slider } from './Slider.tsx';
import './SliderRow.css';

type Props = {
  label: string;
  /** The current value in words: "120 %". */
  value: string;
  description?: string;
  steps: number;
  step: number;
  onChange: (step: number) => void;
};

// Figma: SliderRow. A setting on a scale with a few stops: its label, its
// current value, the Slider between a small and a large mark, a description.
export function SliderRow({ label, value, description, steps, step, onChange }: Props) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <div className="SliderRow">
      <div className="SliderRow-label textBodyStrong">
        <span id={labelId}>{label}</span>
        <span className="SliderRow-value">{value}</span>
      </div>
      <div className="SliderRow-scale">
        <span className="textCaption" aria-hidden="true">
          A
        </span>
        <Slider
          steps={steps}
          step={step}
          onChange={onChange}
          labelledBy={labelId}
          describedBy={description ? descriptionId : undefined}
          valueText={value}
        />
        <span className="textHeading" aria-hidden="true">
          A
        </span>
      </div>
      {description && (
        <p className="SliderRow-description textCaption" id={descriptionId}>
          {description}
        </p>
      )}
    </div>
  );
}
