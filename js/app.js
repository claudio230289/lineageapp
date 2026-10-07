/* =========================================================
   1. IMPORTACIONES Y ESTADO GLOBAL
   ========================================================= */
// 1.A. Importación de módulos externos e internos
import {
    db,
    guardarTodo,
    prepararBase,
    cargarBaseDatosRemota,
    iniciarSesionGoogle as authIniciarSesionGoogle,
    cerrarSesion as authCerrarSesion
} from './db.js';
import { calcularNetoMes, calcularGastosMes, calcularPasivoPorKeyword, formatARS, obtenerMesActual, esPagado, normalizarCategoria, normalizarTexto, aNumero } from './calculos.js';
import { renderizarDeseosYProyeccion } from './deseos.js';
import { mostrarNotificacion, notificarExito, notificarAdvertencia, notificarError, manejarError } from './notificaciones.js';
import { busEventos } from './core/eventos.js';
import { SCHEMA_VERSION } from './version.js';
import { suscribirAvisosPersistencia } from './core/avisos.js';
import { generarMesesFuturos, obtenerNombreMes, obtenerMesSiguiente, obtenerMesAnterior } from './utils/fechas.js';
import { generarId, coincideId } from './utils/id.js';
import { delegar } from './dom/delegacion.js';
import { construirComprobante } from './comprobante.js';
import { planificarReplicacion, aplicarPlan } from './negocio/replicacion.js';
import { crearControlInactividad, MS_INACTIVIDAD } from './core/inactividad.js';
import { pasarGastoAlSiguiente } from './app.rollover.js';

// 1.B. Variables de estado globales
let myChart = null;

/* =========================================================
   1.D. Avisos de persistencia (db.js -> toasts)
   =========================================================
   db.js emite hechos; acá se conecta el bus con los toasts. La
   regla de qué se avisa y qué no vive en js/core/avisos.js,
   aparte, para poder testearla: app.js importa db.js, que
   importa Firebase por URL y no se puede cargar en Node.

   Se engancha al importar el módulo y no dentro de initApp:
   el bus tiene que estar escuchando antes de que db.js pueda
   emitir, y db.js arranca a observar la autenticación en el
   momento en que se importa.
   ========================================================= */
suscribirAvisosPersistencia(busEventos, { notificarError, notificarExito });

// 1.C. Utilidad de sanitización para prevenir XSS
// Escapa también las comillas, no sólo < > &: el resultado se usa
// dentro de atributos como aria-label y data-id, donde una comilla
// sin escapar corta el atributo y corrompe el HTML. En nodos de
// texto el escapado de comillas no cambia lo que se ve.
function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* =========================================================
   2. GESTIÓN DE INTERFAZ Y SESIÓN (LOGIN / NAV)
   ========================================================= */
// 2.A. Control de visibilidad de pantallas
export function mostrarPantallaLogin() {
    const loginPanel = document.getElementById('login-panel');
    const mainApp = document.getElementById('app-content');

    if (loginPanel) loginPanel.classList.remove('hidden');
    if (mainApp) mainApp.classList.add('hidden');
}

export function ocultarPantallaLogin() {
    const loginPanel = document.getElementById('login-panel');
    const mainApp = document.getElementById('app-content');

    if (loginPanel) loginPanel.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
}

// 2.B. Manejadores de autenticación (Google/Firebase)
export async function handleIniciarSesionGoogle() {
    try {
        const estado = document.getElementById('debug-app-status');
        if (estado) estado.textContent = 'Autenticando en Google...';
        
        const user = await authIniciarSesionGoogle();
        if (user) {
            await initApp();
        } else {
            if (estado) estado.textContent = 'Autenticación cancelada o fallida';
        }
    } catch (error) {
        console.error('Error durante el inicio de sesión:', error);
        manejarError('Inicio de sesión', error);
    }
}

/* =========================================================
   CIERRE POR INACTIVIDAD
   =========================================================
   A los 5 minutos sin actividad: guardar y cerrar sesión.

   El orden importa. Si se cerrara primero y se guardara después,
   el guardado correría sin usuario y caería alocalStorage, así
   que los últimos cambios sólo vivirían en la pestaña. Por eso
   se espera al resultado de guardarTodo antes de cerrar.

   El motivo es 'cierre', que está en MOTIVOS_SILENCIOSOS: la
   persona no está mirando la pantalla, así que un toast se
   perdería. Lo que sí se le dice es el motivo en el panel de
   login, que es lo primero que va a ver.
   ========================================================= */
let controlInactividad = null;

async function cerrarPorInactividad() {
    const estado = document.getElementById('debug-app-status');
    if (estado) estado.textContent = 'Sesión cerrada por inividad. Se guardaron los cambios.';

    // Primero guardar. Se espera de verdad: sin este await, el
    // signOut podría correr antes de que termine el guardado.
    const resultado = await guardarTodo('cierre');
    if (resultado && resultado.ok === false) {
        // Falló el guardado. Se cierra igual (la persona no está
        // presente para decidir) pero no se avisa a nadie; los datos
        // quedaron en localStorage, que es donde se leen al volver.
        console.error('[Inactividad] No se pudo guardar antes de cerrar:', resultado.error);
    }

    await authCerrarSesion();
    mostrarPantallaLogin();
}

/**
 * Arranca (o rearma) el control de inactividad.
 *
 * Idempotente por diseño: se puede llamar en cada arranque sin
 * duplicar temporizadores ni listeners. Si ya había un control
 * armado, se detiene antes de crear el nuevo.
 */
export function armarInactividad() {
    if (controlInactividad) controlInactividad.detener();

    controlInactividad = crearControlInactividad({
        alCerrar: cerrarPorInactividad,
        esperaMs: MS_INACTIVIDAD
    });
    controlInactividad.armar();
    return controlInactividad;
}

/** Corta el control de inactividad. Idempotente. */
export function detenerInactividad() {
    if (!controlInactividad) return;
    controlInactividad.detener();
    controlInactividad = null;
}

export async function handleCerrarSesion() {
    // Antes de cerrar: si el logout es manual, el control se
    // desarma. Si no, el primer clic en la pantalla de login lo
    // rearma con la sesión ya cerrada.
    detenerInactividad();
    try {
        await authCerrarSesion();
        mostrarPantallaLogin();
        const estado = document.getElementById('debug-app-status');
        if (estado) estado.textContent = 'Sin sesión activa';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    }
}

// 2.C. Navegación temporal y selectores de mes/año
export function asegurarAnioEnSelect(anio) {
    const selectorAnio = document.getElementById('selector-anio');
    if (!selectorAnio) return;
    let existe = false;
    for (let i = 0; i < selectorAnio.options.length; i++) {
        if (selectorAnio.options[i].value === String(anio)) {
            existe = true;
            break;
        }
    }
    if (!existe) {
        const opt = document.createElement('option');
        opt.value = anio;
        opt.innerText = anio;
        selectorAnio.appendChild(opt);
    }
    selectorAnio.value = anio;
}

export function actualizarTarjetaMesSeleccionado() {
    const label = document.getElementById('label-mes-seleccionado');
    if (!label) return;
    const partes = db.mesActivo ? db.mesActivo.split('-') : [];
    if (partes.length < 2) return;
    const anio = partes[0];
    const numMes = parseInt(partes[1], 10);
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    label.innerText = `${mesesNombres[numMes - 1]} ${anio}`;
}

