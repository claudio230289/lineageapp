/* =========================================================
   MÓDULO DE LISTAS DE COMPRA (js/compras.js)
   Integración con DOM, persistencia en db/nube/local y db.gastos
   ========================================================= */

import { db, guardarTodo, auth } from './db.js';
import { formatARS, obtenerMesActual } from './calculos.js';
import { generarId } from './utils/id.js';
import { mostrarNotificacion, notificarExito, notificarError } from './notificaciones.js';
import {
    crearItemCompra,
    calcularTotalesCompras,
    toggleItemComprado,
    editarItemCompra,
    eliminarItemCompra,
    limpiarComprados,
    filtrarCompras,
    prepararGastoDesdeCompras,
    agruparComprasPorCategoria,
    obtenerCategoriasDisponibles,
    agregarCategoriaPersonalizada,
    obtenerMetadatosCategoria
} from './compras/nucleo.js';

let itemEditandoId = null;
let filtroEstadoActual = 'todos'; // 'todos' | 'pendientes' | 'comprados'
let filtroCategoriaActual = 'todas';
let filtroTextoActual = '';
const acordeonesComprasCerrados = new Set();

/**
 * Obtiene la clave de almacenamiento seguro para compras.
 */
function obtenerStorageKey() {
    const uid = auth?.currentUser?.uid || (db && (db.uid || db.user?.uid));
    return uid ? `compras_lineage_${uid}` : 'compras_lineage_anon';
}

/**
 * Carga la lista de compras desde db.compras o fallback a localStorage.
 * @returns {Array<Object>}
 */
export function cargarListaCompras() {
    if (db && Array.isArray(db.compras) && db.compras.length > 0) {
        return db.compras;
    }

    try {
        const key = obtenerStorageKey();
        const guardado = localStorage.getItem(key);
        if (guardado) {
            const parseado = JSON.parse(guardado);
            if (Array.isArray(parseado) && parseado.length > 0) {
                if (db) db.compras = parseado;
                return parseado;
            }
        }

        const fallbackGeneral = localStorage.getItem('finanzas_db_fallback');
        if (fallbackGeneral) {
            const parsed = JSON.parse(fallbackGeneral);
            if (Array.isArray(parsed?.compras) && parsed.compras.length > 0) {
                if (db) db.compras = parsed.compras;
                return parsed.compras;
            }
        }
    } catch (e) {
        console.warn('[compras] Error al leer compras desde storage:', e);
    }

    if (db && Array.isArray(db.compras)) {
        return db.compras;
    }
    if (db) db.compras = [];
    return [];
}

/**
 * Persiste la lista de compras en db.compras, localStorage y en la nube vía guardarTodo.
 * @param {Array<Object>} lista
 */
export function guardarListaCompras(lista) {
    const listaNormalizada = Array.isArray(lista) ? lista : [];
    if (db) {
        db.compras = listaNormalizada;
    }

    try {
        const key = obtenerStorageKey();
        localStorage.setItem(key, JSON.stringify(listaNormalizada));
    } catch (e) {
        console.error('[compras] Error al persistir compras en localStorage:', e);
    }

    guardarTodo('edicion').catch(err => {
        console.warn('[compras] Error al guardar compras en nube:', err);
    });
}

/**
 * Carga las categorías personalizadas desde db.comprasCategorias o localStorage.
 * @returns {Array<string>}
 */
export function cargarCategoriasCompras() {
    if (db && Array.isArray(db.comprasCategorias) && db.comprasCategorias.length > 0) {
        return db.comprasCategorias;
    }

    try {
        const key = `compras_cats_${obtenerStorageKey()}`;
        const guardado = localStorage.getItem(key);
        if (guardado) {
            const parseado = JSON.parse(guardado);
            if (Array.isArray(parseado) && parseado.length > 0) {
                if (db) db.comprasCategorias = parseado;
                return parseado;
            }
        }

        const fallbackGeneral = localStorage.getItem('finanzas_db_fallback');
        if (fallbackGeneral) {
            const parsed = JSON.parse(fallbackGeneral);
            if (Array.isArray(parsed?.comprasCategorias) && parsed.comprasCategorias.length > 0) {
                if (db) db.comprasCategorias = parsed.comprasCategorias;
                return parsed.comprasCategorias;
            }
        }
    } catch (e) {
        console.warn('[compras] Error al leer categorías desde storage:', e);
    }

    if (db && Array.isArray(db.comprasCategorias)) {
        return db.comprasCategorias;
    }
    if (db) db.comprasCategorias = [];
    return [];
}

