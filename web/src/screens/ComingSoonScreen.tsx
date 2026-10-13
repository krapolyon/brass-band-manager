import { useTranslation } from 'react-i18next';
import { Message } from '../components/Message.tsx';
import type { NavKey } from '../components/nav.ts';
import { AppLayout } from './AppLayout.tsx';

type Props = { tab: Extract<NavKey, 'home' | 'songs'> };

// What the tabs of the features that do not exist yet show in the meantime:
// nothing is designed for them. Temporary, replaced as each feature arrives.
export function ComingSoonScreen({ tab }: Props) {
  const { t } = useTranslation();

  return (
    <AppLayout current={tab} title={t(`nav.${tab}`)}>
      <Message>{t(`comingSoon.${tab}`)}</Message>
    </AppLayout>
  );
}
