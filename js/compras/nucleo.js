/* =========================================================
   NÚCLEO DEL MÓDULO DE LISTAS DE COMPRA (js/compras/nucleo.js)
   Lógica pura, libre de DOM, Firebase y localStorage.
   ========================================================= */

import { aNumero } from '../calculos/nucleo.js';

/**
 * Categorías estándar sugeridas para ítems de compra.
 */
export const CATEGORIAS_COMPRA = [
    'Supermercado',
    'Verdulería / Frutería',
    'Carnicería',
    'Farmacia',
    'Hogar y Limpieza',
    'Kiosco / Almacén',
    'Mascotas',
    'Otros'
];

/**
 * Crea un ítem de compra normalizado.
 *
 * @param {Object} datos
 * @param {string} datos.nombre
 * @param {string} [datos.cantidad]
 * @param {number|string} [datos.precioEstimado]
 * @param {string} [datos.categoria]
 * @param {boolean} [datos.comprado]
 * @param {string} [datos.id]
 * @returns {Object} Ítem creado
 */
export function crearItemCompra({
    id = null,
    nombre = '',
    cantidad = '1 u',
    precioEstimado = 0,
    categoria = 'Supermercado',
    comprado = false,
    fecha = null
} = {}) {
    const nombreLimpio = String(nombre || '').trim();
    if (!nombreLimpio) {
        throw new Error('El nombre o artículo de la compra es obligatorio.');
    }

    const precio = Math.max(0, aNumero(precioEstimado));
    const cantLimpia = String(cantidad || '1 u').trim() || '1 u';
    const catLimpia = String(categoria || 'Supermercado').trim() || 'Supermercado';

    return {
        id: id || `compra_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        nombre: nombreLimpio,
        cantidad: cantLimpia,
        precioEstimado: precio,
        categoria: catLimpia,
        comprado: Boolean(comprado),
        fecha: fecha || new Date().toISOString()
    };
}

/**
 * Calcula los totales consolidados de la lista de compras.
 *
 * @param {Array<Object>} items
 * @returns {{
 *   totalEstimado: number,
 *   totalComprados: number,
 *   totalPendiente: number,
 *   cantidadTotal: number,
 *   cantidadComprados: number,
 *   cantidadPendientes: number,
 *   porcentajeCompletado: number
 * }}
 */
export function calcularTotalesCompras(items = []) {
    if (!Array.isArray(items)) {
        return {
            totalEstimado: 0,
            totalComprados: 0,
            totalPendiente: 0,
            cantidadTotal: 0,
            cantidadComprados: 0,
            cantidadPendientes: 0,
            porcentajeCompletado: 0
        };
    }

    let totalEstimado = 0;
    let totalComprados = 0;
    let cantidadComprados = 0;

    for (const item of items) {
        if (!item) continue;
        const precio = Math.max(0, aNumero(item.precioEstimado));
        totalEstimado += precio;
        if (item.comprado) {
            totalComprados += precio;
            cantidadComprados += 1;
        }
    }

    const cantidadTotal = items.length;
    const cantidadPendientes = cantidadTotal - cantidadComprados;
    const totalPendiente = Math.max(0, totalEstimado - totalComprados);
    const porcentajeCompletado = cantidadTotal > 0
        ? Math.round((cantidadComprados / cantidadTotal) * 100)
        : 0;

    return {
        totalEstimado,
        totalComprados,
        totalPendiente,
        cantidadTotal,
        cantidadComprados,
        cantidadPendientes,
        porcentajeCompletado
    };
}

/**
 * Alterna el estado comprado/pendiente de un ítem.
 *
 * @param {Array<Object>} items
 * @param {string} id
 * @returns {Array<Object>} Nueva lista
 */
export function toggleItemComprado(items = [], id) {
    if (!Array.isArray(items) || !id) return items;
    return items.map(item => {
        if (item && String(item.id) === String(id)) {
            return { ...item, comprado: !item.comprado };
        }
        return item;
    });
}

/**
 * Modifica los datos de un ítem existente.
 *
 * @param {Array<Object>} items
 * @param {string} id
 * @param {Object} nuevosDatos
 * @returns {Array<Object>} Nueva lista
 */
export function editarItemCompra(items = [], id, nuevosDatos = {}) {
    if (!Array.isArray(items) || !id) return items;
    return items.map(item => {
        if (item && String(item.id) === String(id)) {
            const precio = nuevosDatos.precioEstimado !== undefined
                ? Math.max(0, aNumero(nuevosDatos.precioEstimado))
                : item.precioEstimado;
            const nombre = nuevosDatos.nombre !== undefined
                ? String(nuevosDatos.nombre).trim() || item.nombre
                : item.nombre;
            const cantidad = nuevosDatos.cantidad !== undefined
                ? String(nuevosDatos.cantidad).trim() || item.cantidad
                : item.cantidad;
            const categoria = nuevosDatos.categoria !== undefined
                ? String(nuevosDatos.categoria).trim() || item.categoria
                : item.categoria;

            return {
                ...item,
                nombre,
                cantidad,
                precioEstimado: precio,
                categoria
            };
        }
        return item;
    });
}

/**
 * Elimina un ítem por id.
 *
 * @param {Array<Object>} items
 * @param {string} id
 * @returns {Array<Object>} Nueva lista
 */
export function eliminarItemCompra(items = [], id) {
    if (!Array.isArray(items) || !id) return items;
    return items.filter(item => item && String(item.id) !== String(id));
}

/**
 * Remueve todos los ítems marcados como comprados.
 *
 * @param {Array<Object>} items
 * @returns {Array<Object>} Lista filtrada con sólo los pendientes
 */
export function limpiarComprados(items = []) {
    if (!Array.isArray(items)) return [];
    return items.filter(item => item && !item.comprado);
}

/**
 * Filtra los ítems por texto (nombre/categoría) y estado.
 *
 * @param {Array<Object>} items
 * @param {Object} [filtros]
 * @returns {Array<Object>}
 */
export function filtrarCompras(items = [], { texto = '', filtroEstado = 'todos', categoria = 'todas' } = {}) {
    if (!Array.isArray(items)) return [];

    const textoMin = String(texto || '').trim().toLowerCase();
    const catMin = String(categoria || 'todas').trim().toLowerCase();

    return items.filter(item => {
        if (!item) return false;

        // Filtro por estado
        if (filtroEstado === 'pendientes' && item.comprado) return false;
        if (filtroEstado === 'comprados' && !item.comprado) return false;

        // Filtro por categoría
        if (catMin !== 'todas' && String(item.categoria || '').toLowerCase() !== catMin) {
            return false;
        }

        // Filtro por texto
        if (textoMin) {
            const matchNombre = String(item.nombre || '').toLowerCase().includes(textoMin);
            const matchCat = String(item.categoria || '').toLowerCase().includes(textoMin);
            const matchCant = String(item.cantidad || '').toLowerCase().includes(textoMin);
            if (!matchNombre && !matchCat && !matchCant) return false;
        }

        return true;
    });
}

/**
 * Prepara la carga de un gasto único a partir de los ítems de compra.
 *
 * @param {Array<Object>} items Lista completa de compras
 * @param {Object} [opciones]
 * @param {string} [opciones.concepto] Concepto personalizado (ej: "Supermercado - Lista de compra")
 * @param {boolean} [opciones.soloComprados=true] Si es true, toma los marcados; si false, toma toda la lista.
 * @returns {{
 *   valido: boolean,
 *   montoTotal: number,
 *   concepto: string,
 *   cantidadItems: number,
 *   itemsTransferidos: Array<Object>,
 *   error?: string
 * }}
 */
export function prepararGastoDesdeCompras(items = [], { concepto = '', soloComprados = true } = {}) {
    if (!Array.isArray(items) || items.length === 0) {
        return {
            valido: false,
            montoTotal: 0,
            concepto: '',
            cantidadItems: 0,
            itemsTransferidos: [],
            error: 'La lista de compras está vacía.'
        };
    }

    const seleccionados = soloComprados
        ? items.filter(i => i && i.comprado)
        : items.filter(Boolean);

    if (seleccionados.length === 0) {
        return {
            valido: false,
            montoTotal: 0,
            concepto: '',
            cantidadItems: 0,
            itemsTransferidos: [],
            error: soloComprados
                ? 'No hay ningún artículo marcado como comprado para pasar a gastos.'
                : 'No hay artículos en la lista.'
        };
    }

    let montoTotal = 0;
    for (const it of seleccionados) {
        montoTotal += Math.max(0, aNumero(it.precioEstimado));
    }

    if (montoTotal <= 0) {
        return {
            valido: false,
            montoTotal: 0,
            concepto: '',
            cantidadItems: seleccionados.length,
            itemsTransferidos: seleccionados,
            error: 'El importe total a pasar debe ser mayor a cero.'
        };
    }

    const conceptoFinal = String(concepto || '').trim() || 'Supermercado - Lista de compra';

    return {
        valido: true,
        montoTotal,
        concepto: conceptoFinal,
        cantidadItems: seleccionados.length,
        itemsTransferidos: seleccionados
    };
}
