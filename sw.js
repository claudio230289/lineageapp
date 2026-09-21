const CACHE_NAME = 'finanzas-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => clients.claim())
  );
});

// Agrega las acciones de transferencia y compartir sin tocar la lógica de datos de la app.
function agregarAccionesTransferencia(html) {
  if (html.includes('id="transfer-actions"')) return html;

  const injection = `
    <div id="transfer-actions" class="max-w-md mx-auto px-4 py-2 flex gap-2 flex-wrap justify-center no-print" style="background:#eef2ff;border-bottom:1px solid #c7d2fe">
      <button type="button" onclick="window.enviarDatosANuevoCelular()" class="text-[10px] bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg border border-indigo-500 hover:bg-indigo-700 transition flex items-center">
        <i class="fa-solid fa-mobile-screen-button mr-1"></i> Enviar datos a otro celular
      </button>
      <button type="button" onclick="window.compartirAplicacion()" class="text-[10px] bg-slate-700 text-white px-2.5 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 transition flex items-center">
        <i class="fa-solid fa-share-nodes mr-1"></i> Compartir app
      </button>
    </div>
    <script>
      (() => {
        const nombreArchivo = () => 'finanzas_backup_' + new Date().toISOString().slice(0, 10) + '.json';
        const obtenerDatos = () => {
          const raw = localStorage.getItem('finanzas_db');
          if (!raw) throw new Error('No hay datos guardados para enviar.');
          // Validamos que sea JSON antes de compartirlo.
          return JSON.stringify(JSON.parse(raw), null, 2);
        };
        const descargar = (contenido) => {
          const blob = new Blob([contenido], { type: 'application/json' });
          const enlace = document.createElement('a');
          enlace.href = URL.createObjectURL(blob);
          enlace.download = nombreArchivo();
          document.body.appendChild(enlace);
          enlace.click();
          enlace.remove();
          setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
        };

        window.enviarDatosANuevoCelular = async () => {
          if (!confirm('Esto enviará una copia de todos los datos financieros de este celular. En el nuevo celular deberás usar “Cargar JSON”. ¿Continuar?')) return;
          try {
            const contenido = obtenerDatos();
            const archivo = new File([contenido], nombreArchivo(), { type: 'application/json' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [archivo] })) {
              await navigator.share({
                title: 'Datos de Mis Finanzas',
                text: 'Copia de datos para importar en otro celular. En la app nueva, elegí “Cargar JSON”.',
                files: [archivo]
              });
              return;
            }
            descargar(contenido);
            alert('Tu celular no permite compartir archivos directamente. Se descargó el JSON; envialo al nuevo celular y cargalo con “Cargar JSON”.');
          } catch (error) {
            if (error && error.name === 'AbortError') return;
            console.error('Error al preparar datos para transferencia:', error);
            alert('No se pudieron preparar los datos para enviar.');
          }
        };

        window.compartirAplicacion = async () => {
          const datos = {
            title: 'Mis Finanzas',
            text: 'Te comparto esta app para controlar tus finanzas.',
            url: window.location.href
          };
          try {
            if (navigator.share) {
              await navigator.share(datos);
            } else if (navigator.clipboard) {
              await navigator.clipboard.writeText(window.location.href);
              alert('No se pudo abrir el menú de compartir. El enlace de la app fue copiado.');
            } else {
              prompt('Copiá este enlace para compartir la app:', window.location.href);
            }
          } catch (error) {
            if (error && error.name !== 'AbortError') console.error('Error al compartir la app:', error);
          }
        };
      })();
    </script>`;

  return html.replace('</body>', injection + '</body>');
}

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then(async (networkResponse) => {
        const contentType = networkResponse.headers.get('content-type') || '';
        if (event.request.destination !== 'document' || !contentType.includes('text/html')) {
          return networkResponse;
        }
        const html = await networkResponse.text();
        const modified = agregarAccionesTransferencia(html);
        const headers = new Headers(networkResponse.headers);
        headers.set('content-type', 'text/html; charset=utf-8');
        return new Response(modified, {
          status: networkResponse.status,
          statusText: networkResponse.statusText,
          headers
        });
      })
      .catch(() => caches.match(event.request))
  );
});
