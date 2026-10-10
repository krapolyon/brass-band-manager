import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api.ts';

type Health = {
  database: 'ok' | 'unreachable';
};

// Placeholder for the home screen: it only proves that the front, the API and
// the database talk to each other. The real screen replaces it.
export function HomeScreen() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/api/health'),
    retry: false,
  });

  const state = health.isPending
    ? 'loading'
    : health.data?.database === 'ok'
      ? 'ready'
      : 'unreachable';

  return (
    <main>
      <h1>{t('app.name')}</h1>
      <p role="status" data-state={state}>
        {t(`shell.${state}`)}
      </p>
    </main>
  );
}
