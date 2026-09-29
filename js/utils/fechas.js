/* =========================================================
   UTILIDADES DE FECHAS (js/utils/fechas.js)
   Funciones reutilizables para cálculos de meses
   ========================================================= */

/**
 * Genera una lista de meses futuros a partir de un mes dado
 * @param {string} mesActual - Mes en formato "YYYY-MM"
 * @param {number} cantidad - Cantidad de meses a generar
 * @returns {string[]} Lista de meses en formato "YYYY-MM"
 */
export function generarMesesFuturos(mesActual, cantidad) {
    const meses = [];
    let [y, m] = mesActual.split('-').map(Number);
    for (let i = 0; i < cantidad; i++) {
        m++;
        if (m > 12) { m = 1; y++; }
        meses.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return meses;
}

/**
 * Genera una lista de meses entre dos fechas
 * @param {string} mesInicio - Mes inicial en formato "YYYY-MM"
 * @param {string} mesFin - Mes final en formato "YYYY-MM"
 * @returns {string[]} Lista de meses en formato "YYYY-MM"
 */
export function generarMesesEntre(mesInicio, mesFin) {
    const meses = [];
    let [y, m] = mesInicio.split('-').map(Number);
    const [fy, fm] = mesFin.split('-').map(Number);
    while (y < fy || (y === fy && m <= fm)) {
        meses.push(`${y}-${String(m).padStart(2, '0')}`);
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return meses;
}

/**
 * Obtiene el nombre del mes
 * @param {number} numero - Número del mes (1-12)
 * @param {boolean} corto - Si devuelve nombre corto (Ene) o largo (Enero)
 * @returns {string} Nombre del mes
 */
export function obtenerNombreMes(numero, corto = false) {
    const largos = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const cortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return corto ? cortos[numero - 1] : largos[numero - 1];
}

/**
 * Obtiene el mes siguiente
 * @param {string} mes - Mes en formato "YYYY-MM"
 * @returns {string} Mes siguiente en formato "YYYY-MM"
 */
export function obtenerMesSiguiente(mes) {
    let [y, m] = mes.split('-').map(Number);
    m++;
    if (m > 12) { m = 1; y++; }
    return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Obtiene el mes anterior
 * @param {string} mes - Mes en formato "YYYY-MM"
 * @returns {string} Mes anterior en formato "YYYY-MM"
 */
export function obtenerMesAnterior(mes) {
    let [y, m] = mes.split('-').map(Number);
    m--;
    if (m < 1) { m = 12; y--; }
    return `${y}-${String(m).padStart(2, '0')}`;
}
