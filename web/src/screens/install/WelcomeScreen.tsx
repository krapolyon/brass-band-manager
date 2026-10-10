import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { TextField } from '../../components/TextField.tsx';
import { languageName } from '../../i18n.ts';
import { AlreadyInstalledScreen } from './AlreadyInstalledScreen.tsx';
import { useInstallDraft } from './InstallDraft.tsx';
import { InstallLayout } from './InstallLayout.tsx';
import { checkInstallKey, useInstallStatus } from './installApi.ts';

// Figma: Install / Welcome, and its states: empty, language, key missing,
// checking the key, wrong key.
//
// The install key is asked here and checked when "C'est parti" is pressed,
// before the first step. It is checked again when the install is confirmed.
export function WelcomeScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { update } = useInstallDraft();
  const status = useInstallStatus(i18n.language);

  const [key, setKey] = useState('');
  const [isKeyShown, setKeyShown] = useState(false);
  const [isKeyMissing, setKeyMissing] = useState(false);
  const [isLanguageOpen, setLanguageOpen] = useState(false);

  const check = useMutation({
    mutationFn: checkInstallKey,
    onSuccess: (_, installKey) => {
      update({ installKey });
      navigate('/install/band');
    },
    onError: (error) => {
      // Someone finished the install in the meantime: show it.
      if (error instanceof ApiError && error.error === 'alreadyInstalled') {
        queryClient.invalidateQueries({ queryKey: ['install'] });
      }
    },
  });

  if (status.data?.installed) {
    return <AlreadyInstalledScreen />;
  }

  const start = () => {
    if (key === '') {
      setKeyMissing(true);
      return;
    }
    check.mutate(key);
  };

  const isUnreachable =
    status.isError || (check.error instanceof ApiError && check.error.status === 0);
  const isKeyWrong = check.isError && !isUnreachable;
  const keyError = isKeyMissing
    ? t('install.welcome.key.missing')
    : isKeyWrong
      ? t('install.welcome.key.wrong')
      : undefined;

  const languages = status.data?.installed === false ? status.data.languages : [i18n.language];

  return (
    <>
      <InstallLayout
        navAtEnd
        nav={
          <Button kind="secondary" size="small" icon="Globe" onClick={() => setLanguageOpen(true)}>
            {languageName(i18n.language)}
          </Button>
        }
        title={t('install.welcome.title')}
        lead={t('install.welcome.lead')}
        onSubmit={start}
        actions={
          <BottomBar>
            <Button type="submit" disabled={check.isPending}>
              {check.isPending ? t('install.welcome.checking') : t('install.welcome.start')}
            </Button>
          </BottomBar>
        }
      >
        {isUnreachable && <Message kind="danger">{t('errors.unreachable')}</Message>}
        <Sheet>
          <ListRow
            label={t('install.welcome.steps.band.label')}
            detail={t('install.welcome.steps.band.detail')}
          />
          <ListRow
            label={t('install.welcome.steps.sections.label')}
            detail={t('install.welcome.steps.sections.detail')}
          />
          <ListRow
            label={t('install.welcome.steps.member.label')}
            detail={t('install.welcome.steps.member.detail')}
          />
        </Sheet>
        <Sheet>
          <TextField
            label={t('install.welcome.key.label')}
            hint={t('install.welcome.key.hint')}
            error={keyError}
            type={isKeyShown ? 'text' : 'password'}
            name="installKey"
            // Not a password of the member: a password manager has nothing to offer here.
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={key}
            onChange={(event) => {
              setKey(event.target.value);
              setKeyMissing(false);
              check.reset();
            }}
            trailing={
              <IconButton
                icon={isKeyShown ? 'EyeOff' : 'Eye'}
                label={isKeyShown ? t('install.welcome.key.hide') : t('install.welcome.key.show')}
                tone="muted"
                aria-pressed={isKeyShown}
                onClick={() => setKeyShown(!isKeyShown)}
              />
            }
          />
        </Sheet>
      </InstallLayout>

      <Panel
        open={isLanguageOpen}
        onClose={() => setLanguageOpen(false)}
        title={t('install.language.title')}
      >
        {languages.map((language) => (
          <ListRow
            key={language}
            label={languageName(language)}
            current={language === i18n.language}
            trailing={
              language === i18n.language ? (
                <span className="ListRow-mark">
                  <Icon name="Check" />
                </span>
              ) : undefined
            }
            onPress={() => {
              i18n.changeLanguage(language);
              setLanguageOpen(false);
            }}
          />
        ))}
      </Panel>
    </>
  );
}
