/* =========================================================
   MÓDULO DE PERSISTENCIA Y AUTENTICACIÓN FIREBASE (js/db.js)
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
const auth = getAuth(app);
const dbFirestore = getFirestore(app);
const provider = new GoogleAuthProvider();

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

// Función para iniciar sesión con Google (accionada por el usuario)
export function iniciarSesionGoogle() {
    return signInWithPopup(auth, provider)
        .then(() => {
            window.location.reload();
        })
        .catch((error) => {
            console.error("Error en autenticación:", error);
            alert("No se pudo iniciar sesión con Google. Verificá los permisos del navegador.");
        });
}

export function cerrarSesion() {
    return signOut(auth).then(() => {
        window.location.reload();
    });
}

// Carga de datos con manejo seguro si no hay sesión
export function cargarBaseDatosRemota() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const docRef = doc(dbFirestore, "finanzas_usuarios", user.uid);
                try {
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        Object.assign(db, snap.data());
                    } else {
                        await setDoc(docRef, db);
                    }
                } catch (e) {
                    console.error("Error al leer Firestore:", e);
                }
                resolve(db);
            } else {
                // Si no hay sesión, resolvemos indicando que falta login
                resolve(null);
            }
        });
    });
}

export async function guardarBaseDatosLocal(data) {
    db = data;
    localStorage.setItem('finanzas_db_fallback', JSON.stringify(db));
    const user = auth.currentUser;
    if (user) {
        try {
            const docRef = doc(dbFirestore, "finanzas_usuarios", user.uid);
            await setDoc(docRef, db);
        } catch (e) {
            console.error("Error al guardar en Firestore:", e);
        }
    }
}
