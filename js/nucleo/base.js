/* =========================================================
   NÚCLEO DE LA BASE DE DATOS (js/nucleo/base.js)
   =========================================================
   Normalización de forma + recorrido de migraciones, sin
   Firebase ni DOM.

   Por qué está aparte de db.js: db.js importa el SDK de
   Firebase por URL HTTPS, así que Node no puede cargarlo
   (ERR_UNSUPPORTED_ESM_URL_SCHEME) y nada de lo que viva
   adentro es testeable. Esta lógica decide qué pasa con un
   documento remoto incompleto, que es justo lo que más caro
   sale cuando falla sin que nadie lo note.

   Regla: la base por defecto entra como parámetro, no se lee de
   un módulo. Así la función es pura y se puede probar con una
   base fija en vez de depender del estado vivo.
   ========================================================= */

import { SCHEMA_VERSION, aplicarMigraciones } from '../version.js';

/**
 * Base vacía con el mes en curso.
 * @returns {Object}
 */
export function crearBaseVacia(mesActivo) {
    const ahora = new Date();
    return {
        version: SCHEMA_VERSION,
        dolar: 1250,
        mesActivo: mesActivo || `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`,
        ingresos: {},
        gastos: {},
        deseos: [],
        pasivos: []
    };
}

/**
 * Normaliza la FORMA de los datos, sin migrar.
 *
 * Garantiza que existan `ingresos`, `gastos`, `deseos` y
 * `pasivos` con el tipo correcto, y que `dolar` sea número.
 * Sin esto, un documento de Firestore de una versión vieja sin
 * `deseos` deja `db.deseos` en undefined y el render de deseos
 * revienta la app entera. El mismo respaldo en un archivo JSON
 * sí funcionaba, porque el import sí pasaba por acá.
 *
 * NO fija `version`. Preserva la declarada para que
 * `aplicarMigraciones` pueda hacer su trabajo. Si el documento
 * no declara versión, se asume la actual (y no 0: la 0
 * dispararía todas las migraciones sobre datos que nunca
 * pasaron por una versión anterior).
 *
 * @param {*} data Datos sin procesar
 * @param {Object} [basePorDefecto] Aporta los valores que falten
 * @returns {Object} Objeto nuevo; no muta ni `data` ni el default.
 */
export function normalizarBase(data, basePorDefecto = {}) {
    const base = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const porDefecto = basePorDefecto && typeof basePorDefecto === 'object' ? basePorDefecto : {};

    const versionDeclarada = Number(base.version);

    return {
        ...porDefecto,
        ...base,
        version: Number.isFinite(versionDeclarada) && versionDeclarada >= 0
            ? Math.floor(versionDeclarada)
            : SCHEMA_VERSION,
        dolar: Number(base.dolar) || Number(porDefecto.dolar) || 1250,
        mesActivo: base.mesActivo || porDefecto.mesActivo || null,
        ingresos: esObjeto(base.ingresos) ? base.ingresos : {},
        gastos: esObjeto(base.gastos) ? base.gastos : {},
        deseos: Array.isArray(base.deseos) ? base.deseos : [],
        pasivos: Array.isArray(base.pasivos) ? base.pasivos : []
    };
}

/**
 * Devuelve una copia limpia para escribir en Firestore.
 *
 * Firestore rechaza `undefined` ("Unsupported field value: undefined")
 * y números no finitos (NaN/Infinity) al escribir: `setDoc` lanza y
 * el guardado en la nube falla. Peor aún: como `JSON.stringify`
 * convierte NaN a null y omite los undefined, la copia de
 * localStorage sigue "funcionando" y el fallo de la nube queda
 * enmascarado para siempre. Basta un solo ingreso con el campo de
 * valor vacío (`parseFloat('')` = NaN) o una importación de
 * respaldo para que TODOS los guardados en la nube dejen de
 * funcionar hasta limpiar el dato a mano.
 *
 * No muta la entrada: devuelve un objeto nuevo.
 *
 * @param {*} valor
 * @returns {*} Copia sin undefined y sin números no finitos
 */
export function sanitizarParaFirestore(valor) {
    if (Array.isArray(valor)) {
        return valor.map(sanitizarParaFirestore);
    }
    if (valor && typeof valor === 'object') {
        const limpio = {};
        for (const clave of Object.keys(valor)) {
            const v = valor[clave];
            if (v === undefined) continue;
            limpio[clave] = sanitizarParaFirestore(v);
        }
        return limpio;
    }
    if (typeof valor === 'number' && !Number.isFinite(valor)) {
        return null;
    }
    return valor;
}

/**
 * Punto de entrada único para datos que entran a la app:
 * normaliza la forma y luego aplica las migraciones pendientes.
 *
 * @param {*} data Datos sin procesar
 * @param {Object} [basePorDefecto]
 * @param {{esquemaActual?:number, migraciones?:Object}} [opcionesMigracion]
 * @returns {{base:Object, migracionesAplicadas:number[]}}
 */
export function prepararBase(data, basePorDefecto = {}, opcionesMigracion = {}) {
    const base = normalizarBase(data, basePorDefecto);
    const { aplicadas } = aplicarMigraciones(base, opcionesMigracion);
    return { base, migracionesAplicadas: aplicadas };
}

/** Un array no sirve como mapa de meses: sería truthy pero inútil. */
function esObjeto(valor) {
    return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor);
}