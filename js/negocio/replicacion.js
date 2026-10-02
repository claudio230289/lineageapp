/* =========================================================
   REPLICACIÓN DE INGRESOS (js/negocio/replicacion.js)
   =========================================================
   Capa de negocio pura. No toca el DOM ni guarda nada: primero
   se PLANIFICA (función pura) y después se APLICA sobre la base.

   Por qué en dos pasos: la operación puede tocar hasta 24 meses
   y, si el destino ya tiene ingresos cargados, hay que avisarle
   a la persona antes de fusionar o sobrescribir. Planificar
   primero permite mostrar exactamente cuántos ingresos se van a
   agregar, cuántos se omiten y cuántos chocan, antes de tocar
   un solo dato.

   Idempotencia: cada ingreso se identifica por una clave
   (concepto + tipo + modo). Como el plan se arma comparando esa
   clave contra lo que ya hay en cada mes destino, pulsar el
   botón dos veces seguidas no duplica nada: la segunda pasada
   no encuentra altas ni conflictos.
   ========================================================= */

import { aNumero, normalizarTexto } from '../calculos/nucleo.js';
import { generarId } from '../utils/id.js';

/**
 * Clave de identidad de un ingreso dentro de un mes.
 *
 * Se usa concepto + tipo + modo a propósito. Con sólo el concepto
 * se perdían ingresos legítimos distintos que comparten nombre
 * (por ejemplo "Sueldo" como básico y como remunerativo), y la
 * replicación se comía uno de los dos.
 *
 * @param {*} ingreso
 * @returns {string} Clave normalizada
 */
export function claveIngreso(ingreso) {
    if (!ingreso) return '';
    const concepto = normalizarTexto(ingreso.concepto);
    const tipo = normalizarTexto(ingreso.tipo);
    const modo = normalizarTexto(ingreso.modo || 'importe');
    return `${concepto}|${tipo}|${modo}`;
}

/**
 * Compara dos ingresos por su contenido económico.
 *
 * Se compara el valor ya convertido a número para que "1000" y
 * 1000 no cuenten como diferencia, con una tolerancia de un
 * centavo para las fracciones que deja el cálculo por porcentaje.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean} true si son equivalentes
 */
export function ingresosEquivalentes(a, b) {
    if (!a || !b) return false;
    if (claveIngreso(a) !== claveIngreso(b)) return false;
    return Math.abs(aNumero(a.valor) - aNumero(b.valor)) <= 0.005;
}

/**
 * Calcula el plan de replicación SIN modificar nada.
 *
 * Estrategias:
 *   - 'omitir'      agrega lo que falta y jamás toca lo existente
 *   - 'fusionar'    agrega lo que falta; lo que existe pero difiere
 *                   queda anotado como conflicto y NO se modifica
 *   - 'sobrescribir' agrega lo que falta y reemplaza lo que difiere
 *
 * @param {Object} opciones
 * @param {Array}  opciones.origen     Ingresos del mes actual
 * @param {Array}  opciones.destinos   Claves de mes "YYYY-MM" destino
 * @param {string} [opciones.estrategia] 'omitir' | 'fusionar' | 'sobrescribir'
 * @returns {Object} Plan con el detalle por mes y un resumen
 */
export function planificarReplicacion({ origen, destinos, estrategia = 'omitir' } = {}) {
    const listaOrigen = Array.isArray(origen) ? origen.filter(Boolean) : [];
    const listaDestinos = Array.isArray(destinos) ? destinos.filter(Boolean) : [];
    const modo = estrategia === 'fusionar' || estrategia === 'sobrescribir' ? estrategia : 'omitir';

    const meses = listaDestinos.map(mes => {
        const existentes = Array.isArray(mes.lista) ? mes.lista : [];
        return analizarMes(listaOrigen, mes, existentes, modo);
    });

    const resumen = meses.reduce((acc, m) => {
        acc.totalAltas += m.altas.length;
        acc.totalOmitidos += m.omitidos.length;
        acc.totalConflictos += m.conflictos.length;
        acc.totalSobrescrituras += m.sobrescrituras.length;
        if (m.existentes.length > 0) acc.mesesConDatos += 1;
        if (m.altas.length > 0 || m.sobrescrituras.length > 0) acc.mesesAModificar += 1;
        return acc;
    }, {
        totalAltas: 0,
        totalOmitidos: 0,
        totalConflictos: 0,
        totalSobrescrituras: 0,
        mesesConDatos: 0,
        mesesAModificar: 0
    });

    return {
        origen: listaOrigen,
        destinos: listaDestinos,
        estrategia: modo,
        meses,
        resumen,
        // "Vacío" significa que no hay nada que decidir, no sólo que no
        // haya altas. Un plan que sólo trae conflictos SÍ tiene algo
        // que resolver: hay que preguntarle a la persona si se
        // sobreescribe. Si se contara sólo con las altas, el conflict
        // se perdería y la función cortaría antes de preguntar.
        vacio: resumen.totalAltas === 0 && resumen.totalSobrescrituras === 0 && resumen.totalConflictos === 0,
        requiereConfirmacion: resumen.totalConflictos > 0
    };
}

