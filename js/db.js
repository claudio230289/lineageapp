/* =========================================================
   MÓDULO DE PERSISTENCIA Y AUTENTICACIÓN FIREBASE (js/db.js)
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
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

function crearPanelLogin() {
    if (document.getElementById('login-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'login-panel';
    panel.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-gray-100 p-6';
    panel.innerHTML = `
        <div class="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl border border-gray-200">
            <h2 class="text-xl font-bold text-gray-800">Mis Finanzas</h2>
            <p class="mt-2 mb-5 text-sm text-gray-500">Iniciá sesión para continuar</p>
            <button id="login-google-button" type="button" class="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700">
                Continuar con Google
            </button>
        </div>`;
    document.body.appendChild(panel);
    const boton = panel.querySelector('#login-google-button');
    if (boton) boton.addEventListener('click', iniciarSesionGoogle);
}

function actualizarPanelLogin(user) {
    crearPanelLogin();
    const panel = document.getElementById('login-panel');
    const mainApp = document.getElementById('app-content');

    if (panel) panel.classList.toggle('hidden', Boolean(user));
    if (mainApp) mainApp.classList.toggle('hidden', !Boolean(user));
}

export function iniciarSesionGoogle() {
    const isMobileOrEmbedded = /android|iphone|ipad|mobile|wv\b|instagram|fbav|fban/i.test(navigator.userAgent)
        || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

    const loginPromise = isMobileOrEmbedded
        ? signInWithRedirect(auth, provider)
        : signInWithPopup(auth, provider);

    return loginPromise.then((result) => result?.user || auth.currentUser).catch((error) => {
        console.error('Error en autenticación:', error);

        if (error.code === 'auth/popup-blocked') {
            alert('La ventana emergente fue bloqueada por el navegador. Se reintentará con redirección.');
            return signInWithRedirect(auth, provider);
        }

        if (error.code === 'auth/unauthorized-domain') {
            alert('Este dominio no está autorizado en Firebase Authentication. Revisá los Authorized domains.');
        } else if (error.code === 'auth/operation-not-allowed') {
            alert('El proveedor de Google no está habilitado en Firebase.');
        } else if (error.code !== 'auth/popup-closed-by-user') {
            alert(`No se pudo iniciar sesión con Google.\nCódigo: ${error.code || 'unknown'}`);
        }

        throw error;
    });
}

export async function procesarResultadoRedirect() {
    try {
        const result = await getRedirectResult(auth);
        return result?.user || null;
    } catch (error) {
        console.error('Error al procesar redirect de Google:', error);
        return null;
    }
}

export function cerrarSesion() {
    return signOut(auth).then(() => window.location.reload());
}

// Los atributos onclick del HTML necesitan esta función en window.
window.cerrarSesion = cerrarSesion;

export function esperarUsuario() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

export async function cargarBaseDatosRemota() {
    const user = await esperarUsuario();

    if (!user) return { user: null, database: null };

    const docRef = doc(dbFirestore, 'finanzas_usuarios', user.uid);
    try {
        const snap = await getDoc(docRef);
        if (snap.exists()) Object.assign(db, snap.data());
        else await setDoc(docRef, db);
        return { user, database: db };
    } catch (e) {
        console.error('Error al leer Firestore:', e);
        return { user, database: db, error: e };
    }
}

export async function guardarBaseDatosLocal(data) {
    db = data;
    localStorage.setItem('finanzas_db_fallback', JSON.stringify(db));
    const user = auth.currentUser;
    if (user) {
        try {
            await setDoc(doc(dbFirestore, 'finanzas_usuarios', user.uid), db);
        } catch (e) {
            console.error('Error al guardar en Firestore:', e);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        crearPanelLogin();
        onAuthStateChanged(auth, actualizarPanelLogin);
    }, { once: true });
} else {
    crearPanelLogin();
    onAuthStateChanged(auth, actualizarPanelLogin);
}
