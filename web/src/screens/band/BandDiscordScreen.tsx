import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../api.ts';
import { type DiscordSettings, useDiscordSettings } from '../../band.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { TextField } from '../../components/TextField.tsx';
import { AppLayout } from '../AppLayout.tsx';
import '../settings/settings.css';
import { AdminsOnlyScreen, useCanManageBand } from './BandSettingsScreen.tsx';
import './band.css';

// Figma: Band settings / Discord (section 6, 0.3.0, issue #33). The server
// of the band, read from the link of any of its channels; whether the bot of
// the band reaches it; the Discord role of each section, chosen among the
// roles of the server in a sheet (a Dialog from 1024). Saved with its button.
// Rules: model/band.md, "Discord"; how to create the bot: docs/discord-bot.md.
export function BandDiscordScreen() {
  const canManage = useCanManageBand();
  const settings = useDiscordSettings(canManage === true).data;

  if (canManage === null) return null;
  if (!canManage) return <AdminsOnlyScreen />;
  if (!settings) return null;
  return <DiscordForm settings={settings} />;
}

function DiscordForm({ settings }: { settings: DiscordSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const group = useId();
  // The server as the link of a channel, or its identifier: what was saved is shown as it is.
  const [link, setLink] = useState(settings.serverId ?? '');
  const [roles, setRoles] = useState(() => rolesOf(settings));
  const [choosing, setChoosing] = useState<number | null>(null);
  const [linkError, setLinkError] = useState<string>();
  const [outcome, setOutcome] = useState<'saved' | 'failed' | null>(null);
  const [isSaving, setSaving] = useState(false);

  useEffect(() => setRoles(rolesOf(settings)), [settings]);

  const save = async () => {
    setSaving(true);
    setOutcome(null);
    setLinkError(undefined);
    try {
      const saved = await api<DiscordSettings>('/api/band/discord', {
        method: 'PUT',
        body: {
          link: link.trim() === '' ? null : link.trim(),
          sectionRoles: Object.entries(roles).map(([sectionId, discordRoleId]) => ({
            sectionId: Number(sectionId),
            discordRoleId,
          })),
        },
      });
      queryClient.setQueryData(['discordSettings', true], saved);
      queryClient.invalidateQueries({ queryKey: ['discordSettings', false] });
      // The forms of songs and gigs offer the link of a channel once a server is set.
      queryClient.invalidateQueries({ queryKey: ['band'] });
      setLink(saved.serverId ?? '');
      setOutcome('saved');
    } catch (error) {
      if (error instanceof ApiError && error.fields?.link) {
        setLinkError(t('band.discordSettings.linkInvalid'));
      } else {
        setOutcome('failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const serverName = settings.serverName;
  const roleName = (roleId: string | null) =>
    roleId === null
      ? t('band.discordSettings.noRole')
      : `@${settings.roles?.find((role) => role.id === roleId)?.name ?? t('band.discordSettings.roleGone')}`;
  const section = settings.sections.find((one) => one.id === choosing);

  return (
    <AppLayout
      current="settings"
      back="/band"
      backLabel={t('band.title')}
      width="form"
      title={t('band.discordSettings.title')}
      subtitle={t('band.discordSettings.lead')}
      onSubmit={save}
      actions={
        <BottomBar>
          <Button type="submit" disabled={isSaving}>
            {t('band.discordSettings.save')}
          </Button>
        </BottomBar>
      }
    >
      <div className="band-form">
        {outcome === 'saved' && <Message kind="success">{t('band.discordSettings.saved')}</Message>}
        {outcome === 'failed' && (
          <Message kind="danger">{t('band.discordSettings.failed')}</Message>
        )}
        <Sheet title={t('band.discordSettings.server')}>
          <TextField
            label={t('band.discordSettings.link')}
            hint={t('band.discordSettings.linkHint')}
            error={linkError}
            inputMode="url"
            autoComplete="off"
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
          {settings.serverId && link.trim() === settings.serverId && !linkError && (
            <Message kind="success">{t('band.discordSettings.linkRecognized')}</Message>
          )}
        </Sheet>
        {settings.serverId && (
          <Sheet title={t('band.discordSettings.bot')}>
            {!settings.hasBot && (
              <>
                <Message kind="warning">{t('band.discordSettings.botNone')}</Message>
                <p className="settings-note textCaption">{t('band.discordSettings.botHelp')}</p>
              </>
            )}
            {settings.hasBot && settings.bot === 'connected' && (
              <Message kind="success">
                {serverName
                  ? t('band.discordSettings.botConnected', { server: serverName })
                  : t('band.discordSettings.botConnectedNoName')}
              </Message>
            )}
            {settings.hasBot && settings.bot === 'refused' && (
              <Message kind="warning">{t('band.discordSettings.botRefused')}</Message>
            )}
            {settings.hasBot && settings.bot === 'unreachable' && (
              <Message kind="warning">{t('band.discordSettings.botUnreachable')}</Message>
            )}
          </Sheet>
        )}
        {settings.serverId && settings.roles && (
          <Sheet title={t('band.discordSettings.roles')}>
            <p className="settings-note textCaption">{t('band.discordSettings.rolesLead')}</p>
            <div className="settings-rows">
              {settings.sections.map((one) => (
                <NavRow
                  key={one.id}
                  pictogram={one.icon}
                  label={one.name}
                  detail={roleName(roles[one.id] ?? null)}
                  chevron
                  opensPanel
                  onClick={() => setChoosing(one.id)}
                />
              ))}
            </div>
          </Sheet>
        )}
      </div>
      <Panel
        open={section !== undefined}
        onClose={() => setChoosing(null)}
        title={section?.name ?? ''}
      >
        <p className="settings-note textCaption">
          {serverName
            ? t('band.discordSettings.roleSheetLead', { server: serverName })
            : t('band.discordSettings.roleSheetLeadNoName')}
        </p>
        <div role="radiogroup" aria-label={section?.name}>
          {section &&
            [null, ...(settings.roles ?? []).map((role) => role.id)].map((roleId) => {
              // A role tags one section: a role another section has is not offered.
              const takenBy = Object.entries(roles).find(
                ([sectionId, other]) =>
                  other !== null && other === roleId && Number(sectionId) !== section.id,
              );
              return (
                <ListRow
                  key={roleId ?? 'none'}
                  label={roleName(roleId)}
                  detail={takenBy ? t('band.discordSettings.roleTaken') : undefined}
                  disabled={takenBy !== undefined}
                  group={group}
                  selected={(roles[section.id] ?? null) === roleId}
                  onSelect={() => {
                    setRoles({ ...roles, [section.id]: roleId });
                    setChoosing(null);
                  }}
                />
              );
            })}
        </div>
      </Panel>
    </AppLayout>
  );
}

function rolesOf(settings: DiscordSettings): Record<number, string | null> {
  return Object.fromEntries(
    settings.sections.map((section) => [section.id, section.discordRoleId]),
  );
}
