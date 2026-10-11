import { Icon, type IconName } from './Icon.tsx';
import './QuickAction.css';

type Props = {
  icon: IconName;
  label: string;
  /** What the action opens: a phone number, an email, an address. */
  href: string;
};

// Figma: QuickAction. One action among two or three shown side by side, all
// the same width: an icon and one word. An action that cannot be done is not
// shown.
export function QuickAction({ icon, label, href }: Props) {
  return (
    <a className="QuickAction textLabel" href={href}>
      <Icon name={icon} />
      {label}
    </a>
  );
}
