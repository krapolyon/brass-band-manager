import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useGigReminders } from '../../band.ts';
import { BandMention } from '../../components/BandMention.tsx';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Chip } from '../../components/Chip.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { useCostumes } from '../../gigs.ts';
import { useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import '../settings/settings.css';

/** Whether the signed-in member may change the settings of the band. Null while it is not known. */
export function useCanManageBand(): boolean | null {
  const me = useMe().data;
  return me ? me.permissions.includes('manageBand') : null;
}

// Shown to a member who opens the settings of the band without being an
// admin. The API refuses them anyway; this says it kindly.
export function AdminsOnlyScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AppLayout
      current="settings"
      back="/settings"
      backLabel={t('nav.settings')}
      width="form"
      title={t('manage.noRight.title')}
      subtitle={t('band.adminsOnly')}
      actions={
        <BottomBar>
          <Button onClick={() => navigate('/settings')}>{t('band.backToSettings')}</Button>
        </BottomBar>
      }
    >
      {null}
    </AppLayout>
  );
}

// Figma: Band settings / Summary. What makes the app the band's own, for
// admins: short on purpose, related settings share one entry. One entry is not
// theirs alone: the known spellings belong to whoever manages songs
// (model/songs.md, entry 2), who sees this screen with that single row.
export function BandSettingsScreen() {
  const { t } = useTranslation();
  const canManage = useCanManageBand();
  const canManageSongs = useMe().data?.permissions.includes('manageSongs') ?? false;
  const sections = useSections().data ?? [];
  const instrumentCount = sections.reduce(
    (count, section) => count + section.instruments.length,
    0,
  );

  const costumeCount = useCostumes().data?.length ?? 0;
  const band = useGigReminders(canManage === true).data;

  if (canManage === null) return null;
  if (!canManage && !canManageSongs) return <AdminsOnlyScreen />;

  // "15 et 5 jours avant, à partir de 18 h", or what is left of it.
  const days = [band?.gigFirstReminderDays, band?.gigSecondReminderDays].filter(
    (value): value is number => typeof value === 'number',
  );
  const hour = band?.gigReminderHour ?? 18;
  const remindersDetail =
    days.length === 2
      ? t('band.reminders.detail', { first: days[0], second: days[1], hour })
      : days.length === 1
        ? t('band.reminders.detailOne', { count: days[0], hour })
        : t('band.reminders.detailNone');

  const spellings = (
    <NavRow
      icon="FileText"
      label={t('band.spellings.title')}
      detail={t('band.spellings.detail')}
      to="/band/spellings"
    />
  );

  if (!canManage) {
    // Nothing else of the band settings, and not the sentence that reserves them to admins.
    return (
      <AppLayout
        current="settings"
        back="/settings"
        backLabel={t('nav.settings')}
        width="form"
        title={t('band.title')}
      >
        <Sheet>
          <div className="settings-rows">{spellings}</div>
        </Sheet>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      current="settings"
      back="/settings"
      backLabel={t('nav.settings')}
      width="form"
      title={t('band.title')}
      subtitle={t('band.lead')}
    >
      <BandMention />
      <Sheet>
        <div className="settings-rows">
          <NavRow
            icon="SunMoon"
            label={t('band.appearance.title')}
            detail={t('band.appearance.detail')}
            to="/band/appearance"
          />
          <NavRow
            icon="Music"
            label={t('band.sections.title')}
            detail={t('install.sections.summary', {
              sections: t('install.sections.sectionCount', { count: sections.length }),
              instruments: t('install.sections.instrumentCount', { count: instrumentCount }),
            }).replace(' · ', ', ')}
            to="/band/sections"
          />
          {canManageSongs && spellings}
          <NavRow
            icon="Image"
            label={t('band.costumes.title')}
            detail={t('band.costumes.detail', { count: costumeCount })}
            to="/band/costumes"
          />
          <NavRow
            icon="Timer"
            label={t('band.reminders.title')}
            detail={remindersDetail}
            to="/band/reminders"
          />
        </div>
      </Sheet>
      <Sheet title={t('band.connections')}>
        {/* A reserved row: the screen comes with the Discord feature. */}
        <NavRow
          icon="Message"
          label="Discord"
          detail={t('band.discord')}
          trailing={<Chip>{t('band.soon')}</Chip>}
        />
      </Sheet>
    </AppLayout>
  );
}
