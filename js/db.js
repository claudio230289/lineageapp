/* =========================================================
   MÓDULO DE PERSISTENCIA Y AUTENTICACIÓN FIREBASE (js/db.js)
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuración de tu proyecto de Firebase
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
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

// Función para iniciar sesión con Google
export function iniciarSesionGoogle() {
    return signInWithPopup(auth, provider)
        .then((result) => {
            window.location.reload();
        })
        .catch((error) => {
            console.error("Error en autenticación:", error);
            alert("No se pudo iniciar sesión con Google.");
        });
}

export function cerrarSesion() {
    return signOut(auth).then(() => {
        window.location.reload();
    });
}

// Carga de datos vinculada al usuario autenticado
export function cargarBaseDatosRemota() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Usuario logueado: usamos un documento exclusivo para su UID
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
                // Si no hay sesión iniciada, forzamos el popup de Google
                iniciarSesionGoogle();
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
