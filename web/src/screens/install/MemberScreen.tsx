import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { ApiError } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { InstrumentRow } from '../../components/InstrumentRow.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { PickerField, TextField } from '../../components/TextField.tsx';
import type { DraftMember } from './InstallDraft.tsx';
import { useInstallDraft } from './InstallDraft.tsx';
import { focusFirstError, InstallLayout } from './InstallLayout.tsx';
import { install } from './installApi.ts';
import { StepNav } from './StepNav.tsx';
import { countInstruments, keptSections, useSections } from './sections.ts';

// The rules of the API (AccessRules.php, InstallAction.php), so that the
// member learns of a problem before sending. The API checks them again.
const PASSWORD_MIN_CHARACTERS = 10;
const NAME_MAX_LENGTH = 50;
const EMAIL_MAX_LENGTH = 254;

type Field = 'firstName' | 'lastName' | 'nickname' | 'instrument' | 'email' | 'password';

// Figma: Install / First member, and its states: empty, filled, errors,
// instrument picker, sending, server error.
export function MemberScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { draft, update } = useInstallDraft();
  const [sections] = useSections();
  const [wasSent, setSent] = useState(false);
  const [isPasswordShown, setPasswordShown] = useState(false);
  const [isPickerOpen, setPickerOpen] = useState(false);

  const { member } = draft;
  const kept = keptSections(sections);
  // A flat list, in the order of the band: many sections hold a single instrument.
  const instruments = kept.flatMap((section) => section.instruments);
  // An instrument chosen here and then unticked at step 2 is no longer chosen.
  const instrument = instruments.find((other) => other.id === member.instrumentId);

  const send = useMutation({
    mutationFn: install,
    onSuccess: () => {
      // The key, the password and the contact details have done their work: they leave the memory.
      update({
        installKey: '',
        logo: null,
        logoInput: null,
        member: {
          firstName: '',
          lastName: '',
          nickname: '',
          instrumentId: null,
          email: '',
          password: '',
        },
        summary: {
          bandName: draft.bandName.trim(),
          sectionCount: kept.length,
          instrumentCount: countInstruments(kept),
          nickname: member.nickname.trim(),
          instrument: instrument?.name ?? '',
        },
      });
      queryClient.invalidateQueries({ queryKey: ['install'] });
      // The page takes the name and the icon of the band.
      queryClient.invalidateQueries({ queryKey: ['band'] });
      navigate('/install/done', { replace: true });
    },
    onError: (error) => {
      // Someone finished the install in the meantime: the welcome address says so.
      if (error instanceof ApiError && error.error === 'alreadyInstalled') {
        queryClient.invalidateQueries({ queryKey: ['install'] });
        navigate('/install', { replace: true });
      }
    },
  });

  if (draft.summary) {
    return <Navigate to="/install/done" replace />;
  }
  if (draft.installKey === '') {
    return <Navigate to="/install" replace />;
  }

  const set = (changes: Partial<DraftMember>) => {
    // While the install is being sent, what is on its way is not changed.
    if (send.isPending) return;
    update({ member: { ...member, ...changes } });
    send.reset();
  };

  // What the API refused, when it refused fields: { "admin.email": "invalid" }.
  const refused = send.error instanceof ApiError ? send.error.fields : {};
  const missingCharacters = PASSWORD_MIN_CHARACTERS - [...member.password].length;

  const errors: Partial<Record<Field, string>> = {};
  if (wasSent) {
    for (const name of ['firstName', 'lastName', 'nickname'] as const) {
      // Refused by the API: a name made only of characters that are not kept.
      if (member[name].trim() === '' || refused[`admin.${name}`]) {
        errors[name] = t(`install.member.${name}.missing`);
      }
    }
    if (!instrument || refused['admin.instrument']) {
      errors.instrument = t('install.member.instrument.missing');
    }
    if (member.email.trim() === '') {
      errors.email = t('install.member.email.missing');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim()) || refused['admin.email']) {
      errors.email = t('install.member.email.invalid');
    }
    if (missingCharacters > 0) {
      errors.password = t('install.member.password.tooShort', {
        count: missingCharacters,
        min: PASSWORD_MIN_CHARACTERS,
      });
    } else if (refused['admin.password']) {
      errors.password = t('install.member.password.invalid');
    }
  }
  const errorCount = Object.keys(errors).length;
  // A failure that no field of this screen explains. Either the server did not
  // answer, and sending again is the thing to do; or it refused something of
  // an earlier step, and sending the same again would not help.
  const failure =
    !send.isError || errorCount > 0
      ? null
      : send.error instanceof ApiError && send.error.status > 0 && send.error.status < 500
        ? 'refused'
        : 'failed';

  const finish = () => {
    if (send.isPending) return;
    setSent(true);
    const isComplete =
      member.firstName.trim() !== '' &&
      member.lastName.trim() !== '' &&
      member.nickname.trim() !== '' &&
      instrument !== undefined &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim()) &&
      missingCharacters <= 0;
    if (!isComplete || !instrument) {
      focusFirstError();
      return;
    }

    send.mutate({
      installKey: draft.installKey,
      language: i18n.language,
      bandName: draft.bandName,
      sections: kept.map((section) => ({
        name: section.name,
        instruments: section.instruments.map((other) => other.name),
      })),
      admin: {
        email: member.email,
        password: member.password,
        lastName: member.lastName,
        firstName: member.firstName,
        nickname: member.nickname,
        instrument: instrument.name,
      },
      ...(draft.logoInput ? { logo: draft.logoInput } : {}),
    });
  };

  return (
    <>
      <InstallLayout
        nav={<StepNav step={3} back="/install/sections" />}
        title={t('install.member.title')}
        lead={t('install.member.lead')}
        onSubmit={finish}
        actions={
          <BottomBar>
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? t('install.member.sending') : t('install.member.finish')}
            </Button>
          </BottomBar>
        }
      >
        {errorCount > 0 && (
          <Message kind="danger">
            {t('install.errors.beforeFinishing', { count: errorCount })}
          </Message>
        )}
        <Sheet title={t('install.member.inTheBand')}>
          <div className="InstallLayout-pair">
            <TextField
              label={t('install.member.firstName.label')}
              error={errors.firstName}
              name="firstName"
              autoComplete="given-name"
              maxLength={NAME_MAX_LENGTH}
              value={member.firstName}
              onChange={(event) => set({ firstName: event.target.value })}
            />
            <TextField
              label={t('install.member.lastName.label')}
              error={errors.lastName}
              name="lastName"
              autoComplete="family-name"
              maxLength={NAME_MAX_LENGTH}
              value={member.lastName}
              onChange={(event) => set({ lastName: event.target.value })}
            />
          </div>
          <div className="InstallLayout-pair">
            <TextField
              label={t('install.member.nickname.label')}
              hint={t('install.member.nickname.hint')}
              error={errors.nickname}
              name="nickname"
              autoComplete="nickname"
              maxLength={NAME_MAX_LENGTH}
              value={member.nickname}
              onChange={(event) => set({ nickname: event.target.value })}
            />
            <PickerField
              label={t('install.member.instrument.label')}
              error={errors.instrument}
              value={instrument?.name ?? ''}
              placeholder={t('install.member.instrument.placeholder')}
              onPick={() => setPickerOpen(true)}
            />
          </div>
        </Sheet>
        <Sheet title={t('install.member.toSignIn')}>
          <div className="InstallLayout-pair">
            <TextField
              label={t('install.member.email.label')}
              hint={t('install.member.email.hint')}
              error={errors.email}
              type="email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={EMAIL_MAX_LENGTH}
              value={member.email}
              onChange={(event) => set({ email: event.target.value })}
            />
            <TextField
              label={t('install.member.password.label')}
              hint={t('install.member.password.hint', { min: PASSWORD_MIN_CHARACTERS })}
              error={errors.password}
              type={isPasswordShown ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              value={member.password}
              onChange={(event) => set({ password: event.target.value })}
              trailing={
                <IconButton
                  icon={isPasswordShown ? 'EyeOff' : 'Eye'}
                  label={
                    isPasswordShown
                      ? t('install.member.password.hide')
                      : t('install.member.password.show')
                  }
                  tone="muted"
                  aria-pressed={isPasswordShown}
                  onClick={() => setPasswordShown(!isPasswordShown)}
                />
              }
            />
          </div>
        </Sheet>
        {failure && <Message kind="danger">{t(`install.member.${failure}`)}</Message>}
      </InstallLayout>

      <Panel
        open={isPickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('install.member.instrument.title')}
      >
        {instruments.map((other) => (
          <InstrumentRow
            key={other.id}
            name={other.name}
            choice={other.id === instrument?.id ? 'current' : 'none'}
            onPress={() => {
              set({ instrumentId: other.id });
              setPickerOpen(false);
            }}
          />
        ))}
      </Panel>
    </>
  );
}
