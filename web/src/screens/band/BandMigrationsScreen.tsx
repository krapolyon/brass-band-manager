import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import {
  type MigrationsResult,
  useCanRunMigrations,
  usePendingMigrations,
} from '../../migrations.ts';
import { useSetMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { PasswordField } from '../access/PasswordField.tsx';
import { AdminsOnlyScreen } from './BandSettingsScreen.tsx';
import '../settings/settings.css';
import './band.css';

// Shown to an admin while migrations wait: on the home screen, where an admin
// arrives, and at the top of the band settings. Nothing for anyone else, and
// nothing when the database is up to date.
export function PendingMigrationsNotice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pending = usePendingMigrations().data ?? [];

  if (pending.length === 0) return null;

  return (
    <div className="band-panel">
      <Message kind="warning">{t('band.migrations.notice', { count: pending.length })}</Message>
      <Button kind="secondary" onClick={() => navigate('/band/migrations')}>
        {t('band.migrations.open')}
      </Button>
    </div>
  );
}

// Not drawn in Figma: deduced from the band settings screens, with their
// components (docs/architecture.md, "Deployment"). Where an admin applies the
// migrations on a host without a command line: the list of what waits, a
// confirmation that asks for the password again, then what happened
// (model/band.md, "Updating the database").
export function BandMigrationsScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setMe = useSetMe();
  const canRun = useCanRunMigrations();
  const pending = usePendingMigrations();
  const [isConfirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [wasSent, setSent] = useState(false);
  // What the last run did. Kept here, so that it is shown whatever happened
  // to the panel in the meantime.
  const [result, setResult] = useState<MigrationsResult | null>(null);
  const outcome = useRef<HTMLDivElement>(null);

  const run = useMutation({
    mutationFn: () =>
      api<MigrationsResult>('/api/migrations', { method: 'POST', body: { password } }),
    onSuccess: (result) => {
      setResult(result);
      queryClient.setQueryData(['migrations'], result.pending);
      // The tables changed: what the app had read is asked again.
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'migrations' });
      setConfirming(false);
      setPassword('');
      setSent(false);
    },
    onError: (error) => {
      // After too many wrong passwords the session is over (see PasswordScreen).
      if (error instanceof ApiError && error.status === 401) {
        setMe(null);
        navigate('/sign-in', { replace: true });
      }
    },
  });

  // The button that opened the panel may be gone once the run is over: the
  // focus goes to what happened, never nowhere.
  useEffect(() => {
    if (result) outcome.current?.focus();
  }, [result]);

  if (canRun === null) return null;
  if (!canRun) return <AdminsOnlyScreen />;

  const names = pending.data ?? [];
  const refused = run.error instanceof ApiError ? run.error : null;
  const passwordError = !wasSent
    ? undefined
    : password === ''
      ? t('band.migrations.passwordMissing')
      : refused?.fields.password
        ? t('settings.password.currentWrong')
        : undefined;
  const failure =
    run.isError && !passwordError
      ? refused?.error === 'migrationsRunning'
        ? t('band.migrations.running')
        : refused?.error === 'encryptionKeyMissing'
          ? t('band.migrations.encryptionKeyMissing')
          : t('errors.unreachable')
      : null;

  const close = () => {
    // Not while a run is on its way: its result must be seen.
    if (run.isPending) return;
    setConfirming(false);
    setPassword('');
    setSent(false);
    run.reset();
  };

  return (
    <AppLayout
      current="settings"
      back="/band"
      backLabel={t('band.title')}
      width="form"
      title={t('band.migrations.title')}
      subtitle={t('band.migrations.lead')}
      actions={
        names.length > 0 ? (
          <BottomBar surface="glass">
            <Button onClick={() => setConfirming(true)}>{t('band.migrations.apply')}</Button>
          </BottomBar>
        ) : undefined
      }
    >
      <div className="band-form">
        {pending.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}

        {result && (
          <div className="band-form" ref={outcome} tabIndex={-1}>
            {result?.failed && (
              <Message kind="danger">
                {t('band.migrations.failed', { name: result.failed.name })}
              </Message>
            )}
            {result && !result.failed && result.applied.length > 0 && (
              <Message kind="success">
                {t('band.migrations.done', { count: result.applied.length })}
              </Message>
            )}
            {result?.failed && (
              <Sheet title={t('band.migrations.answer')}>
                {/* What MySQL said, as it said it: the admin repairs the database with it. */}
                <p className="textBody band-migrationAnswer">{result.failed.message}</p>
              </Sheet>
            )}
            {result && result.applied.length > 0 && (
              <Sheet title={t('band.migrations.applied')}>
                <div className="settings-rows">
                  {result.applied.map((name) => (
                    <NavRow key={name} icon="Check" label={name} />
                  ))}
                </div>
              </Sheet>
            )}
          </div>
        )}

        {names.length > 0 && (
          <>
            {!result?.failed && <Message kind="warning">{t('band.migrations.backup')}</Message>}
            <Sheet title={t('band.migrations.pending', { count: names.length })}>
              <div className="settings-rows">
                {names.map((name) => (
                  <NavRow key={name} icon="FileText" label={name} />
                ))}
              </div>
            </Sheet>
          </>
        )}
        {pending.isSuccess && names.length === 0 && !result && (
          <Message>{t('band.migrations.upToDate')}</Message>
        )}
      </div>

      <Panel open={isConfirming} onClose={close} title={t('band.migrations.confirm.title')}>
        <form
          className="band-panel"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (run.isPending) return;
            setSent(true);
            if (password !== '') run.mutate();
          }}
        >
          <p className="textBody">{t('band.migrations.confirm.text', { count: names.length })}</p>
          {failure && <Message kind="danger">{failure}</Message>}
          <PasswordField
            label={t('band.migrations.confirm.password')}
            name="password"
            autoComplete="current-password"
            data-autofocus
            error={passwordError}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" kind="danger" disabled={run.isPending}>
            {run.isPending
              ? t('band.migrations.confirm.applying')
              : t('band.migrations.confirm.submit')}
          </Button>
          <Button kind="quiet" onClick={close} disabled={run.isPending}>
            {t('band.migrations.confirm.cancel')}
          </Button>
        </form>
      </Panel>
    </AppLayout>
  );
}