export function renderizarCuadriculaMeses() {
    actualizarTarjetaMesSeleccionado();
    const container = document.getElementById('cuadricula-meses');
    const selectorAnio = document.getElementById('selector-anio');
    if (!container || !selectorAnio) return;
    container.innerHTML = '';
    const anioActual = selectorAnio.value;
    const mesSeleccionado = db.mesActivo;
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    mesesCortos.forEach((nombre, index) => {
        const numMes = String(index + 1).padStart(2, '0');
        const mesKey = `${anioActual}-${numMes}`;
        const isActive = (mesKey === mesSeleccionado);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `py-2 text-xs font-bold rounded-xl transition border ${isActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`;
        btn.innerText = nombre;
        btn.onclick = () => seleccionarMesCuadricula(mesKey);
        container.appendChild(btn);
    });
}

export function seleccionarMesCuadricula(mesKey) {
    db.mesActivo = mesKey;
    guardarTodo();
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual')?.classList.contains('active')) renderizarGraficoAnual();
    toggleAcordeon('sec-selector-mes', 'icon-sm');
}

export function cambiarAnioCuadricula() {
    const selectorAnio = document.getElementById('selector-anio');
    if (!selectorAnio) return;
    const nuevoAnio = selectorAnio.value;
    const mesActualNum = db.mesActivo ? db.mesActivo.split('-')[1] : '01';
    db.mesActivo = `${nuevoAnio}-${mesActualNum}`;
    guardarTodo();
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual')?.classList.contains('active')) renderizarGraficoAnual();
}

export function cambiarMesNavegacion(delta) {
    if (!db.mesActivo) return;
    let [year, month] = db.mesActivo.split('-').map(Number);
    month += delta;
    if (month < 1) { month = 12; year -= 1; }
    else if (month > 12) { month = 1; year += 1; }
    const nuevoMesKey = `${year}-${String(month).padStart(2, '0')}`;
    asegurarAnioEnSelect(year);
    db.mesActivo = nuevoMesKey;
    guardarTodo();
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual')?.classList.contains('active')) renderizarGraficoAnual();
}

export function mesAnterior() { cambiarMesNavegacion(-1); }
export function mesSiguiente() { cambiarMesNavegacion(1); }

/* =========================================================
   3. ACCIONES DE PERSISTENCIA Y TRANSFERENCIA (NUBE / JSON / PDF)
   ========================================================= */
// 3.A. Sincronización remota y respaldos
export async function forzarSincronizacion() {
    console.log('[Persistencia] Forzando sincronización con Firebase...');
    
    if (typeof cargarBaseDatosRemota !== 'function') {
        console.error('Error crítico: cargarBaseDatosRemota no está definida o no se importó correctamente.');
        alert('Error interno: El módulo de base de datos no está listo.');
        return;
    }

    const confirmacion = confirm('¿Deseás sobreescribir los datos locales cargando la última copia guardada en Firebase?');
    if (!confirmacion) {
        console.log('[Persistencia] Operación cancelada por el usuario.');
        return;
    }
    
    try {
        const estado = document.getElementById('debug-app-status');
        if (estado) estado.textContent = 'Sincronizando con Firebase…';
        
        const resultado = await cargarBaseDatosRemota();
        console.log('[Persistencia] Resultado de sincronización:', resultado);

        // cargarBaseDatosRemota NO lanza cuando Firestore falla:
        // devuelve { user, database, error }. Antes sólo se miraba
        // `user`, así que una lectura fallida mostraba "Sincronización
        // completada" y la persona creía tener la última versión
        // cuando en pantalla seguía la copia vieja.
        if (resultado && resultado.error) {
            if (estado) estado.textContent = 'Error al sincronizar';
            return;
        }

        if (resultado && resultado.user) {
            if (db && db.mesActivo) {
                asegurarAnioEnSelect(db.mesActivo.split('-')[0]);
            }
            renderizarCuadriculaMeses();
            renderizarTodo();
            if (document.getElementById('tab-anual')?.classList.contains('active')) {
                renderizarGraficoAnual();
            }
            if (estado) estado.textContent = 'Aplicación lista';
            notificarExito('Sincronización con Firebase completada');
        } else {
            if (estado) estado.textContent = 'Sin sesión activa o datos inexistentes';
            mostrarNotificacion('No se pudo recuperar información remota. Verifica haber iniciado sesión.', 'warning');
        }
    } catch (err) {
        console.error('Error al sincronizar con Firebase:', err);
        const estado = document.getElementById('debug-app-status');
        if (estado) estado.textContent = 'Error al sincronizar';
        manejarError('Sincronizar datos', err);
    }
}

export function guardarYDescargarRespaldo() {
    db.version = SCHEMA_VERSION;
    guardarTodo();
    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        const nombreArchivo = `finanzas_backup_${new Date().toISOString().slice(0,10)}_${Date.now()}.json`;
        downloadAnchor.setAttribute("download", nombreArchivo);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        // Antes el archivo se descargaba en silencio: si el navegador
        // la bloqueaba, la persona no se enteraba hasta mucho después,
        // cuando buscaba el respaldo y no estaba.
        notificarExito(`Respaldo descargado: ${nombreArchivo}`);
    } catch (err) {
        console.error('Error al generar respaldo:', err);
        manejarError('Generar respaldo', err);
    }
}

// 3.B. Importación y actualización de app
export function accionIniciarImportacionJSON() {
    const inputFile = document.getElementById('import-file-resumen');
    if (inputFile) {
        inputFile.click();
    }
}

export function importarRespaldoJSONAuto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const content = e.target.result;
            const importedData = JSON.parse(content);
            // prepararBase = normalizar forma + aplicar migraciones.
            // Antes sólo normalizaba, así que un respaldo de una
            // versión anterior entraba con su `version` vieja y sin
            // transformar.
            const { base: dbNueva, migracionesAplicadas } = prepararBase(importedData);
            if (migracionesAplicadas.length > 0) {
                notificarInfo(`Respaldo actualizado al esquema actual (migraciones: ${migracionesAplicadas.join(', ')}).`);
            }
            Object.assign(db, dbNueva);
            
            if (db.mesActivo) {
                asegurarAnioEnSelect(db.mesActivo.split('-')[0]);
            }
            
            await guardarTodo('importacion');
            renderizarCuadriculaMeses();
            renderizarTodo();
            if (document.getElementById('tab-anual')?.classList.contains('active')) renderizarGraficoAnual();
            notificarExito('Respaldo JSON importado y guardado en la nube con éxito');
        } catch (err) {
            console.error('Error procesando JSON:', err);
            mostrarNotificacion('El archivo seleccionado no es un JSON de respaldo válido.', 'error');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

export function accionGuardarJSON() {
    if (confirm("¿Deseás descargar la copia de respaldo JSON local en este dispositivo?")) {
        guardarYDescargarRespaldo();
    }
}

export function accionActualizarApp() {
    actualizarVersionApp();
}

export function accionExportarPDF() {
    window.print();
}

export async function actualizarVersionApp() {
    if (confirm('¿Confirmás limpiar la caché temporal y recargar la aplicación?')) {
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let reg of regs) await reg.unregister();
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                for (let k of keys) await caches.delete(k);
            }
            window.location.reload(true);
        } catch (e) {
            window.location.reload();
        }
    }
}

