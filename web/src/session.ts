import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api.ts';
import type { Appearance } from './appearance.ts';

// Who is signed in on this device: what GET /api/me answers
// (api/src/Access/Profile.php). The session itself is a cookie the page
// cannot read; this is how the front knows there is one.
export type Me = Omit<Appearance, 'textSizePercent'> & {
  id: number;
  nickname: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string | null;
  streetAddress: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string | null;
  addressInstructions: string | null;
  photoUrl: string | null;
  instrumentId: number;
  status: 'ACTIVE' | 'POWER_MEMBER';
  language: string;
  roles: string[];
  /** What the member may do: the keys of api/src/Access/Permission.php. */
  permissions: string[];
};

// Where a member lands once signed in: the home screen.
export const HOME = '/';

/** The signed-in member; null when nobody is signed in on this device. */
export function useMe() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api<Me>('/api/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          // The session ended elsewhere (a departure, "sign out everywhere",
          // too many wrong passwords): what the member saw leaves the memory
          // of the page. The band stays: it is public.
          // Only when someone was signed in: a visitor has nothing to
          // forget, and the screens before sign-in are asking things too.
          if (queryClient.getQueryData(['me'])) {
            queryClient.removeQueries({
              predicate: (query) => query.queryKey[0] !== 'me' && query.queryKey[0] !== 'band',
            });
          }
          return null;
        }
        throw error;
      }
    },
    // Asked again when the app comes back to the foreground: a session ended
    // elsewhere (a departure, "sign out everywhere") is noticed then.
    staleTime: 60_000,
  });
}

/** Records who is signed in after a sign-in, a password link or a change of the member's own record. */
export function useSetMe() {
  const queryClient = useQueryClient();

  return (me: Me | null) => {
    if (me === null) {
      // Nothing a member saw stays in the memory of the page after they sign
      // out. The answer to "who is signed in" is kept, emptied below: what
      // follows it (the look of the app, the guards) then learns that nobody
      // is. Removed with the rest, it would never hear of it.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    }
    queryClient.setQueryData(['me'], me);
  };
}
