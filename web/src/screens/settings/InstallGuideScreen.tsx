import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useBand } from '../../band.ts';
import { BandMention } from '../../components/BandMention.tsx';
import { BandTile } from '../../components/BandTile.tsx';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { NumberedStep, NumberedSteps } from '../../components/NumberedStep.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import {
  installPlatform,
  promptInstall,
  rememberOffered,
  useInstallPrompt,
} from '../../installGuide.ts';
import { HOME } from '../../session.ts';
import { FlowLayout } from '../FlowLayout.tsx';
import './settings.css';

// Figma: Members / Install guide (section 14), one screen per device: Android
// when the browser offers to install, Android through the menu of the
// browser, iPhone in Safari, iPhone in another browser. Shown once per device
// after sign-in, then from the settings and from the notifications of an
// iPhone (model/members.md, entry 3, "Install guide").
export function InstallGuideScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const band = useBand().data;
  const canPrompt = useInstallPrompt();
  const [platform] = useState(installPlatform);
  const [copy, setCopy] = useState<'copied' | 'refused' | null>(null);
  const wasCopied = copy === 'copied';

  // Seen once is offered: the app never shows it again by itself.
  useEffect(rememberOffered, []);

  // A computer, or the app already installed: nothing to guide.
  if (platform === null || !band) return <Navigate to={HOME} replace />;

  const back = (location.state as { back?: string } | null)?.back ?? HOME;
  const close = () => navigate(back, { replace: true });
  const later = (kind: 'secondary' | 'quiet') => (
    <Button kind={kind} onClick={close}>
      {t('installGuide.later')}
    </Button>
  );
  const appLink = `${window.location.origin}/`;

  const tile = (
    <BandTile
      name={band.name}
      iconUrl={band.icons?.['512'] ?? null}
      caption={t('installGuide.preview')}
    />
  );

  if (platform === 'android' && canPrompt) {
    return (
      <FlowLayout
        band={<BandMention />}
        title={t('installGuide.title')}
        lead={t('installGuide.lead.android')}
        actions={
          <BottomBar>
            <Button
              icon="Download"
              onClick={async () => {
                if (await promptInstall()) close();
              }}
            >
              {t('installGuide.install')}
            </Button>
            {later('quiet')}
          </BottomBar>
        }
      >
        {tile}
        <p className="settings-muted textCaption">{t('installGuide.confirm')}</p>
      </FlowLayout>
    );
  }

  if (platform === 'android') {
    return (
      <FlowLayout
        band={<BandMention />}
        title={t('installGuide.title')}
        lead={t('installGuide.lead.android')}
        actions={<BottomBar>{later('secondary')}</BottomBar>}
      >
        {tile}
        <Sheet title={t('installGuide.android.title')}>
          <NumberedSteps>
            <NumberedStep number={1} icon="More">
              {t('installGuide.android.menu')}
            </NumberedStep>
            <NumberedStep number={2} icon="Download">
              {t('installGuide.android.choose')}
            </NumberedStep>
            <NumberedStep number={3} icon="Smartphone">
              {t('installGuide.android.open')}
            </NumberedStep>
          </NumberedSteps>
        </Sheet>
      </FlowLayout>
    );
  }

  if (platform === 'iosSafari') {
    return (
      <FlowLayout
        band={<BandMention />}
        title={t('installGuide.title')}
        lead={t('installGuide.lead.apple')}
        actions={<BottomBar>{later('secondary')}</BottomBar>}
      >
        {tile}
        <Sheet title={t('installGuide.iosSafari.title')}>
          <NumberedSteps>
            <NumberedStep number={1} icon="Upload">
              {t('installGuide.iosSafari.share')}
            </NumberedStep>
            <NumberedStep number={2} icon="Plus">
              {t('installGuide.iosSafari.choose')}
            </NumberedStep>
            <NumberedStep number={3} icon="Smartphone">
              {t('installGuide.iosSafari.open')}
            </NumberedStep>
          </NumberedSteps>
        </Sheet>
      </FlowLayout>
    );
  }

  return (
    <FlowLayout
      band={<BandMention />}
      title={t('installGuide.title')}
      lead={t('installGuide.lead.apple')}
      actions={
        <BottomBar>
          <Button
            icon={wasCopied ? 'Check' : 'Copy'}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(appLink);
                setCopy('copied');
              } catch {
                // The browser refused: the link is shown, to copy by hand.
                setCopy('refused');
              }
            }}
          >
            {t(wasCopied ? 'installGuide.iosOther.copied' : 'installGuide.iosOther.copyLink')}
          </Button>
          {later('quiet')}
        </BottomBar>
      }
    >
      {tile}
      <Message kind="warning">{t('installGuide.iosOther.warning')}</Message>
      <Sheet title={t('installGuide.iosOther.title')}>
        <NumberedSteps>
          <NumberedStep number={1} icon="Copy">
            {t('installGuide.iosOther.copy')}
          </NumberedStep>
          <NumberedStep number={2}>{t('installGuide.iosOther.paste')}</NumberedStep>
          <NumberedStep number={3}>{t('installGuide.iosOther.follow')}</NumberedStep>
        </NumberedSteps>
        {/* The browser refused to copy: the link itself, to select by hand. */}
        {copy === 'refused' && <p className="settings-link textBody">{appLink}</p>}
      </Sheet>
      <p role="status" className="visuallyHidden">
        {wasCopied ? t('installGuide.iosOther.copied') : ''}
      </p>
    </FlowLayout>
  );
}
