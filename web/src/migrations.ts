import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';
import { useMe } from './session.ts';

// What POST /api/migrations answers (api/src/Migrations/RunMigrationsAction.php).
export type MigrationsResult = {
  /** The scripts that were applied, in order. */
  applied: string[];
  /** The script that failed and what MySQL said; null when none did. */
  failed: { name: string; message: string } | null;
  /** What still waits afterwards. */
  pending: string[];
};

/** Whether the signed-in member may apply the migrations. Null while it is not known. */
export function useCanRunMigrations(): boolean | null {
  const me = useMe().data;
  return me ? me.permissions.includes('runMigrations') : null;
}

/** The migrations that wait to be applied. Asked only for who may apply them. */
export function usePendingMigrations() {
  const canRun = useCanRunMigrations();

  return useQuery({
    queryKey: ['migrations'],
    queryFn: async () => (await api<{ pending: string[] }>('/api/migrations')).pending,
    enabled: canRun === true,
  });
}
