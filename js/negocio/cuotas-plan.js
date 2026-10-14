/* =========================================================
   PLAN DE CUOTAS: LÓGICA PURA (js/negocio/cuotas-plan.js)
   =========================================================
   Capa de negocio pura para editar un plan de cuotas. No toca
   el DOM ni importa db.js: recibe el mapa de gastos por mes y
   devuelve un PLAN (qué actualizar, qué agregar, qué quitar)
   sin mutar nada. La mutación la aplica js/app.js.

   DECISIÓN DE NUMERACIÓN
   --------------------
   El editor modela el plan como "lo que queda por pagar": el
   total se precarga con la CANTIDAD de cuotas en alcance y esas
   cuotas se renumeran 1..N dentro del alcance. Las cuotas pagadas
   o de meses pasados conservan su numeración histórica y no se
   tocan. Si el total pedido NO cambia respecto a la cantidad
   actual en alcance, se preserva el `cuotaNro` original de cada
   cuota para evitar re-numberar sin necesidad. Si el total sí
   cambia, se renumeran consecutivamente desde 1.

   POR QUÉ EXISTE ESTE MÓDULO
   --------------------------
   `guardarEdicionPlanCuotas` vivía en js/app.js, que importa
   Firebase por URL y no se puede cargar en Node. Por qué el bug
   de "editar el plan tocaba las cuotas PAGADAS y las de meses
   PASADOS" no tenía ningún test que lo frenara. Acá la regla de
   alcance vive en funciones puras y testeables.

   REGLA DE ALCANCE (el corazón del módulo)
   ----------------------------------------
   "En alcance" de un plan = cuotas del MISMO grupoId, del mes
   activo o de meses futuros (clave "YYYY-MM" comparada
   lexicográficamente) y NO pagadas. Las pagadas y las de meses
   anteriores quedan SIEMPRE afuera: editarlas reescribiría plata
   ya cerrada o historia que no corresponde.

   DECISIÓN DE NUMERACIÓN (segunda instancia, para consenso)
   ------------------------------------------------------------
   Si el total pedido cambia, se renumeran las cuotas en alcance
   de 1 al nuevo total. Las cuotas fuera de alcance conservan su
   numeración original. Si el total no cambia, cada cuota conserva
   su monto y su `cuotaNro`/`cuotaTotal` actual, y no hay actualizaciones.

   REGLA DE ALCANCE (versión detallada)
   -----------------------------------
   "En alcance" = cuotas del MISMO grupoId, del mes activo o
   de meses futuros (clave "YYYY-MM" comparada lexicográficamente)
   y NO pagadas. Las pagadas y las de meses anteriores quedan
   SIEMPRE afuera: editarlas reescribiría plata ya cerrada o
   historia que no corresponde.

   DECISIÓN DE NUMERACIÓN (versión detallada)
   --------------------------------------
   El editor modela el plan como "lo que queda por pagar": el
   total se precarga con la CANTIDAD de cuotas en alcance y esas
   cuotas se renumeran 1..N dentro del alcance. Las cuotas pagadas
   o de meses pasados conservan su numeración histórica y no se
   tocan. Si el total pedido NO cambia respecto a la cantidad
   actual en alcance, se preserva el `cuotaNro` original de cada
   cuota para evitar re-numberar sin necesidad. Si el total sí
   cambia, se renumeran consecutivamente desde 1.

   Avisos de aplanado
   -----------------
   Si el plan tenía montos distintos por cuota y la edición los
   deja todos iguales, se avisa al usuario en lugar de hacerlo
   en silencio, para que preserve los montos individuales editando
   cada cuota por separado.

   Altas y bajas
   ------------
   - Crecer: agrega cuotas DESPUÉS de la última en alcance, con el
     mismo grupoId, evitando duplicar por concepto en el mes destino.
   - Reducir: quita SÓLO la cola en alcance. Nunca toca una cuota
     fuera de alcance, aunque el total pedido sea menor.
   - Renumerar y reescribir concepto/monto: SÓLO en alcance.

   Casos borde
   ----------
   - Sin cuotas en alcance: retorna actualizaciones/altas/bajas vacías
     con aviso `sin-cuotas-en-alcance`.
   - Total inválido (< 1): aviso `total-invalido`.
   - Sin cambios: si los montos pasados son idénticos a los actuales,
     no hay actualizaciones ni avisos.
   - Duplicado: si la nueva cuota ya existe en el mes destino, se omite
     y se avisa con código `duplicado`.

   Casos testeables (para los tests):
   - (1) NO modifica cuota PAGADA (ni en mes activo ni en futuro).
   - (2) NO modifica cuotas de meses PASADOS.
   - (3) SÍ modifica cuotas impagas del mes activo y futuros.
   - (4) Reduce quita SÓLO la cola en alcance.
   - (5) Nunca quita cuota pagada, aunque esté en la cola.
   - (6) Crecer agrega después de la última en alcance.
   - (7) No duplica cuota que ya existe en el mes destino.
   - (8) Guardar sin cambios NO aplana montos en plan variable.
   - (9) Si no se pasan montos, cada cuota conserva la suya.
   - (10) Cambio de monto en plan variable avisa `aplanado`.

   Casos borde duros (tolerancia a basura):
   - `cuotasEnAlcance(null/undefined/{}, ...)` → [].
   - Entradas sin `categoria: 'Cuotas'` → se saltan.
   - Entradas sin `grupoId` → se saltan.
   - Meses anteriores al activo → se saltan.
   - Pagado `"si"` (string) → tratado como pagado.
   - `cuotaNro`/`.total` ausentes o no numéricos → 0 o valor por defecto.

   Funciones exportadas:
   - `cuotasEnAlcance(listaGastosPorMes, grupoId, mesActivo)` → array
   - `planificarEdicionPlan({cuotasPorMes, grupoId, mesActual, base, montos, nuevoTotal})` → objeto con actualizaciones/altas/bajas/avisos.

   Test coverage (lista de verificación, no código ejecutable):
   - La regla de alcance isola correctamente pagadas/pasadas.
   - La numeración se renueva 1..N solo en alcance.
   - Crecer agrega después; reducir quita la cola.
   - Guardar sin cambios preserva montos variables.
   - Duplicado se detecta y omite.
   - Avisos `aplanado`, `sin-cuotas-en-alcance`, `total-invalido`, `duplicado`.

   Nota de implementación: la lógica pura vive en `js/negocio/cuotas-plan.js`;
   la mutación sobre `db.gastos` la aplica `js/app.js` mediante
   `editarPlanCuotas` / `guardarEdicionPlanCuotas`. Los tests de la UI
   (browser) cubren el flujo completo; estos tests cubren la lógica pura
   que antes no tenía cobertura por la dependencia de Firebase.
*/

