/* =========================================================
   MÓDULO DE LISTAS DE COMPRA (js/compras.js)
   Integración con DOM, persistencia local y db.gastos
   ========================================================= */

import { db, guardarTodo } from './db.js';
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
    prepararGastoDesdeCompras
} from './compras/nucleo.js';

let itemEditandoId = null;
let filtroEstadoActual = 'todos'; // 'todos' | 'pendientes' | 'comprados'
let filtroCategoriaActual = 'todas';
let filtroTextoActual = '';

/**
 * Obtiene la clave de almacenamiento seguro para compras.
 */
function obtenerStorageKey() {
    const uid = db && (db.uid || db.user?.uid);
    return uid ? `compras_lineage_${uid}` : 'compras_lineage_anon';
}

/**
 * Carga la lista de compras desde localStorage o memoria.
 * @returns {Array<Object>}
 */
export function cargarListaCompras() {
    try {
        const key = obtenerStorageKey();
        const guardado = localStorage.getItem(key);
        if (guardado) {
            const parseado = JSON.parse(guardado);
            if (Array.isArray(parseado)) {
                return parseado;
            }
        }
    } catch (e) {
        console.warn('[compras] Error al leer compras desde storage:', e);
    }
    return [];
}

/**
 * Persiste la lista de compras en localStorage.
 * @param {Array<Object>} lista
 */
export function guardarListaCompras(lista) {
    try {
        const key = obtenerStorageKey();
        localStorage.setItem(key, JSON.stringify(lista || []));
        if (db) {
            db.compras = lista;
        }
    } catch (e) {
        console.error('[compras] Error al persistir compras:', e);
    }
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
    const categoria = selectCategoria?.value || 'Supermercado';

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

export function renderizarCompras() {
    const lista = cargarListaCompras();
    const totales = calcularTotalesCompras(lista);

    // 1. Tarjetas Resumen
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
                btn.className = 'px-3 py-1 rounded-xl text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200';
            }
        }
    });

    // 3. Renderizar Lista
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

    contenedorLista.innerHTML = itemsFiltrados.map(item => {
        const estaComprado = Boolean(item.comprado);
        const estiloTexto = estaComprado
            ? 'line-through text-gray-400'
            : 'font-semibold text-gray-800';
        const estiloFila = estaComprado
            ? 'bg-gray-50 border-gray-200 opacity-75'
            : 'bg-white border-gray-200 hover:border-indigo-200 shadow-sm';

        return `
            <div class="flex items-center justify-between p-3 rounded-2xl border transition ${estiloFila} gap-3" data-compra-id="${escapeHTML(item.id)}">
                <div class="flex items-center space-x-3 flex-1 min-w-0">
                    <input 
                        type="checkbox" 
                        ${estaComprado ? 'checked' : ''} 
                        onchange="window.toggleItemCompra('${escapeHTML(item.id)}')"
                        class="w-5 h-5 rounded-lg text-indigo-600 focus:ring-indigo-500 border-gray-300 cursor-pointer transition"
                        title="Marcar como comprado"
                    >
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center space-x-2">
                            <span class="text-xs truncate ${estiloTexto}">${escapeHTML(item.nombre)}</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-mono font-medium">${escapeHTML(item.cantidad)}</span>
                        </div>
                        <div class="flex items-center space-x-2 mt-0.5">
                            <span class="text-[10px] text-indigo-600 font-medium">${escapeHTML(item.categoria)}</span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center space-x-3">
                    <span class="font-mono text-xs font-bold ${estaComprado ? 'text-gray-400' : 'text-gray-900'}">
                        ${formatARS(item.precioEstimado)}
                    </span>
                    <button 
                        type="button" 
                        onclick="window.iniciarEdicionCompra('${escapeHTML(item.id)}')" 
                        class="text-gray-400 hover:text-indigo-600 p-1 text-xs" 
                        title="Editar"
                    >
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button 
                        type="button" 
                        onclick="window.eliminarItemCompra('${escapeHTML(item.id)}')" 
                        class="text-gray-400 hover:text-rose-600 p-1 text-xs" 
                        title="Eliminar"
                    >
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
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
