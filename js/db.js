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

export function iniciarSesionGoogle() {
    const isMobileOrEmbedded = /android|iphone|ipad|mobile|wv\b|instagram|fbav|fban/i.test(navigator.userAgent)
        || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

    if (isMobileOrEmbedded) {
        return signInWithRedirect(auth, provider)
            .catch((error) => {
                console.error('Error de autenticación con redirect:', error);
                alert('No se pudo iniciar sesión con Google desde este navegador. Probá otra vez o abrí la app en Chrome/Safari.');
                throw error;
            });
    }

    return signInWithPopup(auth, provider)
        .then((result) => result.user)
        .catch((error) => {
            console.error('Error en autenticación:', {
                code: error.code,
                message: error.message,
                customData: error.customData,
                stack: error.stack
            });

            if (error.code === 'auth/popup-blocked') {
                alert('La ventana emergente fue bloqueada por el navegador. Se reintentará con redirección.');
                return signInWithRedirect(auth, provider);
            }

            if (error.code === 'auth/unauthorized-domain') {
                alert('Este dominio no está autorizado en Firebase Authentication. Revisá los Authorized Domains.');
            } else if (error.code === 'auth/popup-closed-by-user') {
                alert('Se canceló el inicio de sesión con Google.');
            } else if (error.code === 'auth/operation-not-allowed') {
                alert('El proveedor de Google no está habilitado en Firebase.');
            } else {
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
    return signOut(auth).then(() => {
        window.location.reload();
    });
}

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

    if (!user) {
        return { user: null, database: null };
    }

    const docRef = doc(dbFirestore, 'finanzas_usuarios', user.uid);

    try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            Object.assign(db, snap.data());
        } else {
            await setDoc(docRef, db);
        }
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
            const docRef = doc(dbFirestore, 'finanzas_usuarios', user.uid);
            await setDoc(docRef, db);
        } catch (e) {
            console.error('Error al guardar en Firestore:', e);
        }
    }
}
