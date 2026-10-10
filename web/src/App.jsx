import { useEffect, useState } from 'react';
import { t } from './i18n.js';

// Shell of the app: it only proves that the front, the API and the database
// talk to each other. The real screens replace it feature by feature.
export function App() {
  const [state, setState] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/health')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((health) => {
        if (!cancelled) setState(health.database === 'ok' ? 'ready' : 'unreachable');
      })
      .catch(() => {
        if (!cancelled) setState('unreachable');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>{t('app.name')}</h1>
      <p role="status" data-state={state}>
        {t(`shell.${state}`)}
      </p>
    </main>
  );
}