/* Funciones auxiliares usadas internamente (mantenidas en el mismo archivo
   por simplicidad, aunque podrían ir a js/negocio/ o js/calculos/):
   - `compararCuotas(a, b)`: ordena por mes y cuotaNro.
   - `cuotasEnAlcance(listaGastosPorMes, grupoId, mesActivo)` → array.
   - `planificarEdicionPlan({cuotasPorMes, grupoId, mesActual, base, montos, nuevoTotal})` → {actualizaciones, altas, bajas, avisos}.
   - `armarPlan({grupoId, base, desde, total, monto, montos, pagadas})` → mapa de gastos.
   - `esObjetoPlano(valor)` → boolean.
*/

import { aNumero, esPagado, normalizarTexto, mesDesplazado } from '../calculos/nucleo.js';
import { formatearCuota, parsearCuota } from '../version.js';
import { generarId } from '../utils/id.js';

/* =========================================================
   IMPLEMENTACIÓN
   ========================================================= */

/**
 * ¿El valor es un objeto usable como gasto?
 *
 * Los respaldos JSON pueden traer null, strings o números donde
 * debería haber un gasto. Tratar esos valores como gasto es lo que
 * hacía reventar el render con un TypeError.
 *
 * @param {*} valor
 * @returns {boolean}
 */
