import { type DragEvent, useRef, useState } from 'react';
import { Button } from './Button.tsx';
import { Icon } from './Icon.tsx';
import './DropZone.css';

type Props = {
  /** Large: the top of the import. Compact: in a sheet. */
  size: 'large' | 'compact';
  title: string;
  hint: string;
  /** The label of the nested Button, which opens the file picker. */
  buttonLabel: string;
  /** The files dropped or chosen, in the order the browser gives them. */
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
};

// Figma: DropZone. Files dropped on the zone or chosen with its button. The
// button opens the browser's own file picker, so the zone works with a
// keyboard and on a phone; dropping is one more way, never the only one.
// While files hover, the dashed border takes the accent (Figma: "drag-over",
// described for the code, not drawn).
export function DropZone({
  size,
  title,
  hint,
  buttonLabel,
  onFiles,
  multiple = true,
  disabled = false,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  // How many nested elements the pointer is over: leaving a child is not leaving the zone.
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  function give(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  }

  function carriesFiles(event: DragEvent) {
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  function enter(event: DragEvent) {
    if (disabled || !carriesFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  }

  function leave(event: DragEvent) {
    if (disabled || !carriesFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }

  function over(event: DragEvent) {
    // Without this the browser refuses the drop and opens the file instead.
    if (disabled || !carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function drop(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (!disabled) give(event.dataTransfer.files);
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping is an addition for a pointer; the button inside does the same for everyone
    <div
      className="DropZone"
      data-size={size}
      data-dragging={dragging ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      onDragEnter={enter}
      onDragLeave={leave}
      onDragOver={over}
      onDrop={drop}
    >
      <Icon name="Upload" size={32} />
      <span className={`DropZone-title ${size === 'large' ? 'textHeading' : 'textBodyStrong'}`}>
        {title}
      </span>
      <span className="DropZone-hint textBody">{hint}</span>
      <Button
        kind="secondary"
        size="small"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {buttonLabel}
      </Button>
      {/* The browser's own file picker, opened by the button above. */}
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          give(event.target.files);
          // The same file can be chosen again after a correction.
          event.target.value = '';
        }}
      />
    </div>
  );
}
