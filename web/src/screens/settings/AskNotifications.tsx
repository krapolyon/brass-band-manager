import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { Panel } from '../../components/Panel.tsx';
import { pushSupport, rememberAsked, usePush, usePushSwitch, wasAsked } from '../../push.ts';
import './settings.css';

// Figma: Gigs / Notifications — first opening on a new device (section 10).
// Asked once per device, when the app opens on one that was never asked and
// can receive notifications. Whatever is answered, the setting stays in the
// account, under "Notifications".
export function AskNotifications() {
  const { t } = useTranslation();
  const push = usePush();
  const { enable } = usePushSwitch();
  const [isOpen, setOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);

  const publicKey = push.data?.publicKey ?? null;
  const isSubscribed = push.data?.isSubscribed ?? true;
  useEffect(() => {
    if (publicKey === null || isSubscribed || wasAsked()) return;
    // A device that already said no in its own settings is not asked here.
    if (pushSupport() !== 'ready' || Notification.permission !== 'default') return;
    setOpen(true);
  }, [publicKey, isSubscribed]);

  const close = () => {
    rememberAsked();
    setOpen(false);
  };
  const accept = async () => {
    if (publicKey === null) return;
    setBusy(true);
    try {
      await enable(publicKey);
    } catch {
      // Not turned on: the setting of the account says so, and can try again.
    } finally {
      setBusy(false);
      close();
    }
  };

  return (
    <Panel open={isOpen} onClose={close} title={t('settings.notifications.ask.title')}>
      <div className="settings-ask">
        <span className="settings-askIcon" aria-hidden="true">
          <Icon name="Notification" size={32} filled />
        </span>
        <p className="textBodyLarge">{t('settings.notifications.ask.lead')}</p>
        <Button icon="Notification" disabled={isBusy} onClick={accept}>
          {t('settings.notifications.ask.accept')}
        </Button>
        <Button kind="quiet" onClick={close}>
          {t('settings.notifications.ask.refuse')}
        </Button>
        <p className="settings-muted textCaption">{t('settings.notifications.ask.later')}</p>
      </div>
    </Panel>
  );
}