function esObjeto(valor) {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Orden por mes y, dentro del mes, por número de cuota.
 *
 * @param {{mes:string, gasto:Object}} a
 * @param {{mes:string, gasto:Object}} b
 * @returns {number}
 */
function compararCuotas(a, b) {
    if (a.mes !== b.mes) return a.mes < b.mes ? -1 : 1;
    return aNumero(a.gasto.cuotaNro) - aNumero(b.gasto.cuotaNro);
}

/**
 * Devuelve las cuotas EN ALCANCE de un plan.
 *
 * "En alcance" = mismo grupoId, categoría 'Cuotas', del mes activo o
 * de meses futuros y NO pagadas. Cada elemento es `{mes, gasto}`,
 * ordenado por mes y, dentro del mes, por número de cuota.
 *
 * No muta nada y tolera cualquier basura en la entrada: una lista
 * que no es array o un elemento que no es objeto se saltea en vez
 * de romper.
 *
 * @param {Object} listaGastosPorMes Mapa "YYYY-MM" → array de gastos
 * @param {string} grupoId
 * @param {string} mesActivo "YYYY-MM"
 * @returns {Array<{mes:string, gasto:Object}>}
 */
export function cuotasEnAlcance(listaGastosPorMes, grupoId, mesActivo) {
    if (!esObjeto(listaGastosPorMes)) return [];

    const grupo = String(grupoId);
    const activo = String(mesActivo);
    const enAlcance = [];

    for (const mes of Object.keys(listaGastosPorMes)) {
        // Los meses anteriores al activo son historia cerrada: no se
        // editan nunca desde acá.
        if (mes < activo) continue;

        const lista = listaGastosPorMes[mes];
        if (!Array.isArray(lista)) continue;

        for (const gasto of lista) {
            if (!esObjeto(gasto)) continue;
            if (normalizarTexto(gasto.categoria) !== 'cuotas') continue;
            if (String(gasto.grupoId) !== grupo) continue;
            if (esPagado(gasto)) continue;
            enAlcance.push({ mes, gasto });
        }
    }

    return enAlcance.sort(compararCuotas);
}


/**
 * Calcula el plan de edición de un plan de cuotas SIN mutar nada.
 *
 * Reglas (detalladas en la cabecera del archivo):
 *   - Sólo se tocan las cuotas EN ALCANCE.
 *   - Crecer: altas después de la última en alcance, sin duplicar
 *     por concepto en el mes destino.
 *   - Reducir: bajas SÓLO de la cola en alcance.
 *   - Renumerar y reescribir concepto/monto: sólo en alcance.
 *   - Si no se pasan `montos`, cada cuota conserva el suyo.
 *   - Sólo se emite una actualización si algo cambió de verdad: así
 *     "guardar sin cambios" no reescribe la base y no aplana nada.
 *
 * @param {Object} params
 * @param {Object} params.cuotasPorMes Mapa "YYYY-MM" → array de gastos
 * @param {string} params.grupoId
 * @param {string} params.mesActual "YYYY-MM"
 * @param {string} params.base Concepto base del plan (vacío lo deriva)
 * @param {Array<number>} [params.montos] Monto por cuota en alcance
 * @param {number} params.nuevoTotal Total de cuotas pedido
 * @returns {{actualizaciones:Array, altas:Array, bajas:Array, avisos:Array}}
 */
export function planificarEdicionPlan({
    cuotasPorMes,
    grupoId,
    mesActual,
    base,
    montos,
    nuevoTotal
}) {
    const plan = { actualizaciones: [], altas: [], bajas: [], avisos: [] };

    // --- Validación de entrada -------------------------------------
    if (!Number.isFinite(nuevoTotal) || nuevoTotal < 1) {
        plan.avisos.push({
            codigo: 'total-invalido',
            tipo: 'warning',
            mensaje: 'El total de cuotas debe ser 1 o más.'
        });
        return plan;
    }

    const enAlcance = cuotasEnAlcance(cuotasPorMes, grupoId, mesActual);

    if (enAlcance.length === 0) {
        plan.avisos.push({
            codigo: 'sin-cuotas-en-alcance',
            tipo: 'warning',
            mensaje: 'El plan no tiene cuotas pendientes del mes actual ni de meses futuros.'
        });
        return plan;
    }

    // --- Concepto base ---------------------------------------------
    // Si no se pasó, se deriva del concepto de la primera cuota en
    // alcance; si tampoco se puede parsear, se usa el texto tal cual.
    let baseFinal = typeof base === 'string' ? base.trim() : '';
    if (!baseFinal) {
        const partes = parsearCuota(enAlcance[0].gasto.concepto);
        baseFinal = partes ? partes.base : String(enAlcance[0].gasto.concepto ?? '');
    }

    const hayMontos = Array.isArray(montos) && montos.length > 0;

    /**
     * Monto pedido para la cuota en la posición `indice` del alcance.
     * Si el formulario trajo menos montos que cuotas (porque creció el
     * plan), repite el último: es el valor que la persona escribió.
     *
     * @param {number} indice
     * @returns {number}
     */
    const montoDe = (indice) => {
        if (!hayMontos) return null;
        if (indice < montos.length) return aNumero(montos[indice]);
        return aNumero(montos[montos.length - 1]);
    };

    const conservar = Math.min(nuevoTotal, enAlcance.length);
    const ultimaMes = enAlcance[enAlcance.length - 1].mes;

    // --- Aviso de aplanado -----------------------------------------
    // Sólo avisa si el plan ERA variable (montos distintos por cuota)
    // y la edición lo deja plano. Un plan que ya era plano no avisa.
    if (hayMontos) {
        const montosActuales = enAlcance.map(c => aNumero(c.gasto.monto));
        const eraVariable = new Set(montosActuales.map(String)).size > 1;
        if (eraVariable) {
            const montosFinales = enAlcance.slice(0, conservar).map((_c, i) => montoDe(i));
            const ahoraPlano = new Set(montosFinales.map(String)).size <= 1;
            if (ahoraPlano) {
                plan.avisos.push({
                    codigo: 'aplanado',
                    tipo: 'info',
                    mensaje: 'El plan tenía montos distintos por cuota y ahora quedaron todos iguales.'
                });
            }
        }
    }

    // --- Bajas: la cola en alcance que sobra ------------------------
    // Nunca toca una cuota fuera de alcance, aunque el total pedido
    // sea menor: esas son meses cerrados o cuotas ya pagadas.
    for (const { gasto, mes } of enAlcance.slice(conservar)) {
        plan.bajas.push({ id: gasto.id, mes });
    }

    // --- Actualizaciones: renumerar 1..N dentro del alcance ---------
    // Sólo se emite una actualización si algo cambió de verdad: así
    // "guardar sin cambios" no reescribe la base y no aplana nada.
    for (let i = 0; i < conservar; i++) {
        const { gasto, mes } = enAlcance[i];
        const nro = i + 1;
        const conceptoNuevo = formatearCuota(baseFinal, nro, nuevoTotal);
        const montoNuevo = hayMontos ? montoDe(i) : aNumero(gasto.monto);

        const cambioConcepto = conceptoNuevo !== String(gasto.concepto ?? '');
        const cambioMonto = montoNuevo !== aNumero(gasto.monto);
        const cambioNro = nro !== aNumero(gasto.cuotaNro);
        const cambioTotal = nuevoTotal !== aNumero(gasto.cuotaTotal);

        if (cambioConcepto || cambioMonto || cambioNro || cambioTotal) {
            plan.actualizaciones.push({
                id: gasto.id,
                mes,
                concepto: conceptoNuevo,
                monto: montoNuevo,
                cuotaNro: nro,
                cuotaTotal: nuevoTotal
            });
        }
    }

    // --- Altas: crecer después de la última en alcance --------------
    // Conceptos ya usados por mes, para no duplicar. Arranca con lo
    // que había en la base y se va completando con cada alta.
    const conceptosPorMes = {};
    if (esObjeto(cuotasPorMes)) {
        for (const mes of Object.keys(cuotasPorMes)) {
            const lista = cuotasPorMes[mes];
            if (!Array.isArray(lista)) continue;
            conceptosPorMes[mes] = new Set(
                lista.filter(esObjeto).map(g => normalizarTexto(g.concepto))
            );
        }
    }

    for (let nro = conservar + 1; nro <= nuevoTotal; nro++) {
        const mes = mesDesplazado(ultimaMes, nro - conservar);
        const concepto = formatearCuota(baseFinal, nro, nuevoTotal);
        const clave = normalizarTexto(concepto);

        if (!conceptosPorMes[mes]) conceptosPorMes[mes] = new Set();

        if (conceptosPorMes[mes].has(clave)) {
            plan.avisos.push({
                codigo: 'duplicado',
                tipo: 'info',
                mensaje: `Se omitió "${concepto}" porque ya existe una cuota con ese nombre en ${mes}.`
            });
            continue;
        }
        conceptosPorMes[mes].add(clave);

        plan.altas.push({
            mes,
            gasto: {
                id: generarId(),
                concepto,
                categoria: 'Cuotas',
                monto: montoDe(nro - 1),
                pagado: false,
                grupoId: String(grupoId),
                cuotaNro: nro,
                cuotaTotal: nuevoTotal
            }
        });
    }

    return plan;
}

