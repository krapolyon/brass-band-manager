import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBand } from '../../band.ts';
import { calendarPlatform, feedAddress, useCalendar, useCalendarAddress } from '../../calendar.ts';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { TextField } from '../../components/TextField.tsx';
import { AppLayout } from '../AppLayout.tsx';
import './settings.css';

// Figma: Members / Settings — calendar (page Members, section 10). A personal
// address a calendar app subscribes to (model/members.md, "Calendar
// address"); the app writes into nobody's calendar. The screen follows the
// device: an iPhone, an iPad or a Mac open their Calendar app with the
// webcal address; Android and Windows copy the address for Google Agenda,
// which subscribes from a computer only. The address is created the first
// time the member asks for it, and replaced, after a confirmation, by
// "Réinitialiser la synchro".
export function CalendarScreen() {
  const { t } = useTranslation();
  const band = useBand().data;
  const calendar = useCalendar();
  const address = useCalendarAddress();
  const platform = calendarPlatform();
  const [copied, setCopied] = useState<string | null>(null);
  // The browser refused to copy: the address is shown, selected, to copy by hand.
  const [shown, setShown] = useState<string | null>(null);
  const [failure, setFailure] = useState(false);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [wasReset, setReset] = useState(false);
  const field = useRef<HTMLDivElement>(null);

  const token = calendar.data?.token ?? null;

  const copy = async () => {
    setFailure(false);
    setReset(false);
    try {
      const text = feedAddress(await address.ensure(), 'https');
      try {
        await navigator.clipboard.writeText(text);
        setCopied(text);
        setShown(null);
      } catch {
        setShown(text);
        window.requestAnimationFrame(() => field.current?.querySelector('input')?.select());
      }
    } catch {
      setFailure(true);
    }
  };
  const add = async () => {
    setFailure(false);
    setReset(false);
    try {
      // The Calendar app of the device opens with it.
      window.location.href = feedAddress(await address.ensure(), 'webcal');
    } catch {
      setFailure(true);
    }
  };
  const reset = async () => {
    setBusy(true);
    setFailure(false);
    try {
      await address.reset();
      setCopied(null);
      setShown(null);
      setReset(true);
      setConfirmOpen(false);
    } catch {
      setFailure(true);
    } finally {
      setBusy(false);
    }
  };

  const isCopied = copied !== null && token !== null && copied === feedAddress(token, 'https');
  const copyButton = (kind: 'primary' | 'secondary') => (
    <Button kind={kind} icon={isCopied ? 'Check' : 'Copy'} onClick={copy}>
      {t(isCopied ? 'settings.calendar.copied' : 'settings.calendar.copy')}
    </Button>
  );

  return (
    <AppLayout
      current="settings"
      back="/settings"
      backLabel={t('nav.settings')}
      width="form"
      title={t('settings.calendar.title')}
      subtitle={t('settings.calendar.lead')}
    >
      {calendar.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
      {failure && <Message kind="danger">{t('settings.calendar.failed')}</Message>}
      <Sheet title={t('settings.calendar.sync')}>
        <div className="settings-calendar">
          <p className="textBody">{t('settings.calendar.what')}</p>
          {platform === 'apple' ? (
            <>
              <Button icon="Calendar" onClick={add} disabled={calendar.isPending}>
                {t('settings.calendar.add')}
              </Button>
              {copyButton('secondary')}
            </>
          ) : (
            copyButton('primary')
          )}
          {shown !== null && (
            <div ref={field}>
              <TextField
                label={t('settings.calendar.address')}
                readOnly
                value={shown}
                onFocus={(event) => event.target.select()}
              />
            </div>
          )}
          <p className="settings-muted textCaption settings-steps">
            {t(platform === 'apple' ? 'settings.calendar.appleNote' : 'settings.calendar.steps', {
              band: band?.name ?? '',
            })}
          </p>
        </div>
      </Sheet>
      <Sheet title={t('settings.calendar.reset')}>
        <div className="settings-calendar">
          <p className="textBody">{t('settings.calendar.resetLead')}</p>
          <Button
            kind="secondary"
            icon="RotateCcw"
            aria-haspopup="dialog"
            disabled={token === null}
            onClick={() => setConfirmOpen(true)}
          >
            {t('settings.calendar.resetButton')}
          </Button>
        </div>
      </Sheet>
      <p className="visuallyHidden" role="status">
        {isCopied ? t('settings.calendar.copied') : wasReset ? t('settings.calendar.wasReset') : ''}
      </p>

      <Panel
        open={isConfirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('settings.calendar.confirm.title')}
      >
        <div className="settings-confirm">
          <p className="textBodyLarge">{t('settings.calendar.resetLead')}</p>
          <Button kind="danger" icon="RotateCcw" disabled={isBusy} onClick={reset}>
            {t('settings.calendar.resetButton')}
          </Button>
          <Button kind="secondary" onClick={() => setConfirmOpen(false)}>
            {t('settings.calendar.confirm.cancel')}
          </Button>
        </div>
      </Panel>
    </AppLayout>
  );
}
