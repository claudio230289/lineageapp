self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('lineage-cache-v1').then((cache) => {
      return cache.addAll([
        '/lineageapp/',
        '/lineageapp/index.html'
      ]);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
