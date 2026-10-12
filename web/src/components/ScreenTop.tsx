import type { ReactNode } from 'react';
import './ScreenTop.css';

type Props = {
  /** What leads back, and the step of a flow (Figma: Show back, Show step). */
  leading?: ReactNode;
  /** One action, at the end of the line (Figma: Show action). */
  action?: ReactNode;
  /** The band, on a screen shown before sign-in (Figma: Show band). */
  band?: ReactNode;
  title: string;
  subtitle?: string;
};

// Figma: ScreenTop. The top of every screen: a line for what leads back, the
// step and one action, then the band, the title and a sentence. It is the
// only place where the top margin of a screen is set: 32 px, or the safe area
// of the device plus 8 px when that is more, so that a notch never covers
// the back button.
export function ScreenTop({ leading, action, band, title, subtitle }: Props) {
  return (
    <header className="ScreenTop">
      {(leading || action) && (
        <div className="ScreenTop-navigation">
          {leading && <div className="ScreenTop-leading">{leading}</div>}
          {action && <div className="ScreenTop-action">{action}</div>}
        </div>
      )}
      <div className="ScreenTop-heading">
        {band}
        <h1 className="textDisplay">{title}</h1>
        {subtitle && <p className="textBodyLarge">{subtitle}</p>}
      </div>
    </header>
  );
}
