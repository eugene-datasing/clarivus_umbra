/**
 * Veil Service Worker
 *
 * Provides offline capability by caching the application shell and static assets.
 * Uses cache-first for static assets and network-first for dynamic content/API calls.
 */

const CACHE_VERSION = "veil-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

/**
 * App shell resources to pre-cache on install.
 */
const APP_SHELL = [
  "/",
  "/offline.html",
];

/**
 * Install event: pre-cache the app shell.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/**
 * Activate event: clean up old caches from previous versions.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Fetch event: route requests through appropriate caching strategies.
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Skip non-http(s) requests
  if (!url.protocol.startsWith("http")) return;

  // Strategy 1: Cache-first for static assets (_next/static/*, images, fonts)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Strategy 2: Network-first for API calls
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Strategy 3: Network-first for HTML pages (dynamic content)
  if (
    request.headers.get("accept")?.includes("text/html") ||
    url.pathname.startsWith("/_next/data/")
  ) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Default: network-first for everything else
  event.respondWith(networkFirst(request));
});

/**
 * Cache-first strategy: serve from cache, fall back to network.
 * Used for static assets that rarely change.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a basic offline response for assets
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

/**
 * Network-first strategy: try network, fall back to cache.
 * Used for API calls and dynamic content.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: "You are offline" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Network-first with offline fallback for HTML pages.
 * Falls back to the cached offline page when both network and cache fail.
 */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try to serve from dynamic cache first
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fall back to offline page
    const offlinePage = await caches.match("/offline.html");
    if (offlinePage) return offlinePage;

    return new Response(
      "<html><body><h1>Offline</h1><p>Veil requires a network connection.</p></body></html>",
      {
        status: 503,
        headers: { "Content-Type": "text/html" },
      }
    );
  }
}
