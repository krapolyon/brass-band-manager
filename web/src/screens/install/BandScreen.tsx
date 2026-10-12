import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { ImageField } from '../../components/ImageField.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { TextField } from '../../components/TextField.tsx';
import { FlowLayout, focusFirstError } from '../FlowLayout.tsx';
import { useInstallDraft } from './InstallDraft.tsx';
import { prepareLogo } from './logo.ts';
import { StepNav } from './StepNav.tsx';

// The rules of model/band.md for the logo.
const LOGO_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1000 * 1000;
const NAME_MAX_LENGTH = 80;

// Figma: Install / Band, and its states: empty, filled, errors, long name.
export function BandScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { draft, update } = useInstallDraft();
  const [wasSent, setSent] = useState(false);
  const [logoError, setLogoError] = useState<string>();

  if (draft.installKey === '') {
    return <Navigate to="/install" replace />;
  }

  const isNameMissing = draft.bandName.trim() === '';
  const nameError = wasSent && isNameMissing ? t('install.band.name.missing') : undefined;

  // A file that is refused is not kept: the logo stays what it was.
  const chooseLogo = async (file: File | null) => {
    // Some systems give no type to an SVG file: its name then says what it is.
    const type = file?.type || (file?.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '');
    if (file && !LOGO_TYPES.includes(type)) {
      setLogoError(t('install.band.logo.wrongType'));
    } else if (file && file.size > LOGO_MAX_BYTES) {
      const megabytes = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(
        file.size / 1000 / 1000,
      );
      setLogoError(t('install.band.logo.tooBig', { size: megabytes }));
    } else {
      try {
        // Drawn into its icons at once: a file the browser cannot read is refused here.
        const logoInput = file ? await prepareLogo(file) : null;
        setLogoError(undefined);
        update({ logo: file, logoInput });
      } catch {
        setLogoError(t('install.band.logo.wrongType'));
      }
    }
  };

  const next = () => {
    setSent(true);
    if (isNameMissing) {
      focusFirstError();
    } else {
      navigate('/install/sections');
    }
  };

  return (
    <FlowLayout
      nav={<StepNav step={1} back="/install" />}
      title={t('install.band.title')}
      lead={t('install.band.lead')}
      onSubmit={next}
      actions={
        <BottomBar>
          <Button type="submit">{t('install.continue')}</Button>
        </BottomBar>
      }
    >
      {nameError && (
        <Message kind="danger">{t('install.errors.beforeContinuing', { count: 1 })}</Message>
      )}
      <Sheet>
        <TextField
          label={t('install.band.name.label')}
          hint={t('install.band.name.hint')}
          error={nameError}
          name="bandName"
          autoComplete="organization"
          maxLength={NAME_MAX_LENGTH}
          value={draft.bandName}
          onChange={(event) => update({ bandName: event.target.value })}
        />
        <ImageField
          label={t('install.band.logo.label')}
          hint={t('install.band.logo.hint')}
          error={logoError}
          accept={LOGO_TYPES.join(',')}
          value={draft.logo}
          onChange={chooseLogo}
        />
      </Sheet>
    </FlowLayout>
  );
}
