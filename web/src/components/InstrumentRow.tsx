import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import { ListRow } from './ListRow.tsx';

type Props = {
  /** The band's own word for the instrument: never translated. */
  name: string;
} & (
  | {
      /** Picked among others, as at install. */
      choice: 'ticked' | 'unticked';
      onToggle: (ticked: boolean) => void;
      /** The button at the end of the row, and what it does in words. */
      onMore: () => void;
      moreLabel: string;
    }
  | {
      /** Listed, with its action (Figma: Choice=None): an instrument of the band, in its settings. */
      choice: 'listed';
      /** Under the name: how many members play it. */
      detail?: string;
      onMore: () => void;
      moreLabel: string;
    }
  | {
      /** One of a list where a single one is chosen; `current` is the one chosen. */
      choice: 'none' | 'current';
      onPress: () => void;
    }
);

// Figma: Instrument/Row. An instrument as one line of a list.
export function InstrumentRow(props: Props) {
  if ('onToggle' in props) {
    return (
      <ListRow
        label={props.name}
        checked={props.choice === 'ticked'}
        onCheck={props.onToggle}
        trailing={<IconButton icon="More" label={props.moreLabel} onClick={props.onMore} />}
      />
    );
  }

  if (props.choice === 'listed') {
    return (
      <ListRow
        label={props.name}
        detail={props.detail}
        trailing={<IconButton icon="More" label={props.moreLabel} onClick={props.onMore} />}
      />
    );
  }

  const isCurrent = props.choice === 'current';
  return (
    <ListRow
      label={props.name}
      onPress={props.onPress}
      current={isCurrent}
      trailing={
        isCurrent ? (
          <span className="ListRow-mark">
            <Icon name="Check" />
          </span>
        ) : undefined
      }
    />
  );
}
