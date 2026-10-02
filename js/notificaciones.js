/* =========================================================
   SISTEMA DE NOTIFICACIONES (js/notificaciones.js)
   Toasts no bloqueantes en lugar de alert()
   ========================================================= */

/**
 * Registro de toasts vivos por clave, para refrescar en vez de
 * apilar. Sin esto, un error que se repite (por ejemplo, la nube
 * caída durante el guardado automático) llenaría la pantalla de
 * copias idénticas del mismo texto.
 * @type {Map<string, {nodo:HTMLElement, temporizador:any}>}
 */
const avisosVivos = new Map();

/**
 * Duración por tipo. Los errores quedan más tiempo porque
 * requieren acción, no sólo lectura.
 */
const DURACION_MS = {
    info: 5000,
    success: 4000,
    warning: 7000,
    error: 9000
};

const colores = {
    info: 'bg-indigo-600',
    success: 'bg-emerald-600',
    warning: 'bg-amber-600',
    error: 'bg-red-600'
};

const iconos = {
    info: 'fa-info-circle',
    success: 'fa-check-circle',
    warning: 'fa-exclamation-triangle',
    error: 'fa-times-circle'
};

/**
 * Muestra un aviso flotante.
 *
 * @param {string} mensaje
 * @param {'info'|'success'|'warning'|'error'} [tipo]
 * @param {{clave?:string}} [opciones]
 *   `clave` deduplica: si ya hay un toast vivo con esa clave, se
 *   reinicia su temporizador en lugar de crear otro. Sirve para
 *   errores que pueden repetirse en cadena.
 * @returns {HTMLElement|null} El nodo creado, o null si no hay DOM.
 */
export function mostrarNotificacion(mensaje, tipo = 'info', opciones = {}) {
    // Sin DOM no hay a dónde mostrar. Devolver en silencio es
    // preferible a romper la operación que se quiere avisar: el aviso
    // es accesorio, el guardado no.
    if (typeof document === 'undefined') return null;

    const clave = opciones && opciones.clave ? String(opciones.clave) : null;

    // Mismo aviso todavía en pantalla: se refresca su tiempo y ya.
    if (clave && avisosVivos.has(clave)) {
        const previo = avisosVivos.get(clave);
        clearTimeout(previo.temporizador);
        previo.temporizador = programarRetiro(previo.nodo, clave, DURACION_MS[tipo] || 5000);
        return previo.nodo;
    }

    let contenedor = document.getElementById('notificaciones');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'notificaciones';
        contenedor.className = 'fixed top-4 right-4 z-[200] space-y-2';
        document.body.appendChild(contenedor);
    }

    const notif = document.createElement('div');
    notif.className = `${colores[tipo] || colores.info} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 max-w-xs`;

    // El icono sí es HTML (lo genera esta función); el mensaje NO.
    // Va con textContent porque acá llega texto de
    // errores de Firebase, mensajes de los datos del usuario y
    // conceptos que la persona escribió. Interpolarlo con
    // innerHTML convertía cualquier "<b>" del contenido en
    // marcado, y un concepto malicioso en HTML.
    const icono = document.createElement('i');
    icono.className = `fa-solid ${iconos[tipo] || iconos.info}`;

    const texto = document.createElement('span');
    texto.textContent = mensaje == null ? '' : String(mensaje);

    notif.appendChild(icono);
    notif.appendChild(texto);

    contenedor.appendChild(notif);

    // Animación de entrada
    requestAnimationFrame(() => {
        notif.classList.add('opacity-100', 'translate-x-0');
    });

    const temporizador = programarRetiro(notif, clave, DURACION_MS[tipo] || 5000);
    if (clave) avisosVivos.set(clave, { nodo: notif, temporizador });

    return notif;
}

/**
 * Programa el retiro del toast.
 * @private
 */
function programarRetiro(nodo, clave, ms) {
    return setTimeout(() => {
        nodo.classList.add('opacity-0', 'translate-x-full');
        setTimeout(() => {
            nodo.remove();
            if (clave) avisosVivos.delete(clave);
        }, 300);
    }, ms);
}

export function manejarError(contexto, error) {
    console.error(`[${contexto}]`, error);
    const mensaje = error?.message || error || 'Error desconocido';
    mostrarNotificacion(`Error: ${mensaje}`, 'error');
}

// Funciones de convenencia
export function notificarExito(mensaje, opciones) {
    return mostrarNotificacion(mensaje, 'success', opciones);
}

export function notificarInfo(mensaje, opciones) {
    return mostrarNotificacion(mensaje, 'info', opciones);
}

export function notificarAdvertencia(mensaje, opciones) {
    return mostrarNotificacion(mensaje, 'warning', opciones);
}

export function notificarError(mensaje, opciones) {
    return mostrarNotificacion(mensaje, 'error', opciones);
}