// The service worker exists so the browser will offer to install the app, and so that a page
// asked for while the server cannot be reached still shows something useful. It caches one file.
//
// Chromium requires a registered service worker with a fetch handler before it fires
// `beforeinstallprompt`; without one the manifest and icons are not enough, which is measurable
// — every other installability criterion passed and the event still never arrived.
//
// It caches nothing of the app. A caching worker on a self-hosted app is a liability: it serves
// the previous build's assets after an upgrade, from a layer the user cannot see and the
// operator did not know they deployed. Every request goes to the network exactly as it would
// with no worker at all. The one exception is public/offline.html, which stands on its own (no
// app scripts or styles) and is served only when a page could not be fetched at all — the server
// is down, or the tailnet is — so that a meeting can still be recorded in the browser and sent
// once the server is back (lib/local-recordings.ts).
const OFFLINE_CACHE = "voxinq-offline-v1";
const OFFLINE_URL = "/offline.html";

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

self.addEventListener("install", (event) => {
  // Take over immediately rather than waiting for every tab to close: the only cached file is
  // fetched afresh by each version, so there is nothing for a new one to conflict with.
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      // Fetched past the HTTP cache, so an upgrade's page replaces the previous one. A failure
      // leaves the worker without it rather than not installing at all.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" })).catch(() => {});
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clear anything a previous version of this file may have cached, so a worker that once
      // stored responses cannot keep serving them.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== OFFLINE_CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

// Only page loads are looked at, and only when the app gave no answer: the network failed, or a
// proxy in front of it (tailscale serve, a reverse proxy) said it could not reach the app. Any
// answer from the app itself — an error page, a login redirect — is shown as it is.
const GATEWAY_ERRORS = new Set([502, 503, 504]);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(
    (async () => {
      const offline = async (res) => (await caches.match(OFFLINE_URL)) ?? res ?? Response.error();
      try {
        const res = await fetch(req);
        return GATEWAY_ERRORS.has(res.status) ? offline(res) : res;
      } catch {
        return offline(null);
      }
    })(),
  );
});