/* =========================================================
   4. LÓGICA DE NEGOCIO Y OPERACIONES DE FINANZAS
   ========================================================= */
// 4.A. Gestión de Ingresos
export function toggleTipoIngreso() {
    const tipo = document.getElementById('ing-tipo')?.value;
    const modoSelect = document.getElementById('ing-modo-monto');
    const optPorc = document.getElementById('opt-porcentaje');
    if (!modoSelect || !optPorc) return;
    if (tipo === 'Basico') { modoSelect.value = 'importe'; optPorc.disabled = true; }
    else { optPorc.disabled = false; }
    toggleModoMonto();
}

export function toggleModoMonto() {
    const modo = document.getElementById('ing-modo-monto')?.value;
    const lbl = document.getElementById('label-valor-monto');
    if (lbl) lbl.innerText = modo === 'porcentaje' ? 'Porcentaje (%) del Básico' : 'Monto ($)';
}

export function guardarIngreso(e) {
    e.preventDefault();
    const mes = obtenerMesActual();
    if (!db.ingresos) db.ingresos = {};
    if (!db.ingresos[mes]) db.ingresos[mes] = [];
    const conceptoInput = document.getElementById('ing-concepto').value.trim();
    const tipo = document.getElementById('ing-tipo').value;
    const modo = document.getElementById('ing-modo-monto').value;
    const valor = parseFloat(document.getElementById('ing-valor').value);

    if (tipo === 'Basico') db.ingresos[mes] = db.ingresos[mes].filter(i => i.tipo !== 'Basico');
    db.ingresos[mes].push({ id: generarId(), concepto: conceptoInput, tipo, modo, valor });
    document.getElementById('form-ingreso').reset();
    toggleTipoIngreso();
    guardarYRenderizar();
}

export function eliminarIngreso(id) {
    const mes = obtenerMesActual();
    if (db.ingresos && db.ingresos[mes]) {
        db.ingresos[mes] = db.ingresos[mes].filter(i => !coincideId(i.id, id));
        guardarYRenderizar();
    }
}

export function replicarIngresosMes() {
    const mesActual = obtenerMesActual();
    const origen = (db.ingresos && db.ingresos[mesActual]) || [];

    if (origen.length === 0) {
        return mostrarNotificacion('No hay ingresos cargados en este mes para replicar.', 'warning');
    }

    // El destino es el período que la persona elija, no una ventana
    // fija de 24 meses que se iba de largo sin avisar.
    const selectCantidad = document.getElementById('ing-replicar-cantidad');
    const cantidadMeses = Math.max(1, parseInt(selectCantidad ? selectCantidad.value : '12', 10) || 12);
    const clavesDestino = generarMesesFuturos(mesActual, cantidadMeses);
    const destinos = clavesDestino.map(mes => ({
        mes,
        lista: (db.ingresos && db.ingresos[mes]) || []
    }));

    // Primera pasada: sólo agregar lo que falta, sin tocar nada.
    const planOmitir = planificarReplicacion({ origen, destinos, estrategia: 'omitir' });
    const { resumen } = planOmitir;

    if (planOmitir.vacio) {
        const detalle = resumen.mesesConDatos > 0
            ? `Los ${cantidadMeses} meses destino ya tienen estos ingresos cargados.`
            : 'No hay nada nuevo para replicar.';
        return mostrarNotificacion(`No se replicó nada. ${detalle}`, 'info');
    }

    let estrategia = 'omitir';

    // Si hay conflictos reales (misma clave, importe distinto) no se
    // decide por código: se le pregunta a la persona. Aceptar
    // sobreescribe con el valor del mes actual; cancelar conserva lo
    // que ya estaba y sólo agrega lo que faltaba.
    const sobrescribirForzado = !!document.getElementById('ing-replicar-sobrescribir')?.checked;

    if (sobrescribirForzado) {
        estrategia = 'sobrescribir';
    } else if (planOmitir.requiereConfirmacion) {
        const detalleConflictos = resumen.totalConflictos;
        const aceptaSobrescribir = confirm(
            `Hay ${detalleConflictos} ingreso(s) en los meses futuros con el mismo concepto/tipo/modo ` +
            `pero distinto importe.\n\n` +
            `Aceptar: sobrescribir con el importe de ${mesActual}.\n` +
            `Cancelar: conservarlos y sólo agregar los ingresos que falten.\n\n` +
            `Altas a crear: ${resumen.totalAltas}`
        );
        estrategia = aceptaSobrescribir ? 'sobrescribir' : 'fusionar';
    } else if (resumen.mesesConDatos > 0) {
        const aceptaFusionar = confirm(
            `${resumen.mesesConDatos} de los ${cantidadMeses} meses destino ya tienen ingresos.\n\n` +
            `Se van a agregar ${resumen.totalAltas} ingreso(s) que faltan, sin tocar los existentes.\n` +
            `¿Continuar?`
        );
        if (!aceptaFusionar) return;
        estrategia = 'fusionar';
    }

    const plan = estrategia === 'omitir'
        ? planOmitir
        : planificarReplicacion({ origen, destinos, estrategia });

    const aplicado = aplicarPlan(db, plan);

    // Puede no quedar nada por aplicar si sólo había conflictos y la
    // persona eligió conservarlos. Informar eso como "replicado con
    // éxito, 0 agregados" sería engañoso.
    if (aplicado.mesesModificados === 0) {
        return mostrarNotificacion('No se replicó nada: los meses destino ya estaban completos.', 'info');
    }

    guardarYRenderizar();

    const detalleSobrescritura = aplicado.ingresosSobrescritos > 0
        ? `, ${aplicado.ingresosSobrescritos} sobrescrito(s)`
        : '';
    notificarExito(
        `Ingresos replicados a ${aplicado.mesesModificados} mes(es): ` +
        `${aplicado.ingresosAgregados} agregado(s)${detalleSobrescritura}.`
    );
}