/**
 * Persiste las categorías personalizadas en db.comprasCategorias, localStorage y nube.
 * @param {Array<string>} categorias
 */
export function guardarCategoriasCompras(categorias) {
    const normalizadas = Array.isArray(categorias) ? categorias : [];
    if (db) {
        db.comprasCategorias = normalizadas;
    }

    try {
        const key = `compras_cats_${obtenerStorageKey()}`;
        localStorage.setItem(key, JSON.stringify(normalizadas));
    } catch (e) {
        console.warn('[compras] Error al guardar categorías en local:', e);
    }

    guardarTodo('edicion').catch(err => {
        console.warn('[compras] Error al guardar categorías en nube:', err);
    });
}

/**
 * Llena el select de categorías con las opciones predeterminadas y personalizadas.
 * @param {string|null} [categoriaASeleccionar=null]
 */
export function poblarSelectCategorias(categoriaASeleccionar = null) {
    const select = document.getElementById('compra-categoria');
    if (!select) return;

    const personalizadas = cargarCategoriasCompras();
    const items = cargarListaCompras();
    const todas = obtenerCategoriasDisponibles(personalizadas, items);

    const actual = categoriaASeleccionar || select.value || 'Supermercado';

    const opcionesHTML = todas.map(cat => {
        const sel = (cat.toLowerCase() === actual.toLowerCase()) ? 'selected' : '';
        return `<option value="${escapeHTML(cat)}" ${sel}>${escapeHTML(cat)}</option>`;
    }).join('');

    select.innerHTML = `
        ${opcionesHTML}
        <option value="__NUEVA__" class="font-bold text-indigo-600">+ Nueva categoría...</option>
    `;

    if (todas.some(c => c.toLowerCase() === actual.toLowerCase())) {
        const coincidente = todas.find(c => c.toLowerCase() === actual.toLowerCase());
        select.value = coincidente;
    } else {
        select.value = todas[0] || 'Supermercado';
    }
}

/**
 * Abre un diálogo interactivo para crear una nueva categoría de compra personalizada.
 * @returns {string|null} Nombre de la categoría creada o null si se canceló
 */
export function crearNuevaCategoriaCompra() {
    const nombre = prompt('Ingresá el nombre de la nueva categoría para tu lista de compras:');
    if (nombre === null) {
        poblarSelectCategorias();
        return null;
    }

    const limpio = nombre.trim();
    if (!limpio) {
        mostrarNotificacion('El nombre de la categoría no puede estar vacío.', 'warning');
        poblarSelectCategorias();
        return null;
    }

    const personalizadas = cargarCategoriasCompras();
    const resultado = agregarCategoriaPersonalizada(personalizadas, limpio);
    guardarCategoriasCompras(resultado.categorias);
    poblarSelectCategorias(resultado.categoria);

    if (resultado.yaExistia) {
        mostrarNotificacion(`La categoría "${resultado.categoria}" ya existe.`, 'info');
    } else {
        notificarExito(`Categoría "${resultado.categoria}" creada.`);
    }

    return resultado.categoria;
}

/**
 * Manejador del cambio de selección en el dropdown de categorías.
 * @param {Event|HTMLSelectElement} [eventoOElem]
 */
export function manejarCambioCategoriaCompra(eventoOElem) {
    const selectElem = eventoOElem?.target || (eventoOElem?.tagName === 'SELECT' ? eventoOElem : document.getElementById('compra-categoria'));
    if (!selectElem) return;
    if (selectElem.value === '__NUEVA__') {
        crearNuevaCategoriaCompra();
    }
}

/**
 * Alterna el estado abierto/cerrado de un acordeón de categoría de compras.
 * @param {string} categoria
 */
export function toggleAcordeonCompra(categoria) {
    if (!categoria) return;
    if (acordeonesComprasCerrados.has(categoria)) {
        acordeonesComprasCerrados.delete(categoria);
    } else {
        acordeonesComprasCerrados.add(categoria);
    }
    renderizarCompras();
}

/**
 * Despliega todos los acordeones de categorías.
 */
export function expandirTodasCompras() {
    acordeonesComprasCerrados.clear();
    renderizarCompras();
}

/**
 * Contrae todos los acordeones de categorías.
 */
