/* =========================================================
   PLAN DE CUOTAS: LÓGICA PURA (js/negocio/cuotas-plan.js)
   =========================================================
   Capa de negocio pura para editar un plan de cuotas. No toca
   el DOM ni importa db.js: recibe el mapa de gastos por mes y
   devuelve un PLAN (qué actualizar, qué agregar, qué quitar)
   sin mutar nada. La mutación la aplica js/app.js.

   POR QUÉ EXISTE ESTE MÓDULO
   --------------------------
   `guardarEdicionPlanCuotas` vivía en js/app.js, que importa
   Firebase por URL y no se puede cargar en Node. Por eso el bug
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

   DECISIÓN DE NUMERACIÓN
   ----------------------
   El editor modela el plan como "lo que queda por pagar": el
   total se precarga con la CANTIDAD de cuotas en alcance y esas
   cuotas se renumeran 1..N dentro del alcance. Las cuotas pagadas
   o de meses pasados conservan su numeración histórica y no se
   tocan. Es la única forma de que "total" y "número de cuota"
   sean coherentes entre sí tras crecer o reducir.
   ========================================================= */

import { aNumero, esPagado, mesDesplazado, normalizarCategoria } from '../calculos/nucleo.js';
import { formatearCuota, parsearCuota } from '../version.js';
import { generarId } from '../utils/id.js';

/** ¿Es un objeto plano (no array, no null)? Tolerante a basura. */
function esObjetoPlano(valor) {
    return !!valor && typeof valor === 'object' && !Array.isArray(valor);
}

/**
 * Ordena dos entradas {mes, gasto} por mes y, dentro del mes, por
 * número de cuota. El orden importa para saber cuál es "la última
 * en alcance" (dónde se agregan las cuotas nuevas) y cuál es la
 * cola que se quita al reducir.
 */
function compararCuotas(a, b) {
    if (a.mes !== b.mes) return a.mes < b.mes ? -1 : 1;
    return aNumero(a.gasto && a.gasto.cuotaNro) - aNumero(b.gasto && b.gasto.cuotaNro);
}

/**
 * Reúne las cuotas de un plan que SÍ se pueden editar: mismo
 * `grupoId`, mes >= `mesActivo` y no pagadas.
 *
 * `listaGastosPorMes` es el mapa completo de la app
 * `{ 'YYYY-MM': [gasto, ...] }` (db.gastos). Se recibe entero para
 * poder recorrer todos los meses cargados.
 *
 * La comparación de meses es lexicográfica y funciona porque la
 * clave es "YYYY-MM" con cero a la izquierda: '2026-06' < '2026-07'.
 * Un mes corrupto (por ejemplo '2026-6') simplemente puede quedar
 * fuera del alcance, nunca rompe el recorrido.
 *
 * @param {Object} listaGastosPorMes Mapa { 'YYYY-MM': Array<Gasto> }
 * @param {string} grupoId Grupo del plan
 * @param {string} mesActivo "YYYY-MM" del mes activo de la app
 * @returns {Array<{mes:string, gasto:Object}>} Ordenado por mes y cuotaNro
 */
export function cuotasEnAlcance(listaGastosPorMes, grupoId, mesActivo) {
    const mapa = esObjetoPlano(listaGastosPorMes) ? listaGastosPorMes : {};
    const objetivo = String(grupoId);
    const desde = String(mesActivo);
    const cuotas = [];

    for (const mes of Object.keys(mapa)) {
        const lista = Array.isArray(mapa[mes]) ? mapa[mes] : [];
        for (const gasto of lista) {
            if (!esObjetoPlano(gasto)) continue;
            // Sólo cuotas: un gasto de otra categoría que herede un
            // grupoId no debe entrar en el plan.
            if (normalizarCategoria(gasto.categoria) !== 'cuotas') continue;
            if (String(gasto.grupoId) !== objetivo) continue;
            // Meses anteriores al activo: intocables.
            if (mes < desde) continue;
            // Pagadas: intocables.
            if (esPagado(gasto)) continue;

            cuotas.push({ mes, gasto });
        }
    }

    cuotas.sort(compararCuotas);
    return cuotas;
}

