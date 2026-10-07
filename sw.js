/* =========================================================
   SERVICE WORKER OPTIMIZADO (sw.js)
   Estrategias de caché inteligentes
   ========================================================= */

/* Service worker clásico: no puede usar `import`, así que este
   número es un literal. La fuente de verdad es APP_VERSION en
   js/version.js y tests/version.test.js falla si deja de coincidir
   con `finanzas-v${APP_VERSION}`. No actualizar a mano sin tocar
   también js/version.js. */
const CACHE_NAME = 'finanzas-v14.1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-finanzas-lineage.svg',
  './js/version.js',
  './js/db.js',
  './js/calculos.js',
  './js/calculos/nucleo.js',
  './js/comprobante.js',
  './js/deseos.js',
  './js/app.js',
  './js/app.rollover.js',
  './js/notificaciones.js',
  './js/negocio/replicacion.js',
  './js/nucleo/base.js',
  './js/core/eventos.js',
  './js/core/avisos.js',
  './js/core/inactividad.js',
  './js/utils/fechas.js',
  './js/utils/id.js',
  './js/utils/formato.js',
  './js/dom/delegacion.js',
  './js/dom/version-ui.js',
  './js/app.rollover.js'
];

// Instalación: cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando assets estáticos');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: estrategias de caché
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // No cachear requests de Firebase/Google APIs
  if (url.origin.includes('firebase') || 
      url.origin.includes('googleapis.com') || 
      url.origin.includes('gstatic.com') ||
      url.origin.includes('dolarapi.com')) {
    return;
  }

  // Estrategia: Network First para HTML (siempre fresco)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Estrategia: Cache First para assets estáticos
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Estrategia: Stale While Revalidate para el resto
  event.respondWith(staleWhileRevalidate(event.request));
});

// Network First: intenta red, fallback a caché
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

// Cache First: intenta caché, fallback a red
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    throw error;
  }
}

// Stale While Revalidate: sirve caché inmediato, actualiza en background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => cachedResponse);
  
  return cachedResponse || fetchPromise;
}

// Verificar si es un asset estático
function isStaticAsset(pathname) {
  return pathname.endsWith('.js') ||
         pathname.endsWith('.css') ||
         pathname.endsWith('.svg') ||
         pathname.endsWith('.png') ||
         pathname.endsWith('.jpg') ||
         pathname.endsWith('.ico') ||
         pathname.endsWith('.json');
}

// Mensajes desde la app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
