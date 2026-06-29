/**
 * Kettlebells service worker — cache-first with runtime caching.
 *
 * Strategy:
 *  - On install: precache the app shell (root page, manifest, sw itself).
 *  - On fetch: cache-first for same-origin GET requests, so Vite-hashed
 *    JS/CSS get cached on first load and served offline thereafter.
 *  - Navigation requests always fall back to cached index.html for SPA routing.
 *  - On activate: delete caches with old version names.
 *  - skipWaiting() + clients.claim() so updates activate on next reload.
 */

const CACHE_VERSION = "kb-v1";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  /** @type {ExtendableEvent} */
  const e = /** @type {any} */ (event);
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  /** @type {ServiceWorkerGlobalScope} */ (/** @type {any} */ (self)).skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  /** @type {ExtendableEvent} */
  const e = /** @type {any} */ (event);
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  /** @type {ServiceWorkerGlobalScope} */ (/** @type {any} */ (self)).clients.claim();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  /** @type {FetchEvent} */
  const e = /** @type {any} */ (event);
  const { request } = e;

  // Only handle same-origin GET requests
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(cacheFirst(request));
});

/**
 * Cache-first strategy.
 * On miss: fetch from network, cache the response, return it.
 * For navigation (HTML) requests on network failure: serve cached index.html.
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Only cache successful responses with a body we can clone
    if (response.ok && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failure — for navigation requests fall back to index.html
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503 });
  }
}
