// The service worker of the app. It does one thing: show the push
// notifications the server sends (the live setlist, the reminders of gigs)
// and open the app where they point. It keeps nothing and caches nothing.
// The texts are written by the server, in the language of the member
// (api/resources/push.<language>.json).

// The icon of the installed app: the logo of the band, or the neutral icon.
const icon = () =>
  fetch('/api/manifest')
    .then((response) => response.json())
    .then((manifest) => manifest.icons?.[0]?.src)
    .catch(() => undefined);

self.addEventListener('push', (event) => {
  let sent = {};
  try {
    sent = event.data ? event.data.json() : {};
  } catch {
    // A notification that cannot be read is still shown: a browser ends the
    // subscription of an app that receives one and shows nothing.
  }
  event.waitUntil(
    icon().then((src) =>
      self.registration.showNotification(sent.title ?? '', {
        body: sent.body ?? '',
        icon: src,
        // On Android a notification replaces the one that has its tag, without
        // a new vibration. An iPhone ignores this: there they pile up.
        tag: sent.tag,
        renotify: sent.tag ? (sent.renotify ?? false) : undefined,
        requireInteraction: sent.requireInteraction ?? false,
        actions: sent.actions ?? [],
        data: { url: sent.url ?? '/', ...(sent.data ?? {}) },
      }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data ?? {};

  // "Suivant", shown to who manages setlists: the setlist moves on by one
  // song, as from the live screen. The server checks the right again.
  if (event.action === 'next' && data.setlistId) {
    event.waitUntil(
      fetch(`/api/setlists/${data.setlistId}/live`, {
        method: 'PUT',
        credentials: 'same-origin',
        // Pressed in the notification itself: this device is told the next
        // song like the others, or its notification would stay on the old one.
        headers: { 'Content-Type': 'application/json', 'X-From-Notification': '1' },
        body: JSON.stringify({ position: data.position + 1 }),
      }).catch(() => {}),
    );
    return;
  }

  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      if (!open) return self.clients.openWindow(data.url);
      return open.focus().then((focused) => focused.navigate(data.url));
    }),
  );
});
