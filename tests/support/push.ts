import { execFileSync } from 'node:child_process';
import type { APIRequestContext } from '@playwright/test';

// Push notifications on the test server: it writes each one to a file
// instead of sending it (docker-compose.yml, BRASS_BAND_PUSH_LOG). Nothing
// ever leaves for a push service, and the devices here are made up.

const LOG = '/var/www/storage/pushLog.jsonl';
const onServer = (script: string) =>
  execFileSync('docker', ['compose', 'exec', '-T', 'web-test', 'sh', '-c', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

export type SentPush = {
  endpoint: string;
  payload: {
    title: string;
    body: string;
    tag?: string;
    url?: string;
    actions?: { action: string; title: string }[];
    data?: Record<string, unknown>;
  };
  options: { TTL: number; urgency: string; topic?: string };
};

export function emptyPushes(): void {
  onServer(`rm -f ${LOG}`);
}

/** Every notification the server wrote since the last emptyPushes(), in order. */
export function sentPushes(): SentPush[] {
  return onServer(`cat ${LOG} 2>/dev/null || true`)
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SentPush);
}

/** The address of a made-up device, at a push service the server knows. */
export const endpointOf = (device: string) => `https://fcm.googleapis.com/fcm/send/${device}`;

/** A signed-in device accepts notifications. `device` names it in what is sent. */
export function subscribe(context: APIRequestContext, device: string) {
  return context.put('/api/push/subscription', {
    data: {
      endpoint: endpointOf(device),
      p256dhKey:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      authKey: 'tBHItJI5svbpez7KI4CCXg',
    },
  });
}

/** Runs the hourly task of the automatic reminders, as if it were a given moment. */
export function runReminders(now: string): string {
  return onServer(`php /var/www/api/tasks/gigReminders.php --now="${now}"`);
}
