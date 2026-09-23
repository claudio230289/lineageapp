/* =========================================================
   MÓDULO DE PERSISTENCIA Y BASE DE DATOS (js/db.js)
   ========================================================= */
export const DB_VERSION = 13;
export const STORAGE_KEY = 'finanzas_db';

export function crearDbVacia() {
    const now = new Date();
    const mesActualDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
        version: DB_VERSION,
        dolar: 1250,
        mesActivo: mesActualDefault,
        ingresos: {},
        gastos: {},
        deseos: [],
        pasivos: []
    };
}

export function migrarDb(data) {
    let currentVersion = data.version || 1;
    if (currentVersion < DB_VERSION) {
        data.version = DB_VERSION;
        data.ingresos = data.ingresos || {};
        data.gastos = data.gastos || {};
        data.deseos = Array.isArray(data.deseos) ? data.deseos : [];
        data.pasivos = Array.isArray(data.pasivos) ? data.pasivos : [];
        data.dolar = Number(data.dolar) || 1250;
        if (!data.mesActivo) {
            const now = new Date();
            data.mesActivo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
    }
    return data;
}

export function cargarBaseDatos() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return crearDbVacia();
        let parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') throw new Error('Estructura corrupta');
        if (!parsed.version || parsed.version < DB_VERSION) {
            parsed = migrarDb(parsed);
            guardarBaseDatosLocal(parsed);
        }
        return parsed;
    } catch (e) {
        const backupVacio = crearDbVacia();
        guardarBaseDatosLocal(backupVacio);
        return backupVacio;
    }
}

export function guardarBaseDatosLocal(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            alert('Límite de almacenamiento local alcanzado.');
        }
    }
}

export let db = cargarBaseDatos();
