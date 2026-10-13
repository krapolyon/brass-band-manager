import './ListRow.css';
import './SongPartRow.css';

type Props = {
  /** Available: can be shown. Shown: the part on screen. Missing: the instrument has no score for this song. */
  state: 'available' | 'shown' | 'missing';
  /** The instrument. */
  name: string;
  /** Under the name: "Affichée", "Pas de partition pour ce morceau". */
  detail?: string;
  onPress?: () => void;
};

// Figma: SongPart/Row. One part in the picker of the PDF mode. It is the
// ListRow of Figma, nested: the same row, as a button. The part on screen is
// told by its detail in the accent, and to screen readers by aria-current. A
// missing part is muted and does nothing, but keeps the focus, so that the
// reason written under its name can be read.
export function SongPartRow({ state, name, detail, onPress }: Props) {
  const missing = state === 'missing';

  return (
    <button
      className="ListRow SongPartRow"
      type="button"
      data-state={state}
      aria-current={state === 'shown' ? 'true' : undefined}
      aria-disabled={missing ? 'true' : undefined}
      onClick={() => {
        if (!missing) onPress?.();
      }}
    >
      <span className="ListRow-texts">
        <span className="textBodyLarge">{name}</span>
        {detail && <span className="ListRow-detail textCaption">{detail}</span>}
      </span>
    </button>
  );
}
