import type { Page } from '@playwright/test';

// The browser of the tests is given a push service of its own: nothing is
// asked of Google or Apple, and the server records instead of sending.
export async function fakePush(
  page: Page,
  permission: 'default' | 'granted' | 'denied' = 'default',
) {
  await page.addInitScript((start) => {
    let state = start;
    const subscription = {
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-browser',
        keys: {
          p256dh:
            'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
          auth: 'tBHItJI5svbpez7KI4CCXg',
        },
      }),
      unsubscribe: async () => true,
    };
    let current: typeof subscription | null = null;
    const registration = {
      pushManager: {
        getSubscription: async () => current,
        subscribe: async () => {
          current = subscription;
          return subscription;
        },
      },
    };
    Object.defineProperty(window, 'Notification', {
      value: {
        get permission() {
          return state;
        },
        requestPermission: async () => {
          if (state === 'default') state = 'granted';
          return state;
        },
      },
    });
    Object.defineProperty(window, 'PushManager', { value: class {} });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: async () => registration,
        getRegistration: async () => registration,
        ready: Promise.resolve(registration),
      },
    });
  }, permission);
}
