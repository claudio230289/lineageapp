/* =========================================================
   VERSIÓN Y MIGRACIONES (js/version.js)
   =========================================================
   Fuente única de verdad. Antes el número de versión vivía
   en cuatro lugares distintos y ya diverge entre sí:

     package.json        13.9.0
     db.js APP_VERSION   13.8
     index.html          13.9
     sw.js CACHE_NAME    finanzas-v14.0

   Eso no es cosmético: el CACHE_NAME es lo que decide si un
   service worker serves la app vieja o la nueva, y el
   APP_VERSION es lo que ve la persona para reportar un bug.

   DOS NÚMEROS DISTINTOS, A PROPÓSITO
   ---------------------------------
   APP_VERSION    versión del código. Cambia en cada entrega.
   SCHEMA_VERSION versión de la FORMA de los datos. Sólo cambia
                  cuando hay que transformar algo que ya está
                  guardado en Firestore o en un respaldo.

   Subir APP_VERSION no obliga a migrar nada. Subir
   SCHEMA_VERSION sí, y obliga a escribir la migración.

   Por qué nada de derive sw.js: es un service worker clásico y
   no puede usar `import`. En vez de duplicar el número a mano,
   el test de guardia (tests/version.test.js) falla si el
   literal de sw.js deja de coincidir con lo de acá.
   ========================================================= */

/** Versión del código, visible para la persona. */
export const APP_VERSION = '14.2';

/**
 * Versión de la forma de los datos.
 *
 * El historial del repo muestra que DB_VERSION fue 13 desde que
 * se introdujo (commit 9c55ec2) y nunca se movió. No hay
 * migraciones anteriores que recuperar: escribir las de las
 * versiones 1 a 12 sería inventar una historia que no está
 * registrada.
 */
export const SCHEMA_VERSION = 13;

/**
 * Migraciones, una por versión destino.
 *
 * La clave N significa "convertir datos de la versión N-1 a la
 * N", y la función recibe la base y la modifica en el sitio.
 * Ejemplo de cómo se agrega una:
 *
 *   14: (base) => {
 *       base.ajusteNuevo = base.ajusteNuevo ?? 0;
 *   },
 *
 * Sólo hacen falta para cambios que no se pueden resolver
 * normalizando la forma. Lo que sí se puede normalizar (que
 * `deseos` sea array, que `monto` sea número) va en
 * `migrarDb` y aplica siempre, con independencia de la versión.
 */
export const MIGRACIONES = {
    // Sin entradas: SCHEMA_VERSION no cambió desde la última
    // entrega, así que no hay nada que transformar. La primera
    // migración real se escribe al subir SCHEMA_VERSION a 14.
};

/**
 * Nombre de la caché del service worker.
 * Debe coincidir con el literal de sw.js; el test lo verifica.
 */
export const CACHE_NAME = `finanzas-v${APP_VERSION}`;

/**
 * Aplica las migraciones pendientes sobre una base ya
 * normalizada en su forma.
 *
 * Idempotente: si la base ya está en SCHEMA_VERSION no hace
 * nada. Esto importa porque se llama en cada carga; una
 * migración destructiva aplicada dos veces perdería datos.
 *
 * Una versión sin entrada en MIGRACIONES se considera un simple
 * salto de número que no requiere transformar nada. Es lo que
 * permite que los respaldos antiguos, que nunca tuvieron
 * `version`, sigan cargando en vez de romperse.
 *
 * @param {Object} base Base normalizada. Se modifica en el sitio.
 * @param {{esquemaActual?:number, migraciones?:Object}} [opciones]
 *   `migraciones` permite inyectar un registro distinto al de la
 *   app. Existe para poder probar el recorrido de migraciones de
 *   verdad: copiar el algoritmo en el test probaría la copia, y un
 *   bug en el algoritmo real pasaría el suite igual.
 * @returns {{datos:Object, aplicadas:number[], versionInicial:number}}
 */
export function aplicarMigraciones(base, opciones = {}) {
    const esquemaActual = Number.isFinite(opciones.esquemaActual)
        ? opciones.esquemaActual
        : SCHEMA_VERSION;
    const registro = opciones.migraciones && typeof opciones.migraciones === 'object'
        ? opciones.migraciones
        : MIGRACIONES;

    if (!base || typeof base !== 'object') {
        return { datos: base, aplicadas: [], versionInicial: 0 };
    }

    let versionInicial = Number(base.version);
    if (!Number.isFinite(versionInicial) || versionInicial < 0) {
        // Sin versión legible: se asume la actual, NO la 0. La 0
        // dispararía todas las migraciones sobre datos que quizá
        // nunca vio una versión anterior. Y se estampa, para no
        // tener que volver a diagnosticar el mismo documento
        // corrupto en cada carga.
        base.version = esquemaActual;
        return { datos: base, aplicadas: [], versionInicial: esquemaActual };
    }
    versionInicial = Math.floor(versionInicial);

    if (versionInicial >= esquemaActual) {
        // Ya está al día. No se toca `version`: si el documento
        // declara una versión futura (app más nueva que esta),
        // respetarla es más seguro que degradarla.
        return { datos: base, aplicadas: [], versionInicial };
    }

    const aplicadas = [];
    for (let version = versionInicial + 1; version <= esquemaActual; version++) {
        const migrar = registro[version];
        if (typeof migrar === 'function') {
            migrar(base);
            aplicadas.push(version);
        }
    }

    base.version = esquemaActual;
    return { datos: base, aplicadas, versionInicial };
}