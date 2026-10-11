import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { useBand } from '../../band.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { TextField } from '../../components/TextField.tsx';
import { FlowLayout, focusFirstError } from '../FlowLayout.tsx';
import { AccessibilityButton } from './AccessibilityButton.tsx';

// Figma: Members / Forgot password, in its three states: the form, "sent",
// and what it says on an instance that cannot send email. The screen answers
// the same thing whatever the address: nothing tells whether it belongs to a
// member (model/members.md, "Forgotten password").
export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const band = useBand().data;
  const [email, setEmail] = useState('');
  const [wasSent, setSent] = useState(false);

  const request = useMutation({
    mutationFn: () => api('/api/passwordLink/request', { method: 'POST', body: { email } }),
  });
  const cannotSend =
    band?.canSendEmail === false ||
    (request.error instanceof ApiError && request.error.error === 'emailUnavailable');

  // Said before sending: an address that cannot be one gets no "sent" screen.
  const emailError =
    email.trim() === ''
      ? t('forgotPassword.emailMissing')
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? undefined
        : t('forgotPassword.emailInvalid');

  const back = (
    <IconButton
      kind="glass"
      icon="ChevronLeft"
      label={t('common.back')}
      onClick={() => navigate('/sign-in')}
    />
  );
  const toSignIn = (
    <BottomBar>
      <Button onClick={() => navigate('/sign-in')}>{t('forgotPassword.backToSignIn')}</Button>
    </BottomBar>
  );

  if (cannotSend) {
    return (
      <FlowLayout
        nav={back}
        action={<AccessibilityButton />}
        title={t('forgotPassword.title')}
        lead={t('forgotPassword.noEmail.lead')}
        actions={toSignIn}
      >
        <Message>{t('forgotPassword.noEmail.who')}</Message>
      </FlowLayout>
    );
  }

  if (request.isSuccess) {
    return (
      <FlowLayout
        nav={back}
        action={<AccessibilityButton />}
        title={t('forgotPassword.sent.title')}
        lead={t('forgotPassword.sent.lead')}
        actions={toSignIn}
      >
        <Message>{t('forgotPassword.sent.nothing')}</Message>
      </FlowLayout>
    );
  }

  return (
    <FlowLayout
      nav={back}
      action={<AccessibilityButton />}
      title={t('forgotPassword.title')}
      lead={t('forgotPassword.lead')}
      onSubmit={() => {
        if (request.isPending) return;
        setSent(true);
        if (emailError) {
          focusFirstError();
        } else {
          request.mutate();
        }
      }}
      actions={
        <BottomBar>
          <Button type="submit" disabled={request.isPending}>
            {t('forgotPassword.submit')}
          </Button>
        </BottomBar>
      }
    >
      {request.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
      <Sheet>
        <TextField
          label={t('signIn.email')}
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          error={wasSent ? emailError : undefined}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Sheet>
    </FlowLayout>
  );
}
