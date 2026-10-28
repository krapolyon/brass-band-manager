import { type InputHTMLAttributes, type ReactNode, useId, useRef } from 'react';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import './TextField.css';

type Common = {
  /** Always shown above the field, never inside it. */
  label: string;
  /** Under the field: the rule, given before the member breaks it. */
  hint?: string;
  /** Figma: Hint=Success, a check and the success colour: the rule the hint gave is met. */
  hintTone?: 'neutral' | 'success';
  /** What is wrong and what to do. Replaces the hint and turns the field red. */
  error?: string;
};

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> &
  Common & {
    /** At the end of the field (Figma: "Trailing icon"): the eye of a password, for instance. */
    trailing?: ReactNode;
    /** A date that may be left empty: once filled, the field offers to empty it
     *  (Figma: Icon/Close as the trailing icon). The date picker of a phone has
     *  no way to clear a date. The label names the button for screen readers. */
    clear?: { label: string; onClear: () => void };
  };

// Figma: TextField. Its states are those of the input: Empty shows the
// placeholder, Filled a value, Focused the focus, Disabled the `disabled`
// attribute; Error is the `error` prop.
//
// A date shows Icon/Calendar at its end, and the whole field opens the picker
// of the device. The browser's own calendar button is hidden: one icon, the
// one of the design.
export function TextField({ label, hint, hintTone, error, trailing, clear, ...input }: Props) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const isDate = input.type === 'date';

  let end = trailing;
  if (end === undefined && isDate) {
    end =
      clear && input.value ? (
        <IconButton
          icon="Close"
          label={clear.label}
          tone="muted"
          onClick={() => {
            clear.onClear();
            // The member goes on from the field they emptied.
            field.current?.focus();
          }}
        />
      ) : (
        <Icon name="Calendar" />
      );
  }

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      hintTone={hintTone}
      error={error}
      disabled={input.disabled}
    >
      <input
        className="textBodyLarge"
        id={id}
        ref={field}
        aria-invalid={error ? true : undefined}
        aria-describedby={(error ?? hint) ? `${id}-hint` : undefined}
        {...input}
        onClick={(event) => {
          input.onClick?.(event);
          if (!isDate || input.disabled || input.readOnly) return;
          // A computer opens the picker only from its own button, hidden
          // here. A browser that cannot do it opens its picker by itself.
          try {
            event.currentTarget.showPicker();
          } catch {
            // Nothing to do: the field can still be typed in.
          }
        }}
      />
      {end}
    </Field>
  );
}

type SelectProps = Common & {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
};

// Figma: TextField with a chevron as trailing icon, for a short list. It is
// the browser's own <select>: the list it opens is the one of the device.
export function SelectField({ label, hint, error, value, onChange, options }: SelectProps) {
  const id = useId();

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <select
        className="textBodyLarge"
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={(error ?? hint) ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="ChevronDown" />
    </Field>
  );
}

type PickerProps = Common & {
  /** What is chosen, in words; empty when nothing is. */
  value: string;
  /** Shown while nothing is chosen. */
  placeholder?: string;
  /** Opens the panel the choice is made in. */
  onPick: () => void;
};

// Figma: TextField with a chevron as trailing icon, for a choice made in a
// panel (BottomSheet or Dialog). The field is a button that opens it.
export function PickerField({ label, hint, error, value, placeholder, onPick }: PickerProps) {
  const id = useId();

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {/* Named by its label and by what it shows: "Instrument, Sax Ténor". */}
      <button
        className="textBodyLarge"
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-labelledby={`${id}-label ${id}`}
        aria-describedby={(error ?? hint) ? `${id}-hint` : undefined}
        data-empty={value === '' ? 'true' : undefined}
        onClick={onPick}
      >
        {value === '' ? placeholder : value}
      </button>
      <Icon name="ChevronDown" />
    </Field>
  );
}

// What the three forms share: the label above, the box, the hint or the error below.
function Field({
  id,
  label,
  hint,
  hintTone,
  error,
  disabled,
  children,
}: Common & { id: string; disabled?: boolean; children: ReactNode }) {
  const message = error ?? hint;
  const isMet = !error && hint !== undefined && hintTone === 'success';

  return (
    <div
      className="TextField"
      data-error={error ? 'true' : undefined}
      data-hint={isMet ? 'success' : undefined}
      data-disabled={disabled}
    >
      <label className="textLabel" id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      <div className="TextField-box">{children}</div>
      {/* An error or a success is announced, so that it is heard as well as
          seen. A neutral hint is only read with the field: a countdown would
          be spoken at each key. */}
      <p
        className="TextField-hint textCaption"
        id={`${id}-hint`}
        aria-live={error || isMet ? 'polite' : 'off'}
      >
        {error && <Icon name="Alert" size={16} />}
        {isMet && <Icon name="Check" size={16} />}
        {message && <span>{message}</span>}
      </p>
    </div>
  );
}