export function contraerTodasCompras() {
    const lista = cargarListaCompras();
    const itemsFiltrados = filtrarCompras(lista, {
        texto: filtroTextoActual,
        filtroEstado: filtroEstadoActual,
        categoria: filtroCategoriaActual
    });
    const grupos = agruparComprasPorCategoria(itemsFiltrados);
    grupos.forEach(g => acordeonesComprasCerrados.add(g.categoria));
    renderizarCompras();
}

/**
 * Maneja el submit del formulario para agregar o editar un ítem.
 */
export function guardarItemCompra(e) {
    if (e) e.preventDefault();

    const inputNombre = document.getElementById('compra-nombre');
    const inputCantidad = document.getElementById('compra-cantidad');
    const inputPrecio = document.getElementById('compra-precio');
    const selectCategoria = document.getElementById('compra-categoria');

    if (!inputNombre) return;

    const nombre = inputNombre.value.trim();
    if (!nombre) {
        mostrarNotificacion('Por favor, ingresá el nombre del artículo.', 'warning');
        inputNombre.focus();
        return;
    }

    const cantidad = inputCantidad?.value.trim() || '1 u';
    const precioEstimado = inputPrecio?.value.trim() || '0';
    let categoria = selectCategoria?.value || 'Supermercado';

    if (categoria === '__NUEVA__') {
        const nueva = crearNuevaCategoriaCompra();
        categoria = nueva || 'Supermercado';
    }

    let lista = cargarListaCompras();

    if (itemEditandoId) {
        lista = editarItemCompra(lista, itemEditandoId, {
            nombre,
            cantidad,
            precioEstimado,
            categoria
        });
        notificarExito(`Artículo "${nombre}" actualizado.`);
        itemEditandoId = null;
        const btnSubmit = document.getElementById('btn-guardar-compra');
        if (btnSubmit) btnSubmit.innerText = 'Agregar a la Lista';
        const btnCancelar = document.getElementById('btn-cancelar-edicion-compra');
        if (btnCancelar) btnCancelar.classList.add('hidden');
    } else {
        const nuevo = crearItemCompra({
            nombre,
            cantidad,
            precioEstimado,
            categoria
        });
        lista.push(nuevo);
        notificarExito(`Artículo "${nombre}" agregado a la lista.`);
    }

    guardarListaCompras(lista);

    inputNombre.value = '';
    if (inputCantidad) inputCantidad.value = '';
    if (inputPrecio) inputPrecio.value = '';
    inputNombre.focus();

    renderizarCompras();
}

/**
 * Carga un ítem en el formulario para edición.
 */
export function iniciarEdicionCompra(id) {
    const lista = cargarListaCompras();
    const item = lista.find(i => String(i.id) === String(id));
    if (!item) return;

    itemEditandoId = item.id;

    const inputNombre = document.getElementById('compra-nombre');
    const inputCantidad = document.getElementById('compra-cantidad');
    const inputPrecio = document.getElementById('compra-precio');
    const selectCategoria = document.getElementById('compra-categoria');
    const btnSubmit = document.getElementById('btn-guardar-compra');
    const btnCancelar = document.getElementById('btn-cancelar-edicion-compra');

    if (inputNombre) inputNombre.value = item.nombre;
    if (inputCantidad) inputCantidad.value = item.cantidad || '';
    if (inputPrecio) inputPrecio.value = item.precioEstimado ? String(item.precioEstimado) : '';

    poblarSelectCategorias(item.categoria || 'Supermercado');
    if (selectCategoria) selectCategoria.value = item.categoria || 'Supermercado';

    if (btnSubmit) btnSubmit.innerText = 'Guardar Cambios';
    if (btnCancelar) btnCancelar.classList.remove('hidden');

    inputNombre?.focus();
}

/**
 * Cancela la edición activa.
 */
export function cancelarEdicionCompra() {
    itemEditandoId = null;
    const inputNombre = document.getElementById('compra-nombre');
    const inputCantidad = document.getElementById('compra-cantidad');
    const inputPrecio = document.getElementById('compra-precio');
    const btnSubmit = document.getElementById('btn-guardar-compra');
    const btnCancelar = document.getElementById('btn-cancelar-edicion-compra');

    if (inputNombre) inputNombre.value = '';
    if (inputCantidad) inputCantidad.value = '';
    if (inputPrecio) inputPrecio.value = '';
    if (btnSubmit) btnSubmit.innerText = 'Agregar a la Lista';
    if (btnCancelar) btnCancelar.classList.add('hidden');
}

