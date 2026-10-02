/* =========================================================
   MÓDULO DE PERSISTENCIA Y AUTENTICACIÓN FIREBASE (js/db.js)
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { busEventos } from "./core/eventos.js";
import { APP_VERSION, SCHEMA_VERSION } from "./version.js";
import { crearBaseVacia, normalizarBase, prepararBase as prepararBaseNucleo } from "./nucleo/base.js";

/**
 * @deprecated Usar APP_VERSION de js/version.js. Se conserva para no
 * romper imports externos; los valores salen del mismo lugar.
 */
export { APP_VERSION } from "./version.js";
/**
 * @deprecated Usar SCHEMA_VERSION de js/version.js.
 */
export const DB_VERSION = SCHEMA_VERSION;

const firebaseConfig = {
    apiKey: "AIzaSyA-Seo2AO3STv9YghXE8SiZQ6R8tFS5T2E",
    authDomain: "lineageapp-7039f.firebaseapp.com",
    projectId: "lineageapp-7039f",
    storageBucket: "lineageapp-7039f.firebasestorage.app",
    messagingSenderId: "526969024739",
    appId: "1:526969024739:web:e64f5e1884d3c0d13f95d6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const dbFirestore = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export let db = crearBaseVacia();

/**
 * Normaliza la FORMA de los datos.
 *
 * Adaptador delgado sobre `normalizarBase` (js/nucleo/base.js). La
 * lógica vive allá para poder testearla: este módulo importa
 * Firebase por URL HTTPS y Node no puede cargarlo.
 *
 * Lo que garantiza: que existan `ingresos`, `gastos`, `deseos` y
 * `pasivos` con el tipo correcto, y que `dolar` sea número. Un
 * documento de Firestore de una versión vieja puede no tener
 * `deseos`; sin esto, el render de deseos revienta la app.
 *
 * Lo que NO hace, a propósito: NO fija `version`. Antes lo hacía,
 * con lo que una base en versión 12 quedaba estampada como 13 sin
 * pasar por ninguna migración. Ahora preserva la versión declarada
 * para que `aplicarMigraciones` pueda hacer su trabajo.
 *
 * @param {*} data Datos sin procesar
 * @returns {Object} Base normalizada (objeto nuevo)
 */
export function migrarDb(data) {
    return normalizarBase(data, db);
}

/**
 * Punto de entrada único para preparar datos que entran a la app:
 * normaliza la forma y luego aplica las migraciones pendientes.
 *
 * Existe porque hasta ahora cada llamador hacía una cosa distinta:
 * el import de JSON pasaba por `migrarDb` y la carga de Firestore no
 * pasaba por nada. Por eso un documento remoto con la forma
 * incompleta rompía la app mientras el mismo respaldo en un
 * archivo funcionaba bien.
 *
 * @param {*} data Datos sin procesar
 * @returns {{base:Object, migracionesAplicadas:number[]}}
 */
export function prepararBase(data) {
    return prepararBaseNucleo(data, db);
}

function textoError(error) {
    if (!error) return 'sin error';
    if (typeof error === 'string') return error;
    return `${error.code || error.name || 'Error'}: ${error.message || error}`;
}

export function mostrarDebug(mensaje, error = null) {
    const detalle = error ? `${mensaje}\n${textoError(error)}` : mensaje;
    console.error('[LineageApp]', detalle, error || '');
    const debug = document.getElementById('login-debug');
    if (debug) {
        debug.textContent = detalle;
        debug.classList.remove('hidden');
    }
}

function actualizarEstadoApp(mensaje) {
    const estado = document.getElementById('debug-app-status');
    if (estado) estado.textContent = mensaje;
}

function crearPanelLogin() {
    const panel = document.getElementById('login-panel');
    if (!panel) return;

    const version = document.getElementById('app-version-label');
    if (version) version.textContent = `Versión ${APP_VERSION}`;

    const boton = panel.querySelector('#login-google-button');
    if (boton && boton.dataset.authListenerAttached !== 'true') {
        boton.addEventListener('click', iniciarSesionGoogle);
        boton.dataset.authListenerAttached = 'true';
    }
}

function actualizarPanelLogin(user) {
    crearPanelLogin();
    const panel = document.getElementById('login-panel');
    const mainApp = document.getElementById('app-content');
    if (panel) panel.classList.toggle('hidden', Boolean(user));
    if (mainApp) mainApp.classList.toggle('hidden', !Boolean(user));
    actualizarEstadoApp(user ? 'Usuario autenticado. Cargando datos…' : 'Esperando inicio de sesión…');
    mostrarDebug(user ? `Autenticado: ${user.email || user.uid}` : `Sin sesión activa. Dominio: ${window.location.hostname}`);
}

const persistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
    mostrarDebug('No se pudo conservar la sesión', error);
    actualizarEstadoApp('No se pudo configurar la sesión.');
    throw error;
});