/**
 * Calcula, SIN mutar nada, el plan de edición de un plan de cuotas.
 *
 * Entrada:
 *   - cuotasPorMes : mapa completo { 'YYYY-MM': Array<Gasto> }
 *   - grupoId      : grupo del plan que se edita
 *   - mesActual    : "YYYY-MM" del mes activo
 *   - base         : concepto base nuevo (sin la parte "(Cuota n/total)")
 *   - montos       : (opcional) montos deseados por cuota EN ALCANCE,
 *                    en orden. Si falta una posición o el array no se
 *                    pasa, esa cuota CONSERVA su monto actual. Pasar
 *                    los montos actuales es lo que evita aplanar un
 *                    plan de montos variables al guardar sin cambios.
 *   - nuevoTotal   : total de cuotas que tendrá el plan EN ALCANCE
 *
 * Salida (todo calculado, nada aplicado):
 *   - actualizaciones : [{ mes, id, concepto, monto, cuotaNro, cuotaTotal }]
 *                       sólo para cuotas en alcance que cambian de verdad
 *   - altas           : [{ mes, gasto }] cuotas nuevas, después de la última en alcance
 *   - bajas           : [{ mes, id }] cuotas de la cola en alcance que se quitan
 *   - avisos          : [{ codigo, tipo, mensaje }] para mostrar en pantalla
 *
 * Reglas:
 *   1. Crecer: agrega cuotas DESPUÉS de la última en alcance, con el
 *      mismo grupoId, evitando duplicar por concepto en el mes destino
 *      (mismo criterio que generarCuotasPlan).
 *   2. Reducir: quita SÓLO la cola en alcance. Nunca toca una cuota
 *      fuera de alcance, aunque el total pedido sea menor.
 *   3. Renumerar y reescribir concepto/monto: SÓLO en alcance.
 *
 * @param {Object} opciones
 * @returns {{actualizaciones:Array, altas:Array, bajas:Array, avisos:Array}}
 */
