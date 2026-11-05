/*
 * Myna service worker. Push notifications only: no fetch handler and no
 * caching, so a deploy is never hidden behind a stale copy of the app.
 *
 * Payload (encrypted by lib/push.ts):
 *   { kind, title, body, url, tag?, sentAt }
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Myna";
  const options = {
    body: data.body || "Something needs you.",
    tag: data.tag || undefined,
    // A replaced notification (same tag) should still buzz: it is new news.
    renotify: Boolean(data.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    timestamp: data.sentAt || Date.now(),
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/m", kind: data.kind },
  };

  const work = [self.registration.showNotification(title, options)];
  // Home-screen icon dot for things that are waiting on the owner (iOS 16.4+, Android).
  if ((data.kind === "order" || data.kind === "handoff") && self.navigator.setAppBadge) {
    work.push(self.navigator.setAppBadge().catch(() => {}));
  }
  event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/m", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const sameOrigin = windows.filter((c) => new URL(c.url).origin === self.location.origin);
      const existing = sameOrigin.find((c) => c.url === target) || sameOrigin[0];
      if (existing) {
        await existing.focus();
        if (existing.url !== target) {
          // navigate() only works on clients this worker controls; fall back to a message.
          if ("navigate" in existing) {
            try {
              await existing.navigate(target);
              return;
            } catch {}
          }
          existing.postMessage({ type: "myna:navigate", url: target });
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