// 4.B. Gestión de Gastos y Tarjetas
export function guardarGasto(e) {
    e.preventDefault();
    const mesActual = obtenerMesActual();
    const editId = document.getElementById('gas-edit-id').value;
    const conceptoInput = document.getElementById('gas-concepto').value.trim();
    const categoria = document.getElementById('gas-categoria').value;
    // aNumero en lugar de parseFloat: nunca devuelve NaN, así un
    // campo vacío o con basura no contamina los totales del mes.
    const monto = aNumero(document.getElementById('gas-monto').value);

    if (!db.gastos) db.gastos = {};
    if (!db.gastos[mesActual]) db.gastos[mesActual] = [];

    if (editId) {
        const gastoOriginal = db.gastos[mesActual].find(g => coincideId(g.id, editId));
        const conceptoAnterior = gastoOriginal ? normalizarTexto(gastoOriginal.concepto) : '';
        const categoriaAnterior = gastoOriginal ? normalizarCategoria(gastoOriginal.categoria) : '';

        if (gastoOriginal) {
            // Editar no altera el estado de pago: se conservan
            // concepto, categoría, monto y pagado tal como estaban.
            gastoOriginal.concepto = conceptoInput;
            gastoOriginal.categoria = categoria;
            gastoOriginal.monto = monto;
        }
        cancelarEdicionGasto();

        if (normalizarCategoria(categoria) === 'fijos' || categoriaAnterior === 'fijos') {
            const mesesFuturos = generarMesesFuturos(mesActual, 24);
            mesesFuturos.forEach(mVal => {
                if (db.gastos[mVal]) {
                    const idx = db.gastos[mVal].findIndex(g => normalizarCategoria(g.categoria) === 'fijos' && normalizarTexto(g.concepto) === conceptoAnterior);
                    if (idx >= 0) {
                        db.gastos[mVal][idx].concepto = conceptoInput;
                        db.gastos[mVal][idx].monto = monto;
                        db.gastos[mVal][idx].categoria = categoria;
                    }
                }
            });
        }
    } else {
        db.gastos[mesActual].push({ id: generarId(), concepto: conceptoInput, categoria, monto, pagado: false });
        document.getElementById('form-gasto').reset();

        if (normalizarCategoria(categoria) === 'fijos') {
            const mesesFuturos = generarMesesFuturos(mesActual, 24);
            const conceptoNormalizado = normalizarTexto(conceptoInput);
            mesesFuturos.forEach(mVal => {
                if (!db.gastos[mVal]) db.gastos[mVal] = [];
                const idx = db.gastos[mVal].findIndex(g => normalizarCategoria(g.categoria) === 'fijos' && normalizarTexto(g.concepto) === conceptoNormalizado);
                if (idx >= 0) {
                    db.gastos[mVal][idx].monto = monto;
                } else {
                    db.gastos[mVal].push({ id: generarId(), concepto: conceptoInput, categoria: 'Fijos', monto, pagado: false });
                }
            });
        }
    }
    guardarYRenderizar();
}

export function editarGasto(id) {
    const mes = obtenerMesActual();
    const gasto = (db.gastos && db.gastos[mes]) ? db.gastos[mes].find(g => coincideId(g.id, id)) : null;
    if (!gasto || normalizarCategoria(gasto.categoria) === 'cuotas') return;
    document.getElementById('gas-edit-id').value = gasto.id;
    document.getElementById('gas-concepto').value = gasto.concepto;
    document.getElementById('gas-categoria').value = gasto.categoria;
    document.getElementById('gas-monto').value = gasto.monto;
    document.getElementById('form-gasto-titulo').innerText = 'Editar Gasto';
    document.getElementById('btn-submit-gasto').innerText = 'Actualizar Gasto';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    window.scrollTo({ top: 300, behavior: 'smooth' });
}

export function cancelarEdicionGasto() {
    document.getElementById('gas-edit-id').value = '';
    document.getElementById('form-gasto').reset();
    document.getElementById('form-gasto-titulo').innerText = 'Cargar Gasto / Único';
    document.getElementById('btn-submit-gasto').innerText = 'Agregar Gasto';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
}

export function ejecutarRollOverDeudas() {
    const mesActual = obtenerMesActual();
    const pendientes = (db.gastos && db.gastos[mesActual] ? db.gastos[mesActual] : []).filter(g => !esPagado(g) && !g.pasado);
    if (pendientes.length === 0) return mostrarNotificacion('No hay gastos pendientes en este mes.', 'info');

    const mesSiguiente = obtenerMesSiguiente(mesActual);

    if (!db.gastos) db.gastos = {};
    if (!db.gastos[mesSiguiente]) db.gastos[mesSiguiente] = [];

    let migrados = 0;
    pendientes.forEach(p => {
        if (!db.gastos[mesSiguiente].some(g => g.concepto === p.concepto && g.origenMes === mesActual)) {
            db.gastos[mesSiguiente].push({ id: generarId(), concepto: p.concepto, categoria: p.categoria, monto: p.monto, pagado: false, origenMes: mesActual, origenId: p.id });
            p.pasado = true;
            p.pasadoAMes = mesSiguiente;
            migrados++;
        }
    });

    guardarYRenderizar();
    notificarExito(`Se han migrado ${migrados} pendientes al mes ${mesSiguiente}`);
}

export function guardarCompraTarjeta(e) {
    e.preventDefault();
    const mesInicio = obtenerMesActual();
    const conceptoBase = document.getElementById('tar-concepto').value.trim();
    const cuotaInicio = parseInt(document.getElementById('tar-cuota-inicio').value) || 1;
    const totalCuotas = parseInt(document.getElementById('tar-cuotas').value);
    const montoCuota = parseFloat(document.getElementById('tar-monto').value);

    let [year, month] = mesInicio.split('-').map(Number);
    let generadas = 0;
    if (!db.gastos) db.gastos = {};
    for (let i = 0; i <= (totalCuotas - cuotaInicio); i++) {
        let nroActual = cuotaInicio + i;
        let m = month + i, y = year + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
        let mesKey = `${y}-${String(m).padStart(2, '0')}`;
        if (!db.gastos[mesKey]) db.gastos[mesKey] = [];
        let nombreCuota = `${conceptoBase} (Cuota ${nroActual}/${totalCuotas})`;
        if (!db.gastos[mesKey].some(g => g.concepto === nombreCuota)) {
            db.gastos[mesKey].push({ id: generarId(), concepto: nombreCuota, categoria: 'Cuotas', monto: montoCuota, pagado: false });
            generadas++;
        }
    }
    document.getElementById('form-tarjeta').reset();
    guardarYRenderizar();
    notificarExito(`Programadas ${generadas} cuotas`);
}

export function togglePagoGasto(id) {
    const mes = obtenerMesActual();
    const lista = (db.gastos && db.gastos[mes]) || [];
    const gasto = lista.find(g => coincideId(g.id, id));
    if (!gasto) {
        mostrarNotificacion('No se encontró el gasto a marcar.', 'warning');
        return;
    }
    if (gasto && gasto.pasado) {
        return mostrarNotificacion('Este gasto ya fue pasado al mes siguiente.', 'info');
    }
    // Se escribe SIEMPRE como booleano: es el atributo único de
    // estado en fijos, cuotas y únicos. Cualquier otro formato
    // heredado de un JSON importado se normaliza acá.
    gasto.pagado = !esPagado(gasto);
    guardarYRenderizar();
}

export function eliminarGasto(id) {
    const mes = obtenerMesActual();
    const lista = (db.gastos && db.gastos[mes]) || [];
    const gasto = lista.find(g => coincideId(g.id, id));
    if (!gasto || !confirm(`¿Estás seguro de que querés eliminar el gasto "${gasto.concepto}"?`)) return;

    if (normalizarCategoria(gasto.categoria) === 'fijos') {
        const conceptoTarget = normalizarTexto(gasto.concepto);
        const mesesFuturos = generarMesesFuturos(mes, 25);
        mesesFuturos.unshift(mes);
        mesesFuturos.forEach(mVal => {
            if (db.gastos && db.gastos[mVal]) {
                db.gastos[mVal] = db.gastos[mVal].filter(g => !(normalizarCategoria(g.categoria) === 'fijos' && normalizarTexto(g.concepto) === conceptoTarget));
            }
        });
    } else {
        db.gastos[mes] = lista.filter(g => !coincideId(g.id, id));
    }
    guardarYRenderizar();
}

// 4.C. Pasivos, Deseos y Utilidades (Dólar, WhatsApp)
export function guardarReglaPasivo(e) {
    e.preventDefault();
    const keyword = document.getElementById('pas-keyword').value.trim().toLowerCase();
    const nombre = document.getElementById('pas-nombre').value.trim();
    if (!db.pasivos) db.pasivos = [];
    db.pasivos.push({ id: generarId(), keyword, nombre });
    document.getElementById('form-pasivo').reset();
    guardarYRenderizar();
}

