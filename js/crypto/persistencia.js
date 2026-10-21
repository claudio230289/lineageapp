/* =========================================================
   ADAPTADOR DE PERSISTENCIA CRIPTOGRÁFICA (js/crypto/persistencia.js)
   Fase 3 del Plan Cero Conocimiento (Zero-Knowledge)
   Integración entre Motor Criptográfico, WebAuthn y Persistencia
   ========================================================= */

import {
    cifrarObjeto,
    descifrarObjeto,
    esDocumentoCifrado,
    derivarClave,
    generarSalt
} from './nucleo.js';

import {
    obtenerClaveActiva,
    estaSesionDesbloqueada,
    obtenerSaltActivo,
    establecerClaveActiva,
    restaurarSesionCriptoDesdeSessionStorage
} from './biometria.js';

import {
    abrirModalDesbloquearCifrado
} from './ui.js';

import { sanitizarParaFirestore } from '../nucleo/base.js';

/**
 * Prepara los datos para ser persistidos en la nube (Firestore).
 * Si el usuario tiene una sesión criptográfica activa (desbloqueada con PIN o biometría),
 * empaqueta y cifra la base completa en el sobre estándar de cero conocimiento.
 * Si no tiene cifrado activado, sanitiza y retorna los datos en texto plano
 * garantizando retrocompatibilidad con usuarios y esquemas existentes.
 *
 * @param {Object} datos Base de datos o documento a guardar
 * @param {string|null} [usuarioId] UID del usuario actual
 * @param {Object} [opciones={}] Opciones criptográficas adicionales (clave o salt forzados)
 * @returns {Promise<Object>} Sobre cifrado { esCifrado: true, ... } o datos sanitizados
 */
export async function prepararDocParaNube(datos, usuarioId = null, opciones = {}) {
    if (!estaSesionDesbloqueada() && typeof sessionStorage !== 'undefined') {
        await restaurarSesionCriptoDesdeSessionStorage(usuarioId);
    }
    const sesionActiva = estaSesionDesbloqueada();
    const clave = opciones.clave || (sesionActiva ? obtenerClaveActiva() : null);

    if (clave) {
        let salt = opciones.salt || obtenerSaltActivo();
        if (!salt && usuarioId && typeof localStorage !== 'undefined') {
            try {
                salt = localStorage.getItem(`cero_conocimiento_salt_${usuarioId}`);
            } catch (_) {}
        }
        if (!salt) {
            salt = generarSalt(16);
        }

        // Generar sobre cifrado AES-GCM 256 bits
        return await cifrarObjeto(datos, clave, salt);
    }

    // Guarda de seguridad Cero Conocimiento:
    // Si el usuario ya tiene configurado el cifrado (salt registrado o flag activo)
    // pero la sesión criptográfica se encuentra bloqueada, queda TERMINANTEMENTE PROHIBIDO
    // enviar datos en texto plano a la nube para no exponer información confidencial ni
    // sobreescribir el sobre cifrado en Firestore.
    let tieneCifradoConfigurado = false;
    if (usuarioId && typeof localStorage !== 'undefined') {
        try {
            tieneCifradoConfigurado = Boolean(
                localStorage.getItem(`cero_conocimiento_salt_${usuarioId}`) ||
                localStorage.getItem(`cero_conocimiento_activo_${usuarioId}`)
            );
        } catch (_) {}
    }

    if (tieneCifradoConfigurado) {
        console.warn('[Seguridad] Escritura remota abortada: la sesión criptográfica está bloqueada para este usuario.');
        return null;
    }

    // Modo retrocompatible: documento estándar en texto plano sanitizado
    return sanitizarParaFirestore(datos);
}

/**
 * Procesa un documento recuperado de la nube (Firestore).
 * Si detecta que es un sobre cifrado, lo descifra de inmediato si la sesión ya
 * está desbloqueada en memoria, o dispara el flujo de solicitud de desbloqueo UI.
 * Si el documento no está cifrado, lo retorna en texto plano.
 *
 * @param {Object} docData Datos recuperados de Firestore
 * @param {Object|string|null} [usuario] Objeto de usuario o UID
 * @param {Object} [opciones={}] Configuración y callbacks de resolución
 * @returns {Promise<Object>} Datos descifrados o texto plano original
 */
