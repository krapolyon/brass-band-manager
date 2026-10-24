import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.tsx';
import { Panel } from '../../components/Panel.tsx';
import { TextField } from '../../components/TextField.tsx';
import { linkAddress } from './manage.ts';

/** A link that was just created: shown once, here. */
export type CreatedLink = {
  token: string;
  nickname: string;
  isInvitation: boolean;
  /** The address the app sent the invitation to (#50); absent when it sent nothing. */
  sentTo?: string;
};

type Props = { link: CreatedLink | null; onClose: () => void };

// A link created on one screen and shown on the next (the invite form, then
// the list). It crosses in the memory of the page and is taken once: never
// through the history of the browser, where it would come back on a reload.
let handedOver: CreatedLink | null = null;

export function handOver(link: CreatedLink) {
  handedOver = link;
}

export function takeHandedOver(): CreatedLink | null {
  const link = handedOver;
  handedOver = null;
  return link;
}

// Figma: Members / Manage — invitation link, and "invitation sent" (section
// 16, 0.4.0, #50). The app shows a password link once, when it is created;
// whoever manages members copies it and sends it by the means of their choice
// (model/members.md, entry 3). An invitation the app sent by email says where
// it went, and keeps the link as a way to send it by hand. It is kept
// nowhere: closing this panel loses it, and a new one has to be created.
export function LinkPanel({ link, onClose }: Props) {
  const { t } = useTranslation();
  const [wasCopied, setCopied] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const address = link ? linkAddress(link.token, link.isInvitation) : '';
  const kind = link?.sentTo ? 'sent' : link?.isInvitation ? 'invitation' : 'password';

  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Panel open={link !== null} onClose={close} title={t(`manage.link.${kind}.title`)}>
      <div className="members-sheet" ref={sheet}>
        <p className="textBodyLarge">
          {t(`manage.link.${kind}.text`, {
            nickname: link?.nickname ?? '',
            email: link?.sentTo ?? '',
          })}
        </p>
        <TextField
          label={t(`manage.link.${kind}.label`)}
          hint={t(kind === 'sent' ? 'manage.link.sent.once' : 'manage.link.once')}
          readOnly
          value={address}
          onFocus={(event) => event.target.select()}
        />
        <Button
          // Sent by email, copying it is the way out, not the main action.
          kind={kind === 'sent' ? 'secondary' : 'primary'}
          icon={wasCopied ? 'Check' : 'Copy'}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address);
              setCopied(true);
            } catch {
              // The browser refused: the address is selected, ready to be copied by hand.
              sheet.current?.querySelector('input')?.select();
            }
          }}
        >
          {t(wasCopied ? 'manage.link.copied' : 'manage.link.copy')}
        </Button>
        {/* Only where the device has a share sheet. */}
        {'share' in navigator && (
          <Button
            kind={kind === 'sent' ? 'quiet' : 'secondary'}
            icon="Share"
            onClick={() => navigator.share({ url: address }).catch(() => {})}
          >
            {t('manage.link.share')}
          </Button>
        )}
        <p role="status" className="visuallyHidden">
          {wasCopied ? t('manage.link.copied') : ''}
        </p>
      </div>
    </Panel>
  );
}
