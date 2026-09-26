/* =========================================================
   MÓDULO DE PERSISTENCIAs Y AUTENTICACIÓN FIREBASE (js/db.js)
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

export const APP_VERSION = '13.8';
export const DB_VERSION = 13;

export let db = {
    version: DB_VERSION,
    dolar: 1250,
    mesActivo: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    ingresos: {},
    gastos: {},
    deseos: [],
    pasivos: []
};

export function migrarDb(data) {
    const base = data && typeof data === 'object' ? data : {};
    return {
        ...db,
        ...base,
        version: DB_VERSION,
        dolar: Number(base.dolar) || 1250,
        mesActivo: base.mesActivo || db.mesActivo,
        ingresos: base.ingresos && typeof base.ingresos === 'object' ? base.ingresos : {},
        gastos: base.gastos && typeof base.gastos === 'object' ? base.gastos : {},
        deseos: Array.isArray(base.deseos) ? base.deseos : [],
        pasivos: Array.isArray(base.pasivos) ? base.pasivos : []
    };
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
}

// Configuración de persistencia con manejo seguro de restricciones del navegador
const persistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('[LineageApp] Advertencia de persistencia local:', error);
    return null;
});

let authStateReadyResolved = false;
const authStateReady = new Promise((resolve) => {
    // Timeout de seguridad de 4 segundos para evitar congelamiento si Firebase demora
    const timeoutId = setTimeout(() => {
        if (!authStateReadyResolved) {
            authStateReadyResolved = true;
            console.warn('[LineageApp] Timeout de autenticación alcanzado. Forzando liberación de interfaz.');
            resolve(null);
        }
    }, 4000);

    onAuthStateChanged(auth, (user) => {
        if (!authStateReadyResolved) {
            authStateReadyResolved = true;
            clearTimeout(timeoutId);
            resolve(user);
        }
        actualizarPanelLogin(user);
    }, (error) => {
        if (!authStateReadyResolved) {
            authStateReadyResolved = true;
            clearTimeout(timeoutId);
            mostrarDebug('Error en estado de autenticación', error);
            resolve(null);
        }
    });
});

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

export async function cargarBaseDatosRemota(usuario = null) {
    const user = usuario || await esperarUsuario();
    if (!user) {
        actualizarEstadoApp('Sesión no iniciada.');
        return { user: null, database: null };
    }

    actualizarEstadoApp('Cargando datos de Firestore…');
    const docRef = doc(dbFirestore, 'finanzas_usuarios', user.uid);
    try {
        const snap = await getDoc(docRef);
        if (snap.exists()) Object.assign(db, migrarDb(snap.data()));
        else await setDoc(docRef, db);
        actualizarEstadoApp('Aplicación lista');
        return { user, database: db };
    } catch (error) {
        mostrarDebug('Falló la carga de datos de Firestore', error);
        actualizarEstadoApp('No se pudieron cargar los datos.');
        return { user, database: db, error };
    }
}

export async function guardarBaseDatosLocal(data) {
    db = data;
    localStorage.setItem('finanzas_db_fallback', JSON.stringify(db));
    if (auth.currentUser) {
        try { await setDoc(doc(dbFirestore, 'finanzas_usuarios', auth.currentUser.uid), db); }
        catch (error) { mostrarDebug('Falló el guardado en Firestore', error); }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', crearPanelLogin, { once: true });
} else {
    crearPanelLogin();
}

/* =========================================================
   SINCRONIZACIÓN INTELIGENTE EN SEGUNDO PLANO (Eventos PWA)
   ========================================================= */
if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'hidden') {
            if (navigator.onLine && typeof guardarBaseDatosLocal === 'function') {
                try {
                    await guardarBaseDatosLocal(db);
                } catch (e) {
                    console.warn("[Sync PWA] Error al sincronizar en segundo plano:", e);
                }
            }
        }
    });

    window.addEventListener('online', async () => {
        if (typeof guardarBaseDatosLocal === 'function') {
            try {
                await guardarBaseDatosLocal(db);
            } catch (e) {
                console.warn("[Sync PWA] Error al sincronizar tras reconexión:", e);
            }
        }
    });
}
