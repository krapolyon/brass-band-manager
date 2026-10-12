import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useBand } from '../../band.ts';
import { Message } from '../../components/Message.tsx';
import { SegmentedControl } from '../../components/SegmentedControl.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { ThemeSwatch } from '../../components/ThemeSwatch.tsx';
import { accentThemes } from '../../themes.ts';
import { AppLayout } from '../AppLayout.tsx';
import { useSavePreferences } from './preferences.ts';
import './settings.css';

// Figma: Members / Settings — appearance. Light or dark, and the accent
// colour: the one of the band, which the member follows by default, or one
// of their own. Both apply at once.
export function AppearanceScreen() {
  const { t } = useTranslation();
  const band = useBand().data;
  const save = useSavePreferences();
  const { me } = save;
  const swatches = useId();

  if (!me) return null;

  return (
    <AppLayout
      current="settings"
      back="/settings"
      backLabel={t('nav.settings')}
      width="form"
      title={t('settings.appearance.title')}
      subtitle={t('settings.appearance.lead')}
    >
      {save.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
      <Sheet title={t('settings.appearance.schemeTitle')}>
        <SegmentedControl
          label={t('settings.appearance.schemeTitle')}
          value={me.colorScheme}
          onChange={(colorScheme) => save.mutate({ colorScheme })}
          options={(['AUTO', 'LIGHT', 'DARK'] as const).map((value) => ({
            value,
            label: t(`settings.appearance.scheme.${value}`),
          }))}
        />
        <p className="settings-note textCaption">{t('settings.appearance.schemeNote')}</p>
      </Sheet>
      <Sheet title={t('settings.appearance.accentTitle')}>
        <div
          className="settings-swatches"
          role="radiogroup"
          aria-label={t('settings.appearance.accentTitle')}
        >
          <ThemeSwatch
            kind="band"
            theme={band?.defaultAccentTheme ?? accentThemes[0]}
            label={t('settings.appearance.band')}
            name={swatches}
            checked={me.accentTheme === null}
            onChange={() => save.mutate({ accentTheme: null })}
          />
          {accentThemes.map((theme) => (
            <ThemeSwatch
              key={theme}
              theme={theme}
              label={t(`theme.${theme}`)}
              name={swatches}
              checked={me.accentTheme === theme}
              onChange={() => save.mutate({ accentTheme: theme })}
            />
          ))}
        </div>
        <p className="settings-note textCaption">{t('settings.appearance.accentNote')}</p>
      </Sheet>
    </AppLayout>
  );
}
