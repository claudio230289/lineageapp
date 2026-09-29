/* =========================================================
   GENERADOR DE IDs ÚNICOS (js/utils/id.js)
   Evita colisiones de Date.now() con componente aleatorio
   ========================================================= */

/**
 * Genera un ID único combinando timestamp y componente aleatorio
 * @returns {string} ID único en formato "timestamp-random"
 */
export function generarId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
