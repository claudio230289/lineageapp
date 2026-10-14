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
export const APP_VERSION = '14.5';

/**
 * Versión de la forma de los datos.
 *
 * El historial del repo muestra que DB_VERSION fue 13 desde que
 * se introdujo (commit 9c55ec2) y nunca se movió. La versión 14
 * es la primera migración real: agrega `trabajo` a los ingresos
 * y `grupoId`/`cuotaNro`/`cuotaTotal` a las cuotas que ya estaban
 * guardadas. No hay migraciones para las versiones 1 a 12;
 * escribir esas sería inventar una historia que no está
 * registrada.
 */
export const SCHEMA_VERSION = 14;

/* =========================================================
   HELPERS DE CUOTAS Y SLUG
   =========================================================
   Viven acá y NO en js/calculos/nucleo.js a propósito: la
   migración 14 los necesita, y js/version.js es el único módulo
   que no puede importar nada (un service worker clásico lo
   carga directamente). Definirlos en otro lado obligaría a
   version.js a importar, que es justo lo que el test prohíbe.

   Son funciones puras y sin estado, así que duplicar acá la
   idea de `normalizarTexto` no agrega deuda: la migración corre
   una vez por documento y no participa del cálculo en pantalla.
   ========================================================= */

/** ¿Es un objeto plano (no array, no null)? */
function esObjetoPlano(valor) {
    return !!valor && typeof valor === 'object' && !Array.isArray(valor);
}

/**
 * Normalización local de texto: recorta, minúsculas y sin tildes.
 * Réplica mínima de js/calculos/nucleo.js para no importar.
 * @param {*} valor
 * @returns {string}
 */
