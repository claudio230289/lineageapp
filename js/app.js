async function initApp() {
    try {
        const fechaObj = new Date();
        const dateEl = document.getElementById('current-date-label');
        if (dateEl) {
            dateEl.innerText = fechaObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
    } catch (e) {
        console.error(e);
    }

    // Espera la autenticación de Google y la descarga de datos de Firestore
    await cargarBaseDatosRemota();

    if (db && db.mesActivo) {
        asegurarAnioEnSelect(db.mesActivo.split('-')[0]);
    } else {
        const now = new Date();
        db.mesActivo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        asegurarAnioEnSelect(now.getFullYear());
    }

    toggleTipoIngreso();
    renderizarCuadriculaMeses();
    renderizarTodo();
}
