import { type TextareaHTMLAttributes, useId } from 'react';
import { Icon } from './Icon.tsx';
import './TextArea.css';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'rows'> & {
  /** Always shown above the field, never inside it. */
  label: string;
  /** Under the field: the rule, given before the member breaks it. */
  hint?: string;
  /** What is wrong and what to do. Replaces the hint and turns the field red. */
  error?: string;
  /** Figma: "Lines". 2 for the note of a slot, 4 for the notes of a gig. */
  lines?: 2 | 4;
};

// Figma: TextArea. A few lines of free text. Its states are those of the
// textarea: Empty shows the placeholder, Filled a value, Focused the focus;
// Error is the `error` prop. The text is 16 px at least, so that an iPhone
// does not zoom when the field takes the focus.
export function TextArea({ label, hint, error, lines = 4, ...textarea }: Props) {
  const id = useId();
  const message = error ?? hint;

  return (
    <div className="TextArea" data-error={error ? 'true' : undefined}>
      <label className="textLabel" htmlFor={id}>
        {label}
      </label>
      <textarea
        className="textBodyLarge"
        id={id}
        rows={lines}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? `${id}-hint` : undefined}
        {...textarea}
      />
      {/* Announced when it changes, so that an error is heard as well as seen. */}
      <p className="TextArea-hint textCaption" id={`${id}-hint`} aria-live="polite">
        {error && <Icon name="Alert" size={16} />}
        {message && <span>{message}</span>}
      </p>
    </div>
  );
}
