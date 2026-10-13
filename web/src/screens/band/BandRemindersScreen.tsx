import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api.ts';
import { type GigReminders, useGigReminders } from '../../band.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SelectField, TextField } from '../../components/TextField.tsx';
import { AppLayout } from '../AppLayout.tsx';
import { AdminsOnlyScreen, useCanManageBand } from './BandSettingsScreen.tsx';
import './band.css';

/** A number of days as it is typed: empty for none, a whole number from 1 to 90 otherwise; false when it is neither. */
function daysOf(text: string): number | null | false {
  if (text.trim() === '') return null;
  const days = Number(text);
  return /^\d{1,2}$/.test(text.trim()) && days >= 1 && days <= 90 ? days : false;
}

// Figma: Band settings / Gig reminders (section 4). How many days before a
// gig its two reminders are sent, and from which hour. It changes what every
// member receives: saved with its button. The reminders themselves are not
// sent yet: the screen says so.
export function BandRemindersScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useCanManageBand();
  const band = useGigReminders(canManage === true).data;
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [hour, setHour] = useState('18');
  const [errors, setErrors] = useState<{ first?: string; second?: string }>({});
  const [outcome, setOutcome] = useState<'saved' | 'failed' | null>(null);
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (!band) return;
    setFirst(band.gigFirstReminderDays === null ? '' : String(band.gigFirstReminderDays));
    setSecond(band.gigSecondReminderDays === null ? '' : String(band.gigSecondReminderDays));
    setHour(String(band.gigReminderHour));
  }, [band]);

  if (canManage === null) return null;
  if (!canManage) return <AdminsOnlyScreen />;

  const save = async () => {
    const firstDays = daysOf(first);
    const secondDays = daysOf(second);
    const found = {
      first: firstDays === false ? t('band.reminders.errors.days') : undefined,
      second:
        secondDays === false
          ? t('band.reminders.errors.days')
          : typeof firstDays === 'number' &&
              typeof secondDays === 'number' &&
              secondDays >= firstDays
            ? t('band.reminders.errors.order')
            : undefined,
    };
    setErrors(found);
    setOutcome(null);
    if (found.first || found.second || firstDays === false || secondDays === false) return;

    setSaving(true);
    try {
      const saved = await api<GigReminders>('/api/band/gigReminders', {
        method: 'PUT',
        body: {
          gigFirstReminderDays: firstDays,
          gigSecondReminderDays: secondDays,
          gigReminderHour: Number(hour),
        },
      });
      queryClient.setQueryData(['gigReminders'], saved);
      setOutcome('saved');
    } catch {
      setOutcome('failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout
      current="settings"
      back="/band"
      backLabel={t('band.title')}
      width="form"
      title={t('band.reminders.title')}
      subtitle={t('band.reminders.lead')}
      onSubmit={save}
      actions={
        <BottomBar surface="glass">
          <Button type="submit" disabled={isSaving}>
            {t('band.reminders.save')}
          </Button>
        </BottomBar>
      }
    >
      <div className="band-form">
        <Message>{t('band.reminders.notYet')}</Message>
        {outcome === 'saved' && <Message kind="success">{t('band.reminders.saved')}</Message>}
        {outcome === 'failed' && <Message kind="danger">{t('band.reminders.failed')}</Message>}
        <Sheet title={t('band.reminders.first')}>
          <TextField
            label={t('band.reminders.days')}
            inputMode="numeric"
            hint={t('band.reminders.firstHint')}
            error={errors.first}
            value={first}
            onChange={(event) => setFirst(event.target.value)}
          />
        </Sheet>
        <Sheet title={t('band.reminders.second')}>
          <TextField
            label={t('band.reminders.days')}
            inputMode="numeric"
            hint={t('band.reminders.secondHint')}
            error={errors.second}
            value={second}
            onChange={(event) => setSecond(event.target.value)}
          />
        </Sheet>
        <Sheet title={t('band.reminders.hourTitle')}>
          <SelectField
            label={t('band.reminders.hour')}
            hint={t('band.reminders.hourHint')}
            value={hour}
            onChange={setHour}
            options={Array.from({ length: 24 }, (_, value) => ({
              value: String(value),
              label: t('band.reminders.hourOption', { hour: value }),
            }))}
          />
        </Sheet>
      </div>
    </AppLayout>
  );
}
