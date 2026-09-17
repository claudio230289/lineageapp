// storage.js

const STORAGE_KEY = 'finanzas_db';

// Estado global de la base de datos
export let db = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
    ingresos: {},
    gastos: {},
    deseos: [],
    dolar: 1250
};

// Función para persistir los cambios en el navegador
export function guardarDB() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (error) {
        console.error("Error al guardar en localStorage:", error);
    }
}
