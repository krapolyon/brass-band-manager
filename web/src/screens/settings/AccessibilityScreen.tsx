import { useTranslation } from 'react-i18next';
import { AccessibilityOptions } from '../../components/AccessibilityOptions.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { AppLayout } from '../AppLayout.tsx';
import { useSavePreferences } from './preferences.ts';

// Figma: Members / Settings — accessibility. The six options of the account:
// seen by the member only, applied at once, the same on every device.
export function AccessibilityScreen() {
  const { t } = useTranslation();
  const save = useSavePreferences();
  const { me } = save;

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
        <AccessibilityOptions value={me} onChange={(options) => save.mutate(options)} />
      </Sheet>
    </AppLayout>
  );
}
