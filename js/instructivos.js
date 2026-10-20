/* =========================================================
   MÓDULO DE INSTRUCTIVOS Y GUÍAS DE USO (js/instructivos.js)
   Renderizado interactivo, buscador y acordeón para DOM.
   ========================================================= */

import {
    INSTRUCTIVOS_DATA,
    CATEGORIAS_INSTRUCTIVOS,
    buscarInstructivos,
    obtenerCategorias
} from './instructivos/nucleo.js';

let categoriaSeleccionada = 'todas';
let busquedaActual = '';
const acordeonesAbiertos = new Set(['ciclo-mensual']); // Primera guía abierta por defecto

/**
 * Utilidad de sanitización para prevenir XSS en render dinámico.
 */
function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Renderiza los filtros por categoría (píldoras).
 */
export function renderizarFiltrosCategorias() {
    const contenedor = document.getElementById('contenedor-filtros-instructivos');
    if (!contenedor) return;

    const categoriasConConteo = obtenerCategorias(INSTRUCTIVOS_DATA);

    contenedor.innerHTML = categoriasConConteo.map(cat => {
        const esActiva = (cat.id === categoriaSeleccionada);
        const estiloActivo = 'bg-indigo-600 text-white font-bold shadow-sm border-indigo-600';
        const estiloInactivo = 'bg-white text-gray-700 hover:bg-gray-100 border-gray-200';

        return `
            <button type="button"
                    onclick="window.setFiltroCategoriaInstructivos('${escapeHTML(cat.id)}')"
                    class="px-3 py-1.5 rounded-xl border text-xs whitespace-nowrap transition flex items-center space-x-1.5 ${esActiva ? estiloActivo : estiloInactivo}">
                <i class="${escapeHTML(cat.icono)} text-[11px]"></i>
                <span>${escapeHTML(cat.nombre)}</span>
                <span class="ml-1 text-[10px] px-1.5 py-0.2 rounded-full ${esActiva ? 'bg-indigo-700 text-white' : 'bg-gray-100 text-gray-600'}">${cat.cantidad}</span>
            </button>
        `;
    }).join('');
}

/**
 * Alterna el estado abierto/cerrado de una tarjeta de instructivo.
 *
 * @param {string} id ID del instructivo
 */
export function toggleAcordeonInstructivo(id) {
    if (!id) return;
    if (acordeonesAbiertos.has(id)) {
        acordeonesAbiertos.delete(id);
    } else {
        acordeonesAbiertos.add(id);
    }
    renderizarListaInstructivos();
}

/**
 * Expande todas las guías actualmente visibles.
 */
export function expandirTodosInstructivos() {
    const visibles = buscarInstructivos(INSTRUCTIVOS_DATA, {
        texto: busquedaActual,
        categoria: categoriaSeleccionada
    });
    visibles.forEach(g => acordeonesAbiertos.add(g.id));
    renderizarListaInstructivos();
}

/**
 * Contrae todas las guías.
 */
export function contraerTodosInstructivos() {
    acordeonesAbiertos.clear();
    renderizarListaInstructivos();
}

/**
 * Cambia la categoría seleccionada y vuelve a renderizar.
 *
 * @param {string} categoria
 */
export function setFiltroCategoriaInstructivos(categoria) {
    categoriaSeleccionada = categoria || 'todas';
    renderizarFiltrosCategorias();
    renderizarListaInstructivos();
}

/**
 * Maneja el evento de tipeo en el buscador de instructivos.
 */
export function filtrarInstructivos() {
    const input = document.getElementById('input-busqueda-instructivos');
    const btnLimpiar = document.getElementById('btn-limpiar-busqueda-instructivos');

    busquedaActual = input ? input.value.trim() : '';

    if (btnLimpiar) {
        if (busquedaActual) {
            btnLimpiar.classList.remove('hidden');
        } else {
            btnLimpiar.classList.add('hidden');
        }
    }

    renderizarListaInstructivos();
}

/**
 * Limpia el texto de búsqueda y restaura la vista.
 */
export function limpiarBusquedaInstructivos() {
    const input = document.getElementById('input-busqueda-instructivos');
    const btnLimpiar = document.getElementById('btn-limpiar-busqueda-instructivos');
    if (input) {
        input.value = '';
        input.focus();
    }
    if (btnLimpiar) btnLimpiar.classList.add('hidden');
    busquedaActual = '';
    renderizarListaInstructivos();
}

/**
 * Renderiza la lista completa de tarjetas acordeón de instructivos.
 */
