import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SwitchRow } from '../../components/SwitchRow.tsx';
import { pushSupport, usePush, usePushSwitch } from '../../push.ts';
import { AppLayout } from '../AppLayout.tsx';
import './settings.css';

// Figma: Members / My account — notifications (page Gigs, section 10).
// Notifications are set device by device, never on a gig: the switch is this
// device's. An iPhone only receives them in the app added to the home screen.
export function NotificationsScreen() {
  const { t } = useTranslation();
  const push = usePush();
  const { enable, disable } = usePushSwitch();
  const [isBusy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'failed' | 'refused' | null>(null);
  const [isHelpOpen, setHelpOpen] = useState(false);
  // Read at each render: the member may have changed the settings of the device meanwhile.
  const support = pushSupport();

  const publicKey = push.data?.publicKey ?? null;
  const canSwitch = support === 'ready' && publicKey !== null;
  const isOn = canSwitch && (push.data?.isSubscribed ?? false);

  const change = async (wanted: boolean) => {
    if (!canSwitch || isBusy || publicKey === null) return;
    setBusy(true);
    setFailure(null);
    try {
      if (wanted) {
        if (!(await enable(publicKey))) setFailure('refused');
      } else {
        await disable();
      }
    } catch {
      setFailure('failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout
      current="settings"
      back="/settings"
      backLabel={t('nav.settings')}
      width="form"
      title={t('settings.notifications.title')}
      subtitle={t('settings.notifications.lead')}
    >
      {push.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
      {failure === 'failed' && (
        <Message kind="danger">{t('settings.notifications.failed')}</Message>
      )}
      <Sheet title={t('settings.notifications.thisDevice')}>
        <SwitchRow
          label={t('settings.notifications.reminders')}
          description={t('settings.notifications.remindersHint')}
          checked={isOn}
          onChange={change}
        />
      </Sheet>
      {support === 'needsInstall' ? (
        <>
          <Message>{t('settings.notifications.needsInstall')}</Message>
          <Button kind="secondary" icon="Smartphone" onClick={() => setHelpOpen(true)}>
            {t('settings.notifications.install')}
          </Button>
        </>
      ) : (
        <>
          {(support === 'denied' || failure === 'refused') && (
            <Message kind="warning">{t('settings.notifications.denied')}</Message>
          )}
          {(support === 'unsupported' || (push.data && publicKey === null)) && (
            <Message>{t('settings.notifications.unavailable')}</Message>
          )}
          <p className="settings-muted textCaption">{t('settings.notifications.powerMembers')}</p>
        </>
      )}

      <Panel
        open={isHelpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('settings.notifications.install')}
      >
        <p className="settings-help textBody">{t('settings.notifications.installSteps')}</p>
      </Panel>
    </AppLayout>
  );
}
