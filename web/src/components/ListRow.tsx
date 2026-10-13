import { type ReactNode, useId } from 'react';
import { Checkbox } from './Checkbox.tsx';
import { Icon } from './Icon.tsx';
import { Radio } from './Radio.tsx';
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
  /** Figma: Leading=Checked or Unchecked. The row starts with a checkbox, and pressing its label ticks it. */
  checked?: boolean;
  onCheck?: (checked: boolean) => void;
  /**
   * Figma: Leading=Selected or Unselected. The row starts with a radio: one
   * choice among the rows that share `group`, inside a `radiogroup`.
   */
  selected?: boolean;
  onSelect?: () => void;
  group?: string;
  /** Figma: State=Disabled. A choice that cannot be made: `detail` says why. */
  disabled?: boolean;
};

// Figma: ListRow. One line of a list: a label, an optional detail and an
// optional action at the end.
export function ListRow({
  label,
  detail,
  trailing,
  add,
  onPress,
  current,
  checked,
  onCheck,
  selected,
  onSelect,
  group,
  disabled,
}: Props) {
  const id = useId();
  const texts = (
    <span className="ListRow-texts">
      <span className={add ? 'textBodyStrong' : 'textBodyLarge'}>{label}</span>
      {detail && <span className="ListRow-detail textCaption">{detail}</span>}
    </span>
  );

  if (onSelect) {
    return (
      <div className="ListRow" data-selected={selected ?? false} data-disabled={disabled}>
        {/* The label is the touch target of the radio and gives it its name. */}
        <label className="ListRow-check" htmlFor={id}>
          <Radio
            id={id}
            name={group}
            checked={selected ?? false}
            disabled={disabled}
            onChange={onSelect}
          />
          {texts}
        </label>
        {trailing}
      </div>
    );
  }

  if (onCheck) {
    return (
      <div className="ListRow">
        {/* The label is the touch target of the checkbox and gives it its name. */}
        <label className="ListRow-check" htmlFor={id}>
          <Checkbox
            id={id}
            checked={checked ?? false}
            onChange={(event) => onCheck(event.target.checked)}
          />
          {texts}
        </label>
        {trailing}
      </div>
    );
  }

  const content = (
    <>
      {add && <Icon name="Plus" />}
      {texts}
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
