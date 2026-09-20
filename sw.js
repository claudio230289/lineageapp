const CACHE_NAME = 'finanzas-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-512.png'
  // Agrega aquí tus scripts o CSS locales si los tienes separados
];

// 1. Instalar y guardar recursos críticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Limpiar cachés antiguos al activar
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => clients.claim())
  );
});

// 3. Interceptar peticiones: Red primero, respaldo en caché si falla
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Opcional: podrías actualizar el caché dinámicamente aquí si la respuesta es válida
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
