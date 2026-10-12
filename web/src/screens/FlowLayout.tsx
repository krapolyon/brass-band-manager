import type { FormEvent, ReactNode } from 'react';
import { Halo } from '../components/Halo.tsx';
import { ScreenTop } from '../components/ScreenTop.tsx';
import './FlowLayout.css';

type Props = {
  /** Above the title: the language button, or the way back and the step. */
  nav?: ReactNode;
  /** On a phone, puts the nav at the end of its line, as on the welcome screen. */
  navAtEnd?: boolean;
  /** One action at the end of the line of the nav: the accessibility button before sign-in. */
  action?: ReactNode;
  /** The band above the title, on a screen shown before sign-in. */
  band?: ReactNode;
  title: string;
  lead?: string;
  /** The sheets, fields and messages of the screen. */
  children?: ReactNode;
  /** The BottomBar of the screen. */
  actions?: ReactNode;
  /** How far the content spreads on the largest screens: a form stops earlier than a list of cards. */
  width?: 'form' | 'cards';
  /** Makes the content and its actions a form: pressing Enter in a field sends it. */
  onSubmit?: () => void;
};

// After a form was refused: puts the focus on its first faulty field, once
// the errors are on the screen, so that the member lands where to fix.
export function focusFirstError() {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(
        '.FlowLayout .TextField[data-error="true"] :is(input, select, button)',
      )
      ?.focus();
  });
}

// The frame of every screen of the install, and of every flow in steps, at
// the four widths of the design. It is layout only (Figma: "plain frames
// remain only for layout: the panes, the columns"):
//
//   below 768    one column, the halo at the top, the actions at the bottom
//   from 768     the same column, centred, 640 wide
//   from 1024    on the left, a floating glass panel over the halo, as tall
//                as the window: the nav and the title. On the right, on plain
//                ground, the content then its actions
//   from 1920    the same, with a wider panel
export function FlowLayout({
  nav,
  navAtEnd,
  action,
  band,
  title,
  lead,
  children,
  actions,
  width = 'form',
  onSubmit,
}: Props) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };
  const Right = onSubmit ? 'form' : 'div';

  return (
    <main className="FlowLayout" data-width={width}>
      <div className="FlowLayout-left">
        <Halo />
        <div className="FlowLayout-glass" />
        <ScreenTop
          leading={navAtEnd ? undefined : nav}
          action={action ?? (navAtEnd ? nav : undefined)}
          band={band}
          title={title}
          subtitle={lead}
        />
      </div>
      <Right className="FlowLayout-right" onSubmit={onSubmit ? submit : undefined} noValidate>
        <div className="FlowLayout-content">{children}</div>
        {actions}
      </Right>
    </main>
  );
}
