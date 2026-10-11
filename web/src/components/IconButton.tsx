import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import './IconButton.css';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: IconName;
  /** What the button does, in words: read by screen readers, since the button shows only an icon. */
  label: string;
  /** Glass: floats over a halo or an artwork. Control: sits on a sheet. Plain: inside a row. */
  kind?: 'glass' | 'control' | 'plain';
  /** Colour of the icon when it is not the colour of the text. */
  tone?: 'text' | 'muted' | 'accent';
};

// Figma: IconButton. A round button that shows only an icon, 44 px wide: the
// smallest touch target.
export function IconButton({
  icon,
  label,
  kind = 'plain',
  tone = 'text',
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      className="IconButton"
      data-kind={kind}
      data-tone={tone}
      type={type}
      aria-label={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
