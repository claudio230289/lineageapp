/* =========================================================
   INICIALIZACIÓN DE LA APLICACIÓN (js/app.js)
   ========================================================= */
import { cargarBaseDatosRemota, iniciarSesionGoogle, db } from './db.js';

// Exponemos la función de login al ámbito global para el botón de emergencia si no hay sesión
window.iniciarSesionGoogleApp = iniciarSesionGoogle;

export async function initApp() {
    try {
        const fechaObj = new Date();
        const dateEl = document.getElementById('current-date-label');
        if (dateEl) {
            dateEl.innerText = fechaObj.toLocaleDateString('es-AR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        }
    } catch (e) {
        console.error("Error al establecer la fecha:", e);
    }

    // Espera la autenticación de Google y la descarga de datos de Firestore
    const datosCargados = await cargarBaseDatosRemota();

    // Si el usuario no inició sesión, mostramos la pantalla de acceso limpia y detenemos la ejecución
    if (!datosCargados) {
        document.body.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white; font-family: sans-serif; text-align: center; padding: 20px;">
                <h1 style="font-size: 24px; margin-bottom: 10px;">Mis Finanzas v13.5</h1>
                <p style="color: #94a3b8; margin-bottom: 20px; max-width: 400px;">Iniciá sesión con tu cuenta de Google para acceder a tus datos sincronizados en la nube de forma segura.</p>
                <button onclick="window.iniciarSesionGoogleApp()" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);">
                    <i class="fa-brands fa-google mr-2"></i> Iniciar sesión con Google
                </button>
            </div>
        `;
        return;
    }

    // Validación y asignación del mes activo
    if (db && db.mesActivo) {
        asegurarAnioEnSelect(db.mesActivo.split('-')[0]);
    } else {
        const now = new Date();
        db.mesActivo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        asegurarAnioEnSelect(now.getFullYear());
    }

    // Renderizado general de la interfaz con los datos ya sincronizados
    toggleTipoIngreso();
    renderizarCuadriculaMeses();
    renderizarTodo();
}

// Ejecución al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});
