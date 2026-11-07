// Turno service worker: the guide's day and group list keep working without
// signal (last version seen is shown), static files load from cache, and push
// notifications open the page they point to.
const VERSION = "turno-v1";
const OFFLINE_PAGES = ["/clock", "/clock/tour"];

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    // immutable assets: cache first
    e.respondWith(caches.open(VERSION).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (req.mode === "navigate" && OFFLINE_PAGES.some((p) => url.pathname === p)) {
    // the guide's pages: network first, last copy when offline
    e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(VERSION).then((c) => c.put(req, r.clone())); return r; })
      .catch(async () => (await caches.match(req)) || (await caches.match("/clock")) || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
  }
});

self.addEventListener("push", (e) => {
  let msg = { title: "Turno", body: "", url: "/" };
  try { msg = { ...msg, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(msg.title, { body: msg.body, icon: "/pwa-icon/192", badge: "/pwa-icon/192", data: { url: msg.url } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).pathname === url);
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
