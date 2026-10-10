import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import './Button.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Primary: the one main action of a screen. Secondary: another action of
   *  equal weight. Quiet: a minor action. Danger: a destructive action. */
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'large' | 'small';
  /** An icon before the label (Figma: "Show icon" and "Icon"). */
  icon?: IconName;
};

// Figma: Button. A button says what it does and keeps the same name through
// a flow. The disabled state of Figma is the `disabled` attribute.
export function Button({
  kind = 'primary',
  size = 'large',
  icon,
  type = 'button',
  children,
  ...rest
}: Props) {
  return (
    <button
      className={`Button ${size === 'large' ? 'textButton' : 'textLabel'}`}
      data-kind={kind}
      data-size={size}
      type={type}
      {...rest}
    >
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  );
}
