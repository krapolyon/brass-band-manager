import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.tsx';
import { Panel } from '../../components/Panel.tsx';
import { TextField } from '../../components/TextField.tsx';
import { linkAddress } from './manage.ts';

/** A link that was just created: shown once, here. */
export type CreatedLink = { token: string; nickname: string; isInvitation: boolean };

type Props = { link: CreatedLink | null; onClose: () => void };

// Figma: Members / Manage — invitation link. The app shows a password link
// once, when it is created; whoever manages members copies it and sends it by
// the means of their choice (model/members.md, entry 3). It is kept nowhere:
// closing this panel loses it, and a new one has to be created.
export function LinkPanel({ link, onClose }: Props) {
  const { t } = useTranslation();
  const [wasCopied, setCopied] = useState(false);
  const address = link ? linkAddress(link.token, link.isInvitation) : '';
  const kind = link?.isInvitation ? 'invitation' : 'password';

  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Panel open={link !== null} onClose={close} title={t(`manage.link.${kind}.title`)}>
      <div className="members-sheet">
        <p className="textBodyLarge">
          {t(`manage.link.${kind}.text`, { nickname: link?.nickname ?? '' })}
        </p>
        <TextField
          label={t(`manage.link.${kind}.label`)}
          hint={t('manage.link.once')}
          readOnly
          value={address}
          onFocus={(event) => event.target.select()}
        />
        <Button
          icon={wasCopied ? 'Check' : 'Copy'}
          onClick={async () => {
            await navigator.clipboard.writeText(address);
            setCopied(true);
          }}
        >
          {t(wasCopied ? 'manage.link.copied' : 'manage.link.copy')}
        </Button>
        {/* Only where the device has a share sheet. */}
        {'share' in navigator && (
          <Button
            kind="secondary"
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
