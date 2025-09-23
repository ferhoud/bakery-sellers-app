/* Service Worker v4 – network-first pour éviter l’UI obsolète */
const CACHE_NAME = "bakery-app-v4";
const APP_SHELL = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

// Installer: précache minimal + activation immédiate
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});

// Activer: purge anciens caches + contrôler tout de suite
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

// Support "skip waiting" déclenché depuis la page
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Requêtes:
// - Navigations (HTML): réseau d'abord, fallback cache si hors-ligne
// - Assets: cache d'abord, sinon réseau (et on met en cache)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Pages (navigate) -> toujours chercher la version fraîche
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cached = await caches.match("/index.html");
        return cached || new Response("Hors-ligne et pas encore en cache.", { status: 503 });
      }
    })());
    return;
  }

  // Assets → cache d'abord
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      const copy = res.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, copy);
      return res;
    } catch {
      return new Response("Ressource non disponible hors-ligne.", { status: 504 });
    }
  })());
});
