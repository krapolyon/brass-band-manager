import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { type Band, useBand } from '../../band.ts';
import { BandTile } from '../../components/BandTile.tsx';
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
import { APP_ICON_TYPES, type AppIconProblem, prepareAppIcon } from './appIcon.ts';
import { AdminsOnlyScreen, useCanManageBand } from './BandSettingsScreen.tsx';

const LOGO_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1000 * 1000;
const NAME_MAX_LENGTH = 80;
const languages = Object.keys(i18n.options.resources ?? {});

// Figma: Band settings / Appearance (section 6, 0.3.0). The name, the logo,
// the icon of the installed app, the accent colour and the default language
// of the band, saved with one button: they change what every member sees,
// and what is shown before sign-in. Band/Tile shows the icon as a phone will.
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
  // The icon of the app: a new square image with its icons, or the saved one taken away.
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconInput, setIconInput] = useState<LogoInput | null>(null);
  const [isIconRemoved, setIconRemoved] = useState(false);
  const [iconError, setIconError] = useState<string>();
  const [wasSent, setSent] = useState(false);
  const megabytes = (bytes: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(bytes / 1000 / 1000);

  const iconMessage = (refused: AppIconProblem) => {
    switch (refused.problem) {
      case 'notSquare':
        return t('band.appearance.appIconErrors.notSquare', refused);
      case 'tooSmall':
        return t('band.appearance.appIconErrors.tooSmall', refused);
      case 'tooBig':
        return t('band.appearance.appIconErrors.tooBig', { size: megabytes(refused.bytes) });
      default:
        return t('band.appearance.appIconErrors.wrongType');
    }
  };

  // An image that is refused is not kept: the icon stays what it was.
  const chooseIcon = async (file: File | null) => {
    setIconError(undefined);
    if (file === null) {
      setIconFile(null);
      setIconInput(null);
      setIconRemoved(true);
      return;
    }
    const prepared = await prepareAppIcon(file).catch(
      (): AppIconProblem => ({ problem: 'wrongType' }),
    );
    if ('problem' in prepared) {
      setIconError(iconMessage(prepared));
      return;
    }
    setIconInput(prepared);
    setIconFile(file);
    setIconRemoved(false);
  };

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
      setLogoError(t('install.band.logo.tooBig', { size: megabytes(file.size) }));
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
        try {
          await api('/api/band/logo', { method: 'PUT', body: logoInput });
        } catch (error) {
          // The name and the colour are saved: only the logo is to choose again.
          if (error instanceof ApiError && error.status === 422) {
            setLogoError(t('band.appearance.logoRefused'));
            setLogoFile(null);
            setLogoInput(null);
          }
          throw error;
        }
      } else if (isLogoRemoved && band.logoUrl) {
        await api('/api/band/logo', { method: 'DELETE' });
      }
      if (iconInput) {
        try {
          await api('/api/band/appIcon', { method: 'PUT', body: iconInput });
        } catch (error) {
          if (error instanceof ApiError && error.status === 422) {
            setIconError(t('band.appearance.appIconRefused'));
            setIconFile(null);
            setIconInput(null);
          }
          throw error;
        }
      } else if (isIconRemoved && band.appIconUrl) {
        await api('/api/band/appIcon', { method: 'DELETE' });
      }
    },
    onSuccess: () => navigate('/band'),
    // Whatever happened, the band is asked again: a save can stop halfway.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['band'] }),
    onError: focusFirstFieldError,
  });

  const refused = save.error instanceof ApiError ? save.error.fields : {};
  const nameError =
    wasSent && (name.trim() === '' || refused.name) ? t('install.band.name.missing') : undefined;
  const isUnreachable = save.isError && !nameError && !logoError && !iconError;
  // What a phone will show: the new icon, else the icon of the band, else
  // the one made from the logo, as the form stands.
  const toPng = (encoded: string) => `data:image/png;base64,${encoded}`;
  const ownIcon = iconInput ? toPng(iconInput.icon512) : isIconRemoved ? null : band.appIconUrl;
  const logoIcon = logoInput
    ? toPng(logoInput.icon512)
    : isLogoRemoved
      ? null
      : band.appIconUrl
        ? // The icons of the band are those of its own icon: the logo stands in.
          band.logoUrl
        : (band.icons?.['512'] ?? null);

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
        <ImageField
          label={t('band.appearance.appIcon')}
          hint={t('band.appearance.appIconHint')}
          error={iconError}
          accept={APP_ICON_TYPES.join(',')}
          value={iconFile}
          current={isIconRemoved ? null : band.appIconUrl}
          onChange={chooseIcon}
        />
        <BandTile
          name={name.trim() || band.name}
          iconUrl={ownIcon ?? logoIcon}
          caption={t('band.appearance.appIconPreview')}
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
