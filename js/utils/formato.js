/* =========================================================
   FORMATO DE IMPORTES (js/utils/formato.js)
   =========================================================
   Función pura de presentación de dinero en pesos argentinos.
   Vive separada de los cálculos para poder testearse sin cargar
   el estado global ni Firebase.
   ========================================================= */

import { aNumero } from '../calculos/nucleo.js';

/**
 * Formatea un importe como pesos argentinos: $ 1.234.567,89
 *
 * @param {*} valor Cualquier valor; se convierte de forma defensiva
 * @returns {string} Importe formateado con signo $ y 2 decimales
 */
export function formatARS(valor) {
    return '$ ' + aNumero(valor).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}