let authStateReadyResolved = false;
const authStateReady = persistenceReady.then(() => new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
        actualizarPanelLogin(user);
        if (!authStateReadyResolved) {
            authStateReadyResolved = true;
            resolve(user);
        }
    }, (error) => {
        mostrarDebug('Falló la observación de autenticación', error);
        actualizarEstadoApp('Error restaurando la sesión.');
        if (!authStateReadyResolved) {
            authStateReadyResolved = true;
            reject(error);
        }
    });
}));

export async function iniciarSesionGoogle() {
    mostrarDebug('Iniciando autenticación con Google...');
    try {
        await persistenceReady;
        const result = await signInWithPopup(auth, provider);
        return result?.user || auth.currentUser;
    } catch (error) {
        mostrarDebug('Falló el inicio de sesión', error);
        if (error.code === 'auth/unauthorized-domain') alert('Este dominio no está autorizado en Firebase Authentication.');
        else if (error.code === 'auth/operation-not-allowed') alert('El proveedor de Google no está habilitado en Firebase.');
        else if (error.code !== 'auth/popup-closed-by-user') alert(`No se pudo iniciar sesión.\nCódigo: ${error.code || 'unknown'}`);
        throw error;
    }
}

export function cerrarSesion() { return signOut(auth).then(() => window.location.reload()); }
window.cerrarSesion = cerrarSesion;

export async function esperarUsuario() {
    await persistenceReady;
    if (auth.currentUser) return auth.currentUser;
    return authStateReady;
}

/* =========================================================
   CONTRATO DE EVENTOS DE PERSISTENCIA
   =========================================================
   db.js no muestra avisos: emite hechos y deja que app.js
   decida si ameritan un toast. Motivos válidos de 'motivo':
     'auto'          guardado por intervalo (cada 10 min)
     'edicion'       el usuario agregó/editó/borró un registro
     'manual'        apretó el botón Guardar
     'importacion'   restauró un respaldo JSON

   Regla de presentación: los guardados automáticos NO se
   anuncian. Pasaría un toast cada 10 minutos sin que nadie lo
   pidiera. Los manuales y los errores, sí.
   ========================================================= */

/**
 * Emite un error de persistencia con el detalle ya formateado.
 * @private
 */
function reportarFalloPersistencia(operacion, motivo, error) {
    busEventos.emitir('db:error', {
        operacion,
        motivo,
        error,
        mensaje: textoError(error),
        // Si la copia local quedó escrita, el usuario puede
        // reintentar más tarde sin perder nada.
        recuperable: true
    });
}

export async function cargarBaseDatosRemota(usuario = null) {
    const user = usuario || await esperarUsuario();
    if (!user) {
        actualizarEstadoApp('Sesión no iniciada.');
        return { user: null, database: null };
    }

    actualizarEstadoApp('Cargando datos de Firestore…');
    busEventos.emitir('db:cargando', { operacion: 'cargar', motivo: 'arranque' });

    const docRef = doc(dbFirestore, 'finanzas_usuarios', user.uid);
    try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            // Antes: Object.assign(db, snap.data()) a pelo. La copia
            // local venía por localStorage y ya normalizada; la de
            // Firestore entraba sin ninguna garantía de forma, así
            // que un documento viejo sin `deseos` rompía la app. Ahora
            // pasa por el mismo camino que el import de JSON.
            const { base, migracionesAplicadas } = prepararBase(snap.data());
            if (migracionesAplicadas.length > 0) {
                console.info(`[Esquema] Migraciones aplicadas: ${migracionesAplicadas.join(', ')}`);
            }
            Object.assign(db, base);
        } else {
            await setDoc(docRef, db);
        }
        actualizarEstadoApp('Aplicación lista');
        busEventos.emitir('db:cargado', { operacion: 'cargar', motivo: 'arranque', destino: 'nube', vacio: !snap.exists() });
        return { user, database: db };
    } catch (error) {
        mostrarDebug('Falló la carga de datos de Firestore', error);
        actualizarEstadoApp('No se pudieron cargar los datos.');
        // La copia local ya está en localStorage: avisar evita que
        // alguien piense que ve sus datos cuando en realidad está
        // mirando el respaldo viejo del navegador.
        reportarFalloPersistencia('cargar', 'arranque', error);
        return { user, database: db, error };
    }
}

