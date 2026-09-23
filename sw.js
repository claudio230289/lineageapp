const CACHE_NAME = 'finanzas-v13.7';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-finanzas-lineage.svg',
  './js/db.js',
  './js/calculos.js',
  './js/deseos.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin.includes('firebase') || url.origin.includes('googleapis.com') || url.origin.includes('gstatic.com')) {
    return;
  }

  const isAppAsset =
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/manifest.json') ||
    url.pathname.endsWith('/icon-finanzas-lineage.svg') ||
    /\/js\//.test(url.pathname) ||
    /\/sw\.js$/.test(url.pathname);

  event.respondWith(
    isAppAsset
      ? fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          })
          .catch(() => caches.match(event.request))
      : caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
