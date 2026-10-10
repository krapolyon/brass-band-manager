import type { FormEvent, ReactNode } from 'react';
import { Halo } from '../../components/Halo.tsx';
import './InstallLayout.css';

type Props = {
  /** Above the title: the language button, or the way back and the step. */
  nav?: ReactNode;
  /** On a phone, puts the nav at the end of its line, as on the welcome screen. */
  navAtEnd?: boolean;
  title: string;
  lead: string;
  /** The sheets, fields and messages of the screen. */
  children?: ReactNode;
  /** The BottomBar of the screen. */
  actions?: ReactNode;
  /** How far the content spreads on the largest screens: a form stops earlier than a list of cards. */
  width?: 'form' | 'cards';
  /** Makes the content and its actions a form: pressing Enter in a field sends it. */
  onSubmit?: () => void;
};

// The frame of every screen of the install, at the four widths of the design.
// It is layout only (Figma: "plain frames remain only for layout: the panes,
// the columns"):
//
//   below 768    one column, the halo at the top, the actions at the bottom
//   from 768     the same column, centred, 640 wide
//   from 1024    two panes: on the left the halo, the nav and the title; on
//                the right, on plain ground, the content then its actions
//   from 1920    the same, with a wider left pane
export function InstallLayout({
  nav,
  navAtEnd,
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
    <main className="InstallLayout" data-width={width}>
      <div className="InstallLayout-left">
        <Halo />
        <div className="InstallLayout-column">
          {nav && (
            <div className="InstallLayout-nav" data-at-end={navAtEnd}>
              {nav}
            </div>
          )}
          <div className="InstallLayout-heading">
            <h1 className="textDisplay">{title}</h1>
            <p className="textBodyLarge">{lead}</p>
          </div>
        </div>
      </div>
      <Right className="InstallLayout-right" onSubmit={onSubmit ? submit : undefined} noValidate>
        <div className="InstallLayout-content">{children}</div>
        {actions}
      </Right>
    </main>
  );
}