function normalizarTextoLocal(valor) {
    if (typeof valor !== 'string') return '';
    return valor
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Desplaza una clave de mes "YYYY-MM" `offset` meses.
 *
 * Réplica mínima de js/calculos/nucleo.js#mesDesplazado para no
 * importar (js/version.js no puede importar nada). La migración la
 * necesita para calcular el mes de la PRIMERA cuota de una serie a
 * partir del mes donde está guardada la cuota N.
 *
 * Es tolerante: si la clave no tiene forma "YYYY-MM", devuelve la
 * entrada tal cual en vez de producir "NaN-NaN".
 *
 * @param {*} mesInicio "YYYY-MM"
 * @param {number} offset Meses a desplazar (puede ser negativo)
 * @returns {string} "YYYY-MM"
 */
function mesDesplazadoLocal(mesInicio, offset) {
    const [year, month] = String(mesInicio).split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return String(mesInicio);
    const totalMeses = year * 12 + (month - 1) + offset;
    const y = Math.floor(totalMeses / 12);
    // Módulo positivo: con offsets negativos el % de JS da negativo.
    const m = ((totalMeses % 12) + 12) % 12 + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Convierte un texto en un identificador estable para usar en
 * claves y nombres de grupo: minúsculas, sin tildes y con los
 * espacios y símbolos colapsados a guiones.
 *
 * Se usa para la parte de nombre del grupoId de un plan de cuotas
 * (`plan-<slug>-<mesCuota1>`): la migración reconstruye el MISMO id
 * para todas las cuotas de una compra de forma determinística, y el
 * mes de la primera cuota separa dos compras homónimas.
 *
 * @param {*} texto
 * @returns {string} Slug, o '' si la entrada no es un string útil
 */
export function slug(texto) {
    if (typeof texto !== 'string') return '';
    return texto
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Extrae base, número y total de un concepto de cuota con la
 * forma "Concepto (Cuota 3/12)".
 *
 * Devuelve null si el concepto no termina con ese patrón, o si la
 * base queda vacía: agrupar cuotas huérfanas (sin nombre) bajo
 * una misma clave uniría planes que no tienen nada que ver.
 *
 * @param {*} concepto
 * @returns {{base:string, nro:number, total:number}|null}
 */
export function parsearCuota(concepto) {
    if (typeof concepto !== 'string') return null;
    const coincidencia = concepto.match(/\(Cuota\s+(\d+)\s*\/\s*(\d+)\)\s*$/);
    if (!coincidencia) return null;

    const base = concepto.slice(0, coincidencia.index).trim();
    if (!base) return null;

    return {
        base,
        nro: parseInt(coincidencia[1], 10),
        total: parseInt(coincidencia[2], 10)
    };
}

/**
 * Arma el concepto estándar de una cuota: "Base (Cuota n/total)".
 * Es la inversa de parsearCuota y la única forma de escribir el
 * nombre de una cuota, para que el formato no se desincronice.
 *
 * @param {string} base
 * @param {number} nro
 * @param {number} total
 * @returns {string}
 */
export function formatearCuota(base, nro, total) {
    return `${base} (Cuota ${nro}/${total})`;
}

/**
 * Migraciones, una por versión destino.
 *
 * La clave N significa "convertir datos de la versión N-1 a la
 * N", y la función recibe la base y la modifica en el sitio.
 * Ejemplo de cómo se agrega una:
 *
 *   15: (base) => {
 *       base.ajusteNuevo = base.ajusteNuevo ?? 0;
 *   },
 *
 * Sólo hacen falta para cambios que no se pueden resolver
 * normalizando la forma. Lo que sí se puede normalizar (que
 * `deseos` sea array, que `monto` sea número) va en
 * `migrarDb` y aplica siempre, con independencia de la versión.
 */
export const MIGRACIONES = {
    /**
     * 13 -> 14: ingresos por trabajo y plan de cuotas con identidad.
     *
     * Dos backfills, los dos idempotentes (cada campo se escribe
     * sólo si NO existe) porque esta migración corre en cada carga
     * hasta que el documento quede estampado en 14:
     *
     *   1. Ingresos: agrega `trabajo: ''`. El cálculo del neto pasó
     *      a agrupar los básicos por trabajo; un ingreso sin el
     *      campo se trata como el trabajo '' (el caso histórico,
     *      un único trabajo).
     *
     *   2. Cuotas: agrega `grupoId`, `cuotaNro` y `cuotaTotal` a
     *      las cuotas cuyo concepto ya tiene la forma
     *      "Concepto (Cuota n/total)". El grupoId es determinístico
     *      (`plan-<slug>-<mesCuota1>`), así que todas las cuotas de
     *      la MISMA compra quedan en el mismo grupo sin importar
     *      cuándo se corra la migración, y dos compras homónimas de
     *      meses distintos quedan en grupos DISTINTOS. El
     *      discriminante es el mes de la primera cuota de la serie,
     *      deducido desplazando el mes del gasto (nro - 1) meses
     *      hacia atrás.
     *
     * Es tolerante a datos corruptos: si un mes no es un array, si
     * un ingreso no es un objeto o si el concepto no es parseable,
     * esa entrada se saltea sin abortar el resto.
     */
    14: (base) => {
        // 1. Ingresos: `trabajo: ''` donde falte.
        if (esObjetoPlano(base.ingresos)) {
            for (const mes of Object.keys(base.ingresos)) {
                const lista = base.ingresos[mes];
                if (!Array.isArray(lista)) continue;
                for (const ingreso of lista) {
                    if (esObjetoPlano(ingreso) && ingreso.trabajo === undefined) {
                        ingreso.trabajo = '';
                    }
                }
            }
        }

        // 2. Cuotas: identidad de plan y numeración donde falte.
        if (esObjetoPlano(base.gastos)) {
            for (const mes of Object.keys(base.gastos)) {
                const lista = base.gastos[mes];
                if (!Array.isArray(lista)) continue;
                for (const gasto of lista) {
                    if (!esObjetoPlano(gasto)) continue;
                    // Sólo cuotas: un gasto fijo con un nombre que
                    // casualmente termina en "(Cuota n/m)" no debe
                    // quedar dentro de un plan.
                    if (normalizarTextoLocal(gasto.categoria) !== 'cuotas') continue;
                    // Ya migrado: no volver a tocar.
                    if (gasto.grupoId !== undefined
                        && gasto.cuotaNro !== undefined
                        && gasto.cuotaTotal !== undefined) continue;

                    const partes = parsearCuota(gasto.concepto);
                    if (!partes) continue;

                    // Mes de la PRIMERA cuota de la serie: se deduce
                    // retrocediendo (nro - 1) meses desde el mes donde
                    // está esta cuota. Todas las cuotas de una misma
                    // compra lo calculan igual, así que obtienen el
                    // MISMO grupoId; dos compras homónimas que
                    // arrancaron en meses distintos obtienen uno
                    // distinto. Si el número de cuota no es utilizable,
                    // se usa el mes del propio gasto como discriminante.
                    const nroEfectivo = gasto.cuotaNro !== undefined
                        ? Number(gasto.cuotaNro)
                        : partes.nro;
                    const mesCuota1 = Number.isFinite(nroEfectivo) && nroEfectivo >= 1
                        ? mesDesplazadoLocal(mes, -(nroEfectivo - 1))
                        : mes;

                    if (gasto.grupoId === undefined) gasto.grupoId = `plan-${slug(partes.base)}-${mesCuota1}`;
                    if (gasto.cuotaNro === undefined) gasto.cuotaNro = partes.nro;
                    if (gasto.cuotaTotal === undefined) gasto.cuotaTotal = partes.total;
                }
            }
        }
    }
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