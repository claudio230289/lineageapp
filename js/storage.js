// js/storage.js - Manejo seguro de la base de datos y localStorage

const DB_NAME = 'finanzas_db';

// Obtener toda la base de datos preservando cada registro existente
function obtenerBaseDatos() {
    const data = localStorage.getItem(DB_NAME);
    if (!data) {
        return {
            ingresos: [],
            gastos: [],
            deseos: [],
            config: { ahorroObjetivo: 0 }
        };
    }
    try {
        const db = JSON.parse(data);
        // Garantizamos que existan las colecciones sin alterar datos previos
        if (!db.ingresos) db.ingresos = [];
        if (!db.gastos) db.gastos = [];
        if (!db.deseos) db.deseos = [];
        if (!db.config) db.config = {};
        return db;
    } catch (error) {
        console.error("Error al parsear finanzas_db, usando estructura de respaldo.", error);
        return { ingresos: [], gastos: [], deseos: [], config: {} };
    }
}

// Guardar la base de datos completa de forma segura
function guardarBaseDatos(db) {
    try {
        localStorage.setItem(DB_NAME, JSON.stringify(db));
    } catch (error) {
        console.error("Error al guardar en localStorage:", error);
    }
}

// Obtener registros filtrados por mes (ej: "2026-09")
function obtenerDatosMes(anioMes) {
    const db = obtenerBaseDatos();
    return {
        ingresos: db.ingresos.filter(item => item.mes === anioMes),
        gastos: db.gastos.filter(item => item.mes === anioMes),
        deseos: db.deseos || []
    };
}

