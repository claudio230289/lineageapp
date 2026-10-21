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
    'Verdulería',
    'Carnicería',
    'Farmacia',
    'Hogar',
    'Limpieza',
    'Otros'
];

export const CATEGORIAS_PREDETERMINADAS = CATEGORIAS_COMPRA;

/**
 * Obtiene la lista unificada y deduplicada de categorías disponibles
 * (predeterminadas + personalizadas creadas por el usuario + usadas en ítems).
 *
 * @param {Array<string>} [personalizadas=[]]
 * @param {Array<Object>} [items=[]]
 * @returns {Array<string>}
 */
export function obtenerCategoriasDisponibles(personalizadas = [], items = []) {
    const lista = [...CATEGORIAS_PREDETERMINADAS];
    const existentes = new Set(lista.map(c => c.trim().toLowerCase()));

    if (Array.isArray(personalizadas)) {
        for (const cat of personalizadas) {
            const limpia = String(cat || '').trim();
            if (limpia && !existentes.has(limpia.toLowerCase())) {
                lista.push(limpia);
                existentes.add(limpia.toLowerCase());
            }
        }
    }

    if (Array.isArray(items)) {
        for (const it of items) {
            const cat = String(it?.categoria || '').trim();
            if (cat && !existentes.has(cat.toLowerCase())) {
                lista.push(cat);
                existentes.add(cat.toLowerCase());
            }
        }
    }

    return lista;
}

/**
 * Agrega una nueva categoría personalizada si no existe en la lista.
 *
 * @param {Array<string>} actuales Categorías personalizadas existentes
 * @param {string} nuevaCategoria Nombre de la nueva categoría
 * @returns {{
 *   exito: boolean,
 *   categorias: Array<string>,
 *   categoria: string,
 *   yaExistia?: boolean,
 *   error?: string
 * }}
 */
export function agregarCategoriaPersonalizada(actuales = [], nuevaCategoria = '') {
    const limpia = String(nuevaCategoria || '').trim();
    if (!limpia) {
        return {
            exito: false,
            categorias: Array.isArray(actuales) ? [...actuales] : [],
            categoria: '',
            error: 'El nombre de la categoría no puede estar vacío.'
        };
    }

    const todas = obtenerCategoriasDisponibles(actuales);
    const coincidencia = todas.find(c => c.toLowerCase() === limpia.toLowerCase());
    if (coincidencia) {
        return {
            exito: true,
            categorias: Array.isArray(actuales) ? [...actuales] : [],
            categoria: coincidencia,
            yaExistia: true
        };
    }

    const nuevas = Array.isArray(actuales) ? [...actuales, limpia] : [limpia];
    return {
        exito: true,
        categorias: nuevas,
        categoria: limpia,
        yaExistia: false
    };
}

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

/**
 * Agrupa los ítems de compra por su categoría y calcula subtotales por grupo.
 *
 * @param {Array<Object>} items
 * @returns {Array<{
 *   categoria: string,
 *   items: Array<Object>,
 *   totalEstimado: number,
 *   totalComprados: number,
 *   totalPendiente: number,
 *   cantidadTotal: number,
 *   cantidadComprados: number,
 *   cantidadPendientes: number
 * }>}
 */
export function agruparComprasPorCategoria(items = []) {
    if (!Array.isArray(items)) return [];

    const gruposMap = new Map();

    for (const item of items) {
        if (!item) continue;
        const cat = String(item.categoria || 'Otros').trim() || 'Otros';
        if (!gruposMap.has(cat)) {
            gruposMap.set(cat, []);
        }
        gruposMap.get(cat).push(item);
    }

    const resultado = [];
    for (const [categoria, grupoItems] of gruposMap.entries()) {
        const totales = calcularTotalesCompras(grupoItems);
        resultado.push({
            categoria,
            items: grupoItems,
            totalEstimado: totales.totalEstimado,
            totalComprados: totales.totalComprados,
            totalPendiente: totales.totalPendiente,
            cantidadTotal: totales.cantidadTotal,
            cantidadComprados: totales.cantidadComprados,
            cantidadPendientes: totales.cantidadPendientes
        });
    }

    return resultado;
}

/**
 * Obtiene el ícono y estilo de badge de una categoría para UI consistente.
 *
 * @param {string} categoria
 * @returns {{ icono: string, colorBadge: string }}
 */
export function obtenerMetadatosCategoria(categoria = '') {
    const catNorm = String(categoria || '').trim().toLowerCase();

    if (catNorm.includes('supermercado')) {
        return { icono: 'fa-solid fa-basket-shopping', colorBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    if (catNorm.includes('verduler') || catNorm.includes('frut')) {
        return { icono: 'fa-solid fa-carrot', colorBadge: 'bg-lime-100 text-lime-800 border-lime-200' };
    }
    if (catNorm.includes('carnicer') || catNorm.includes('carne')) {
        return { icono: 'fa-solid fa-drumstick-bite', colorBadge: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    if (catNorm.includes('farmacia') || catNorm.includes('salud') || catNorm.includes('medic')) {
        return { icono: 'fa-solid fa-pills', colorBadge: 'bg-sky-100 text-sky-800 border-sky-200' };
    }
    if (catNorm.includes('limpieza')) {
        return { icono: 'fa-solid fa-soap', colorBadge: 'bg-cyan-100 text-cyan-800 border-cyan-200' };
    }
    if (catNorm.includes('hogar')) {
        return { icono: 'fa-solid fa-house', colorBadge: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    if (catNorm.includes('kiosco') || catNorm.includes('almac')) {
        return { icono: 'fa-solid fa-cookie-bite', colorBadge: 'bg-orange-100 text-orange-800 border-orange-200' };
    }
    if (catNorm.includes('mascota')) {
        return { icono: 'fa-solid fa-paw', colorBadge: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    return { icono: 'fa-solid fa-tag', colorBadge: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
}

/**
 * Obtiene la lista de compras desde un objeto de base de datos.
 *
 * @param {Object} dbObj
 * @param {Array<Object>} [fallback=[]]
 * @returns {Array<Object>}
 */
export function obtenerComprasDesdeDb(dbObj, fallback = []) {
    if (dbObj && Array.isArray(dbObj.compras)) {
        return dbObj.compras;
    }
    return Array.isArray(fallback) ? fallback : [];
}

/**
 * Sincroniza la lista de compras en el objeto de base de datos.
 *
 * @param {Object} dbObj
 * @param {Array<Object>} lista
 * @returns {Array<Object>}
 */
export function sincronizarComprasEnDb(dbObj, lista = []) {
    if (!dbObj || typeof dbObj !== 'object') return [];
    dbObj.compras = Array.isArray(lista) ? lista : [];
    return dbObj.compras;
}

/**
 * Sincroniza las categorías personalizadas en el objeto de base de datos.
 *
 * @param {Object} dbObj
 * @param {Array<string>} categorias
 * @returns {Array<string>}
 */
export function sincronizarCategoriasEnDb(dbObj, categorias = []) {
    if (!dbObj || typeof dbObj !== 'object') return [];
    dbObj.comprasCategorias = Array.isArray(categorias) ? categorias : [];
    return dbObj.comprasCategorias;
}
