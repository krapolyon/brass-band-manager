import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { useSetMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { PasswordField } from '../access/PasswordField.tsx';
import { PASSWORD_MIN_CHARACTERS, usePasswordError } from '../access/PasswordLinkScreen.tsx';
import { focusFirstFieldError } from './ProfileScreen.tsx';

// Figma: Members / Settings — password. Asks for the current password; a
// wrong one counts like a wrong password at sign-in, and at the fifth the
// device is signed out (model/members.md, "Password change").
export function PasswordScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setMe = useSetMe();
  const queryClient = useQueryClient();
  const passwordError = usePasswordError();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [wasSent, setSent] = useState(false);

  const change = useMutation({
    mutationFn: () =>
      api('/api/me/password', { method: 'PUT', body: { currentPassword, newPassword } }),
    onSuccess: () => navigate('/settings'),
    onError: (error) => {
      // After too many wrong passwords the session is over: asking who is
      // signed in tells, and the guard of the app then leads to the sign-in screen.
      queryClient.invalidateQueries({ queryKey: ['me'] });
      if (error instanceof ApiError && error.status === 401) {
        setMe(null);
        navigate('/sign-in', { replace: true });
      } else {
        focusFirstFieldError();
      }
    },
  });

  const refused = change.error instanceof ApiError ? change.error.fields : {};
  const currentError = !wasSent
    ? undefined
    : currentPassword === ''
      ? t('settings.password.currentMissing')
      : refused.currentPassword
        ? t('settings.password.currentWrong')
        : undefined;
  const newError = wasSent
    ? (passwordError(newPassword, Boolean(refused.newPassword)) ?? undefined)
    : undefined;
  const isUnreachable = change.isError && !currentError && !newError;

  return (
    <AppLayout
      current="settings"
      back="/settings"
      backLabel={t('nav.settings')}
      width="form"
      title={t('settings.password.title')}
      onSubmit={() => {
        if (change.isPending) return;
        setSent(true);
        if (currentPassword === '' || passwordError(newPassword, false)) {
          focusFirstFieldError();
        } else {
          change.mutate();
        }
      }}
      actions={
        <BottomBar>
          <Button type="submit" disabled={change.isPending}>
            {t('settings.password.submit')}
          </Button>
        </BottomBar>
      }
    >
      {isUnreachable && <Message kind="danger">{t('errors.unreachable')}</Message>}
      <Sheet>
        <PasswordField
          label={t('settings.password.current')}
          name="currentPassword"
          autoComplete="current-password"
          error={currentError}
          value={currentPassword}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <PasswordField
          label={t('newPassword.label')}
          name="newPassword"
          autoComplete="new-password"
          hint={t('password.hint', { min: PASSWORD_MIN_CHARACTERS })}
          error={newError}
          value={newPassword}
          onChange={(event) => setNew(event.target.value)}
        />
      </Sheet>
      <Message>{t('settings.password.otherDevices')}</Message>
    </AppLayout>
  );
}
