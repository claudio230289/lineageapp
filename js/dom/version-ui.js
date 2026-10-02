/* =========================================================
   PINTADO DE LA VERSIÓN EN PANTALLA (js/dom/version-ui.js)
   =========================================================
   Escribe el número de versión en las tres superficies donde
   se ve: el <title> de la pestaña, el encabezado de la app y
   la etiqueta del panel de login.

   Antes cada una tenía su propia copia escrita a mano. Sólo
   la etiqueta la escribía el código; el title y el encabezado
   quedaban con literales en index.html que se desincronizan
   en silencio. Pasó de verdad: con la app ya en 14.0, el
   encabezado seguía diciendo 13.9.

   Por qué está aparte de db.js y no ahí adentro: db.js importa
   el SDK de Firebase por URL HTTPS, así que Node no puede
   cargarlo y nada de lo que viva adentro es testeable (mismo
   motivo que js/nucleo/base.js y js/calculos/nucleo.js). Acá
   no hay Firebase, así que esto sí se prueba con jsdom.
   ========================================================= */

import { APP_VERSION } from '../version.js';

/**
 * Los tres textos con el número ya resuelto.
 * Se exportan para que los tests comparen contra la misma fuente
 * que usa la pantalla, en vez de reescribir el formato a mano y
 * que un cambio de formato rompa los dos en direcciones
 * opuestas.
 *
 * @returns {{titulo:string, encabezado:string, etiqueta:string}}
 */
export function piezasVersion() {
    return {
        titulo: `Control Financiero - Claudio (v${APP_VERSION})`,
        encabezado: `Mis Finanzas v${APP_VERSION}`,
        etiqueta: `Versión ${APP_VERSION}`
    };
}

/**
 * Escribe el número de versión donde la persona lo ve.
 *
 * Idempotente: se puede llamar en cada arranque sin efecto
 * acumulativo, y devuelve false si no encontró nada que
 * escribir (o sea, que el HTML no coincide).
 *
 * Usa textContent y no innerHTML a propósito: si algún día el
 * número tuviera formato inesperado, no podría inyectar HTML.
 *
 * @param {Document} [documento] Permite pasar un documento de
 *   prueba; por defecto usa el global.
 * @returns {boolean} true si se escribió al menos una superficie
 */
export function pintarVersionApp(documento) {
    const doc = documento || (typeof document !== 'undefined' ? document : null);
    if (!doc) return false;

    const piezas = piezasVersion();
    let escrita = false;

    const encabezado = doc.getElementById('app-title-header');
    if (encabezado) {
        encabezado.textContent = piezas.encabezado;
        escrita = true;
    }

    const etiqueta = doc.getElementById('app-version-label');
    if (etiqueta) {
        etiqueta.textContent = piezas.etiqueta;
        escrita = true;
    }

    // El title no depende de ningún id, así que siempre se escribe.
    if (doc.title !== piezas.titulo) {
        doc.title = piezas.titulo;
        escrita = true;
    }

    return escrita;
}