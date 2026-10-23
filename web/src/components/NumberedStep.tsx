import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import './NumberedStep.css';

type Props = {
  number: number;
  /** The button to look for, drawn with the icon of the app, never a picture of the system. */
  icon?: IconName;
  children: ReactNode;
};

/** The steps of a how-to, in order. */
export function NumberedSteps({ children }: { children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noRedundantRoles: Safari drops the role of a list drawn without its markers, and with it the number of each step
    <ol className="NumberedSteps" role="list">
      {children}
    </ol>
  );
}

// Figma: NumberedStep. One step of a short how-to: its number on the accent,
// the sentence, and the button to look for. It is an item of NumberedSteps,
// an ordered list: the number is the list's own, shown and read once; the
// icon is decoration, the sentence names the button.
export function NumberedStep({ number, icon, children }: Props) {
  return (
    <li className="NumberedStep">
      <span className="NumberedStep-number textLabel" aria-hidden="true">
        {number}
      </span>
      <span className="NumberedStep-text textBody">{children}</span>
      {icon && (
        <span className="NumberedStep-button">
          <Icon name={icon} />
        </span>
      )}
    </li>
  );
}
