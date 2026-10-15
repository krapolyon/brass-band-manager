import { useTranslation } from 'react-i18next';
import { AccessibilityOptions } from '../../components/AccessibilityOptions.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { setDeviceTextSize, useDeviceTextSize } from '../../deviceAccessibility.ts';
import { AppLayout } from '../AppLayout.tsx';
import { useSavePreferences } from './preferences.ts';

// Figma: Members / Settings — accessibility. The six options, seen by the
// member only and applied at once: the text size on this device (its slider
// says so), the five others on the account, the same on every device.
export function AccessibilityScreen() {
  const { t } = useTranslation();
  const save = useSavePreferences();
  const { me } = save;
  const textSize = useDeviceTextSize();

  if (!me) return null;

  return (
    <AppLayout
      current="settings"
      back="/settings"
      backLabel={t('nav.settings')}
      width="form"
      title={t('accessibility.title')}
      subtitle={t('settings.accessibility.lead')}
    >
      {save.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
      <Sheet>
        <AccessibilityOptions
          value={{ ...me, textSizePercent: textSize }}
          onChange={({ textSizePercent, ...account }) => {
            if (textSizePercent !== textSize) setDeviceTextSize(textSizePercent);
            else save.mutate(account);
          }}
        />
      </Sheet>
    </AppLayout>
  );
}
