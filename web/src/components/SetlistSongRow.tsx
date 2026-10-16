import {
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useId,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon.tsx';
import { PlayedDots } from './PlayedDots.tsx';
import './SetlistSongRow.css';

type Props = {
  /** View: in a gig. Edit: in the form of a setlist, with its handle. */
  mode?: 'view' | 'edit';
  position: number;
  name: string;
  /** View: where touching the song leads. */
  to?: string;
  /** Figma: Show played. The times the song is in the other setlists of the gig. */
  played?: number;
  /** The same in words, for screen readers: "aussi 2 fois ailleurs sur ce plan". */
  playedLabel?: string;
  /** Edit: the drag handle. */
  children?: ReactNode;
  /** Edit: what makes the row one of a SortableList (the `row` of useSortableRow). */
  row?: HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement> };
  /** Edit: takes the song out of the setlist. */
  onRemove?: () => void;
  /** Edit: moves the song one place up (-1) or down (1), from the keyboard. */
  onMove?: (by: 1 | -1) => void;
  /** Edit: what the row does from the keyboard, said to screen readers. */
  keysLabel?: string;
  /** Edit: the word on the remove button, "Retirer". */
  removeLabel?: string;
  /** Edit: what the remove button does, for screen readers: "Retirer Toxic". */
  removeName?: string;
};

// The width of "Retirer" once revealed (104 in Figma), and how far a swipe
// goes before it removes the song outright: past this share of the row.
const REVEALED = 104;
const REMOVES = 0.6;

// Figma: SetlistSong/Row. A song at its place in a setlist: its position and
// the name the band gives it, large enough to read on stage. No cover, no
// original artist. In Edit, the handle moves the song; swiping the row to
// the left reveals "Retirer", and a longer swipe removes it (no menu). The
// same without a pointer: the row takes the focus, Delete removes it, Alt
// with an arrow moves it, and "Retirer" shows when it takes the focus.
export function SetlistSongRow({
  mode = 'view',
  position,
  name,
  to,
  played = 0,
  playedLabel,
  children,
  row,
  onRemove,
  onMove,
  keysLabel,
  removeLabel,
  removeName,
}: Props) {
  const keysId = useId();
  const [offset, setOffset] = useState(0);
  const [isSwiping, setSwiping] = useState(false);
  const swipe = useRef<{
    x: number;
    y: number;
    width: number;
    from: number;
    isHorizontal?: boolean;
  } | null>(null);

  const content = (
    <>
      <span className="SetlistSongRow-position textLabel">{position}</span>
      <span className="SetlistSongRow-name textBodyLarge">{name}</span>
      <PlayedDots count={played} />
      {played > 0 && playedLabel && <span className="visuallyHidden">{playedLabel}</span>}
    </>
  );

  if (mode === 'view') {
    return (
      <li className="SetlistSongRow" data-mode={mode} {...row}>
        {to ? (
          <Link className="SetlistSongRow-link" to={to}>
            {content}
          </Link>
        ) : (
          content
        )}
      </li>
    );
  }

  const start = (event: PointerEvent<HTMLElement>) => {
    // The handle drags the row, and a button keeps its press.
    if (!event.isPrimary || (event.target as Element).closest('button, .SortableHandle')) return;
    swipe.current = {
      x: event.clientX,
      y: event.clientY,
      width: event.currentTarget.getBoundingClientRect().width,
      from: offset,
    };
  };
  const follow = (event: PointerEvent<HTMLElement>) => {
    const at = swipe.current;
    if (!at) return;
    const [dx, dy] = [event.clientX - at.x, event.clientY - at.y];
    if (at.isHorizontal === undefined) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // A vertical move is the page scrolling: the row lets it be.
      at.isHorizontal = Math.abs(dx) > Math.abs(dy);
      if (!at.isHorizontal) {
        swipe.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      setSwiping(true);
    }
    setOffset(Math.min(at.width, Math.max(0, at.from - dx)));
  };
  const end = () => {
    const at = swipe.current;
    swipe.current = null;
    setSwiping(false);
    if (!at?.isHorizontal) return;
    if (offset >= at.width * REMOVES) {
      onRemove?.();
      return;
    }
    setOffset(offset >= REVEALED / 2 ? REVEALED : 0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove?.();
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      onMove?.(event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'Escape') {
      setOffset(0);
    }
  };

  return (
    <li
      className="SetlistSongRow"
      data-mode={mode}
      data-swiping={isSwiping ? 'true' : undefined}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the row itself takes the keys that remove and move it (model/gigs.md, entry 4)
      tabIndex={0}
      aria-describedby={keysLabel ? keysId : undefined}
      aria-keyshortcuts="Delete Alt+ArrowUp Alt+ArrowDown"
      onKeyDown={onKeyDown}
      onPointerDown={start}
      onPointerMove={follow}
      onPointerUp={end}
      onPointerCancel={end}
      {...row}
    >
      {content}
      {children}
      <button
        type="button"
        className="SetlistSongRow-remove"
        data-revealed={offset > 0 ? 'true' : undefined}
        style={offset > 0 ? { width: `${Math.max(offset, 0)}px` } : undefined}
        aria-label={removeName ?? removeLabel}
        onClick={onRemove}
      >
        <Icon name="Trash" />
        <span className="textLabel">{removeLabel}</span>
      </button>
      {keysLabel && (
        <span className="visuallyHidden" id={keysId}>
          {keysLabel}
        </span>
      )}
    </li>
  );
}
