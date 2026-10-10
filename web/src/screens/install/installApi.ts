import { useQuery } from '@tanstack/react-query';
import { api } from '../../api.ts';

// What GET /api/install answers (api/src/Install/InstallStatusAction.php).
export type InstallStatus =
  | { installed: true }
  | {
      installed: false;
      /** The languages the install can be done in. */
      languages: string[];
      /** The starting library of sections and instruments, in the language asked. */
      library: { sections: { name: string; preselected: boolean; instruments: string[] }[] };
    };

export function useInstallStatus(language: string) {
  return useQuery({
    queryKey: ['install', language],
    queryFn: () => api<InstallStatus>(`/api/install?language=${encodeURIComponent(language)}`),
  });
}

export function checkInstallKey(installKey: string) {
  return api<{ valid: true }>('/api/install/key', { method: 'POST', body: { installKey } });
}
