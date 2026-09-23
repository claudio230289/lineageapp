/* =========================================================
   MÓDULO DE PERSISTENCIA Y RESPALDOS (db.js)
   ========================================================= */
const DB_VERSION = 13;
const STORAGE_KEY = 'finanzas_db';

function crearDbVacia() {
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

function migrarDb(data) {
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

function cargarBaseDatos() {
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

function guardarBaseDatosLocal(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            alert('Límite de almacenamiento local alcanzado.');
        }
    }
}

function guardarYDescargarRespaldo() {
    db.version = DB_VERSION;
    guardarBaseDatosLocal(db);
    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `finanzas_backup_${new Date().toISOString().slice(0,10)}_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    } catch (err) {
        console.error('Error al generar respaldo:', err);
    }
}

function importarRespaldoJSONAuto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            const importedData = JSON.parse(content);
            db = migrarDb(importedData);
            if (db.mesActivo) {
                const anioDb = db.mesActivo.split('-')[0];
                asegurarAnioEnSelect(anioDb);
            }
            guardarBaseDatosLocal(db);
            renderizarCuadriculaMeses();
            renderizarTodo();
            if (document.getElementById('tab-anual').classList.contains('active')) renderizarGraficoAnual();
            alert('¡Archivo JSON cargado y restaurado con éxito!');
        } catch (err) {
            console.error('Error procesando JSON:', err);
            mostrarInstructivoCarga();
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// Instancia única global cargada al inicio
let db = cargarBaseDatos();
