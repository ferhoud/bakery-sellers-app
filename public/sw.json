/* Service Worker basique pour cache offline (après 1re visite) */
const CACHE_NAME = "bakery-app-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

// Activer immédiatement le SW
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

// Stratégie :
// - Navigations (HTML) : réseau d'abord, sinon index.html du cache (offline)
// - Autres requêtes : cache d'abord, sinon réseau (et on met en cache au passage)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cached = await caches.match("/index.html");
          return cached || new Response("Hors-ligne et pas encore en cache.", { status: 503 });
        }
      })()
    );
    return;
  }

  // Static/assets
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
