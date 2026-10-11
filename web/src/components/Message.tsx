import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './Message.css';

type Props = {
  /** Neutral is glass: a nudge or an explanation. Warning and Danger say what
   *  happened and what to do next. */
  kind?: 'neutral' | 'success' | 'warning' | 'danger';
  children: ReactNode;
};

// Figma: Message. One or two sentences inside a screen. The icon repeats the
// kind, so that colour is never the only signal. A warning or a danger is
// announced by screen readers when it appears.
export function Message({ kind = 'neutral', children }: Props) {
  const icon = kind === 'neutral' ? 'Info' : kind === 'success' ? 'Check' : 'Alert';

  return (
    <div
      className="Message textBody"
      data-kind={kind}
      role={kind === 'warning' || kind === 'danger' ? 'alert' : undefined}
    >
      <Icon name={icon} size={20} />
      <p>{children}</p>
    </div>
  );
}
