import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from '../../components/Chip.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { isAppleTouchDevice } from '../../installGuide.ts';

// Figma: Songs, section 22 (1.1.0). A row that downloads a file of a song.
//
// On an iPhone or an iPad, a file opened from the app installed on the home
// screen shows in the window of the app, with no way back and no way to save
// it. There the row hands the file to the share sheet of iOS ("Enregistrer
// dans Fichiers", AirDrop…) instead: it fetches the file, then shares it.
// iOS opens the sheet only shortly after a touch: when the file took longer
// to arrive, the row says "Prêt" and the next touch shares the file kept.
// Everywhere else the row stays the link it was.

type Props = {
  label: string;
  detail?: string;
  href: string;
  /** The name the file is saved under; without it, the one the server gives, else the end of the address. */
  fileName?: string;
  disabled?: boolean;
};

type State = 'idle' | 'preparing' | 'ready' | 'failed';

/** True where the row goes through the share sheet: an iPhone or an iPad that shares files. */
export function sharesFiles(): boolean {
  try {
    return (
      isAppleTouchDevice() &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'file.pdf', { type: 'application/pdf' })] })
    );
  } catch {
    return false;
  }
}

export function DownloadRow({ label, detail, href, fileName, disabled }: Props) {
  const [isSharing] = useState(sharesFiles);
  if (!isSharing || disabled) {
    return (
      <NavRow
        icon="Download"
        label={label}
        detail={detail}
        disabled={disabled}
        href={disabled ? undefined : href}
        download={fileName}
        chevron={false}
      />
    );
  }
  return <SharedRow label={label} detail={detail} href={href} fileName={fileName} />;
}

/**
 * Fetches a file and hands it to the share sheet. `press` again once the
 * state is "ready" shares the file kept; once "failed", fetches it again.
 */
export function useSharedFile(href: string, fileName?: string) {
  const [state, setState] = useState<State>('idle');
  const file = useRef<File | null>(null);
  const share = async (kept: File) => {
    try {
      await navigator.share({ files: [kept] });
      file.current = null;
      setState('idle');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'AbortError') {
        // The member closed the sheet: nothing to say.
        file.current = null;
        setState('idle');
      } else if (name === 'NotAllowedError') {
        // Too long after the touch: the next one shares the file kept.
        setState('ready');
      } else {
        file.current = null;
        setState('failed');
      }
    }
  };

  const press = async () => {
    if (state === 'preparing') return;
    if (state === 'ready' && file.current) {
      await share(file.current);
      return;
    }
    setState('preparing');
    try {
      const response = await fetch(href, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('The file could not be downloaded');
      const blob = await response.blob();
      const given = response.headers
        .get('Content-Disposition')
        ?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
      const name =
        fileName ??
        (given ? decodeURIComponent(given) : decodeURIComponent(href.split('/').pop() ?? 'file'));
      file.current = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    } catch {
      setState('failed');
      return;
    }
    await share(file.current);
  };

  return { state, press };
}

function SharedRow({ label, detail, href, fileName }: Omit<Props, 'disabled'>) {
  const { t } = useTranslation();
  const { state, press } = useSharedFile(href, fileName);

  return (
    <NavRow
      icon="Download"
      label={label}
      detail={
        state === 'preparing'
          ? t('songs.download.preparing')
          : state === 'ready'
            ? t('songs.download.readyDetail')
            : state === 'failed'
              ? t('songs.download.failed')
              : detail
      }
      tone={state === 'failed' ? 'danger' : 'default'}
      busy={state === 'preparing'}
      disabled={state === 'preparing'}
      trailing={
        state === 'ready' ? (
          <Chip kind="success" icon="Check">
            {t('songs.download.ready')}
          </Chip>
        ) : undefined
      }
      onClick={() => void press()}
    />
  );
}

/**
 * Saves a file from a button: through the share sheet where the rows use it,
 * else as a download. For the message of a device too old (Figma: Songs,
 * section 22), where the reader of the app cannot run.
 */
export function useSaveFile(href: string | null, fileName?: string) {
  const shared = useSharedFile(href ?? '', fileName);
  const save = () => {
    if (href === null) return;
    if (sharesFiles()) {
      void shared.press();
      return;
    }
    const link = document.createElement('a');
    link.href = href;
    if (fileName) link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  };
  return { save, isPreparing: shared.state === 'preparing' };
}
