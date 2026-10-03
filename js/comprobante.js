/* =========================================================
   COMPROBANTE DE PAGOS (js/comprobante.js)
   =========================================================
   Construcción del recibo: función pura, sin DOM, sin
   window.open y sin confirm. Recibe los datos y devuelve el
   texto y los totales; abrir WhatsApp es responsabilidad de
   la capa de UI (js/app.js).

   Por qué separarlo: el comprobante es la salida que el usuario
   lee y a veces archiva. Que la lógica esté en un módulo que se
   puede testear sin navegador es lo que garantiza que un gasto
   marcado como pagado no vuelva a salir como pendiente.
   ========================================================= */

import { esPagado, aNumero, normalizarTexto } from './calculos/nucleo.js';
import { formatARS } from './utils/formato.js';

/* ---------- Filtro ---------- */

/**
 * Filtra gastos por concepto, sin distinguir mayúsculas, tildes
 * ni acentos. Un mismo criterio para la lista y para el filtro,
 * así lo que se ve en pantalla es exactamente lo que va al
 * comprobante.
 *
 * @param {Array} gastos Lista completa de gastos del mes
 * @param {string} filtro Texto buscado; vacío o ausente trae todo
 * @returns {Array} Subconjunto filtrado
 */
export function filtrarPorConcepto(gastos, filtro) {
    const lista = Array.isArray(gastos) ? gastos : [];
    const texto = normalizarTexto(filtro);
    if (!texto) return lista.slice();
    return lista.filter(g => g && normalizarTexto(g.concepto).includes(texto));
}

/* ---------- Fechas ---------- */

/**
 * Convierte "YYYY-MM" en "MM/AAAA" para mostrar en el comprobante.
 *
 * @param {string} mes Clave de mes, por ejemplo "2026-10"
 * @returns {string} "10/2026", o el texto original si no tiene formato válido
 */
export function formatearPeriodo(mes) {
    if (typeof mes !== 'string') return '';
    const partes = mes.trim().split('-');
    if (partes.length !== 2) return mes;
    const [anio, numero] = partes;
    if (!/^\d{4}$/.test(anio) || !/^\d{2}$/.test(numero)) return mes;
    return `${numero}/${anio}`;
}

/**
 * Fecha y hora de emisión, con dos decimales-free y separador claro.
 *
 * @param {Date} fecha Instancia de Date; se usa new Date() por defecto
 * @returns {string} "DD/MM/AAAA HH:MM"
 */
export function formatearFechaHora(fecha) {
    const d = fecha instanceof Date && !Number.isNaN(fecha.getTime()) ? fecha : new Date();
    const dosDigitos = n => String(n).padStart(2, '0');
    return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()} `
        + `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

/* ---------- Totales ---------- */

/**
 * Calcula los totales de una lista de gastos ya filtrada.
 *
 * El reparto entre pagado y pendiente usa SIEMPRE esPagado, el
 * mismo predicado que usa el resto de la app, y monto usa
 * aNumero, que nunca devuelve NaN. Así el total, el detalle y
 * las tarjetas de la pantalla no pueden discrepar.
 *
 * @param {Array} gastos
 * @returns {{total:number, pagado:number, pendientes:number, salado:boolean, items:Array}}
 */
export function calcularTotalesComprobante(gastos) {
    const lista = Array.isArray(gastos) ? gastos : [];

    let total = 0;
    let pagado = 0;
    let pendientes = 0;
    const items = lista.map(g => {
        const monto = aNumero(g ? g.monto : 0);
        const abonado = esPagado(g);
        total += monto;
        if (abonado) pagado += monto;
        else pendientes += monto;
        return {
            concepto: (g && g.concepto) || 'Sin concepto',
            categoria: (g && g.categoria) || 'Sin categoría',
            monto,
            abonado
        };
    });

    // Tolerancia de $5 (criterio del usuario: "una diferencia menor a
    // 5 pesos se considera saldada").
    //
    // Antes era 0,005, con el argumento técnico de que la aritmética
    // con porcentajes deja fracciones de centavo. Ese argumento ya
    // no aplica: el criterio ahora es de negocio, no de redondeo. Los
    // $5 son ruido frente a gastos de cientos de miles, y una
    // cuenta con 3 pesos de diferencia no sirve de recordatorio.
    //
    // El límite es EXCLUSIVO a propósito, siguiendo la frase
    // "menor a": exactamente $5,00 sigue siendo PENDIENTE. Si algún
    // día el criterio resulta ser "hasta 5", es `<=` y nada más.
    const SALDO_TOLERANTE = 5;
    const salado = pendientes < SALDO_TOLERANTE;

    return { total, pagado, pendientes, salado, items };
}

/* ---------- Comprobante ---------- */

/**
 * Construye el comprobante de pagos listo para compartir.
 *
 * @param {Object} opciones
 * @param {Array}  opciones.gastos      Gastos del período (sin filtrar)
 * @param {string} [opciones.filtro]    Texto del filtro activo, si hubo
 * @param {string} [opciones.periodo]   Clave de mes "YYYY-MM"
 * @param {Date}   [opciones.fechaEmision] Momento de emisión; se inyecta para tests deterministas
 * @returns {{texto:string, total:number, pagado:number, pendientes:number, salado:boolean, items:Array, cantidadItems:number, vacio:boolean}}
 */
export function construirComprobante({ gastos, filtro = '', periodo = '', fechaEmision = new Date() } = {}) {
    const seleccionados = filtrarPorConcepto(gastos, filtro);
    const { total, pagado, pendientes, salado, items } = calcularTotalesComprobante(seleccionados);

    // Los pagos van con ✓ y lo que falta con ○, para que el estado
    // de cada concepto se lea de un vistazo en el chat.
    const lineasItems = items.length
        ? items.map(item => `${item.abonado ? '✓' : '○'} ${item.concepto} — ${formatARS(item.monto)} (${item.categoria})`)
        : ['(sin conceptos para este filtro)'];

    const estado = salado ? 'SALDADO' : 'PENDIENTE';
    const detalleFiltro = normalizarTexto(filtro) ? `Filtro: ${filtro.trim()}` : null;

    const lineas = [
        '*COMPROBANTE DE PAGOS*',
        '------------------------------',
        `Periodo: ${formatearPeriodo(periodo) || 'sin periodo'}`,
        `Emitido: ${formatearFechaHora(fechaEmision)}`,
        ...(detalleFiltro ? [detalleFiltro] : []),
        '',
        '*Conceptos:*',
        ...lineasItems,
        '',
        `Total a pagar: ${formatARS(total)}`,
        `Abonado: ${formatARS(pagado)}`,
        `Pendiente: ${formatARS(pendientes)}`,
        '',
        `*Estado de cuenta: ${estado}*`
    ];

    return {
        texto: lineas.join('\n'),
        total,
        pagado,
        pendientes,
        salado,
        items,
        cantidadItems: items.length,
        vacio: items.length === 0
    };
}