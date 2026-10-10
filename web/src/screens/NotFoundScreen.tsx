import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

// Shown for an address that matches no screen.
export function NotFoundScreen() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t('notFound.title')}</h1>
      <Link to="/">{t('notFound.backHome')}</Link>
    </main>
  );
}
