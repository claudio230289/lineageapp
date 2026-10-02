/* =========================================================
   DELEGACIÓN DE EVENTOS (js/dom/delegacion.js)
   =========================================================
   Reemplaza los handlers inline tipo onclick="window.f(x)"
   que se estaban rompiendo con los IDs string de generarId().

   Por qué fallaba: generarId() devuelve "1790938826674-8ubfw2fdx".
   Interpolar eso sin comillas produce
   onclick="window.togglePagoGasto(1790938826674-8ubfw2fdx)",
   que es JavaScript inválido (SyntaxError). El handler nunca
   compilaba, el click no hacía nada y el checkbox quedaba
   marcado sólo por el comportamiento nativo del navegador,
   mientras el dato seguía con pagado=false.

   Además, los handlers inline no permiten escapar valores y
   obligan a exponer window.fUNCION en el ámbito global. Con
   delegación, el HTML queda como datos y el JS decide qué hacer.
   ========================================================= */

/**
 * Registro de contenedores ya listening, para no duplicar
 * listeners cuando el render se repite. WeakSet porque los
 * contenedores del DOM se liberan solos al reemplazarse.
 * @type {WeakMap<Element, Set<string>>}
 */
const listenersRegistrados = new WeakMap();

/**
 * Registra un manejador delegado sobre un contenedor.
 *
 * Los elementos hijos se marcan con `data-accion` y `data-id`:
 *   <button data-accion="eliminar-gasto" data-id="123">Del</button>
 *
 * El evento se escucha UNA vez por contenedor y tipo de evento,
 * aunque la función se llame en cada render. Que el
 * listener viva en el contenedor y no en el botón es lo que
 * permite que el botón se pueda recrear en cada render sin
 * tener que reconectar nada.
 *
 * @param {Element|null} contenedor Elemento padre que ya existe en el DOM
 * @param {string} evento Tipo de evento, por ejemplo 'click' o 'change'
 * @param {Object<string, Function>} manejadores Mapa accion -> fn(elemento, id)
 * @returns {boolean} true si quedó registrado ahora, false si ya estaba
 */
export function delegar(contenedor, evento, manejadores) {
    if (!contenedor || !manejadores) return false;

    // Evita registrar dos veces el mismo par (contenedor, evento),
    // que duplicaría las acciones en cada render.
    const yaRegistrados = listenersRegistrados.get(contenedor) || new Set();
    if (yaRegistrados.has(evento)) return false;
    yaRegistrados.add(evento);
    listenersRegistrados.set(contenedor, yaRegistrados);

    contenedor.addEventListener(evento, (eventoReal) => {
        // El click puede caer sobre un hijo (ícono, <span>), así que
        // hay que subir hasta el elemento marcado con data-accion.
        const disparador = eventoReal.target.closest('[data-accion]');
        if (!disparador || !contenedor.contains(disparador)) return;

        const accion = disparador.dataset.accion;
        const manejador = manejadores[accion];
        if (!manejador) return;

        // Sólo reactsemos ourselves; si el elemento pide comportamiento
        // nativo (checkbox, submit), no lo interceptamos.
        if (disparador.type === 'checkbox' && evento !== 'change') return;
        if (disparador.tagName === 'BUTTON' && disparador.type !== 'submit') {
            eventoReal.preventDefault();
        }

        manejador(disparador, disparador.dataset.id);
    });

    return true;
}