export async function guardarBaseDatosLocal(data, motivo = 'edicion') {
    db = data;
    localStorage.setItem('finanzas_db_fallback', JSON.stringify(db));
    busEventos.emitir('db:cargado', { operacion: 'guardar-local', motivo, destino: 'local' });

    if (auth.currentUser) {
        try {
            await setDoc(doc(dbFirestore, 'finanzas_usuarios', auth.currentUser.uid), db);
            busEventos.emitir('db:cargado', { operacion: 'guardar-local', motivo, destino: 'nube' });
            return { ok: true, destino: 'nube' };
        } catch (error) {
            mostrarDebug('Falló el guardado en Firestore', error);
            reportarFalloPersistencia('guardar-local', motivo, error);
            return { ok: false, destino: 'local', error };
        }
    }
    return { ok: true, destino: 'local' };
}

/**
 * Guarda la base completa en localStorage y en Firestore.
 *
 * El parámetro `motivo` es nuevo y opcional: los llamadores
 * existentes que invocan guardarTodo() siguen funcionando sin
 * cambios y se comportan como 'auto'.
 *
 * @param {string} [motivo]
 * @returns {Promise<{ok:boolean, destino:string, error?:Error}>}
 */
export async function guardarTodo(motivo = 'auto') {
    db.version = SCHEMA_VERSION;
    localStorage.setItem('finanzas_db_fallback', JSON.stringify(db));
    busEventos.emitir('db:cargado', { operacion: 'guardar', motivo, destino: 'local' });

    if (!auth.currentUser || !navigator.onLine) {
        // Sin sesión o sin red no es un fallo: la copia local está
        // escrita y se subirá en el próximo guardado con red.
        return { ok: true, destino: 'local', motivo: auth.currentUser ? 'sin-conexion' : 'sin-sesion' };
    }

    try {
        await setDoc(doc(dbFirestore, 'finanzas_usuarios', auth.currentUser.uid), db);
        console.log('[Guardado] Nube + Local');
        busEventos.emitir('db:cargado', { operacion: 'guardar', motivo, destino: 'nube' });
        return { ok: true, destino: 'nube' };
    } catch (error) {
        // Antes esto era un console.warn y nada más: el usuario
        // seguía creyendo que sus cambios estaban en la nube. Se
        // conserva la traza para diagnóstico y además se emite el
        // evento, que es lo que permite avisarle sin bloquear.
        console.warn('[Guardado] Solo local (sin conexión):', error);
        reportarFalloPersistencia('guardar', motivo, error);
        return { ok: false, destino: 'local', error };
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', crearPanelLogin, { once: true });
} else {
    crearPanelLogin();
}

/* =========================================================
   GUARDADO AUTOMÁTICO CADA 10 MINUTOS
   ========================================================= */
if (typeof window !== 'undefined') {
    setInterval(async () => {
        if (auth.currentUser && navigator.onLine) {
            try {
                // 'auto' explícito: el guardado periódico nunca debe
                // generar un toast aunque la nube falle. Si alguien
                // lo cambia a 'manual', cada 10 minutos aparecería un
                // aviso que nadie pidió.
                await guardarTodo('auto');
                console.log('[Auto-guardado] Cada 10 min');
            } catch (e) {
                console.warn('[Auto-guardado] Falló:', e);
            }
        }
    }, 10 * 60 * 1000);
}
