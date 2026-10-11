import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './BottomBar.css';

type Props = {
  /** Glass: pinned over a screen that scrolls. Plain: ends a screen that fits. */
  surface?: 'glass' | 'plain';
  /** Above the buttons: counts what was chosen (info) or says why the button is off (warning). */
  caption?: { kind: 'info' | 'warning'; text: string };
  /** The buttons, the one that moves forward first. On a desktop it is shown last, on the right. */
  children: ReactNode;
};

// Figma: BottomBar. The main action of a screen, at the bottom, where the
// thumb rests. From the desktop width it is no longer a bar: the same buttons
// end the content, aligned to its right (see BottomBar.css).
export function BottomBar({ surface = 'plain', caption, children }: Props) {
  return (
    <div className="BottomBar" data-surface={surface}>
      {caption && (
        <p className="BottomBar-caption textCaption" data-kind={caption.kind}>
          {caption.kind === 'warning' && <Icon name="Alert" size={16} />}
          {caption.text}
        </p>
      )}
      <div className="BottomBar-buttons">{children}</div>
    </div>
  );
}