export async function procesarDocDeNube(docData, usuario = null, opciones = {}) {
    if (!docData || typeof docData !== 'object') {
        return docData;
    }

    if (!esDocumentoCifrado(docData)) {
        return docData;
    }

    const uid = (typeof usuario === 'string' ? usuario : (usuario?.uid || ''));

    // Intentar restaurar sesión activa desde sessionStorage si la memoria se limpió por recarga
    if (!estaSesionDesbloqueada()) {
        await restaurarSesionCriptoDesdeSessionStorage(uid);
    }

    // El documento está cifrado: verificar si ya tenemos la clave en memoria
    if (estaSesionDesbloqueada() && obtenerClaveActiva()) {
        return await descifrarObjeto(docData, obtenerClaveActiva());
    }

    // Sesión fresca / bloqueada: disparar solicitud de desbloqueo interactivo
    const solicitador = opciones.solicitarDesbloqueo ||
        (typeof window !== 'undefined' && typeof window.solicitarDesbloqueoCifrado === 'function' ? window.solicitarDesbloqueoCifrado : null) ||
        solicitarDesbloqueoCifrado;

    return await solicitador(docData, usuario, opciones);
}

/**
 * Dispara el flujo de interfaz gráfica para solicitar el desbloqueo de un documento cifrado.
 * Abre el modal `#modal-desbloquear-cifrado` y espera la resolución mediante PIN o biometría.
 *
 * @param {Object} docData Documento cifrado (sobre)
 * @param {Object|string|null} usuario Información del usuario
 * @param {Object} [opcionesUI={}] Opciones del modal
 * @returns {Promise<Object>} Promesa que resuelve con los datos descifrados
 */
export function solicitarDesbloqueoCifrado(docData, usuario = null, opcionesUI = {}) {
    return new Promise((resolve, reject) => {
        const uid = (typeof usuario === 'string' ? usuario : (usuario?.uid || ''));
        const salt = docData?.salt || (typeof localStorage !== 'undefined' && uid ? localStorage.getItem(`cero_conocimiento_salt_${uid}`) : null);

        const fnAbrirModal = opcionesUI.abrirModal || abrirModalDesbloquearCifrado;

        fnAbrirModal({
            usuarioId: uid,
            salt: salt,
            verificarClave: async (claveCandidata) => {
                try {
                    await descifrarObjeto(docData, claveCandidata);
                    return true;
                } catch {
                    return false;
                }
            },
            alDesbloquear: async (clave) => {
                try {
                    const datos = await descifrarObjeto(docData, clave);
                    if (salt && uid && typeof localStorage !== 'undefined') {
                        try {
                            localStorage.setItem(`cero_conocimiento_salt_${uid}`, salt);
                        } catch (_) {}
                    }
                    resolve(datos);
                } catch (err) {
                    reject(err);
                }
            },
            alCancelar: () => {
                reject(new Error('DESBLOQUEO_CANCELADO'));
            }
        });
    });
}

/**
 * Migra una base existente en texto plano a formato Cero Conocimiento cifrado en Firestore.
 * Deriva la clave maestra a partir del nuevo PIN y establece la sesión activa.
 *
 * @param {Object} datosBase Base actual en memoria
 * @param {string} pin PIN maestro seleccionado
 * @param {string|null} [usuarioId] UID del usuario
 * @param {string|null} [saltExistente] Salt opcional
 * @returns {Promise<{ sobre: Object, clave: CryptoKey, salt: string }>}
 */
export async function migrarBaseACeroConocimiento(datosBase, pin, usuarioId = null, saltExistente = null) {
    if (!pin) {
        throw new Error('PIN_REQUERIDO');
    }
    const salt = saltExistente || generarSalt(16);
    const clave = await derivarClave(pin, salt);

    establecerClaveActiva(clave, pin, salt, usuarioId);

    if (usuarioId && typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(`cero_conocimiento_salt_${usuarioId}`, salt);
            localStorage.setItem(`cero_conocimiento_activo_${usuarioId}`, 'true');
        } catch (_) {}
    }

    const sobre = await cifrarObjeto(datosBase, clave, salt);
    return {
        sobre,
        clave,
        salt
    };
}