export function planificarEdicionPlan({
    cuotasPorMes,
    grupoId,
    mesActual,
    base,
    montos,
    nuevoTotal
} = {}) {
    const mapa = esObjetoPlano(cuotasPorMes) ? cuotasPorMes : {};
    const objetivo = String(grupoId);
    const enAlcance = cuotasEnAlcance(mapa, objetivo, mesActual);

    const actualizaciones = [];
    const altas = [];
    const bajas = [];
    const avisos = [];

    if (enAlcance.length === 0) {
        avisos.push({
            codigo: 'sin-cuotas-en-alcance',
            tipo: 'warning',
            mensaje: 'El plan no tiene cuotas pendientes del mes actual ni de meses futuros.'
        });
        return { actualizaciones, altas, bajas, avisos };
    }

    const total = Number.isFinite(Number(nuevoTotal)) ? Math.floor(Number(nuevoTotal)) : 0;
    if (total < 1) {
        avisos.push({ codigo: 'total-invalido', tipo: 'warning', mensaje: 'El total de cuotas debe ser 1 o más.' });
        return { actualizaciones, altas, bajas, avisos };
    }

    // Base efectiva: si no la pasaron, se deriva del concepto de la
    // primera cuota en alcance. parsearCuota devuelve null si el
    // concepto no tiene el formato esperado; en ese caso se usa el
    // concepto crudo (tolerancia a datos sucios).
    let nombreBase = typeof base === 'string' ? base.trim() : '';
    if (!nombreBase) {
        const partes = parsearCuota(enAlcance[0].gasto.concepto);
        nombreBase = partes ? partes.base : String(enAlcance[0].gasto.concepto || '').trim();
    }

    const listaMontos = Array.isArray(montos) ? montos : null;

    // Monto deseado de la cuota en alcance de índice `i`: el que pasó
    // el llamador si existe, o el actual si no (preservar).
    const montosActuales = enAlcance.map(c => aNumero(c.gasto.monto));
    const montoDeseado = (i) => {
        if (listaMontos && listaMontos[i] !== undefined && listaMontos[i] !== null) {
            return aNumero(listaMontos[i]);
        }
        return montosActuales[i];
    };

    // 1. Cuotas en alcance que se conservan (renumeradas 1..total) y,
    //    si el total es menor, la cola que se quita.
    const conservadas = enAlcance.slice(0, total);
    const removidas = total < enAlcance.length ? enAlcance.slice(total) : [];

    // 2. Aviso de aplanado: el plan tenía montos distintos y la
    //    edición los dejaría todos iguales. Se avisa en vez de hacerlo
    //    en silencio.
    const montosDeseados = conservadas.map((_, i) => montoDeseado(i));
    const originalVariable = new Set(montosActuales.map(String)).size > 1;
    const quedariaUniforme = new Set(montosDeseados.map(String)).size <= 1;
    if (originalVariable && quedariaUniforme && conservadas.length > 1) {
        avisos.push({
            codigo: 'aplanado',
            tipo: 'warning',
            mensaje: 'El plan tenía montos distintos por cuota y quedará con un único monto. ' +
                'Para conservar los montos, dejá el monto del plan sin cambios y editá cada cuota por separado.'
        });
    }

    // 3. Actualizaciones: sólo si algo cambia de verdad. Comparar
    //    evita reescribir cuando el valor es idéntico.
    conservadas.forEach((c, i) => {
        const nro = i + 1;
        const monto = montoDeseado(i);
        const concepto = formatearCuota(nombreBase, nro, total);
        const gasto = c.gasto;

        const cambia = gasto.concepto !== concepto
            || aNumero(gasto.monto) !== monto
            || aNumero(gasto.cuotaNro) !== nro
            || aNumero(gasto.cuotaTotal) !== total;

        if (cambia) {
            actualizaciones.push({
                mes: c.mes,
                id: gasto.id,
                concepto,
                monto,
                cuotaNro: nro,
                cuotaTotal: total
            });
        }
    });

    // 4. Bajas: sólo la cola en alcance (por definición, impaga).
    for (const c of removidas) {
        bajas.push({ mes: c.mes, id: c.gasto.id });
    }

    // 5. Altas: nuevas cuotas después de la última en alcance, con el
    //    mismo grupoId. El monto de las nuevas es el de la última
    //    posición conocida (o 0 si no hay referencia).
    if (total > enAlcance.length) {
        const ultima = enAlcance[enAlcance.length - 1];
        const montoAltas = montoDeseado(enAlcance.length - 1);

        for (let nro = enAlcance.length + 1; nro <= total; nro++) {
            const mes = mesDesplazado(ultima.mes, nro - enAlcance.length);
            const concepto = formatearCuota(nombreBase, nro, total);
            const existentesMes = Array.isArray(mapa[mes]) ? mapa[mes] : [];

            // Mismo criterio de deduplicación que generarCuotasPlan:
            // la misma cuota ya cargada en ese mes no se duplica.
            if (existentesMes.some(g => esObjetoPlano(g) && g.concepto === concepto)) {
                avisos.push({
                    codigo: 'duplicado',
                    tipo: 'info',
                    mensaje: `No se agregó "${concepto}": ya existe una cuota con ese concepto en ${mes}.`
                });
                continue;
            }

            altas.push({
                mes,
                gasto: {
                    id: generarId(),
                    concepto,
                    categoria: 'Cuotas',
                    monto: montoAltas,
                    pagado: false,
                    grupoId: objetivo,
                    cuotaNro: nro,
                    cuotaTotal: total
                }
            });
        }
    }

    return { actualizaciones, altas, bajas, avisos };
}
