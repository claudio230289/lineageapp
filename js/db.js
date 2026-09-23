/* =========================================================
   MÓDULO DE PERSISTENCIA Y AUTENTICACIÓN FIREBASE (js/db.js)
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
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
    mostrarDebug(user ? `Autenticado: ${user.email || user.uid}` : `Sin sesión activa. Dominio: ${window.location.hostname}`);
}

export function iniciarSesionGoogle() {
    mostrarDebug('Iniciando autenticación con Google...');
    return signInWithPopup(auth, provider).catch((error) => {
        mostrarDebug('Falló el popup, intentando con redirect...', error);
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
            return signInWithRedirect(auth, provider);
        }
        if (error.code === 'auth/unauthorized-domain') alert('Este dominio no está autorizado en Firebase Authentication.');
        else if (error.code === 'auth/operation-not-allowed') alert('El proveedor de Google no está habilitado en Firebase.');
        else if (error.code !== 'auth/popup-closed-by-user') alert(`No se pudo iniciar sesión.\nCódigo: ${error.code || 'unknown'}`);
        throw error;
    });
}

export async function procesarResultadoRedirect() {
    try {
        const result = await getRedirectResult(auth);
        if (result?.user) mostrarDebug(`Redirect exitoso: ${result.user.email || result.user.uid}`);
        return result?.user || null;
    } catch (error) {
        mostrarDebug('Falló el resultado de redirección', error);
        return null;
    }
}

export function cerrarSesion() { return signOut(auth).then(() => window.location.reload()); }
window.cerrarSesion = cerrarSesion;

export function esperarUsuario() {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        }, (error) => {
            unsubscribe();
            reject(error);
        });
    });
}

export async function cargarBaseDatosRemota(usuario = null) {
    const user = usuario || await esperarUsuario();
    if (!user) return { user: null, database: null };
    const docRef = doc(dbFirestore, 'finanzas_usuarios', user.uid);
    try {
        const snap = await getDoc(docRef);
        if (snap.exists()) Object.assign(db, snap.data());
        else await setDoc(docRef, db);
        return { user, database: db };
    } catch (error) {
        mostrarDebug('Falló la carga de datos de Firestore', error);
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

setPersistence(auth, browserLocalPersistence).catch((error) => mostrarDebug('No se pudo conservar la sesión', error));

async function inicializarModuloDb(callbackAppReady) {
    try {
        await procesarResultadoRedirect();
    } catch (error) {
        mostrarDebug('Error procesando redirección inicial', error);
    }

    onAuthStateChanged(auth, async (user) => {
        actualizarPanelLogin(user);
        if (user) {
            const resultado = await cargarBaseDatosRemota(user);
            if (typeof callbackAppReady === 'function') {
                callbackAppReady(resultado);
            }
        } else {
            if (typeof callbackAppReady === 'function') {
                callbackAppReady({ user: null, database: null });
            }
        }
    }, (error) => {
        mostrarDebug('Falló la observación de autenticación', error);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        crearPanelLogin();
    }, { once: true });
} else {
    crearPanelLogin();
}
