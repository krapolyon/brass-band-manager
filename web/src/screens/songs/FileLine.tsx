import type { IconName } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { SongFileRow } from '../../components/SongFileRow.tsx';
import { useIsDesktop } from './device.ts';

type Props = {
  /** Where the file goes: "Jaquette", or an instrument. */
  label: string;
  fileName: string;
  action: { icon: IconName; label: string; onPress: () => void };
};

// A file placed by the import or waiting to replace another. Figma:
// SongFile/Row on a desktop, where the role and the name sit on one line; on
// a phone a ListRow, the name under the role.
export function FileLine({ label, fileName, action }: Props) {
  const isDesktop = useIsDesktop();

  if (isDesktop) return <SongFileRow label={label} fileName={fileName} action={action} />;

  return (
    <ListRow
      label={label}
      detail={fileName}
      trailing={<IconButton icon={action.icon} label={action.label} onClick={action.onPress} />}
    />
  );
}
