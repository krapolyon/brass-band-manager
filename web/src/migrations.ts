import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from './api.ts';
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

/**
 * True when the API answered "databaseBehind": a new version is on the host
 * and the database has not followed it yet, so the app cannot even say who is
 * signed in (api/src/Migrations/DatabaseBehind.php).
 */
export function isDatabaseBehind(error: unknown): boolean {
  return error instanceof ApiError && error.error === 'databaseBehind';
}

/** The migrations that wait to be applied. Asked only for who may apply them. */
export function usePendingMigrations() {
  const me = useMe();
  // While the database is behind, who is signed in is not known: the API
  // says whether this member may see them (403 otherwise).
  const mayAsk =
    me.data?.permissions.includes('runMigrations') === true || isDatabaseBehind(me.error);

  return useQuery({
    queryKey: ['migrations'],
    queryFn: async () => (await api<{ pending: string[] }>('/api/migrations')).pending,
    enabled: mayAsk,
    retry: false,
  });
}

/** Whether the signed-in member may apply the migrations. Null while it is not known. */
export function useCanRunMigrations(): boolean | null {
  const me = useMe();
  const pending = usePendingMigrations();

  if (me.data) return me.data.permissions.includes('runMigrations');
  // Not signed in, and not behind: nothing to ask.
  if (me.isSuccess) return null;
  // Without who is signed in (the database is behind, or it is asked again
  // after the migrations): the API answered the list only to who may see it.
  if (pending.isSuccess) return true;
  if (pending.error instanceof ApiError && [401, 403].includes(pending.error.status)) return false;
  if (pending.isError && isDatabaseBehind(me.error)) return true;
  return null;
}
