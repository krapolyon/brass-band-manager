import { useTranslation } from 'react-i18next';

// Placeholder for the home screen, which is not designed yet.
export function HomeScreen() {
  const { t } = useTranslation();

  return (
    <main>
      <h1 className="textTitle">{t('app.name')}</h1>
      <p role="status" data-state="ready">
        {t('shell.ready')}
      </p>
    </main>
  );
}
