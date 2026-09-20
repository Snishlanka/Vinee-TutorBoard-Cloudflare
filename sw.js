// Offline app shell. Bump REVISION whenever cached application files change.
const REVISION = '98e8d8549040bd21';
const ASSETS = [
  'index.html',
  'theme.js',
  'style.css',
  'app.js',
  'math.js',
  'pwa.css',
  'board-persistence.js',
  'pwa.js',
  'draft-store.js',
  'manifest.webmanifest',
  'favicon.svg',
  'vendor/pdf-lib.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];
('use strict');
// Each deployment is an atomic app shell. Never mix old HTML with new scripts.
const BASE = self.registration.scope;
const PREFIX = 'vinee-shell:' + BASE + ':';
const CACHE = PREFIX + REVISION;
// Cloudflare redirects index.html to the directory URL. Cache that URL directly:
// redirected responses cannot satisfy navigation requests with redirect='manual'.
const HOME = new URL('index.html', BASE).href;
const urls = new Set(
  ASSETS.map((asset) => (asset === 'index.html' ? BASE : new URL(asset, BASE).href))
);
function navigationResponse(response, request) {
  if (request.mode !== 'navigate' || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.addAll([...urls].map((url) => new Request(url, { cache: 'reload' })));
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
      // No skipWaiting: an update must not interrupt an open lesson in ANY tab.
    })()
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== new URL(BASE).origin) return;
  url.search = '';
  url.hash = '';
  let key = url.href;
  if (request.mode === 'navigate' && (key === BASE || key === HOME)) key = BASE;
  if (!urls.has(key)) return; // No HTML fallback for missing assets or other apps.
  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(key);
        if (cached) return navigationResponse(cached, request);
      } catch {
        // Browser storage can be unavailable; online navigation must still work.
      }
      return fetch(request);
    })()
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'OFFLINE_STATUS')
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const complete = (await Promise.all([...urls].map((url) => cache.match(url)))).every(
          Boolean
        );
        event.ports[0]?.postMessage({ complete, revision: REVISION });
      })()
    );
});