export function eliminarPasivo(id) {
    db.pasivos = (db.pasivos || []).filter(p => !coincideId(p.id, id));
    guardarYRenderizar();
}

export function guardarDeseo(e) {
    e.preventDefault();
    const concepto = document.getElementById('des-concepto').value.trim();
    const moneda = document.getElementById('des-moneda').value;
    const monto = parseFloat(document.getElementById('des-monto').value);
    if (!db.deseos) db.deseos = [];
    db.deseos.push({ id: generarId(), concepto, moneda, monto });
    document.getElementById('form-deseo').reset();
    guardarYRenderizar();
}

export function eliminarDeseo(id) {
    db.deseos = (db.deseos || []).filter(d => d.id !== id);
    guardarYRenderizar();
}

export async function editarDolarManual() {
    const valorActual = db.dolar || 1250;
    const entrada = prompt('Cotización Dólar Oficial ($):', valorActual);
    if (entrada !== null && entrada.trim() !== '') {
        const num = parseFloat(entrada.replace(',', '.'));
        if (!isNaN(num) && num > 0) {
            db.dolar = num;
            await guardarYRenderizar();
        } else {
            mostrarNotificacion('Por favor, ingresá un número válido para el dólar.', 'warning');
        }
    }
}

export async function obtenerDolarOficialAPI() {
    try {
        const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
        if (response.ok) {
            const data = await response.json();
            if (data && data.venta) {
                const cotizacion = parseFloat(data.venta);
                if (!isNaN(cotizacion) && cotizacion > 0) {
                    db.dolar = cotizacion;
                    renderizarTodo();
                }
            }
        }
    } catch (e) {
        console.warn('No se pudo sincronizar automáticamente la cotización del dólar:', e);
    }
}

export function limpiarFiltroGastos() {
    const input = document.getElementById('filtro-gastos');
    if (input) {
        input.value = '';
        renderizarTodo();
        input.focus();
    }
}

export function accionReporteWpGastos() {
    const filtroEl = document.getElementById('filtro-gastos');
    const filtroTexto = filtroEl ? (filtroEl.value || '').trim() : '';
    const detalleFiltro = filtroTexto ? ` filtrado por "${filtroTexto}"` : ' general';

    // El texto y los totales salen del módulo puro, así el resumen
    // del confirm dice exactamente lo que se va a enviar en vez de
    // una estimación que después puede no coincidir.
    const vistaPrevia = construirComprobante({
        gastos: (db.gastos && db.gastos[obtenerMesActual()]) || [],
        filtro: filtroTexto,
        periodo: obtenerMesActual()
    });

    if (confirm(
        `¿Confirmás enviar por WhatsApp el comprobante${detalleFiltro}?\n\n` +
        `${vistaPrevia.cantidadItems} concepto(s) — Total ${formatARS(vistaPrevia.total)}\n` +
        `Abonado ${formatARS(vistaPrevia.pagado)} — Pendiente ${formatARS(vistaPrevia.pendientes)}\n` +
        `Estado de cuenta: ${vistaPrevia.salado ? 'SALDADO' : 'PENDIENTE'}`
    )) {
        enviarReporteWhatsApp();
    }
}

export function enviarReporteWhatsApp() {
    try {
        const mes = obtenerMesActual();
        const filtroEl = document.getElementById('filtro-gastos');
        const filtroTexto = filtroEl ? (filtroEl.value || '').toLowerCase().trim() : '';
        const listaOriginal = (db.gastos && db.gastos[mes]) || [];

        // Toda la lógica del recibo vive en js/comprobante.js.
        // Acá sólo se lee el DOM, se delega y se abre WhatsApp.
        const comprobante = construirComprobante({
            gastos: listaOriginal,
            filtro: filtroTexto,
            periodo: mes
        });

        if (comprobante.vacio) {
            mostrarNotificacion('No hay conceptos para incluir en el comprobante.', 'warning');
            return;
        }

        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(comprobante.texto)}`, '_blank');
    } catch (err) {
        console.error('Error al preparar reporte:', err);
        manejarError('Comprobante de gastos', err);
    }
}

export function toggleAcordeon(contentId, iconId) {
    const content = document.getElementById(contentId);
    const icon = document.getElementById(iconId);
    if (!content) return;
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

export function cambiarTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById('tab-' + tabId);
    if (tabEl) tabEl.classList.add('active');
    ['resumen', 'ingresos', 'gastos', 'pasivos', 'deseos', 'anual'].forEach(t => {
        const btn = document.getElementById('nav-' + t);
        if (btn) {
            btn.className = (t === tabId) ? "flex flex-col items-center justify-center text-indigo-600 focus:outline-none py-1 font-bold" : "flex flex-col items-center justify-center text-gray-400 focus:outline-none py-1";
        }
    });
    window.scrollTo(0, 0);
    renderizarTodo();
    if (tabId === 'anual') setTimeout(renderizarGraficoAnual, 50);
    if (tabId === 'deseos') setTimeout(renderizarDeseosYProyeccion, 50);
}

/* =========================================================
   5. MOTOR DE RENDERIZADO Y GRÁFICOS
   ========================================================= */
// 5.A. Renderizado de gráficos (Chart.js)
export function renderizarGraficoAnual() {
    const ctx = document.getElementById('graficoAnual');
    const selectorAnio = document.getElementById('selector-anio');
    if (!ctx || !selectorAnio) return;
    const baseYear = selectorAnio.value;
    const labels = [], saldos = [];
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    for (let m = 1; m <= 12; m++) {
        const mKey = `${baseYear}-${m < 10 ? '0' + m : m}`;
        labels.push(`${mesesNombres[m-1]} ${baseYear}`);
        saldos.push(calcularNetoMes(mKey).neto - calcularGastosMes(mKey).total);
    }

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Saldo Real ($)', data: saldos, borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderWidth: 2, fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// 5.B. Renderizado integral de la UI (DOM updates)
/**
 * Guarda y vuelve a dibujar. El parámetro `motivo` es opcional:
 * los llamadores internos no lo pasan (quedan como 'auto'), y el
 * botón "Guardar" pasa 'manual' para que el usuario reciba
 * confirmación de que llegó a la nube.
 *
 * @param {string} [motivo]
 */
export async function guardarYRenderizar(motivo) {
    await guardarTodo(motivo || 'edicion');
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual')?.classList.contains('active')) renderizarGraficoAnual();
}

// 5.B.1. Renderizar dólar
function renderizarDolar() {
    const dolarEl = document.getElementById('dolar-oficial-val');
    if (dolarEl) dolarEl.innerText = '$ ' + Number(db.dolar || 1250).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 5.B.2. Renderizar resumen de ingresos
function renderizarResumenIngresos(ingCalc) {
    const recRem = document.getElementById('recibo-tot-rem');
    if (recRem) recRem.innerText = formatARS(ingCalc.rem);
    const recNoRem = document.getElementById('recibo-tot-norem');
    if (recNoRem) recNoRem.innerText = formatARS(ingCalc.norem);
    const recDed = document.getElementById('recibo-tot-ded');
    if (recDed) recDed.innerText = formatARS(ingCalc.ded);
    const recNeto = document.getElementById('recibo-neto-final');
    if (recNeto) recNeto.innerText = formatARS(ingCalc.neto);
}

// 5.B.3. Renderizar lista de ingresos con paginación
const ITEMS_POR_PAGINA = 20;
let paginaActualIngresos = 0;

function renderizarListaIngresos(ingresosMes) {
    const listIng = document.getElementById('lista-ingresos');
    if (!listIng) return;
    listIng.innerHTML = '';
    paginaActualIngresos = 0;

    delegar(listIng, 'click', {
        'eliminar-ingreso': (_el, id) => eliminarIngreso(id)
    });
    
    const inicio = paginaActualIngresos * ITEMS_POR_PAGINA;
    const fin = inicio + ITEMS_POR_PAGINA;
    const itemsPagina = ingresosMes.slice(inicio, fin);
    
    itemsPagina.forEach(i => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs';
        div.innerHTML = `<div><span class="font-bold block text-gray-800">${escapeHTML(i.concepto)}</span><span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium mt-0.5 bg-indigo-100 text-indigo-700">${escapeHTML(i.tipo)}</span></div><div class="flex items-center space-x-2"><span class="font-mono font-bold text-gray-900">${formatARS(i.valor || 0)}</span><button data-accion="eliminar-ingreso" data-id="${escapeHTML(String(i.id))}" class="text-red-500 text-[10px]">Eliminar</button></div>`;
        listIng.appendChild(div);
    });
    
    if (fin < ingresosMes.length) {
        const btnMas = document.createElement('button');
        btnMas.className = 'w-full py-2 mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition';
        btnMas.textContent = `Cargar más (${ingresosMes.length - fin} restantes)`;
        btnMas.onclick = () => {
            paginaActualIngresos++;
            const nuevoInicio = paginaActualIngresos * ITEMS_POR_PAGINA;
            const nuevoFin = nuevoInicio + ITEMS_POR_PAGINA;
            ingresosMes.slice(nuevoInicio, nuevoFin).forEach(i => {
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs';
                div.innerHTML = `<div><span class="font-bold block text-gray-800">${escapeHTML(i.concepto)}</span><span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium mt-0.5 bg-indigo-100 text-indigo-700">${escapeHTML(i.tipo)}</span></div><div class="flex items-center space-x-2"><span class="font-mono font-bold text-gray-900">${formatARS(i.valor || 0)}</span><button data-accion="eliminar-ingreso" data-id="${escapeHTML(String(i.id))}" class="text-red-500 text-[10px]">Eliminar</button></div>`;
                listIng.appendChild(div);
            });
            if (nuevoFin >= ingresosMes.length) btnMas.remove();
        };
        listIng.appendChild(btnMas);
    }
}