/**
 * Tilda o destilda un ítem de la lista.
 */
export function toggleItemCompra(id) {
    let lista = cargarListaCompras();
    lista = toggleItemComprado(lista, id);
    guardarListaCompras(lista);
    renderizarCompras();
}

/**
 * Elimina un ítem de la lista.
 */
export function eliminarItemCompraHandler(id) {
    let lista = cargarListaCompras();
    const item = lista.find(i => String(i.id) === String(id));
    const nombre = item ? item.nombre : 'el artículo';

    if (!confirm(`¿Deseás eliminar "${nombre}" de la lista?`)) return;

    lista = eliminarItemCompra(lista, id);
    if (itemEditandoId === id) {
        cancelarEdicionCompra();
    }
    guardarListaCompras(lista);
    notificarExito(`Artículo "${nombre}" eliminado.`);
    renderizarCompras();
}

/**
 * Limpia todos los ítems marcados como comprados.
 */
export function limpiarComprasCompradas() {
    let lista = cargarListaCompras();
    const comprados = lista.filter(i => i.comprado);
    if (comprados.length === 0) {
        mostrarNotificacion('No hay artículos comprados para limpiar.', 'info');
        return;
    }

    if (!confirm(`¿Eliminar los ${comprados.length} artículos ya comprados de la lista?`)) return;

    lista = limpiarComprados(lista);
    guardarListaCompras(lista);
    notificarExito(`Se limpiaron ${comprados.length} artículos comprados.`);
    renderizarCompras();
}

/**
 * Vacía la lista completa con confirmación.
 */
export function vaciarListaCompras() {
    const lista = cargarListaCompras();
    if (lista.length === 0) {
        mostrarNotificacion('La lista ya está vacía.', 'info');
        return;
    }

    if (!confirm('¿Estás seguro de que querés vaciar toda la lista de compras?')) return;

    guardarListaCompras([]);
    cancelarEdicionCompra();
    notificarExito('Lista de compras vaciada.');
    renderizarCompras();
}

/**
 * Pasa los artículos comprados a Gastos Únicos del mes activo en Finanzas.
 */
export async function pasarCompraAGastos() {
    const lista = cargarListaCompras();
    const plan = prepararGastoDesdeCompras(lista, {
        concepto: 'Supermercado - Lista de compra',
        soloComprados: true
    });

    if (!plan.valido) {
        const pendientes = lista.length;
        if (pendientes > 0 && confirm('No hay artículos marcados como comprados.\n\n¿Deseás pasar el TOTAL ESTIMADO de toda la lista a Gastos del mes?')) {
            const planTotal = prepararGastoDesdeCompras(lista, {
                concepto: 'Supermercado - Lista de compra',
                soloComprados: false
            });
            if (planTotal.valido) {
                await ejecutarPaseAGastos(planTotal, lista, false);
            } else {
                mostrarNotificacion(planTotal.error || 'Error al calcular el total.', 'warning');
            }
        } else {
            mostrarNotificacion(plan.error || 'No hay artículos para pasar.', 'warning');
        }
        return;
    }

    const concepto = prompt(
        `Pasar a Gastos del Mes (${plan.cantidadItems} artículos - ${formatARS(plan.montoTotal)}):\n\nIngresá el concepto del gasto:`,
        plan.concepto
    );

    if (concepto === null) return;

    plan.concepto = concepto.trim() || plan.concepto;
    await ejecutarPaseAGastos(plan, lista, true);
}

async function ejecutarPaseAGastos(plan, lista, fueronSoloComprados) {
    try {
        const mesActivo = db.mesActivo || obtenerMesActual();
        if (!db.gastos) db.gastos = {};
        if (!db.gastos[mesActivo]) db.gastos[mesActivo] = [];

        const nuevoGasto = {
            id: generarId(),
            concepto: plan.concepto,
            monto: plan.montoTotal,
            categoria: 'unicos',
            pagado: true,
            fecha: new Date().toISOString()
        };

        db.gastos[mesActivo].push(nuevoGasto);

        const limpiar = confirm(
            `¡Gasto registrado con éxito en ${mesActivo} por ${formatARS(plan.montoTotal)}!\n\n¿Deseás quitar los artículos pasados de tu lista de compras?`
        );

        if (limpiar) {
            const nuevaLista = fueronSoloComprados
                ? limpiarComprados(lista)
                : [];
            guardarListaCompras(nuevaLista);
        }

        if (typeof window.guardarYRenderizar === 'function') {
            await window.guardarYRenderizar('manual');
        } else {
            await guardarTodo();
            if (typeof window.renderizarTodo === 'function') window.renderizarTodo();
        }

        renderizarCompras();
        notificarExito(`Gasto "${plan.concepto}" (${formatARS(plan.montoTotal)}) registrado en ${mesActivo}.`);
    } catch (err) {
        console.error('[compras] Error al pasar compra a gastos:', err);
        notificarError('No se pudo registrar el gasto en el mes activo.');
    }
}