/**
 * Analiza un mes destino contra los ingresos de origen.
 * @private
 */
function analizarMes(origen, destino, existentes, modo) {
    const indiceExistente = new Map();
    for (const ing of existentes) {
        if (ing) indiceExistente.set(claveIngreso(ing), ing);
    }

    const altas = [];
    const omitidos = [];
    const conflictos = [];
    const sobrescrituras = [];

    for (const ing of origen) {
        const clave = claveIngreso(ing);
        const existente = indiceExistente.get(clave);

        if (!existente) {
            // Alta pura: la clave no existe en el mes destino.
            altas.push({ ...ing, id: generarId() });
            continue;
        }

        if (ingresosEquivalentes(existente, ing)) {
            // Ya está el mismo ingreso: no se toca nada. Esto es lo
            // que hace idempotente al botón.
            omitidos.push({ clave, concepto: ing.concepto, existente });
            continue;
        }

        // Misma clave pero distinto valor: es un conflicto real.
        conflictos.push({ clave, concepto: ing.concepto, valorOrigen: aNumero(ing.valor), valorExistente: aNumero(existente.valor) });

        if (modo === 'sobrescribir') {
            sobrescrituras.push({ ...ing, id: generarId() });
        }
    }

    return {
        mes: destino.mes,
        lista: existentes,
        altas,
        omitidos,
        conflictos,
        sobrescrituras,
        existentes
    };
}

/**
 * Aplica un plan sobre la base de datos.
 *
 * Es la única función de este módulo que muta. Recibe la base
 * completa para poder resolver los meses destino, y devuelve un
 * resumen de lo efectivamente aplicado.
 *
 * @param {Object} db Base de la aplicación (se modifica en el sitio)
 * @param {Object} plan Salida de planificarReplicacion
 * @returns {{mesesModificados:number, ingresosAgregados:number, ingresosSobrescritos:number}}
 */
export function aplicarPlan(db, plan) {
    const resumen = { mesesModificados: 0, ingresosAgregados: 0, ingresosSobrescritos: 0 };
    if (!db || !plan || !Array.isArray(plan.meses)) return resumen;

    if (!db.ingresos || typeof db.ingresos !== 'object') db.ingresos = {};

    for (const detalle of plan.meses) {
        if (!detalle || !detalle.mes) continue;
        if (detalle.altas.length === 0 && detalle.sobrescrituras.length === 0) continue;

        const mes = detalle.mes;
        if (!Array.isArray(db.ingresos[mes])) db.ingresos[mes] = [];

        // Para sobrescribir hay que sacar primero el ingreso que
        // ocupa la misma clave, si no quedaría el viejo y el nuevo
        // juntos y el mes sumaría el importe dos veces.
        const clavesSobrescritas = new Set(detalle.sobrescrituras.map(ing => claveIngreso(ing)));

        if (detalle.sobrescrituras.length > 0) {
            db.ingresos[mes] = db.ingresos[mes].filter(ing => !clavesSobrescritas.has(claveIngreso(ing)));
            db.ingresos[mes].push(...detalle.sobrescrituras);
            resumen.ingresosSobrescritos += detalle.sobrescrituras.length;
        }

        if (detalle.altas.length > 0) {
            db.ingresos[mes].push(...detalle.altas);
            resumen.ingresosAgregados += detalle.altas.length;
        }

        resumen.mesesModificados += 1;
    }

    return resumen;
}