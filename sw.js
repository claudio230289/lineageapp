const CACHE_NAME = 'finanzas-v13.5-v2';
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Excluimos las peticiones a Firebase y Google APIs de la caché estática
  if (url.origin.includes('firebase') || url.origin.includes('googleapis.com') || url.origin.includes('gstatic.com')) {
    return; // Dejamos que el navegador maneje estas peticiones directamente por red
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
