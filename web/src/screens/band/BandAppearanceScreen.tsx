import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { type Band, useBand } from '../../band.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { ImageField } from '../../components/ImageField.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SelectField, TextField } from '../../components/TextField.tsx';
import { ThemeSwatch } from '../../components/ThemeSwatch.tsx';
import i18n, { languageName } from '../../i18n.ts';
import { accentThemes } from '../../themes.ts';
import { AppLayout } from '../AppLayout.tsx';
import type { LogoInput } from '../install/installApi.ts';
import { prepareLogo } from '../install/logo.ts';
import { focusFirstFieldError } from '../settings/ProfileScreen.tsx';
import '../settings/settings.css';
import { AdminsOnlyScreen, useCanManageBand } from './BandSettingsScreen.tsx';

const LOGO_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1000 * 1000;
const NAME_MAX_LENGTH = 80;
const languages = Object.keys(i18n.options.resources ?? {});

// Figma: Band settings / Appearance. The name, the logo, the accent colour
// and the default language of the band, saved with one button: they change
// what every member sees, and what is shown before sign-in.
export function BandAppearanceScreen() {
  const canManage = useCanManageBand();
  const band = useBand().data;

  if (canManage === null || !band) return null;
  if (!canManage) return <AdminsOnlyScreen />;
  // The form starts from the band as it is when the screen opens.
  return <AppearanceForm band={band} />;
}

function AppearanceForm({ band }: { band: Band }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const swatches = useId();
  const [name, setName] = useState(band.name);
  const [theme, setTheme] = useState(band.defaultAccentTheme);
  const [language, setLanguage] = useState(band.defaultLanguage);
  // The logo: a new file with its icons, or the saved one taken away.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoInput, setLogoInput] = useState<LogoInput | null>(null);
  const [isLogoRemoved, setLogoRemoved] = useState(false);
  const [logoError, setLogoError] = useState<string>();
  const [wasSent, setSent] = useState(false);

  // A file that is refused is not kept: the logo stays what it was.
  const chooseLogo = async (file: File | null) => {
    if (file === null) {
      setLogoFile(null);
      setLogoInput(null);
      setLogoRemoved(true);
      setLogoError(undefined);
      return;
    }
    // Some systems give no type to an SVG file: its name then says what it is.
    const type = file.type || (file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '');
    if (!LOGO_TYPES.includes(type)) {
      setLogoError(t('install.band.logo.wrongType'));
    } else if (file.size > LOGO_MAX_BYTES) {
      const megabytes = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(
        file.size / 1000 / 1000,
      );
      setLogoError(t('install.band.logo.tooBig', { size: megabytes }));
    } else {
      try {
        setLogoInput(await prepareLogo(file));
        setLogoFile(file);
        setLogoRemoved(false);
        setLogoError(undefined);
      } catch {
        setLogoError(t('install.band.logo.wrongType'));
      }
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      await api('/api/band', {
        method: 'PATCH',
        body: { name, defaultAccentTheme: theme, defaultLanguage: language },
      });
      if (logoInput) {
        await api('/api/band/logo', { method: 'PUT', body: logoInput });
      } else if (isLogoRemoved && band.logoUrl) {
        await api('/api/band/logo', { method: 'DELETE' });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['band'] });
      navigate('/band');
    },
    onError: focusFirstFieldError,
  });

  const refused = save.error instanceof ApiError ? save.error.fields : {};
  const nameError =
    wasSent && (name.trim() === '' || refused.name) ? t('install.band.name.missing') : undefined;
  const isUnreachable = save.isError && !nameError;

  return (
    <AppLayout
      current="settings"
      back="/band"
      backLabel={t('band.title')}
      width="form"
      title={t('band.appearance.title')}
      subtitle={t('band.appearance.lead')}
      onSubmit={() => {
        if (save.isPending) return;
        setSent(true);
        if (name.trim() === '') {
          focusFirstFieldError();
        } else {
          save.mutate();
        }
      }}
      actions={
        <BottomBar>
          <Button type="submit" disabled={save.isPending}>
            {t('settings.save')}
          </Button>
        </BottomBar>
      }
    >
      {isUnreachable && <Message kind="danger">{t('errors.unreachable')}</Message>}
      <Sheet title={t('band.appearance.nameAndLogo')}>
        <TextField
          label={t('install.band.name.label')}
          error={nameError}
          name="bandName"
          autoComplete="off"
          maxLength={NAME_MAX_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <ImageField
          label={t('install.band.logo.label')}
          hint={t('band.appearance.logoHint')}
          error={logoError}
          accept={LOGO_TYPES.join(',')}
          value={logoFile}
          current={isLogoRemoved ? null : band.logoUrl}
          onChange={chooseLogo}
        />
      </Sheet>
      <Sheet title={t('settings.appearance.accentTitle')}>
        <div
          className="settings-swatches"
          role="radiogroup"
          aria-label={t('settings.appearance.accentTitle')}
        >
          {accentThemes.map((other) => (
            <ThemeSwatch
              key={other}
              theme={other}
              label={t(`theme.${other}`)}
              name={swatches}
              checked={theme === other}
              onChange={() => setTheme(other)}
            />
          ))}
        </div>
        <p className="settings-note textCaption">{t('band.appearance.accentNote')}</p>
      </Sheet>
      <Sheet title={t('settings.language.title')}>
        <SelectField
          label={t('band.appearance.language')}
          hint={t('band.appearance.languageNote')}
          value={language}
          onChange={setLanguage}
          options={languages.map((other) => ({ value: other, label: languageName(other) }))}
        />
      </Sheet>
    </AppLayout>
  );
}
