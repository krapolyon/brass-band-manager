import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { useMe, useSetMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { PasswordField } from '../access/PasswordField.tsx';
import { AdminsOnlyScreen } from './BandSettingsScreen.tsx';
import {
  downloadExport,
  type ExportPart,
  exportNeeds,
  exportParts,
  megabytes,
  useTransfer,
} from './transfer.ts';
import './band.css';

// Figma: Band settings / Export, and its confirmation (section 5). The admin
// ticks the parts to export, a part ticking those it needs; the password is
// asked again, since the file holds the personal data of the members
// (model/export-import.md). The server builds the zip and the browser saves it.
export function BandExportScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setMe = useSetMe();
  const me = useMe().data;
  const state = useTransfer();
  const [chosen, setChosen] = useState<ExportPart[]>([...exportParts]);
  const [isConfirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [wasSent, setSent] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [isExporting, setExporting] = useState(false);

  if (!me) return null;
  if (!me.permissions.includes('transferData')) return <AdminsOnlyScreen />;

  // Ticking a part ticks what it needs; unticking one unticks what needs it.
  const toggle = (part: ExportPart, isOn: boolean) => {
    const next = new Set(chosen);
    if (isOn) {
      next.add(part);
      for (const need of exportNeeds[part]) next.add(need);
    } else {
      next.delete(part);
      for (const other of exportParts) if (exportNeeds[other].includes(part)) next.delete(other);
    }
    setChosen(exportParts.filter((one) => next.has(one)));
  };
  const data = state.data;
  const songsWeight = data ? megabytes(data.songBytes, i18n.language) : '';
  const details: Record<ExportPart, string> = {
    settings: t('band.transfer.export.settingsDetail'),
    members: t('band.transfer.export.membersDetail', { count: data?.members ?? 0 }),
    songs: t('band.transfer.export.songsDetail', { count: data?.songs ?? 0, weight: songsWeight }),
    gigs: t('band.transfer.export.gigsDetail', { count: data?.gigs ?? 0 }),
  };

  const passwordError = !wasSent
    ? undefined
    : password === ''
      ? t('band.migrations.passwordMissing')
      : failure?.fields.password
        ? t('settings.password.currentWrong')
        : undefined;
  const send = async () => {
    setSent(true);
    setFailure(null);
    if (password === '' || isExporting) return;
    setExporting(true);
    try {
      await downloadExport(chosen, password);
      setConfirming(false);
      setPassword('');
      setSent(false);
    } catch (error) {
      const refused = error instanceof ApiError ? error : new ApiError(0, 'unreachable');
      // After too many wrong passwords the session is over (see PasswordScreen).
      if (refused.status === 401) {
        setMe(null);
        navigate('/sign-in', { replace: true });
      }
      setFailure(refused);
    } finally {
      setExporting(false);
    }
  };
  const close = () => {
    if (isExporting) return;
    setConfirming(false);
    setPassword('');
    setSent(false);
    setFailure(null);
  };

  return (
    <AppLayout
      current="settings"
      back="/band/import"
      backLabel={t('band.transfer.import.title')}
      width="form"
      title={t('band.transfer.export.title')}
      subtitle={t('band.transfer.export.lead')}
      actions={
        <BottomBar
          caption={
            chosen.includes('songs') && data
              ? { kind: 'info', text: t('band.transfer.export.weight', { weight: songsWeight }) }
              : undefined
          }
        >
          <Button
            icon="Download"
            disabled={chosen.length === 0}
            onClick={() => setConfirming(true)}
          >
            {t('band.transfer.export.submit')}
          </Button>
        </BottomBar>
      }
    >
      <div className="band-form">
        <Sheet title={t('band.transfer.export.what')}>
          <div className="settings-rows">
            {exportParts.map((part) => (
              <ListRow
                key={part}
                label={t(`band.transfer.part.${part}`)}
                detail={details[part]}
                checked={chosen.includes(part)}
                onCheck={(isOn) => toggle(part, isOn)}
              />
            ))}
          </div>
          <p className="band-hint textCaption">{t('band.transfer.export.note')}</p>
        </Sheet>
        <Message kind="warning">{t('band.transfer.export.personal')}</Message>
      </div>

      <Panel open={isConfirming} onClose={close} title={t('band.transfer.export.passwordTitle')}>
        <form
          className="band-panel"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <p className="textBody">{t('band.transfer.export.passwordLead')}</p>
          {failure && !passwordError && <Message kind="danger">{t('errors.unreachable')}</Message>}
          <PasswordField
            label={t('band.transfer.password')}
            name="password"
            autoComplete="current-password"
            data-autofocus
            error={passwordError}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" icon="Download" disabled={isExporting}>
            {t('band.transfer.export.submit')}
          </Button>
        </form>
      </Panel>
    </AppLayout>
  );
}
