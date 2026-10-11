import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api.ts';
import type { Appearance } from './appearance.ts';

// Who is signed in on this device: what GET /api/me answers
// (api/src/Access/Profile.php). The session itself is a cookie the page
// cannot read; this is how the front knows there is one.
export type Me = Appearance & {
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

// Where a member lands once signed in. The home screen is not designed yet:
// until it is, the directory is the first thing worth seeing.
export const HOME = '/members';

/** The signed-in member; null when nobody is signed in on this device. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api<Me>('/api/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
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
      // Nothing a member saw stays in the memory of the page after they sign out.
      queryClient.clear();
    }
    queryClient.setQueryData(['me'], me);
  };
}
