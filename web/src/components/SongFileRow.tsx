import { Icon, type IconName } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import './SongFileRow.css';

type Props = {
  /** Figma: Role. Where the file goes: "Jaquette", "Fichier MIDI", or an instrument. */
  label: string;
  /** Figma: File. The name of the file, as it was dropped. */
  fileName: string;
  /** What was done to the file, written after its name: "recadrée en carré". */
  detail?: string;
  /** The button at the end: the pencil that corrects where the file goes, or the undo. */
  action?: { icon: IconName; label: string; onPress: () => void };
};

// Figma: SongFile/Row. A file the import has placed: a tick, where it goes,
// its name, and a button to correct it. Figma has one state only. On a
// phone a ListRow does the job.
export function SongFileRow({ label, fileName, detail, action }: Props) {
  return (
    <div className="SongFileRow">
      <Icon name="Check" size={20} />
      <span className="SongFileRow-role textBodyStrong">{label}</span>
      <span className="SongFileRow-file textBody">
        {fileName}
        {detail && ` · ${detail}`}
      </span>
      {action && <IconButton icon={action.icon} label={action.label} onClick={action.onPress} />}
    </div>
  );
}
