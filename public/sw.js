// Service Worker: installability and an offline notice. Do not cache HTML or /api:
// the HTML embeds the signed-in user's state and is served with no-store.
const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const STATIC = "static";
const STATIC_LIMIT = 80;
const SHELL_FILES = ["/offline", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT))) await cache.delete(k);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page loads: always the network; when offline, the offline notice.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }

  // Files the offline notice uses: the network first, the cache when offline.
  if (SHELL_FILES.includes(url.pathname)) {
    event.respondWith(fetch(req).catch(() => caches.match(url.pathname)));
    return;
  }

  // Hashed build output never changes, so serve it from the cache first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          void trim(cache);
        }
        return res;
      }),
    );
  }
});
