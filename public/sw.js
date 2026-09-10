// The service worker exists so the browser will offer to install the app. It caches nothing.
//
// Chromium requires a registered service worker with a fetch handler before it fires
// `beforeinstallprompt`; without one the manifest and icons are not enough, which is measurable
// — every other installability criterion passed and the event still never arrived.
//
// The fetch handler deliberately does nothing. A caching worker on a self-hosted app is a
// liability: it serves the previous build's assets after an upgrade, from a layer the user
// cannot see and the operator did not know they deployed. Voxinq is reached over a LAN or a
// tailnet from a machine that is either up or not, so there is no offline case worth paying
// for that with.

// A notification for a meeting whose time has come. Clicking it should land on the thing it
// is about — the recording screen, or the meeting itself from outside the private network —
// and reuse a window that is already open rather than stacking another one up.
//
// The URL travels in `data.url` rather than being rebuilt here: the page knows whether this
// browser can record, and this file must not have to know it twice.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (!url) return;
  event.waitUntil(
    (async () => {
      const target = new URL(url, self.location.origin).href;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        // Same app, already open: take it there instead of opening a second copy.
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close: there is no cached state
  // for a new version to conflict with.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clear anything a previous version of this file may have cached, so a worker that once
      // stored responses cannot keep serving them.
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

// Present, and intentionally empty: registering a handler is the requirement, intercepting is
// not. Every request goes to the network exactly as it would with no worker at all.
self.addEventListener("fetch", () => {});
