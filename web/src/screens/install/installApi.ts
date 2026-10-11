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
      library: {
        sections: { name: string; instruments: { name: string; preselected: boolean }[] }[];
      };
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

// What POST /api/install receives (api/src/Install/InstallInput.php).
export type InstallInput = {
  installKey: string;
  language: string;
  bandName: string;
  /** In the order they will be listed. */
  sections: { name: string; instruments: string[] }[];
  admin: {
    email: string;
    password: string;
    lastName: string;
    firstName: string;
    nickname: string;
    /** The name of one of the instruments sent in the sections. */
    instrument: string;
  };
  /** Left out when the band gives no logo. */
  logo?: LogoInput;
};

// What the API receives for a logo (api/src/Band/LogoInput.php): the content
// of the file and of its three icons, in base64. Made by prepareLogo().
export type LogoInput = { image: string; icon180: string; icon192: string; icon512: string };

/** Installs the app. The device is then signed in as the first member. */
export function install(input: InstallInput) {
  return api('/api/install', { method: 'POST', body: input });
}
