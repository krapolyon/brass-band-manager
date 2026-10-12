import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button.tsx';
import { Icon } from './Icon.tsx';
import './ImageField.css';

type Props = {
  label: string;
  /** Under the field: the formats and the size accepted. */
  hint?: string;
  /** What is wrong with the file and what to do. Replaces the hint. */
  error?: string;
  /** The image chosen, or null. */
  value: File | null;
  /** The address of the image already saved, shown while no other is chosen. Removing it calls onChange(null) too. */
  current?: string | null;
  /** Called with the file the member chose, or null when they remove it. */
  onChange: (file: File | null) => void;
  /** The types offered by the file chooser, as in <input accept>. */
  accept: string;
};

// Figma: ImageField. Choosing one image file, a logo for instance. Empty
// offers to choose; Filled shows the image and lets the member change or
// remove it; Error says what is wrong with the file.
//
// The image is only read on the device: showing it sends nothing anywhere.
export function ImageField({ label, hint, error, value, current, onChange, accept }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const actions = useRef<HTMLDivElement>(null);

  // The button that removes disappears with the image: the focus goes to the one that chooses.
  const remove = () => {
    onChange(null);
    requestAnimationFrame(() => actions.current?.querySelector('button')?.focus());
  };
  const [chosen, setPreview] = useState<string | null>(null);
  // No file, no preview of a file: said at once, without waiting for the effect
  // below, so that the button that removes is gone before the focus moves.
  const preview = (value ? chosen : null) ?? current ?? null;
  const message = error ?? hint;

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out as this field is; the group and its name say the same thing
    <div
      className="ImageField"
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={message ? `${id}-hint` : undefined}
      data-error={error ? 'true' : undefined}
    >
      <span className="textLabel" id={`${id}-label`}>
        {label}
      </span>
      <div className="ImageField-box">
        <span className="ImageField-preview" data-filled={preview ? 'true' : undefined}>
          {preview ? <img src={preview} alt="" /> : <Icon name="Image" />}
        </span>
        <div className="ImageField-actions" ref={actions}>
          <Button
            kind="secondary"
            size="small"
            icon={preview ? undefined : 'Upload'}
            onClick={() => input.current?.click()}
          >
            {preview ? t('imageField.change') : t('imageField.choose')}
          </Button>
          {preview && (
            <Button kind="danger" size="small" icon="Trash" onClick={remove}>
              {t('imageField.remove')}
            </Button>
          )}
        </div>
        {/* The browser's own file chooser, opened by the button above. */}
        <input
          ref={input}
          type="file"
          accept={accept}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onChange(file);
            // So that choosing the same file again is still a change.
            event.target.value = '';
          }}
        />
      </div>
      <p className="ImageField-hint textCaption" id={`${id}-hint`} aria-live="polite">
        {error && <Icon name="Alert" size={16} />}
        {message && <span>{message}</span>}
      </p>
    </div>
  );
}
