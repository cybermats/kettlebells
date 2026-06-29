/**
 * Kettlebells service worker.
 *
 * Strategy (two-tier):
 *
 *  Navigation requests (mode === "navigate", i.e. HTML page loads):
 *    → Network-first: attempt a live fetch so returning visitors get a fresh
 *      index.html on every online visit. Cache the response on success.
 *      Fall back to the cached index.html when offline.
 *    This prevents returning visitors from being stuck on a stale build when
 *      the service-worker CACHE_VERSION has not changed.
 *
 *  Static assets (JS/CSS/images — Vite content-hashed, immutable URLs):
 *    → Cache-first: serve from cache on hit; fetch, cache, and serve on miss.
 *      These are safe to cache indefinitely because their URLs change when
 *      content changes.
 *
 *  After the first online load the app is fully cached and works offline for
 *  both navigations (via the cached index.html fallback) and assets (via
 *  cache-first hits).
 *
 *  On activate: delete all caches from previous versions so stale assets
 *  don't accumulate on disk.
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

  if (request.mode === "navigate") {
    // Navigation (HTML) → network-first so stale builds don't get stuck
    e.respondWith(networkFirstNav(request));
  } else {
    // Static assets (Vite content-hashed, immutable) → cache-first
    e.respondWith(cacheFirst(request));
  }
});

// ─── Strategy implementations ─────────────────────────────────────────────────

/**
 * Network-first for navigation requests.
 * Fetches a fresh copy when online and caches it; falls back to cached
 * index.html when offline so the app still loads after the first visit.
 */
async function networkFirstNav(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — serve the cached app shell
    const cached = await cache.match(request) ?? await cache.match("./index.html");
    if (cached) return cached;
    return new Response("Offline", { status: 503 });
  }
}

/**
 * Cache-first for static assets (content-hashed URLs).
 * On miss: fetch from network, cache the response, return it.
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
