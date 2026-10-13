import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import './AlertCard.css';

type Props = {
  /** Figma: "Text": "3 plans attendent ta réponse". */
  text: string;
  /** Figma: "Detail" and "Show detail": "Dont 1 nouveau." */
  detail?: string;
  /** Figma: "Filter", the nested FilterChip: pressed when the list is narrowed. */
  children: ReactNode;
};

// Figma: AlertCard. Something waits for the member, with one filter that
// narrows the list under it to those items. The icon and the words carry the
// meaning, not the colour alone. Absent when nothing waits. The count is
// said again by screen readers when it changes.
export function AlertCard({ text, detail, children }: Props) {
  return (
    <div className="AlertCard">
      <div className="AlertCard-line">
        <Icon name="Timer" size={24} />
        <div className="AlertCard-texts" role="status">
          <p className="textBodyStrong">{text}</p>
          {detail && <p className="AlertCard-detail textCaption">{detail}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
