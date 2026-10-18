import './SetlistLength.css';

type Props = {
  /** "4 morceaux · ≈ 17 min". */
  length: string;
  /** Figma: "Note" and "Show note": the songs without a length. */
  note?: string;
};

// Figma: Setlist/Length. How many songs a setlist holds and how long it
// lasts, under the list of the editor (model/gigs.md, entry 4). Announced
// politely as the list changes.
export function SetlistLength({ length, note }: Props) {
  return (
    <p className="SetlistLength" aria-live="polite">
      <span className="textBodyStrong">{length}</span>
      {note && <span className="SetlistLength-note textCaption">{note}</span>}
    </p>
  );
}
