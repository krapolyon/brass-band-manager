import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.tsx';
import { Chip } from '../../components/Chip.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SwitchRow } from '../../components/SwitchRow.tsx';
import {
  type NotificationSettings,
  pushSupport,
  useNotificationSettings,
  usePush,
  usePushSwitch,
  useSaveNotificationSettings,
} from '../../push.ts';
import { AppLayout } from '../AppLayout.tsx';
import './settings.css';

// The settings of the account, by category, in the order of Figma.
const gigSettings = ['notifyGigPlayable', 'notifyGigConfirmed', 'notifyLiveSetlist'] as const;
const songSettings = ['notifySongNew', 'notifySongScore', 'notifySongPart'] as const;

// Figma: Members / Settings — notifications, by category (page Members,
// section 11). Whether this device receives is the switch of the device: it
// is what asks the browser for its permission. What the member receives is
// set once, on the account, for every device (model/members.md,
// "Notification settings"). With the device off, the categories are shown
// disabled and kept. The reminders to answer are not a choice.
export function NotificationsScreen() {
  const { t } = useTranslation();
  const push = usePush();
  const settings = useNotificationSettings();
  const save = useSaveNotificationSettings();
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

  const choose = async (setting: keyof NotificationSettings, on: boolean) => {
    setFailure(null);
    if (!(await save({ [setting]: on ? 'PUSH' : 'OFF' }))) setFailure('failed');
  };
  const row = (setting: keyof NotificationSettings) => {
    const description = t(`settings.notifications.choices.${setting}.hint`, { defaultValue: '' });
    return (
      <SwitchRow
        key={setting}
        label={t(`settings.notifications.choices.${setting}.label`)}
        description={description || undefined}
        checked={settings.data?.[setting] === 'PUSH'}
        disabled={!isOn || !settings.data}
        onChange={(on) => choose(setting, on)}
      />
    );
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
      {(push.isError || settings.isError) && (
        <Message kind="danger">{t('errors.unreachable')}</Message>
      )}
      {failure === 'failed' && (
        <Message kind="danger">{t('settings.notifications.failed')}</Message>
      )}
      <Sheet title={t('settings.notifications.thisDevice')}>
        <SwitchRow
          label={t('settings.notifications.device')}
          description={t('settings.notifications.deviceHint')}
          checked={isOn}
          onChange={change}
        />
      </Sheet>
      {support === 'needsInstall' ? (
        <>
          <Message kind="warning">{t('settings.notifications.needsInstall')}</Message>
          <Button kind="secondary" icon="Smartphone" onClick={() => setHelpOpen(true)}>
            {t('settings.notifications.install')}
          </Button>
        </>
      ) : support === 'denied' || failure === 'refused' ? (
        <Message kind="warning">{t('settings.notifications.denied')}</Message>
      ) : support === 'unsupported' || (push.data && publicKey === null) ? (
        <Message>{t('settings.notifications.unavailable')}</Message>
      ) : (
        push.data && !isOn && <Message>{t('settings.notifications.deviceOff')}</Message>
      )}

      {/* Off on this device: the choices are kept, and cannot be changed here. */}
      <div className="settings-categories" data-disabled={isOn ? undefined : 'true'}>
        <Sheet title={t('settings.notifications.gigs')}>
          <div className="settings-rows">
            <NavRow
              label={t('settings.notifications.reminders')}
              detail={t('settings.notifications.remindersHint')}
              trailing={<Chip>{t('settings.notifications.always')}</Chip>}
            />
            {gigSettings.map(row)}
          </div>
        </Sheet>
        <Sheet title={t('settings.notifications.songs')}>
          <div className="settings-rows">{songSettings.map(row)}</div>
        </Sheet>
      </div>

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
