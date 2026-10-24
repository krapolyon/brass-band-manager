import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { DropZone } from '../../components/DropZone.tsx';
import { Icon } from '../../components/Icon.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SwitchRow } from '../../components/SwitchRow.tsx';
import fr from '../../locales/fr.json';
import { useMe, useSetMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { PasswordField } from '../access/PasswordField.tsx';
import { AdminsOnlyScreen } from './BandSettingsScreen.tsx';
import { ScoreReading } from './ScoreReading.tsx';
import {
  type ExportPart,
  exportNeeds,
  exportParts,
  MAX_UPLOAD_BYTES,
  megabytes,
  type Problem,
  type ReadFile,
  repriseParts,
  uploadZip,
  useTransfer,
} from './transfer.ts';
import './band.css';

// Figma: Band settings / Import (sections 5, 9 and 10, 0.4.0, #43 and #50).
// A zip is dropped, or found in the folder "import" where it arrived by FTP;
// the server reads it, an export of the app or a zip of reprise, and the
// screen shows what it adds and updates, or every line to correct. Nothing
// is loaded before the admin ticks the parts, confirms and gives their
// password again (model/export-import.md).
//
// Add or update, never delete (decided with the owner on 2026-10-24): the
// wording of the screens of an export drawn in section 5 ("remplace") is
// written here as the model says it, to be brought to Figma.
export function BandImportScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setMe = useSetMe();
  const me = useMe().data;
  const state = useTransfer();
  const [file, setFile] = useState<ReadFile | null>(null);
  const [parts, setParts] = useState<string[]>([]);
  const [invites, setInvites] = useState(true);
  const [busy, setBusy] = useState<'reading' | 'loading' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [isConfirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [wasSent, setSent] = useState(false);
  const [passwordWrong, setPasswordWrong] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!me) return null;
  if (!me.permissions.includes('transferData')) return <AdminsOnlyScreen />;

  const start = () => {
    setFile(null);
    setFailure(null);
    setLoaded(false);
  };
  const read = async (name: string) => {
    setBusy('reading');
    setFailure(null);
    setLoaded(false);
    try {
      const answer = await api<ReadFile>('/api/transfer/read', { method: 'POST', body: { name } });
      setFile(answer);
      setInvites(true);
      setParts(
        answer.kind === 'export'
          ? (answer.inFile ?? [])
          : repriseParts.filter((part) => answer[part] !== undefined),
      );
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.error === 'notAZip' ? 'notAZip' : 'unreachable',
      );
    } finally {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ['transfer'] });
    }
  };
  const drop = async (files: File[]) => {
    const zip = files[0];
    if (!zip) return;
    // As the server refuses it (TransferFolder::MAX_UPLOAD_BYTES), without sending it first.
    if (zip.size > MAX_UPLOAD_BYTES) {
      setFailure('tooBig');
      return;
    }
    setBusy('reading');
    try {
      await read(await uploadZip(zip));
    } catch (error) {
      setBusy(null);
      setFailure(error instanceof ApiError && error.status === 413 ? 'tooBig' : 'unreachable');
    }
  };
  const load = async () => {
    setSent(true);
    setPasswordWrong(false);
    if (!file || password === '' || busy) return;
    setBusy('loading');
    try {
      const answer = await api<{ signedOut: boolean }>('/api/transfer/import', {
        method: 'POST',
        body: { name: file.name, parts, password, sendInvitations: invites },
      });
      setConfirming(false);
      setPassword('');
      setSent(false);
      if (answer.signedOut) {
        // Every session ended: the admin signs in again with the password of the file.
        setMe(null);
        navigate('/sign-in', { replace: true });
        return;
      }
      await queryClient.invalidateQueries();
      setFile(null);
      setLoaded(true);
    } catch (error) {
      if (error instanceof ApiError && error.fields.password) {
        setPasswordWrong(true);
      } else if (error instanceof ApiError && error.status === 401) {
        setMe(null);
        navigate('/sign-in', { replace: true });
      } else {
        setConfirming(false);
        setFailure(
          error instanceof ApiError && error.error === 'importRefused' ? 'refused' : 'unreachable',
        );
        setFile(null);
      }
    } finally {
      setBusy(null);
    }
  };

  const changes = (counts: { new?: number; updated?: number } | undefined) =>
    [
      counts?.new ? t('band.transfer.read.new', { count: counts.new }) : null,
      counts?.updated ? t('band.transfer.read.updated', { count: counts.updated }) : null,
    ]
      .filter(Boolean)
      .join(', ');
  const isExport = file?.kind === 'export';
  const hasProblems = (file?.count ?? 0) > 0 || (file !== null && file.kind === null);
  const offered: string[] = isExport ? [...exportParts] : [...repriseParts];
  const available = (part: string) =>
    isExport
      ? (file?.inFile ?? []).includes(part as ExportPart)
      : file?.[part as 'members'] !== undefined;
  const toggle = (part: string, isOn: boolean) => {
    const next = new Set(parts);
    if (isOn) {
      next.add(part);
      if (isExport) for (const need of exportNeeds[part as ExportPart]) next.add(need);
    } else {
      next.delete(part);
      if (isExport) {
        for (const other of exportParts)
          if (exportNeeds[other].includes(part as ExportPart)) next.delete(other);
      }
    }
    setParts(offered.filter((one) => next.has(one)));
  };
  const detailOf = (part: string): string => {
    if (!file || !available(part)) return t('band.transfer.read.notInFile');
    if (isExport) {
      const counts = file.parts?.[part as ExportPart];
      if (part === 'settings') return t('band.transfer.read.export.settings');
      return [
        t(`band.transfer.read.export.${part as 'members'}`, { count: counts?.total ?? 0 }),
        changes(counts),
      ]
        .filter(Boolean)
        .join(' · ');
    }
    const counts = file[part as 'members'];
    switch (part) {
      case 'members':
        return [
          t('band.transfer.read.reprise.members', {
            count: counts?.total ?? 0,
            photos: t('band.transfer.read.reprise.photos', { count: counts?.photos ?? 0 }),
          }),
          changes(counts),
        ]
          .filter(Boolean)
          .join(' · ');
      case 'songs': {
        const line = [
          t('band.transfer.read.reprise.songs', {
            count: counts?.total ?? 0,
            files: t('band.transfer.read.reprise.files', { count: counts?.files ?? 0 }),
          }),
          changes(counts),
        ]
          .filter(Boolean)
          .join(' · ');
        return counts?.updated ? `${line}${t('band.transfer.read.reprise.filesReplace')}` : line;
      }
      case 'gigs':
        return [
          t('band.transfer.read.reprise.gigs', {
            count: counts?.total ?? 0,
            slots: t('band.transfer.read.reprise.slots', { count: counts?.slots ?? 0 }),
          }),
          changes(counts),
        ]
          .filter(Boolean)
          .join(' · ');
      default:
        return t('band.transfer.read.reprise.answers', { count: counts?.total ?? 0 });
    }
  };
  const subtitle = !file
    ? t('band.transfer.import.lead')
    : file.kind === 'export'
      ? t('band.transfer.read.export.subtitle', {
          name: file.name,
          format: file.format,
          date: file.exportedAt
            ? new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'long',
                timeStyle: 'short',
              }).format(new Date(file.exportedAt))
            : '',
        })
      : file.kind === 'reprise'
        ? t('band.transfer.read.reprise.subtitle', {
            name: file.name,
            count: file.files?.length ?? 0,
            files: t('band.transfer.read.reprise.files', { count: file.fileCount ?? 0 }),
          })
        : file.name;
  const invitations = file?.invitations ?? 0;
  const showsInvites =
    (file?.canSendEmail ?? false) && invitations > 0 && parts.includes('members');
  const mainLabel = t(
    isExport ? 'band.transfer.read.export.submit' : 'band.transfer.read.reprise.submit',
  );

  return (
    <AppLayout
      current="settings"
      back="/band"
      // Once a file is read, back is the drop zone again.
      onBack={file ? start : undefined}
      backLabel={t('band.title')}
      width="form"
      title={t('band.transfer.import.title')}
      subtitle={subtitle}
      actions={
        file && file.kind !== null ? (
          <BottomBar
            caption={
              hasProblems
                ? {
                    kind: 'warning',
                    text: t('band.transfer.problems.title', { count: file.count }),
                  }
                : {
                    kind: 'info',
                    text: t(
                      isExport
                        ? 'band.transfer.read.export.ticked'
                        : 'band.transfer.read.reprise.ticked',
                      { count: parts.length },
                    ),
                  }
            }
          >
            <Button
              disabled={hasProblems || parts.length === 0}
              onClick={() => setConfirming(true)}
            >
              {mainLabel}
            </Button>
          </BottomBar>
        ) : undefined
      }
    >
      <div className="band-form">
        {loaded && <Message kind="success">{t('band.transfer.import.loaded')}</Message>}
        {!file && state.data && (
          <ScoreReading songs={state.data.scoresToRead} startsAtOnce={loaded} />
        )}
        {failure && (
          <Message kind="danger">
            {t(`band.transfer.import.failure.${failure as 'unreachable'}`)}
          </Message>
        )}

        {!file && (
          <>
            <DropZone
              size="large"
              title={t('band.transfer.import.drop')}
              hint={t('band.transfer.import.dropHint')}
              buttonLabel={t('band.transfer.import.choose')}
              multiple={false}
              disabled={busy !== null}
              onFiles={(files) => void drop(files)}
            />
            {busy === 'reading' && (
              <p role="status" className="band-hint textCaption">
                {t('band.transfer.import.reading')}
              </p>
            )}
            {/* What arrived by FTP: not drawn, deduced from the note under the zone. */}
            {(state.data?.zips.length ?? 0) > 0 && (
              <Sheet title={t('band.transfer.import.folder')}>
                <div className="settings-rows">
                  {state.data?.zips.map((zip) => (
                    <NavRow
                      key={zip.name}
                      icon="Archive"
                      label={zip.name}
                      detail={megabytes(zip.bytes, i18n.language)}
                      onClick={() => void read(zip.name)}
                      disabled={busy !== null}
                    />
                  ))}
                </div>
              </Sheet>
            )}
            <Sheet title={t('band.transfer.import.templatesTitle')}>
              <p className="textBody">{t('band.transfer.import.templatesLead')}</p>
              {/* A link drawn as Button: the server answers the zip as a download. */}
              <a
                className="Button textButton"
                data-kind="secondary"
                data-size="large"
                href="/api/transfer/templates"
                download
              >
                <Icon name="Download" size={20} />
                {t('band.transfer.import.templates')}
              </a>
            </Sheet>
            <Message>{t('band.transfer.import.exportFirst')}</Message>
            <Link
              className="Button textButton"
              data-kind="secondary"
              data-size="large"
              to="/band/export"
            >
              <Icon name="Download" size={20} />
              {t('band.transfer.import.exportFirstButton')}
            </Link>
            <Message>{t('band.transfer.import.ftp')}</Message>
          </>
        )}

        {file && hasProblems && (
          <>
            <Message kind="danger">
              {file.kind === null
                ? t('band.transfer.problems.unknownZip')
                : t('band.transfer.problems.lead')}
            </Message>
            {file.kind !== null && (
              <Sheet title={t('band.transfer.problems.title', { count: file.count })}>
                <div className="settings-rows">
                  {file.problems.map((problem, index) => (
                    <NavRow
                      // biome-ignore lint/suspicious/noArrayIndexKey: problems have no identity of their own
                      key={index}
                      label={
                        problem.line === null
                          ? problem.file
                          : t('band.transfer.problems.where', {
                              file: problem.file,
                              line: problem.line,
                            })
                      }
                      detail={t(`band.transfer.problem.${problemKey(problem)}`, {
                        value: problem.value ?? '',
                        column: problem.column ?? '',
                        name: file.name,
                      })}
                    />
                  ))}
                </div>
              </Sheet>
            )}
            <Button kind="secondary" icon="Upload" onClick={start}>
              {t('band.transfer.problems.again')}
            </Button>
          </>
        )}

        {file && !hasProblems && (
          <>
            <Sheet
              title={t(
                isExport ? 'band.transfer.read.export.what' : 'band.transfer.read.reprise.what',
              )}
            >
              <div className="settings-rows">
                {offered.map((part) => (
                  <ListRow
                    key={part}
                    label={t(`band.transfer.part.${part as 'members'}`)}
                    detail={detailOf(part)}
                    checked={parts.includes(part)}
                    onCheck={(isOn) => toggle(part, isOn)}
                    disabled={!available(part)}
                  />
                ))}
              </div>
              <p className="band-hint textCaption">
                {t(isExport ? 'band.transfer.read.export.note' : 'band.transfer.read.reprise.note')}
              </p>
            </Sheet>
            {showsInvites && (
              <Sheet title={t('band.transfer.read.invitationsTitle')}>
                <SwitchRow
                  label={t('band.transfer.read.invitations')}
                  description={t(
                    isExport
                      ? 'band.transfer.read.invitationsExport'
                      : 'band.transfer.read.invitationsReprise',
                    { count: invitations },
                  )}
                  checked={invites}
                  onChange={setInvites}
                />
              </Sheet>
            )}
            {isExport && parts.includes('members') && (
              <Message kind="danger">{t('band.transfer.read.export.signedOut')}</Message>
            )}
          </>
        )}
      </div>

      <Panel
        open={isConfirming}
        onClose={() => {
          if (busy) return;
          setConfirming(false);
          setPassword('');
          setSent(false);
          setPasswordWrong(false);
        }}
        title={t('band.transfer.export.passwordTitle')}
      >
        <form
          className="band-panel"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <p className="textBody">{t('band.transfer.read.passwordLead')}</p>
          <PasswordField
            label={t('band.transfer.password')}
            name="password"
            autoComplete="current-password"
            data-autofocus
            error={
              !wasSent
                ? undefined
                : password === ''
                  ? t('band.migrations.passwordMissing')
                  : passwordWrong
                    ? t('settings.password.currentWrong')
                    : undefined
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" disabled={busy !== null}>
            {busy === 'loading' ? t('band.transfer.read.loading') : mainLabel}
          </Button>
        </form>
      </Panel>
    </AppLayout>
  );
}

// The keys of the problems the server gives, as fr.json names them.
type ProblemKey = keyof typeof fr.band.transfer.problem;

/** The key of the message of a problem; a key the front does not know reads as "not valid". */
function problemKey(problem: Problem): ProblemKey {
  // The address of a member that is not one is said as such.
  if (problem.column === 'email' && problem.error === 'invalid') return 'emailInvalid';
  return problem.error in fr.band.transfer.problem ? (problem.error as ProblemKey) : 'invalid';
}
