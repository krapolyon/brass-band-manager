import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import type { AccessibilityOptions } from '../../appearance.ts';
import { useBand } from '../../band.ts';
import { BandMention } from '../../components/BandMention.tsx';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { StepIndicator } from '../../components/StepIndicator.tsx';
import { previewAccessibility, useAccessibilityBeforeSignIn } from '../../deviceAccessibility.ts';
import { HOME, type Me, useSetMe } from '../../session.ts';
import { FlowLayout, focusFirstError } from '../FlowLayout.tsx';
import { MemberRecordFields, type PhotoDraft } from '../members/MemberRecordFields.tsx';
import { draftOf, type MemberRecord, recordOf, useRecordErrors } from '../members/record.ts';
import { AccessibilityButton } from './AccessibilityButton.tsx';
import { PasswordField } from './PasswordField.tsx';
import {
  LinkExpiredScreen,
  PASSWORD_MIN_CHARACTERS,
  usePasswordError,
} from './PasswordLinkScreen.tsx';

// What POST /api/passwordLink/check answers for an invitation
// (api/src/Access/CheckPasswordLinkAction.php).
export type Invitation = {
  isInvitation: true;
  nickname: string;
  member: MemberRecord;
  /** The photo given by whoever invited, as a data address; null when there is none. */
  photo: string | null;
  instruments: { id: number; name: string }[];
};

type Props = { token: string; invitation: Invitation };

const STEPS = 2;

// Figma: Members / Onboarding, in two steps: the details filled in by
// whoever invited, to check and complete, then the password. Nothing is
// saved before the last step: everything is sent together, and saved together
// or not at all (model/members.md, entry 3).
export function OnboardingScreen({ token, invitation }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setMe = useSetMe();
  const bandCountry = useBand().data?.defaultCountryCode ?? '';
  const recordErrors = useRecordErrors();
  const passwordError = usePasswordError();

  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState(() => draftOf(invitation.member, bandCountry));
  const [photo, setPhoto] = useState<PhotoDraft>({
    saved: invitation.photo,
    chosen: null,
    isRemoved: false,
  });
  const [password, setPassword] = useState('');
  const [wasChecked, setChecked] = useState(false);
  const [wasSent, setSent] = useState(false);

  // The options start as those of the device and are shown at once; they are
  // saved with the account, not on the device.
  const [options, setOptions] = useState<AccessibilityOptions>(useAccessibilityBeforeSignIn());
  useEffect(() => {
    previewAccessibility(options);
    return () => previewAccessibility(null);
  }, [options]);
  const accessibility = <AccessibilityButton account={{ value: options, onChange: setOptions }} />;

  const validate = useMutation({
    mutationFn: () =>
      api('/api/passwordLink/validate', {
        method: 'POST',
        body: { token, member: recordOf(draft, bandCountry) },
      }),
    onSuccess: () => setStep(2),
    onError: focusFirstError,
  });
  const finish = useMutation({
    mutationFn: () =>
      api<Me>('/api/passwordLink/use', {
        method: 'POST',
        body: {
          token,
          password,
          member: recordOf(draft, bandCountry),
          accessibility: options,
          ...(photo.chosen ? { photo: { image: photo.chosen.image } } : {}),
          ...(photo.isRemoved && !photo.chosen ? { removePhoto: true } : {}),
        },
      }),
    onSuccess: (me) => {
      setMe(me);
      navigate(HOME, { replace: true });
    },
    onError: (error) => {
      // A record refused at the last moment (a nickname taken meanwhile) is fixed at step 1.
      const fields = error instanceof ApiError ? Object.keys(error.fields) : [];
      if (fields.some((field) => field !== 'password')) setStep(1);
      focusFirstError();
    },
  });

  const isGone = (error: unknown) =>
    error instanceof ApiError && ['invalidPasswordLink', 'notInvited'].includes(error.error);
  if (isGone(validate.error) || isGone(finish.error)) return <LinkExpiredScreen />;

  const refusedBy = (error: unknown) => (error instanceof ApiError ? error.fields : {});
  const refused = { ...refusedBy(validate.error), ...refusedBy(finish.error) };

  if (step === 1) {
    const errors = wasChecked ? recordErrors(draft, bandCountry, refused) : {};
    const errorCount = Object.keys(errors).length;
    const isUnreachable = validate.isError && errorCount === 0;

    return (
      <FlowLayout
        nav={
          <StepIndicator step={1} of={STEPS} label={t('install.step', { step: 1, count: STEPS })} />
        }
        action={accessibility}
        band={<BandMention />}
        title={t('onboarding.title', { nickname: invitation.nickname })}
        lead={t('onboarding.lead')}
        onSubmit={() => {
          if (validate.isPending) return;
          setChecked(true);
          if (Object.keys(recordErrors(draft, bandCountry)).length > 0) {
            focusFirstError();
          } else {
            validate.mutate();
          }
        }}
        actions={
          <BottomBar>
            <Button type="submit" disabled={validate.isPending}>
              {t('onboarding.continue')}
            </Button>
          </BottomBar>
        }
      >
        {errorCount > 0 && (
          <Message kind="danger">
            {t('member.errors.beforeContinuing', { count: errorCount })}
          </Message>
        )}
        {isUnreachable && <Message kind="danger">{t('errors.unreachable')}</Message>}
        <MemberRecordFields
          voice="invited"
          draft={draft}
          onChange={(changes) => setDraft({ ...draft, ...changes })}
          errors={errors}
          instruments={invitation.instruments}
          photo={photo}
          onPhoto={setPhoto}
        />
      </FlowLayout>
    );
  }

  const error = wasSent ? passwordError(password, Boolean(refused.password)) : null;
  const isUnreachable = finish.isError && !error;

  return (
    <FlowLayout
      nav={
        <>
          <IconButton
            kind="glass"
            icon="ChevronLeft"
            label={t('common.back')}
            onClick={() => setStep(1)}
          />
          <StepIndicator step={2} of={STEPS} label={t('install.step', { step: 2, count: STEPS })} />
        </>
      }
      action={accessibility}
      title={t('onboarding.password.title')}
      lead={t('onboarding.password.lead')}
      onSubmit={() => {
        if (finish.isPending) return;
        setSent(true);
        if (passwordError(password, false)) {
          focusFirstError();
        } else {
          finish.mutate();
        }
      }}
      actions={
        <BottomBar>
          <Button type="submit" disabled={finish.isPending}>
            {t('onboarding.password.submit')}
          </Button>
        </BottomBar>
      }
    >
      {isUnreachable && <Message kind="danger">{t('errors.unreachable')}</Message>}
      <Sheet>
        <PasswordField
          label={t('signIn.password')}
          name="password"
          autoComplete="new-password"
          hint={t('password.hint', { min: PASSWORD_MIN_CHARACTERS })}
          error={error ?? undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Sheet>
    </FlowLayout>
  );
}
