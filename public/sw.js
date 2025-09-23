/* Service Worker v3 – cache simple, index.html toujours frais en ligne */
const CACHE_NAME = "bakery-app-v3";
const APP_SHELL = ["/manifest.webmanifest"];

// Install: précache minimum
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

// Activate: nettoie anciens caches et prend le contrôle
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

// Fetch:
// - Navigations (HTML): réseau d'abord, fallback index du cache si hors-ligne
// - Autres: cache d'abord, sinon réseau (et on met en cache)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req); // toujours la version fraîche quand on est en ligne
        } catch {
          const cached = await caches.match("/index.html");
          return cached || new Response("Hors-ligne et pas encore en cache.", { status: 503 });
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
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
    })()
  );
});
