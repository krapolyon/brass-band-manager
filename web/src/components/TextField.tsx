import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { Icon } from './Icon.tsx';
import './TextField.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  /** Always shown above the field, never inside it. */
  label: string;
  /** Under the field: the rule, given before the member breaks it. */
  hint?: string;
  /** What is wrong and what to do. Replaces the hint and turns the field red. */
  error?: string;
  /** At the end of the field (Figma: "Trailing icon"): the eye of a password, for instance. */
  trailing?: ReactNode;
};

// Figma: TextField. Its states are those of the input: Empty shows the
// placeholder, Filled a value, Focused the focus, Disabled the `disabled`
// attribute; Error is the `error` prop.
export function TextField({ label, hint, error, trailing, ...input }: Props) {
  const id = useId();
  const message = error ?? hint;

  return (
    <div
      className="TextField"
      data-error={error ? 'true' : undefined}
      data-disabled={input.disabled}
    >
      <label className="textLabel" htmlFor={id}>
        {label}
      </label>
      <div className="TextField-box">
        <input
          className="textBodyLarge"
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? `${id}-hint` : undefined}
          {...input}
        />
        {trailing}
      </div>
      {/* Announced when it changes, so that an error is heard as well as seen. */}
      <p className="TextField-hint textCaption" id={`${id}-hint`} aria-live="polite">
        {error && <Icon name="Alert" size={16} />}
        {message && <span>{message}</span>}
      </p>
    </div>
  );
}
