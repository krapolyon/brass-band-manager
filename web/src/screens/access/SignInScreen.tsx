import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { BandMention } from '../../components/BandMention.tsx';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { TextField } from '../../components/TextField.tsx';
import { type Me, useSetMe } from '../../session.ts';
import { FlowLayout } from '../FlowLayout.tsx';
import { AccessibilityButton } from './AccessibilityButton.tsx';
import { PasswordField } from './PasswordField.tsx';
import './access.css';

// Figma: Members / Sign in, filled and refused. Every refusal gets the same
// words: a wrong email, a wrong password, a member who cannot sign in and a
// locked sign-in are not told apart (model/members.md, "Sign-in").
export function SignInScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setMe = useSetMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signIn = useMutation({
    mutationFn: () => api<Me>('/api/session', { method: 'POST', body: { email, password } }),
    onSuccess: (me) => {
      setMe(me);
      navigate('/', { replace: true });
    },
  });
  const isRefused = signIn.error instanceof ApiError && signIn.error.status === 401;

  return (
    <FlowLayout
      action={<AccessibilityButton />}
      band={<BandMention />}
      title={t('signIn.title')}
      lead={t('signIn.lead')}
      onSubmit={() => {
        if (!signIn.isPending) signIn.mutate();
      }}
      actions={
        <BottomBar>
          <Button type="submit" disabled={signIn.isPending}>
            {t('signIn.submit')}
          </Button>
        </BottomBar>
      }
    >
      {signIn.isError && (
        <Message kind="danger">{t(isRefused ? 'signIn.refused' : 'errors.unreachable')}</Message>
      )}
      <Sheet>
        <TextField
          label={t('signIn.email')}
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField
          label={t('signIn.password')}
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Sheet>
      <div className="access-centred">
        <Button kind="quiet" size="small" onClick={() => navigate('/forgot-password')}>
          {t('signIn.forgot')}
        </Button>
      </div>
    </FlowLayout>
  );
}