// 5.B.4. Renderizar tarjetas de saldo
function renderizarTarjetasSaldo(ingCalc, gasCalc, saldoReal) {
    const cardSaldo = document.getElementById('card-saldo-real');
    if (cardSaldo) cardSaldo.innerText = formatARS(saldoReal);
    const cardIng = document.getElementById('card-total-ingresos');
    if (cardIng) cardIng.innerText = formatARS(ingCalc.neto);
    const cardEgr = document.getElementById('card-total-egresos');
    if (cardEgr) cardEgr.innerText = formatARS(gasCalc.total);
    const cardPag = document.getElementById('card-gastos-pagados');
    if (cardPag) cardPag.innerText = formatARS(gasCalc.pagado);
    const cardPen = document.getElementById('card-gastos-pendientes');
    if (cardPen) cardPen.innerText = formatARS(gasCalc.pendientes);
}

// 5.B.5. Renderizar desglose de egresos
function renderizarDesgloseEgresos(gasCalc) {
    const sumFijos = document.getElementById('summary-col-fijos');
    if (sumFijos) sumFijos.innerText = formatARS(gasCalc.fijos);
    const sumUnicos = document.getElementById('summary-col-unicos');
    if (sumUnicos) sumUnicos.innerText = formatARS(gasCalc.unicos);
    const sumCuotas = document.getElementById('summary-col-cuotas');
    if (sumCuotas) sumCuotas.innerText = formatARS(gasCalc.cuotas);
}

// 5.B.6. Renderizar totales de gastos
function renderizarTotalesGastos(ingCalc, gasCalc) {
    const gastosSueldoEl = document.getElementById('gastos-sueldo-neto');
    if (gastosSueldoEl) gastosSueldoEl.innerText = formatARS(ingCalc.neto);
    const gastosDispEl = document.getElementById('gastos-saldo-disponible');
    if (gastosDispEl) gastosDispEl.innerText = formatARS(ingCalc.neto - gasCalc.pagado);
    const totGen = document.getElementById('gastos-tot-general');
    if (totGen) totGen.innerText = formatARS(gasCalc.total);
    const totPag = document.getElementById('gastos-tot-pagado');
    if (totPag) totPag.innerText = formatARS(gasCalc.pagado);
    const totPen = document.getElementById('gastos-tot-pendiente');
    if (totPen) totPen.innerText = formatARS(gasCalc.pendientes);
}

// 5.B.7. Renderizar lista de gastos por categoría (colapsable)
let gastosExpandidos = { fijos: false, unicos: false, cuotas: false };

export function toggleGastosCategoria(categoria) {
    gastosExpandidos[categoria] = !gastosExpandidos[categoria];
    renderizarTodo();
}

