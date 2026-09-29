/* =========================================================
   SISTEMA DE NOTIFICACIONES (js/notificaciones.js)
   Reemplaza alert() por toasts modernos
   ========================================================= */

export function mostrarNotificacion(mensaje, tipo = 'info') {
    // Crear contenedor si no existe
    let contenedor = document.getElementById('notificaciones');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'notificaciones';
        contenedor.className = 'fixed top-4 right-4 z-[200] space-y-2';
        document.body.appendChild(contenedor);
    }

    // Crear notificación
    const notif = document.createElement('div');
    
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

    notif.className = `${colores[tipo] || colores.info} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 max-w-xs`;
    notif.innerHTML = `
        <i class="fa-solid ${iconos[tipo] || iconos.info}"></i>
        <span>${mensaje}</span>
    `;

    contenedor.appendChild(notif);

    // Animación de entrada
    requestAnimationFrame(() => {
        notif.classList.add('opacity-100', 'translate-x-0');
    });

    // Auto-eliminar después de 5 segundos
    setTimeout(() => {
        notif.classList.add('opacity-0', 'translate-x-full');
        setTimeout(() => notif.remove(), 300);
    }, 5000);
}

export function manejarError(contexto, error) {
    console.error(`[${contexto}]`, error);
    const mensaje = error?.message || error || 'Error desconocido';
    mostrarNotificacion(`Error: ${mensaje}`, 'error');
}

// Funciones de convenencia
export function notificarExito(mensaje) {
    mostrarNotificacion(mensaje, 'success');
}

export function notificarInfo(mensaje) {
    mostrarNotificacion(mensaje, 'info');
}

export function notificarAdvertencia(mensaje) {
    mostrarNotificacion(mensaje, 'warning');
}
