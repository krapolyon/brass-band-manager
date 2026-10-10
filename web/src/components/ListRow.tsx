import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './ListRow.css';

type Props = {
  label: string;
  /** A second, smaller line under the label (Figma: "Detail"). */
  detail?: string;
  /** At the end of the row (Figma: "Show action"): a button of its own, or a mark. */
  trailing?: ReactNode;
  /** Figma: Leading=Add, the line that adds an item to the list. */
  add?: boolean;
  /** Makes the whole row a button. Not to be combined with a button in `trailing`. */
  onPress?: () => void;
  /** With `onPress`: this row is the one currently chosen in its list. */
  current?: boolean;
};

// Figma: ListRow. One line of a list: a label, an optional detail and an
// optional action at the end. The rows with a checkbox (Leading=Unchecked and
// Checked) come with the screens that tick things.
export function ListRow({ label, detail, trailing, add, onPress, current }: Props) {
  const content = (
    <>
      {add && <Icon name="Plus" />}
      <span className="ListRow-texts">
        <span className={add ? 'textBodyStrong' : 'textBodyLarge'}>{label}</span>
        {detail && <span className="ListRow-detail textCaption">{detail}</span>}
      </span>
      {trailing}
    </>
  );

  if (onPress) {
    return (
      <button
        className="ListRow"
        data-add={add}
        type="button"
        onClick={onPress}
        aria-current={current ? 'true' : undefined}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="ListRow" data-add={add}>
      {content}
    </div>
  );
}