function renderizarListaGastos(gastosFiltrados, gasCalc) {
    const listaFijos = document.getElementById('lista-gastos-fijos');
    const listaUnicos = document.getElementById('lista-gastos-unicos');
    const listaCuotas = document.getElementById('lista-gastos-cuotas');
    if (listaFijos) listaFijos.innerHTML = '';
    if (listaUnicos) listaUnicos.innerHTML = '';
    if (listaCuotas) listaCuotas.innerHTML = '';

    const gastosFijos = gastosFiltrados.filter(g => normalizarCategoria(g.categoria) === 'fijos');
    const gastosUnicos = gastosFiltrados.filter(g => normalizarCategoria(g.categoria) === 'unicos');
    const gastosCuotas = gastosFiltrados.filter(g => normalizarCategoria(g.categoria) === 'cuotas');

    function crearItemGasto(g) {
        const item = document.createElement('div');
        item.className = 'bg-gray-50 rounded-xl p-2.5 border border-gray-100';
        const esCuotas = normalizarCategoria(g.categoria) === 'cuotas';
        const pagado = esPagado(g);
        // El ID viaja como dato en data-id, ya escapado, y no
        // interpolado dentro de JavaScript. Ver js/dom/delegacion.js.
        const idAttr = escapeHTML(String(g.id));
        const concepto = escapeHTML(g.concepto || 'Sin concepto');
        const etiqueta = esCuotas ? 'Cuota / Tarjeta' : (normalizarCategoria(g.categoria) === 'unicos' ? 'Único' : 'Fijo');
        const pasado = !!g.pasado;
        const origenTxt = g.origenMes ? `<p class="text-[9px] text-gray-400 mt-0.5">Desde: ${escapeHTML(g.origenMes)}</p>` : '';
        const pasadoTxt = pasado ? `<p class="text-[9px] text-amber-700 mt-0.5">Pasado → ${escapeHTML(g.pasadoAMes || '')}</p>` : '';
        const btnPasar = (!pagado && !pasado) ? `<button data-accion="pasar-siguiente" data-id="${idAttr}" class="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded whitespace-nowrap">Pasar →</button>` : '';
        const btnEditar = (!esCuotas) ? `<button data-accion="editar-gasto" data-id="${idAttr}" class="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded whitespace-nowrap">Edit</button>` : '';
        const btnEliminar = `<button data-accion="eliminar-gasto" data-id="${idAttr}" class="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded whitespace-nowrap">Del</button>`;

        item.draggable = true;
        item.dataset.gastoId = g.id;
        item.innerHTML = `
            <div class="flex justify-between items-center gap-2">
                <div class="min-w-0 flex items-center gap-2.5">
                    <input type="checkbox" data-accion="toggle-pago" data-id="${idAttr}" ${pagado ? 'checked' : ''} aria-label="Marcar ${concepto} como pagado" class="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer accent-indigo-600">
                    <div class="min-w-0">
                        <p class="font-bold text-xs ${pagado || pasado ? 'line-through text-gray-400' : 'text-gray-800'} truncate">${concepto}</p>
                        <p class="text-[10px] text-gray-500">${etiqueta}</p>
                        ${origenTxt}
                        ${pasadoTxt}
                    </div>
                </div>
                <div class="text-right flex items-center gap-2">
                    <p class="font-mono font-bold text-xs ${pagado || pasado ? 'line-through text-gray-400' : 'text-gray-900'}">${formatARS(g.monto)}</p>
                    <div class="flex gap-1 justify-end flex-wrap">
                        ${btnPasar}
                        ${btnEditar}
                        ${btnEliminar}
                    </div>
                </div>
            </div>
        `;
        return item;
    }

    function crearBloqueCategoria(titulo, total, gastos, categoria, expandido) {
        const bloque = document.createElement('div');
        bloque.className = 'bg-white rounded-xl border border-gray-200 overflow-hidden';
        const icono = expandido ? '▲' : '▼';
        bloque.innerHTML = `
            <div class="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-50 transition" data-accion="toggle-categoria" data-id="${categoria}" role="button" tabindex="0" aria-expanded="${expandido ? 'true' : 'false'}">
                <span class="font-bold text-xs text-gray-700">${titulo} (${gastos.length})</span>
                <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-xs text-gray-900">${formatARS(total)}</span>
                    <span class="text-[10px] text-gray-400">${icono}</span>
                </div>
            </div>
            ${expandido ? '<div class="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2"></div>' : ''}
        `;
        if (expandido) {
            const container = bloque.querySelector('.px-3.pb-3');
            gastos.forEach(g => container.appendChild(crearItemGasto(g)));
        }
        return bloque;
    }

    // Un único listener por contenedor y tipo de evento, registrado
    // la primera vez. El render recrea los botones en cada llamada,
    // pero los contenedores viven en index.html, así que delegar una
    // vez alcanza y no hay que reconectar nada después.
    const acciones = {
        'toggle-pago': (_el, id) => togglePagoGasto(id),
        'editar-gasto': (_el, id) => editarGasto(id),
        'eliminar-gasto': (_el, id) => eliminarGasto(id),
        'toggle-categoria': (_el, id) => toggleGastosCategoria(id),
        'pasar-siguiente': (_el, id) => pasarGastoAlSiguiente(id)
    };
    [listaFijos, listaUnicos, listaCuotas].forEach(lista => {
        delegar(lista, 'click', acciones);
        delegar(lista, 'change', acciones);
        configurarDragDropGastos(lista);
    });

    if (listaFijos) {
        listaFijos.appendChild(crearBloqueCategoria('Fijos', gasCalc.fijos, gastosFijos, 'fijos', gastosExpandidos.fijos));
    }
    if (listaUnicos) {
        listaUnicos.appendChild(crearBloqueCategoria('Únicos', gasCalc.unicos, gastosUnicos, 'unicos', gastosExpandidos.unicos));
    }
    if (listaCuotas) {
        listaCuotas.appendChild(crearBloqueCategoria('Cuotas', gasCalc.cuotas, gastosCuotas, 'cuotas', gastosExpandidos.cuotas));
    }
}

// 5.B.8. Renderizar lista de pasivos
function renderizarListaPasivos(pasivos, saldoReal) {
    const pasivosList = document.getElementById('lista-pasivos-consolidados');
    if (!pasivosList) return;
    pasivosList.innerHTML = '';

    delegar(pasivosList, 'click', {
        'eliminar-pasivo': (_el, id) => eliminarPasivo(id)
    });
    pasivos.forEach(p => {
        const calculo = calcularPasivoPorKeyword(p.keyword);
        const alcanza = saldoReal >= calculo.totalDeuda;
        const div = document.createElement('div');
        div.className = 'bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2';
        div.innerHTML = `
            <div class="flex justify-between items-center">
                <div>
                    <span class="font-bold text-xs text-gray-800 block">${escapeHTML(p.nombre)}</span>
                    <span class="text-[10px] text-gray-500">Filtro: "${escapeHTML(p.keyword)}"</span>
                </div>
                <button data-accion="eliminar-pasivo" data-id="${escapeHTML(String(p.id))}" class="text-red-500 text-[10px]">Eliminar</button>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-gray-200">
                <div><span class="text-[10px] text-gray-500 block">Cuotas Pendientes</span><span class="font-mono font-bold">${calculo.cuotasRestantes} cuotas</span></div>
                <div class="text-right"><span class="text-[10px] text-gray-500 block">Deuda Total</span><span class="font-mono font-bold text-red-600 text-sm">${formatARS(calculo.totalDeuda)}</span></div>
            </div>
            <div class="text-[10px] p-2 rounded-lg ${alcanza ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}">
                ${alcanza ? '✔ Saldo suficiente para precancelar.' : '⚠ Tu saldo no cubre la cancelación total.'}
            </div>
        `;
        pasivosList.appendChild(div);
    });
}

// 5.B.9. Renderizar tabla anual
function renderizarTablaAnual(baseYear) {
    const tablaAnual = document.getElementById('tabla-anual-body');
    if (!tablaAnual) return;
    tablaAnual.innerHTML = '';
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    for (let m = 1; m <= 12; m++) {
        const key = `${baseYear}-${m < 10 ? '0' + m : m}`;
        const net = calcularNetoMes(key).neto;
        const gasto = calcularGastosMes(key);
        const saldo = net - gasto.total;
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-100';
        tr.innerHTML = `<td class="py-2 font-medium">${mesesNombres[m-1]} ${baseYear}</td><td class="py-2 text-right font-mono">${formatARS(net)}</td><td class="py-2 text-right font-mono">${formatARS(gasto.total)}</td><td class="py-2 text-right font-mono">${formatARS(saldo)}</td>`;
        tablaAnual.appendChild(tr);
    }
}