function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function setFiltroEstadoCompras(estado) {
    filtroEstadoActual = estado;
    renderizarCompras();
}

/**
 * Renderiza la interfaz completa de compras:
 * Tarjetas de totales consolidados, estado de filtros, selector de categorías y acordeones agrupados.
 */
export function renderizarCompras() {
    // Sincronizar categorías en el select si existe
    poblarSelectCategorias();

    const lista = cargarListaCompras();
    const totales = calcularTotalesCompras(lista);

    // 1. Tarjetas Resumen Globales
    const cardTotal = document.getElementById('compras-tot-estimado');
    const cardComprados = document.getElementById('compras-tot-comprados');
    const cardPendiente = document.getElementById('compras-tot-pendiente');
    const badgeProgreso = document.getElementById('compras-badge-progreso');

    if (cardTotal) cardTotal.innerText = formatARS(totales.totalEstimado);
    if (cardComprados) {
        cardComprados.innerText = `${formatARS(totales.totalComprados)} (${totales.cantidadComprados}/${totales.cantidadTotal})`;
    }
    if (cardPendiente) cardPendiente.innerText = formatARS(totales.totalPendiente);
    if (badgeProgreso) {
        badgeProgreso.innerText = `${totales.porcentajeCompletado}% comprado`;
        badgeProgreso.className = `text-[10px] font-bold px-2 py-0.5 rounded-full ${
            totales.porcentajeCompletado === 100
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-indigo-100 text-indigo-700'
        }`;
    }

    // 2. Filtros
    const inputBuscar = document.getElementById('compras-buscar');
    if (inputBuscar) {
        filtroTextoActual = inputBuscar.value.trim();
    }
    const selectCat = document.getElementById('compras-filtro-categoria');
    if (selectCat) {
        filtroCategoriaActual = selectCat.value;
    }

    ['todos', 'pendientes', 'comprados'].forEach(est => {
        const btn = document.getElementById(`btn-filtro-compra-${est}`);
        if (btn) {
            if (filtroEstadoActual === est) {
                btn.className = 'px-3 py-1 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm';
            } else {
                btn.className = 'px-3 py-1 rounded-xl text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition';
            }
        }
    });

    // 3. Renderizar Lista Agrupada en Acordeones
    const contenedorLista = document.getElementById('lista-items-compras');
    if (!contenedorLista) return;

    const itemsFiltrados = filtrarCompras(lista, {
        texto: filtroTextoActual,
        filtroEstado: filtroEstadoActual,
        categoria: filtroCategoriaActual
    });

    if (itemsFiltrados.length === 0) {
        contenedorLista.innerHTML = `
            <div class="text-center py-8 text-gray-400 space-y-2">
                <i class="fa-solid fa-basket-shopping text-3xl text-gray-300"></i>
                <p class="text-xs">No hay artículos en esta vista.</p>
                <span class="text-[10px] text-gray-400">Usá el formulario para cargar artículos a tu lista.</span>
            </div>
        `;
        return;
    }

    const grupos = agruparComprasPorCategoria(itemsFiltrados);

    contenedorLista.innerHTML = grupos.map(grupo => {
        const estaAbierto = !acordeonesComprasCerrados.has(grupo.categoria);
        const meta = obtenerMetadatosCategoria(grupo.categoria);

        const itemsHTML = grupo.items.map(item => {
            const estaComprado = Boolean(item.comprado);
            const estiloTexto = estaComprado
                ? 'line-through text-gray-400'
                : 'font-semibold text-gray-800';
            const estiloFila = estaComprado
                ? 'bg-gray-50/70 border-gray-100 opacity-75'
                : 'bg-white border-gray-200 hover:border-indigo-200 shadow-xs';

            return `
                <div class="flex items-center justify-between p-2.5 rounded-xl border transition ${estiloFila} gap-3" data-compra-id="${escapeHTML(item.id)}">
                    <div class="flex items-center space-x-3 flex-1 min-w-0">
                        <input 
                            type="checkbox" 
                            ${estaComprado ? 'checked' : ''} 
                            onchange="window.toggleItemCompra('${escapeHTML(item.id)}')"
                            class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 cursor-pointer transition"
                            title="Marcar como comprado"
                        >
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center space-x-2">
                                <span class="text-xs truncate ${estiloTexto}">${escapeHTML(item.nombre)}</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-mono font-medium">${escapeHTML(item.cantidad)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center space-x-2 sm:space-x-3">
                        <span class="font-mono text-xs font-bold ${estaComprado ? 'text-gray-400' : 'text-gray-900'}">
                            ${formatARS(item.precioEstimado)}
                        </span>
                        <button 
                            type="button" 
                            onclick="window.iniciarEdicionCompra('${escapeHTML(item.id)}')" 
                            class="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 p-1.5 rounded-lg text-xs transition" 
                            title="Editar"
                            aria-label="Editar"
                        >
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button 
                            type="button" 
                            onclick="window.eliminarItemCompra('${escapeHTML(item.id)}')" 
                            class="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg text-xs transition" 
                            title="Eliminar"
                            aria-label="Eliminar"
                        >
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200">
                <button type="button"
                        data-categoria-compra="${escapeHTML(grupo.categoria)}"
                        onclick="window.toggleAcordeonCompra(this.dataset.categoriaCompra)"
                        class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50/80 transition focus:outline-none bg-gray-50/60"
                        aria-expanded="${estaAbierto ? 'true' : 'false'}">
                    <div class="flex items-center space-x-2.5 min-w-0">
                        <span class="w-8 h-8 rounded-xl flex items-center justify-center text-xs border ${meta.colorBadge} flex-shrink-0">
                            <i class="${meta.icono}"></i>
                        </span>
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-bold text-gray-800 truncate">${escapeHTML(grupo.categoria)}</span>
                                <span class="text-[10px] font-medium text-gray-500 bg-gray-200/80 px-2 py-0.5 rounded-full">
                                    ${grupo.cantidadTotal} ${grupo.cantidadTotal === 1 ? 'ítem' : 'ítems'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center space-x-3 text-right flex-shrink-0">
                        <div class="text-right">
                            <div class="text-xs font-mono font-bold text-gray-900">
                                <span class="text-[10px] font-normal text-gray-500 mr-1">Subtotal:</span>${formatARS(grupo.totalEstimado)}
                            </div>
                            ${grupo.totalPendiente > 0 && grupo.totalComprados > 0 ? `
                                <div class="text-[10px] font-mono font-medium text-amber-700">
                                    Pendiente: ${formatARS(grupo.totalPendiente)}
                                </div>
                            ` : ''}
                        </div>
                        <i class="fa-solid fa-chevron-down text-xs text-gray-400 transition-transform duration-200 ${estaAbierto ? 'rotate-180 text-indigo-600' : ''}"></i>
                    </div>
                </button>

                ${estaAbierto ? `
                    <div class="p-3 border-t border-gray-100 space-y-2 bg-white">
                        ${itemsHTML}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

window.guardarItemCompra = guardarItemCompra;
window.iniciarEdicionCompra = iniciarEdicionCompra;
window.cancelarEdicionCompra = cancelarEdicionCompra;
window.toggleItemCompra = toggleItemCompra;
window.eliminarItemCompra = eliminarItemCompraHandler;
window.limpiarComprasCompradas = limpiarComprasCompradas;
window.vaciarListaCompras = vaciarListaCompras;
window.pasarCompraAGastos = pasarCompraAGastos;
window.setFiltroEstadoCompras = setFiltroEstadoCompras;
window.renderizarCompras = renderizarCompras;
window.crearNuevaCategoriaCompra = crearNuevaCategoriaCompra;
window.manejarCambioCategoriaCompra = manejarCambioCategoriaCompra;
window.toggleAcordeonCompra = toggleAcordeonCompra;
window.expandirTodasCompras = expandirTodasCompras;
window.contraerTodasCompras = contraerTodasCompras;
window.poblarSelectCategorias = poblarSelectCategorias;
