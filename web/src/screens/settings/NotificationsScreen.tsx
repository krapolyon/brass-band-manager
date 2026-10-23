import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useBand } from '../../band.ts';
import { Button } from '../../components/Button.tsx';
import { ChannelChoice, type Channels } from '../../components/ChannelChoice.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SwitchRow } from '../../components/SwitchRow.tsx';
import { INSTALL_GUIDE } from '../../installGuide.ts';
import {
  channelOf,
  channelsOf,
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
const gigSettings = [
  'notifyGigReminder',
  'notifyGigPlayable',
  'notifyGigConfirmed',
  'notifyLiveSetlist',
] as const;
const songSettings = ['notifySongNew', 'notifySongScore', 'notifySongPart'] as const;

// Figma: Members / Settings — notifications by channel (page Members,
// section 12, 0.3.0, issue #27). Whether this device receives is the switch
// of the device: it is what asks the browser for its permission. What the
// member receives, and how, is set once, on the account, for every device
// (model/members.md, "Notification settings"): one ChannelChoice per kind,
// Notification and E-mail. With the device off, the notification chips are
// kept and cannot change here; the e-mail chips stay active. The reminders
// to answer keep one channel at least; the live setlist has no e-mail.
// Without a mail server, the e-mail chips are hidden and a choice saved with
// e-mail reads as a notification, as the server sends it.
export function NotificationsScreen() {
  const { t } = useTranslation();
  const push = usePush();
  const settings = useNotificationSettings();
  const canEmail = useBand().data?.canSendEmail ?? false;
  const save = useSaveNotificationSettings();
  const { enable, disable } = usePushSwitch();
  const [isBusy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'failed' | 'refused' | null>(null);
  const navigate = useNavigate();
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

  const choose = async (setting: keyof NotificationSettings, wanted: Channels) => {
    setFailure(null);
    if (!(await save({ [setting]: channelOf(wanted) }))) setFailure('failed');
  };
  const row = (setting: keyof NotificationSettings) => {
    const showEmail = canEmail && setting !== 'notifyLiveSetlist';
    const saved = channelsOf(settings.data?.[setting]);
    // Without e-mail, a choice saved with e-mail is sent as a notification.
    const value = showEmail ? saved : { push: saved.push || saved.email, email: false };
    const hintKey =
      setting === 'notifyGigReminder' && !canEmail
        ? 'settings.notifications.choices.notifyGigReminder.hintWithoutEmail'
        : `settings.notifications.choices.${setting}.hint`;
    const description = t(hintKey, { defaultValue: '' });
    return (
      <ChannelChoice
        key={setting}
        label={t(`settings.notifications.choices.${setting}.label`)}
        description={description || undefined}
        value={value}
        showEmail={showEmail}
        neverOff={setting === 'notifyGigReminder'}
        pushDisabled={!isOn || !settings.data}
        onChange={(wanted) => choose(setting, wanted)}
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
          <Button
            kind="secondary"
            icon="Smartphone"
            onClick={() => navigate(INSTALL_GUIDE, { state: { back: '/settings/notifications' } })}
          >
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

      {/* Off on this device: the notification chips are kept, and cannot be changed here. */}
      <div className="settings-categories">
        <Sheet title={t('settings.notifications.gigs')}>
          <div className="settings-channels">{gigSettings.map(row)}</div>
        </Sheet>
        <Sheet title={t('settings.notifications.songs')}>
          <div className="settings-channels">{songSettings.map(row)}</div>
        </Sheet>
      </div>
    </AppLayout>
  );
}