// 5.B.10. Función principal de renderizado
export function renderizarTodo() {
    try {
        const mes = obtenerMesActual();
        const ingCalc = calcularNetoMes(mes);
        const gasCalc = calcularGastosMes(mes);
        const saldoReal = ingCalc.neto - gasCalc.total;

        renderizarDolar();
        renderizarResumenIngresos(ingCalc);
        renderizarListaIngresos((db.ingresos && db.ingresos[mes]) || []);
        renderizarTarjetasSaldo(ingCalc, gasCalc, saldoReal);
        renderizarDesgloseEgresos(gasCalc);
        renderizarTotalesGastos(ingCalc, gasCalc);

        // Filtro de gastos
        const filtroEl = document.getElementById('filtro-gastos');
        const filtroTexto = filtroEl ? (filtroEl.value || '').toLowerCase().trim() : '';
        const btnLimpiar = document.getElementById('btn-limpiar-filtro');
        const badgeEl = document.getElementById('filtro-total-badge');

        if (filtroTexto && btnLimpiar) btnLimpiar.classList.remove('hidden');
        else if (btnLimpiar) btnLimpiar.classList.add('hidden');

        let totalFiltrado = 0;
        const gastosMes = (db.gastos && db.gastos[mes]) || [];
        const gastosFiltrados = gastosMes.filter(g => !filtroTexto || (g.concepto && g.concepto.toLowerCase().includes(filtroTexto)));

        const ordenarPorEstado = (a, b) => {
            const pa = a && a.pasado;
            const pb = b && b.pasado;
            if (pa !== pb) return pa ? 1 : -1;
            const pagA = esPagado(a);
            const pagB = esPagado(b);
            if (pagA !== pagB) return pagA ? 1 : -1;
            return 0;
        };
        const gastosOrdenados = [...gastosFiltrados].sort(ordenarPorEstado);
        gastosOrdenados.forEach(g => { totalFiltrado += Number(g.monto || 0); });
        if (badgeEl) badgeEl.innerText = `Total: ${formatARS(totalFiltrado)}`;

        renderizarListaGastos(gastosOrdenados, gasCalc);
        renderizarListaPasivos(db.pasivos || [], saldoReal);

        if (document.getElementById('tab-deseos')?.classList.contains('active')) {
            renderizarDeseosYProyeccion();
        }

        const selectorAnio = document.getElementById('selector-anio');
        if (selectorAnio) renderizarTablaAnual(selectorAnio.value);
    } catch (err) {
        console.error('Error en renderizarTodo:', err);
    }
}

/* =========================================================
   6. ASIGNACIÓN GLOBAL INMEDIATA AL OBJETO WINDOW
   ========================================================= */
// 6.A. Asignación directa y explícita de cada handler al entorno global
window.iniciarSesionGoogle = handleIniciarSesionGoogle;
window.cerrarSesion = handleCerrarSesion;
window.editarDolarManual = editarDolarManual;
window.obtenerDolarOficialAPI = obtenerDolarOficialAPI;
window.mesAnterior = mesAnterior;
window.mesSiguiente = mesSiguiente;
window.cambiarAnioCuadricula = cambiarAnioCuadricula;
window.seleccionarMesCuadricula = seleccionarMesCuadricula;
window.toggleAcordeon = toggleAcordeon;
window.guardarIngreso = guardarIngreso;
window.eliminarIngreso = eliminarIngreso;
window.toggleTipoIngreso = toggleTipoIngreso;
window.toggleModoMonto = toggleModoMonto;
window.replicarIngresosMes = replicarIngresosMes;
window.guardarGasto = guardarGasto;
window.editarGasto = editarGasto;
window.cancelarEdicionGasto = cancelarEdicionGasto;
window.eliminarGasto = eliminarGasto;
window.togglePagoGasto = togglePagoGasto;
window.toggleGastosCategoria = toggleGastosCategoria;
window.pasarGastoAlSiguiente = pasarGastoAlSiguiente;
window.guardarCompraTarjeta = guardarCompraTarjeta;
window.ejecutarRollOverDeudas = ejecutarRollOverDeudas;
window.limpiarFiltroGastos = limpiarFiltroGastos;
window.accionReporteWpGastos = accionReporteWpGastos;
window.guardarReglaPasivo = guardarReglaPasivo;
window.eliminarPasivo = eliminarPasivo;
window.guardarDeseo = guardarDeseo;
window.eliminarDeseo = eliminarDeseo;
window.renderizarDeseosYProyeccion = renderizarDeseosYProyeccion;
window.forzarSincronizacion = forzarSincronizacion;
// El botón "Guardar" del Centro de Operaciones lo invoca desde un
// onclick inline. Sin esta línea el clic lanzaba
// "window.guardarYRenderizar is not a function" y el guardado
// manual nunca ocurría.
window.guardarYRenderizar = guardarYRenderizar;
window.accionGuardarJSON = accionGuardarJSON;
window.accionIniciarImportacionJSON = accionIniciarImportacionJSON;
window.importarRespaldoJSONAuto = importarRespaldoJSONAuto;
window.accionActualizarApp = accionActualizarApp;
window.accionExportarPDF = accionExportarPDF;
window.cambiarTab = cambiarTab;
window.renderizarTodo = renderizarTodo;

console.log('[Script] Funciones expuestas a window correctamente. forzarSincronizacion es:', typeof window.forzarSincronizacion);

/* =========================================================
   7. CICLO DE VIDA E INICIALIZACIÓN DE LA APP
   ========================================================= */
// 7.A. Función principal de inicio
export async function initApp() {
    try {
        const fechaObj = new Date();
        const dateEl = document.getElementById('current-date-label');
        if (dateEl) {
            dateEl.innerText = fechaObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }

        const estado = document.getElementById('debug-app-status');
        if (estado) estado.textContent = 'Cargando datos de la sesión…';

        // 1. Cargar primero desde localStorage (instantáneo)
        const fallback = localStorage.getItem('finanzas_db_fallback');
        if (fallback) {
            try {
                Object.assign(db, JSON.parse(fallback));
                if (db.mesActivo) {
                    asegurarAnioEnSelect(db.mesActivo.split('-')[0]);
                }
                renderizarCuadriculaMeses();
                renderizarTodo();
                if (estado) estado.textContent = 'Datos locales cargados. Sincronizando…';
            } catch (e) {
                console.warn('Error cargando fallback local:', e);
            }
        }

        // 2. Luego sincronizar con la nube
        const resultado = await cargarBaseDatosRemota();

        if (!resultado || !resultado.user) {
            mostrarPantallaLogin();
            // Sin sesión no hay nada que proteger: el control queda
            // detenido para no dejar un temporizador corriendo.
            detenerInactividad();
            if (estado) estado.textContent = 'Sin sesión activa';
            return;
        }

        ocultarPantallaLogin();

        if (db && db.mesActivo) {
            asegurarAnioEnSelect(db.mesActivo.split('-')[0]);
        } else {
            const now = new Date();
            db.mesActivo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            asegurarAnioEnSelect(now.getFullYear());
        }

        obtenerDolarOficialAPI().catch(() => {});

        if (estado) estado.textContent = 'Aplicación lista';
        toggleTipoIngreso();
        renderizarCuadriculaMeses();
        renderizarTodo();

        // Sólo con sesión activa y datos en pantalla. Si se armara
        // antes, los 5 minutos correrían durante la carga y el
        // cierre por inactividad dispararía sin que nadie la haya
        // usado todavía.
        armarInactividad();
    } catch (error) {
        console.error('No se pudo inicializar la aplicación:', error);
        const estado = document.getElementById('debug-app-status');
        if (estado) estado.textContent = 'Error al iniciar la aplicación';
        mostrarPantallaLogin();
    }
}

// 7.B. Disparo del arranque
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
