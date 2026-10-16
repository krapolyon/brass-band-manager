import { type TextareaHTMLAttributes, useCallback, useEffect, useId, useRef } from 'react';
import { Icon } from './Icon.tsx';
import './TextArea.css';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'rows'> & {
  /** Always shown above the field, never inside it. */
  label: string;
  /** Under the field: the rule, given before the member breaks it. */
  hint?: string;
  /** What is wrong and what to do. Replaces the hint and turns the field red. */
  error?: string;
  /** Figma: "Lines". 2 for the note of a slot, an address or the description
   *  of a setlist, 4 for the notes of a gig. The field starts at that height
   *  and grows with its text. */
  lines?: 2 | 4;
};

// Figma: TextArea. A few lines of free text. Its states are those of the
// textarea: Empty shows the placeholder, Filled a value, Focused the focus;
// Error is the `error` prop. The text is 16 px at least, so that an iPhone
// does not zoom when the field takes the focus.
//
// The field grows with its text, so that what is typed is read without
// scrolling inside it: never shorter than its number of lines.
export function TextArea({ label, hint, error, lines = 4, ...textarea }: Props) {
  const id = useId();
  const message = error ?? hint;
  const field = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const element = field.current;
    if (!element) return;
    // Back to the height of its lines, then as tall as its text.
    element.style.height = '';
    element.style.height = `${Math.max(element.scrollHeight, element.clientHeight)}px`;
  }, []);

  // Each change of the text, and each change of width: the text wraps anew.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the value is what changes the height
  useEffect(fit, [fit, textarea.value]);
  // The size of the letters changes the height of the lines, not the width:
  // the fonts finishing loading, and the text size, the legible font or the
  // spacing of the member, written on the root element (appearance.ts).
  useEffect(() => {
    void document.fonts?.ready.then(fit);
    const options = new MutationObserver(fit);
    options.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-text-size', 'data-typeface', 'data-spacing'],
    });
    return () => options.disconnect();
  }, [fit]);
  useEffect(() => {
    const element = field.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

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
        ref={field}
        {...textarea}
        onInput={(event) => {
          textarea.onInput?.(event);
          fit();
        }}
      />
      {/* Announced when it changes, so that an error is heard as well as seen. */}
      <p className="TextArea-hint textCaption" id={`${id}-hint`} aria-live="polite">
        {error && <Icon name="Alert" size={16} />}
        {message && <span>{message}</span>}
      </p>
    </div>
  );
}
