import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { useInstallStatus } from './install/installApi.ts';

// Placeholder for the home screen, which is not designed yet. It does one real
// thing: an instance that has never been installed sends its visitor to the
// install.
export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const status = useInstallStatus(i18n.language);

  if (status.data?.installed === false) {
    return <Navigate to="/install" replace />;
  }

  const state = status.isPending ? 'loading' : status.isError ? 'unreachable' : 'ready';

  return (
    <main>
      <h1 className="textTitle">{t('app.name')}</h1>
      <p role="status" data-state={state}>
        {t(`shell.${state}`)}
      </p>
    </main>
  );
}
