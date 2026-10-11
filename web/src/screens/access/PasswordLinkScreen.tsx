import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { BandMention } from '../../components/BandMention.tsx';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { type Me, useSetMe } from '../../session.ts';
import { FlowLayout, focusFirstError } from '../FlowLayout.tsx';
import { AccessibilityButton } from './AccessibilityButton.tsx';
import { type Invitation, OnboardingScreen } from './OnboardingScreen.tsx';
import { PasswordField } from './PasswordField.tsx';

export const PASSWORD_MIN_CHARACTERS = 10;

// What POST /api/passwordLink/check answers (api/src/Access/CheckPasswordLinkAction.php).
export type PasswordLink = { isInvitation: false; nickname: string } | Invitation;

/** The secret of a password link: what follows the # of the address, which is never sent to a server. */
export function usePasswordLinkToken(): string {
  return useLocation().hash.replace(/^#/, '');
}

/** Asks the API whether a link still opens something. */
export function usePasswordLink(token: string) {
  return useQuery({
    queryKey: ['passwordLink', token],
    queryFn: () =>
      api<PasswordLink>('/api/passwordLink/check', { method: 'POST', body: { token } }),
    // A link that opens nothing will not open anything a second later.
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    // Not asked again behind the member's back while they type.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
}

/** What is wrong with a password before it is sent, in the words of the field; null when nothing is. */
export function usePasswordError() {
  const { t } = useTranslation();

  return (password: string, refused: boolean): string | null => {
    const missing = PASSWORD_MIN_CHARACTERS - [...password].length;
    if (missing > 0)
      return t('password.tooShort', { count: missing, min: PASSWORD_MIN_CHARACTERS });
    return refused ? t('password.invalid') : null;
  };
}

// Figma: Members / New password, and Members / Link expired. The screen a
// password link opens for a member who forgot theirs.
export function PasswordLinkScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setMe = useSetMe();
  const token = usePasswordLinkToken();
  const link = usePasswordLink(token);
  const passwordError = usePasswordError();
  const [password, setPassword] = useState('');
  const [wasSent, setSent] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api<Me>('/api/passwordLink/use', { method: 'POST', body: { token, password } }),
    onSuccess: (me) => {
      setMe(me);
      // The address of the link leaves the history with the link itself.
      navigate('/', { replace: true });
    },
  });

  const isGone = (error: unknown) =>
    error instanceof ApiError && error.error === 'invalidPasswordLink';
  if (isGone(link.error) || isGone(save.error)) return <LinkExpiredScreen />;
  if (link.isPending) return <FlowLayout title={t('shell.loading')} />;
  // An invitation is completed on its own screens.
  if (link.data?.isInvitation) return <OnboardingScreen token={token} invitation={link.data} />;

  const refused = save.error instanceof ApiError ? save.error.fields : {};
  const error = wasSent ? passwordError(password, Boolean(refused.password)) : null;
  const isUnreachable = link.isError || (save.isError && !error);

  return (
    <FlowLayout
      action={<AccessibilityButton />}
      band={<BandMention />}
      title={t('newPassword.title')}
      lead={t('newPassword.lead')}
      onSubmit={() => {
        if (save.isPending) return;
        setSent(true);
        if (passwordError(password, false)) {
          focusFirstError();
        } else {
          save.mutate(undefined, { onError: focusFirstError });
        }
      }}
      actions={
        <BottomBar>
          <Button type="submit" disabled={save.isPending || link.isError}>
            {t('newPassword.submit')}
          </Button>
        </BottomBar>
      }
    >
      {isUnreachable && <Message kind="danger">{t('errors.unreachable')}</Message>}
      <Sheet>
        <PasswordField
          label={t('newPassword.label')}
          name="password"
          autoComplete="new-password"
          hint={t('password.hint', { min: PASSWORD_MIN_CHARACTERS })}
          error={error ?? undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Sheet>
      <Message>{t('newPassword.otherDevices')}</Message>
    </FlowLayout>
  );
}

// Figma: Members / Link expired. A link that was used, is too old, or never
// existed: the three are not told apart.
export function LinkExpiredScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <FlowLayout
      action={<AccessibilityButton />}
      band={<BandMention />}
      title={t('linkExpired.title')}
      lead={t('linkExpired.lead')}
      actions={
        <BottomBar>
          <Button onClick={() => navigate('/forgot-password')}>{t('linkExpired.newLink')}</Button>
          <Button kind="quiet" onClick={() => navigate('/sign-in')}>
            {t('linkExpired.toSignIn')}
          </Button>
        </BottomBar>
      }
    >
      <Message>{t('linkExpired.invitation')}</Message>
    </FlowLayout>
  );
}
