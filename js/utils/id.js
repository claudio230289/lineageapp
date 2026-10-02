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

/**
 * Compara dos identificadores tolerando la mezcla de tipos.
 *
 * Necesario porque conviven dos formatos en la misma base: los
 * IDs nuevos de generarId() son string ("1761000000000-a1b2c3d4"),
 * y los creados antes por `Date.now() + Math.random()` son number.
 * La comparación estricta (===) haría que un clic sobre un
 * registro legacy no encontrara nada y el botón pareciera muerto.
 *
 * Al delegar eventos el ID llega siempre como string desde
 * dataset, así que sin esta normalización clickear un registro
 * viejo no haría nada.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean} true si representan el mismo registro
 */
export function coincideId(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return String(a) === String(b);
}
