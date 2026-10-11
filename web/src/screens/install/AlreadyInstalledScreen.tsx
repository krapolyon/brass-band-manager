import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { InstallLayout } from './InstallLayout.tsx';

// Figma: Install / Already installed. The install address opened on an
// instance that someone has already installed.
export function AlreadyInstalledScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <InstallLayout
      title={t('install.alreadyInstalled.title')}
      lead={t('install.alreadyInstalled.lead')}
      actions={
        <BottomBar>
          {/* The sign-in screen is not designed yet: for now this leads to the home address. */}
          <Button onClick={() => navigate('/')}>{t('install.alreadyInstalled.signIn')}</Button>
        </BottomBar>
      }
    >
      <Message>{t('install.alreadyInstalled.note')}</Message>
    </InstallLayout>
  );
}
