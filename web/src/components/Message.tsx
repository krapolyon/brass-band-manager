import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './Message.css';

type Props = {
  /** Neutral is glass: a nudge or an explanation. Warning and Danger say what
   *  happened and what to do next. */
  kind?: 'neutral' | 'success' | 'warning' | 'danger';
  children: ReactNode;
  /** A nudge that sends to the place it speaks of (a card further down): the
   *  whole message is then a button. */
  onPress?: () => void;
};

// Figma: Message. One or two sentences inside a screen. The icon repeats the
// kind, so that colour is never the only signal. A warning or a danger is
// announced by screen readers when it appears, at once; a success too, when
// they have finished speaking.
export function Message({ kind = 'neutral', children, onPress }: Props) {
  const icon = kind === 'neutral' ? 'Info' : kind === 'success' ? 'Check' : 'Alert';

  if (onPress) {
    return (
      <button type="button" className="Message textBody" data-kind={kind} onClick={onPress}>
        <Icon name={icon} size={20} />
        <span className="Message-text">{children}</span>
      </button>
    );
  }

  return (
    <div
      className="Message textBody"
      data-kind={kind}
      role={
        kind === 'warning' || kind === 'danger'
          ? 'alert'
          : kind === 'success'
            ? 'status'
            : undefined
      }
    >
      <Icon name={icon} size={20} />
      <p>{children}</p>
    </div>
  );
}
