import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';

// Push notifications on this device (model/members.md, `pushSubscription`):
// what the browser can do, what the server knows, and turning them on or off.
// They are set device by device: a device is a session.

/** What GET /api/push answers. `publicKey` is null on an instance that sends no notification. */
export type PushState = { publicKey: string | null; isSubscribed: boolean };

const QUERY_KEY = ['push'];
// Remembers that this device was asked, so that the app asks once. A comfort
// kept in the browser: nothing personal, and losing it only asks again.
const ASKED = 'pushAsked';

/**
 * What this browser can do:
 * - "ready": it can be asked, or is already allowed;
 * - "denied": notifications are blocked for the app in the settings of the device;
 * - "needsInstall": an iPhone or iPad, where notifications only reach the app on the home screen;
 * - "unsupported": no notification here.
 */
export function pushSupport(): 'ready' | 'denied' | 'needsInstall' | 'unsupported' {
  const hasPush =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasPush) {
    const isApple =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    return isApple && !isInstalled ? 'needsInstall' : 'unsupported';
  }
  return Notification.permission === 'denied' ? 'denied' : 'ready';
}

export function usePush() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: () => api<PushState>('/api/push') });
}

export const wasAsked = () => {
  try {
    return localStorage.getItem(ASKED) !== null;
  } catch {
    return true;
  }
};
export const rememberAsked = () => {
  try {
    localStorage.setItem(ASKED, '1');
  } catch {
    // A browser that keeps nothing asks again the next time.
  }
};
/** Signing out: the next member of this device is asked in their turn. */
export const forgetAsked = () => {
  try {
    localStorage.removeItem(ASKED);
  } catch {
    // Nothing was kept.
  }
};

const bytes = (key: string) =>
  Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (character) =>
    character.charCodeAt(0),
  );

/** Turning notifications on and off for this device. Both answer what the server then knows. */
export function usePushSwitch() {
  const queryClient = useQueryClient();
  const keep = (state: PushState) => {
    queryClient.setQueryData(QUERY_KEY, state);
    return state;
  };

  return {
    /** Asks the device, then tells the server. False when the member, or the device, said no. */
    enable: async (publicKey: string): Promise<boolean> => {
      rememberAsked();
      if ((await Notification.requestPermission()) !== 'granted') return false;
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes(publicKey),
        }));
      const given = subscription.toJSON();
      keep(
        await api<PushState>('/api/push/subscription', {
          method: 'PUT',
          body: {
            endpoint: given.endpoint,
            p256dhKey: given.keys?.p256dh,
            authKey: given.keys?.auth,
          },
        }),
      );
      return true;
    },
    disable: async (): Promise<void> => {
      rememberAsked();
      // The server first: once it has forgotten the device, nothing is sent to it.
      keep(await api<PushState>('/api/push/subscription', { method: 'DELETE' }));
      const registration = await navigator.serviceWorker?.getRegistration('/sw.js');
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
    },
  };
}

/**
 * What the member wants to be told of, on every device that receives
 * (model/members.md, "Notification settings"). A setting of the account, not
 * of this device. EMAIL will join the values later.
 */
export type NotificationSettings = {
  notifyGigPlayable: 'OFF' | 'PUSH';
  notifyGigConfirmed: 'OFF' | 'PUSH';
  notifyLiveSetlist: 'OFF' | 'PUSH';
  notifySongNew: 'OFF' | 'PUSH';
  notifySongScore: 'OFF' | 'PUSH';
  notifySongPart: 'OFF' | 'PUSH';
};

const SETTINGS_KEY = ['notificationSettings'];

export function useNotificationSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api<NotificationSettings>('/api/me/notifications'),
  });
}

/**
 * Changes one setting at once: shown in the same instant, then saved with the
 * five others, and put back if the server refuses.
 */
export function useSaveNotificationSettings() {
  const queryClient = useQueryClient();
  return async (changes: Partial<NotificationSettings>): Promise<boolean> => {
    const before = queryClient.getQueryData<NotificationSettings>(SETTINGS_KEY);
    if (!before) return false;
    const wanted = { ...before, ...changes };
    queryClient.setQueryData(SETTINGS_KEY, wanted);
    try {
      queryClient.setQueryData(
        SETTINGS_KEY,
        await api<NotificationSettings>('/api/me/notifications', { method: 'PUT', body: wanted }),
      );
      return true;
    } catch {
      queryClient.setQueryData(SETTINGS_KEY, before);
      return false;
    }
  };
}