export function renderizarListaInstructivos() {
    const contenedor = document.getElementById('contenedor-lista-instructivos');
    if (!contenedor) return;

    const guias = buscarInstructivos(INSTRUCTIVOS_DATA, {
        texto: busquedaActual,
        categoria: categoriaSeleccionada
    });

    if (guias.length === 0) {
        contenedor.innerHTML = `
            <div class="bg-white rounded-2xl p-8 text-center border border-gray-200 shadow-sm space-y-3">
                <div class="w-12 h-12 mx-auto rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-xl">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </div>
                <h3 class="text-sm font-bold text-gray-800">No encontramos guías con ese criterio</h3>
                <p class="text-xs text-gray-500 max-w-sm mx-auto">Probá buscando con otras palabras como "cuotas", "rollover", "supermercado", "dólar" o seleccioná "Todas las Guías".</p>
                <button type="button" onclick="window.limpiarBusquedaInstructivos(); window.setFiltroCategoriaInstructivos('todas');" class="inline-flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition">
                    <i class="fa-solid fa-rotate-left mr-1.5"></i> Restablecer búsqueda
                </button>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = guias.map(guia => {
        const estaAbierto = acordeonesAbiertos.has(guia.id);

        const pasosHTML = (guia.pasos || []).map(paso => `
            <div class="flex items-start space-x-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition">
                <div class="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    ${escapeHTML(String(paso.numero))}
                </div>
                <div class="space-y-0.5">
                    <h4 class="text-xs font-bold text-gray-800">${escapeHTML(paso.titulo)}</h4>
                    <p class="text-xs text-gray-600 leading-relaxed">${escapeHTML(paso.descripcion)}</p>
                </div>
            </div>
        `).join('');

        return `
            <article class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200">
                <!-- Encabezado del Acordeón (Clickable) -->
                <button type="button"
                        onclick="window.toggleAcordeonInstructivo('${escapeHTML(guia.id)}')"
                        class="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50/80 transition focus:outline-none"
                        aria-expanded="${estaAbierto ? 'true' : 'false'}">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${guia.colorBadge}">
                            <i class="${escapeHTML(guia.icono)}"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${guia.colorBadge}">
                                    ${escapeHTML(guia.categoriaNombre)}
                                </span>
                            </div>
                            <h3 class="text-sm md:text-base font-bold text-gray-800 mt-0.5">${escapeHTML(guia.titulo)}</h3>
                            <p class="text-xs text-gray-500 line-clamp-1">${escapeHTML(guia.subtitulo)}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 text-gray-400 pl-2">
                        <span class="text-[11px] font-semibold text-gray-400 hidden sm:inline">${estaAbierto ? 'Ocultar' : 'Ver guía'}</span>
                        <i class="fa-solid fa-chevron-down text-xs transition-transform duration-200 ${estaAbierto ? 'rotate-180 text-indigo-600' : ''}"></i>
                    </div>
                </button>

                <!-- Contenido Desplegable -->
                ${estaAbierto ? `
                    <div class="px-4 pb-4 pt-1 border-t border-gray-100 space-y-4">
                        <p class="text-xs text-gray-700 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                            ${escapeHTML(guia.resumen)}
                        </p>

                        <!-- Pasos Guiados -->
                        <div class="space-y-2">
                            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Pasos y Funcionamiento:</h4>
                            <div class="space-y-2">
                                ${pasosHTML}
                            </div>
                        </div>

                        <!-- Tip Destacado -->
                        ${guia.tipDestacado ? `
                            <div class="flex items-start space-x-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                                <i class="fa-solid fa-lightbulb text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
                                <div>
                                    <strong class="font-bold block text-amber-950">Consejo Práctico:</strong>
                                    <span>${escapeHTML(guia.tipDestacado)}</span>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Botón de Acción Rápida -->
                        ${guia.tabDestino ? `
                            <div class="flex justify-end pt-1">
                                <button type="button"
                                        onclick="window.cambiarTab('${escapeHTML(guia.tabDestino)}')"
                                        class="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
                                    <span>${escapeHTML(guia.botonTexto || 'Ir al módulo')}</span>
                                    <i class="fa-solid fa-arrow-right ml-2 text-[10px]"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </article>
        `;
    }).join('');
}

/**
 * Función principal para renderizar el módulo completo de instructivos.
 */
export function renderizarInstructivos() {
    renderizarFiltrosCategorias();
    renderizarListaInstructivos();
}

window.renderizarInstructivos = renderizarInstructivos;
window.renderizarFiltrosCategorias = renderizarFiltrosCategorias;
window.renderizarListaInstructivos = renderizarListaInstructivos;
window.toggleAcordeonInstructivo = toggleAcordeonInstructivo;
window.expandirTodosInstructivos = expandirTodosInstructivos;
window.contraerTodosInstructivos = contraerTodosInstructivos;
window.setFiltroCategoriaInstructivos = setFiltroCategoriaInstructivos;
window.filtrarInstructivos = filtrarInstructivos;
window.limpiarBusquedaInstructivos = limpiarBusquedaInstructivos;
