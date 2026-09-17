// js/ingresos.js - Gestión de ingresos mensuales

// Guardar o actualizar un ingreso
function guardarIngreso(ingresoObj) {
    const db = obtenerBaseDatos();
    if (!db.ingresos) db.ingresos = [];

    if (ingresoObj.id) {
        // Edición de un ingreso existente
        const index = db.ingresos.findIndex(i => i.id === ingresoObj.id);
        if (index !== -1) {
            db.ingresos[index] = { ...db.ingresos[index], ...ingresoObj };
        }
    } else {
        // Creación de un nuevo ingreso
        ingresoObj.id = 'ingreso_' + Date.now();
        db.ingresos.push(ingresoObj);
    }

    guardarBaseDatos(db);
}

// Eliminar un ingreso por su ID
function eliminarIngreso(ingresoId) {
    const db = obtenerBaseDatos();
    if (!db.ingresos) return;

    db.ingresos = db.ingresos.filter(i => i.id !== ingresoId);
    guardarBaseDatos(db);
}

