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
import { usePush } from '../../push.ts';
import { AppLayout } from '../AppLayout.tsx';
import { AdminsOnlyScreen, useCanManageBand } from './BandSettingsScreen.tsx';
import './band.css';

/** A number of days as it is typed: empty for none, a whole number from 1 to 90 otherwise; false when it is neither. */
function daysOf(text: string): number | null | false {
  if (text.trim() === '') return null;
  const days = Number(text);
  return /^\d{1,2}$/.test(text.trim()) && days >= 1 && days <= 90 ? days : false;
}

/** The time between two songs as it is typed: a whole number from 0 to 300; false otherwise. */
function gapOf(text: string): number | false {
  const seconds = Number(text);
  return /^\d{1,3}$/.test(text.trim()) && seconds <= 300 ? seconds : false;
}

// Figma: Band settings / Gigs and setlists (section 6, 0.3.0). How many days
// before a gig its two reminders are sent, from which hour, and the time
// counted between two songs of a setlist. It changes what every member
// receives: saved with its button. The second reminder may come before or
// after the first (Band v1.9).
export function BandRemindersScreen() {
  const { t } = useTranslation();
  const push = usePush();
  const queryClient = useQueryClient();
  const canManage = useCanManageBand();
  const band = useGigReminders(canManage === true).data;
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [hour, setHour] = useState('18');
  const [gap, setGap] = useState('30');
  const [errors, setErrors] = useState<{ first?: string; second?: string; gap?: string }>({});
  const [outcome, setOutcome] = useState<'saved' | 'failed' | null>(null);
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (!band) return;
    setFirst(band.gigFirstReminderDays === null ? '' : String(band.gigFirstReminderDays));
    setSecond(band.gigSecondReminderDays === null ? '' : String(band.gigSecondReminderDays));
    setHour(String(band.gigReminderHour));
    setGap(String(band.setlistGapSeconds));
  }, [band]);

  if (canManage === null) return null;
  if (!canManage) return <AdminsOnlyScreen />;

  const save = async () => {
    const firstDays = daysOf(first);
    const secondDays = daysOf(second);
    const gapSeconds = gapOf(gap);
    const found = {
      first: firstDays === false ? t('band.reminders.errors.days') : undefined,
      second: secondDays === false ? t('band.reminders.errors.days') : undefined,
      gap: gapSeconds === false ? t('band.reminders.errors.gap') : undefined,
    };
    setErrors(found);
    setOutcome(null);
    if (firstDays === false || secondDays === false || gapSeconds === false) return;

    setSaving(true);
    try {
      const saved = await api<GigReminders>('/api/band/gigReminders', {
        method: 'PUT',
        body: {
          gigFirstReminderDays: firstDays,
          gigSecondReminderDays: secondDays,
          gigReminderHour: Number(hour),
          setlistGapSeconds: gapSeconds,
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
        {/* An instance without push keys sends nothing: the settings are kept all the same. */}
        {push.data?.publicKey === null && <Message>{t('band.reminders.notYet')}</Message>}
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
        <Sheet title={t('band.reminders.setlists')}>
          <TextField
            label={t('band.reminders.gap')}
            inputMode="numeric"
            hint={t('band.reminders.gapHint')}
            error={errors.gap}
            value={gap}
            onChange={(event) => setGap(event.target.value)}
            trailing={
              <span className="band-unit textBodyLarge" aria-hidden="true">
                {t('band.reminders.gapUnit')}
              </span>
            }
          />
        </Sheet>
      </div>
    </AppLayout>
  );
}
