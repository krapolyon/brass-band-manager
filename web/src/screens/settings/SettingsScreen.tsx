import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useBuild } from '../../about.ts';
import { api } from '../../api.ts';
import { useCalendar } from '../../calendar.ts';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { MemberHeader } from '../../components/MemberHeader.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { useDeviceTextSize } from '../../deviceAccessibility.ts';
import i18n, { languageName } from '../../i18n.ts';
import { INSTALL_GUIDE, installPlatform } from '../../installGuide.ts';
import { instrumentsOf, useMembers, useSections } from '../../members.ts';
import { forgetAsked, useNotificationSettings, usePush } from '../../push.ts';
import { useMe, useSetMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { useSavePreferences } from './preferences.ts';
import './settings.css';

const languages = Object.keys(i18n.options.resources ?? {});

// Figma: Members / Settings — summary, and the confirmation before signing
// out everywhere. Short on purpose: settings that belong together share one
// entry. What a member may not do is not listed.
export function SettingsScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe().data;
  const textSize = useDeviceTextSize();
  const build = useBuild().data;
  const setMe = useSetMe();
  const save = useSavePreferences();
  const push = usePush().data;
  const notificationSettings = useNotificationSettings().data;
  const calendar = useCalendar().data;
  const [isLanguageOpen, setLanguageOpen] = useState(false);
  const [isConfirmOpen, setConfirmOpen] = useState(false);

  const canManageMembers = me?.permissions.includes('manageMembers') ?? false;
  const canManageBand = me?.permissions.includes('manageBand') ?? false;
  // Whoever manages songs has one entry of the band settings: the known spellings.
  const canManageSongs = me?.permissions.includes('manageSongs') ?? false;
  const instrument = instrumentsOf(useSections().data).find(
    (other) => other.id === me?.instrumentId,
  );
  // Invited members are sent to who manages members only.
  const invitations = (useMembers().data ?? []).filter(
    (member) => member.status === 'INVITED',
  ).length;

  const signOut = useMutation({
    mutationFn: (everywhere: boolean) =>
      api(everywhere ? '/api/sessions' : '/api/session', { method: 'DELETE' }),
    onSuccess: () => {
      // The next member of this device is asked about notifications in their turn.
      forgetAsked();
      setMe(null);
      navigate('/sign-in', { replace: true });
    },
  });

  if (!me) return null;

  // The text size is the one of this device; the five others, of the account.
  const options = [
    textSize !== 100 && t('settings.accessibility.textSize', { percent: textSize }),
    me.hasHighContrast && t('settings.accessibility.highContrast'),
    me.hasIncreasedSpacing && t('settings.accessibility.increasedSpacing'),
    me.hasLegibleFont && t('settings.accessibility.legibleFont'),
    me.hasReducedMotion && t('settings.accessibility.reducedMotion'),
    me.hasExtendedTimeouts && t('settings.accessibility.extendedTimeouts'),
  ].filter(Boolean);
  const sentence = (parts: unknown[]) => {
    const text = parts.join(', ');
    return text.charAt(0).toLocaleUpperCase() + text.slice(1);
  };

  return (
    <>
      <AppLayout current="settings" title={t('nav.settings')} width="form">
        {(save.isError || signOut.isError) && (
          <Message kind="danger">{t('errors.unreachable')}</Message>
        )}
        <Sheet>
          <Link
            className="settings-me"
            to="/settings/profile"
            aria-label={t('settings.profile.open')}
          >
            <MemberHeader
              size="medium"
              nickname={me.nickname}
              title={me.nickname}
              subtitle={`${me.firstName} ${me.lastName}`}
              instrument={instrument?.name ?? ''}
              sectionIcon={instrument?.icon ?? null}
              photoUrl={me.photoUrl}
            />
            <Icon name="ChevronRight" />
          </Link>
        </Sheet>

        <Sheet title={t('settings.account')}>
          <div className="settings-rows">
            <NavRow icon="Lock" label={t('settings.password.title')} to="/settings/password" />
            <NavRow
              icon="SunMoon"
              label={t('settings.appearance.title')}
              detail={`${t(`settings.appearance.scheme.${me.colorScheme}`)} · ${
                me.accentTheme ? t(`theme.${me.accentTheme}`) : t('settings.appearance.bandColour')
              }`}
              to="/settings/appearance"
            />
            <NavRow
              icon="Accessibility"
              label={t('accessibility.title')}
              detail={options.length > 0 ? sentence(options) : t('settings.accessibility.none')}
              to="/settings/accessibility"
            />
            <NavRow
              icon="Notification"
              label={t('settings.notifications.title')}
              detail={
                push
                  ? push.isSubscribed
                    ? t('settings.notifications.detailOn', {
                        // The choices of the account that are on, by any channel.
                        count: Object.values(notificationSettings ?? {}).filter(
                          (channel) => channel !== 'OFF',
                        ).length,
                      })
                    : t('settings.notifications.detailOff')
                  : undefined
              }
              to="/settings/notifications"
            />
            <NavRow
              icon="Calendar"
              label={t('settings.calendar.title')}
              detail={
                calendar
                  ? t(
                      calendar.token
                        ? 'settings.calendar.detailReady'
                        : 'settings.calendar.detailNone',
                    )
                  : undefined
              }
              to="/settings/calendar"
            />
            <NavRow
              icon="Languages"
              label={t('settings.language.title')}
              detail={languageName(me.language)}
              onClick={() => setLanguageOpen(true)}
              opensPanel
              chevron
            />
            {/* While the app is not installed on this phone or tablet. */}
            {installPlatform() !== null && (
              <NavRow
                icon="Smartphone"
                label={t('settings.install.title')}
                detail={t('settings.install.detail')}
                to={INSTALL_GUIDE}
                state={{ back: '/settings' }}
              />
            )}
          </div>
        </Sheet>

        {(canManageMembers || canManageBand || canManageSongs) && (
          <Sheet title={t('settings.band')}>
            <div className="settings-rows">
              {canManageMembers && (
                <NavRow
                  icon="Users"
                  label={t('settings.manageMembers')}
                  detail={
                    invitations > 0 ? t('settings.invitations', { count: invitations }) : undefined
                  }
                  to="/members/manage"
                />
              )}
              {(canManageBand || canManageSongs) && (
                <NavRow
                  icon="Settings"
                  label={t('settings.bandSettings')}
                  detail={
                    canManageBand ? t('settings.bandSettingsDetail') : t('band.spellings.title')
                  }
                  to="/band"
                />
              )}
            </div>
          </Sheet>
        )}

        {/* Alone in its sheet, apart from signing out: a press meant for the
            changelog never signs the member out (Figma, Members, section 5). */}
        <Sheet>
          <NavRow
            icon="Info"
            label={t('settings.about.title')}
            detail={build ? t('settings.about.entry', { version: build.version }) : undefined}
            to="/settings/about"
          />
        </Sheet>

        <Sheet>
          <div className="settings-rows">
            <NavRow
              icon="LogOut"
              label={t('settings.signOut')}
              detail={t('settings.signOutDetail')}
              onClick={() => signOut.mutate(false)}
              disabled={signOut.isPending}
            />
            <NavRow
              icon="Smartphone"
              tone="danger"
              label={t('settings.signOutEverywhere')}
              detail={t('settings.signOutEverywhereDetail')}
              onClick={() => setConfirmOpen(true)}
              opensPanel
            />
          </div>
        </Sheet>
      </AppLayout>

      <Panel
        open={isLanguageOpen}
        onClose={() => setLanguageOpen(false)}
        title={t('settings.language.title')}
      >
        {languages.map((language) => (
          <ListRow
            key={language}
            label={languageName(language)}
            current={language === me.language}
            trailing={
              language === me.language ? (
                <span className="ListRow-mark">
                  <Icon name="Check" />
                </span>
              ) : undefined
            }
            onPress={() => {
              if (language !== me.language) save.mutate({ language });
              setLanguageOpen(false);
            }}
          />
        ))}
      </Panel>

      <Panel
        open={isConfirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('settings.confirmSignOut.title')}
      >
        <div className="settings-confirm">
          <p className="textBodyLarge">{t('settings.confirmSignOut.text')}</p>
          <Button kind="danger" onClick={() => signOut.mutate(true)} disabled={signOut.isPending}>
            {t('settings.signOutEverywhere')}
          </Button>
          <Button kind="secondary" onClick={() => setConfirmOpen(false)}>
            {t('settings.confirmSignOut.cancel')}
          </Button>
        </div>
      </Panel>
    </>
  );
}
