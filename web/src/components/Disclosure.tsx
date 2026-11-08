import { type ReactNode, useId, useState } from 'react';
import { Icon } from './Icon.tsx';
import './Disclosure.css';

type Props = {
  title: string;
  /** Figma: "Detail" and "Show detail". It carries its own separator ("· 3"). */
  detail?: string;
  /** Figma: the slot of the open variant. Not in the page while closed. */
  children: ReactNode;
};

// Figma: Disclosure (1.1.0). A group that opens and closes. The header is a
// real button, the whole row the target, with aria-expanded and
// aria-controls; Enter and Space toggle it. Closed by default, it keeps its
// state while the screen is open; closed, its content is not in the page.
export function Disclosure({ title, detail, children }: Props) {
  const [isOpen, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="Disclosure">
      <button
        type="button"
        className="Disclosure-header"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setOpen(!isOpen)}
      >
        <span className="Disclosure-title textBodyStrong">{title}</span>
        {detail && <span className="Disclosure-detail textBody">{detail}</span>}
        <Icon name={isOpen ? 'ChevronUp' : 'ChevronDown'} />
      </button>
      <div id={contentId} className="Disclosure-content">
        {isOpen && children}
      </div>
    </div>
  );
}
