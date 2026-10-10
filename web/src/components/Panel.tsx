import { type MouseEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton.tsx';
import './Panel.css';

type Props = {
  open: boolean;
  /** Called when the member closes the panel: its close button, the Escape key, or a press outside. */
  onClose: () => void;
  title: string;
  /** Figma: the Content slot. */
  children: ReactNode;
};

type Form = 'adaptive' | 'bottomSheet' | 'dialog';

// The panel behind BottomSheet and Dialog. It is the browser's own <dialog>:
// the browser keeps the focus inside it, closes it on Escape, makes the rest
// of the page inert, and gives the focus back when it closes.
function Base({ open, onClose, title, children, form }: Props & { form: Form }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  // A press on the scrim lands on the <dialog> itself, not on what it holds.
  const closeOnScrim = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialog.current) onClose();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard closes a dialog with Escape, which the browser handles
    <dialog
      className="Panel"
      data-form={form}
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={closeOnScrim}
    >
      <div className="Panel-surface">
        <span className="Panel-grabber" aria-hidden="true" />
        <header className="Panel-header">
          <h2 className="textTitle" id={titleId}>
            {title}
          </h2>
          <IconButton kind="control" icon="Close" label={t('common.close')} onClick={onClose} />
        </header>
        <div className="Panel-content">{children}</div>
      </div>
    </dialog>
  );
}

// A panel is a BottomSheet below the desktop width and a Dialog from it: this
// is what a screen uses.
export function Panel(props: Props) {
  return <Base {...props} form="adaptive" />;
}

// Figma: BottomSheet. A panel that rises from the bottom of the screen, over
// the scrim. To edit one item of a list or to choose in a list.
export function BottomSheet(props: Props) {
  return <Base {...props} form="bottomSheet" />;
}

// Figma: Dialog. The desktop form of BottomSheet: a panel centred over the scrim.
export function Dialog(props: Props) {
  return <Base {...props} form="dialog" />;
}
