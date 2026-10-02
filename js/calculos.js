/* =========================================================
   MÓDULO DE CÁLCULOS FINANCIEROS (js/calculos.js)
   =========================================================
   Adaptador delgado: conserva las firmas públicas que ya
   consume la app y delega el cálculo real a js/calculos/nucleo.js,
   que es puro y testeable sin Firebase ni DOM.

   Regla de la casa: la lógica de negocio NO debe importar db.js.
   Este archivo sí lo hace, y es deliberado, porque es el único
   punto donde se resuelve el estado global. Toda función nueva
   de cálculo va en nucleo.js recibiendo los datos por parámetro.
   ========================================================= */

import { db } from './db.js';
import {
    calcularNetoDesde,
    calcularGastosDesde,
    calcularPasivoDesde
} from './calculos/nucleo.js';

export { formatARS } from './utils/formato.js';
export {
    aNumero,
    normalizarTexto,
    normalizarCategoria,
    esPagado
} from './calculos/nucleo.js';

/**
 * Neto de ingresos del mes indicado.
 * @param {string} mes "YYYY-MM"
 * @returns {{rem:number, norem:number, ded:number, neto:number}}
 */
export function calcularNetoMes(mes) {
    return calcularNetoDesde((db.ingresos && db.ingresos[mes]) || []);
}

/**
 * Desglose de gastos del mes indicado.
 * @param {string} mes "YYYY-MM"
 * @returns {{fijos:number, unicos:number, cuotas:number, total:number, pagado:number, pendientes:number}}
 */
export function calcularGastosMes(mes) {
    return calcularGastosDesde((db.gastos && db.gastos[mes]) || []);
}

/**
 * Deuda pendiente de las cuotas que matcheen una palabra clave,
 * considerando todos los meses cargados.
 * @param {string} keyword
 * @returns {{totalDeuda:number, cuotasRestantes:number}}
 */
export function calcularPasivoPorKeyword(keyword) {
    return calcularPasivoDesde(db.gastos || {}, keyword);
}

/**
 * Mes actualmente seleccionado en la app.
 * @returns {string} "YYYY-MM"
 */
export function obtenerMesActual() {
    return db.mesActivo;
}