/* =========================================================
   MÓDULO DE BIOMETRÍA Y SESIÓN CRIPTOGRÁFICA (js/crypto/biometria.js)
   Fase 2 del Plan Cero Conocimiento (Zero-Knowledge)
   WebAuthn (Biometría / FaceID / Huella) + Gestión de Sesión Volátil
   ========================================================= */

import {
    uint8ArrayToBase64,
    base64ToUint8Array,
    derivarClave
} from './nucleo.js';

// Prefijos para almacenamiento local seguro por usuario
const STORAGE_KEY_BIO_PREFIX = 'cero_conocimiento_bio_';
const STORAGE_KEY_PIN_PREFIX = 'cero_conocimiento_pin_';
const STORAGE_KEY_SESSION_PREFIX = 'cero_conocimiento_sesion_';

// Constantes de protección contra fuerza bruta
export const MAX_INTENTOS_SIN_PENALIZACION = 3;
export const BASE_BACKOFF_MS = 1000; // 1 segundo base
export const MAX_BACKOFF_MS = 60000; // Máximo 60 segundos

// Estado en memoria volátil (nunca persistido en disco)
let _claveActiva = null;
let _pinActivo = null;
let _saltActivo = null;

// Estado de fuerza bruta
let _intentosFallidos = 0;
let _bloqueadoHasta = 0;

/* =========================================================
   1. DETECCIÓN Y COMPATIBILIDAD BIOMÉTRICA (WebAuthn)
   ========================================================= */

/**
 * Comprueba si el dispositivo y navegador actual soportan autenticadores
 * de plataforma biométricos (huella dactilar, Face ID, Windows Hello, etc.).
 *
 * @returns {Promise<boolean>}
 */
export async function esBiometriaDisponible() {
    if (typeof window === 'undefined') return false;
    if (!window.PublicKeyCredential) return false;
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
        return false;
    }
    try {
        return Boolean(await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
        return false;
    }
}

/* =========================================================
   2. REGISTRO Y AUTENTICACIÓN WEBAUTHN
   ========================================================= */

/**
 * Registra una nueva credencial biométrica en el autenticador de plataforma.
 *
 * @param {string} usuarioId Identificador único del usuario (UID)
 * @param {Uint8Array|string|null} [challenge] Desafío criptográfico opcional
 * @returns {Promise<{ success: boolean, credentialId: string, credential: PublicKeyCredential }>}
 */
export async function registrarBiometria(usuarioId, challenge = null) {
    if (!usuarioId) {
        throw new Error('USUARIO_REQUERIDO');
    }
    if (typeof navigator === 'undefined' || !navigator.credentials || typeof navigator.credentials.create !== 'function') {
        throw new Error('WEBAUTHN_NO_SOPORTADO');
    }

    let challengeBytes;
    if (challenge instanceof Uint8Array) {
        challengeBytes = challenge;
    } else if (typeof challenge === 'string') {
        challengeBytes = new TextEncoder().encode(challenge);
    } else {
        challengeBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    }

    const userIdBytes = new TextEncoder().encode(String(usuarioId));

    const rp = {
        name: 'Control Financiero - Cero Conocimiento'
    };

    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
        const host = window.location.hostname;
        if (host && host !== 'localhost' && host !== '127.0.0.1' && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
            rp.id = host;
        }
    }

    const publicKey = {
        challenge: challengeBytes,
        rp,
        user: {
            id: userIdBytes,
            name: String(usuarioId),
            displayName: String(usuarioId)
        },
        pubKeyCredParams: [
            { alg: -7, type: 'public-key' },  // ES256
            { alg: -257, type: 'public-key' } // RS256
        ],
        authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
    };

    const credential = await navigator.credentials.create({ publicKey });
    if (!credential) {
        throw new Error('REGISTRO_BIOMETRICO_CANCELADO');
    }

    const credentialId = uint8ArrayToBase64(new Uint8Array(credential.rawId || []));
    const info = {
        credentialId,
        id: credential.id,
        timestamp: Date.now()
    };
    guardarCredencialBiometrica(usuarioId, info);

    return {
        success: true,
        credentialId,
        credential
    };
}

/**
 * Autentica al usuario verificando su biometría en el autenticador de plataforma.
 *
 * @param {string} usuarioId Identificador del usuario
 * @param {string|null} [credentialId] ID de credencial en Base64 (si es null, se busca en storage)
 * @param {Uint8Array|string|null} [challenge] Desafío criptográfico opcional
 * @returns {Promise<{ success: boolean, assertion: PublicKeyCredential }>}
 */
export async function autenticarConBiometria(usuarioId, credentialId = null, challenge = null) {
    if (!usuarioId) {
        throw new Error('USUARIO_REQUERIDO');
    }

    let credId = credentialId;
    if (!credId) {
        const guardada = obtenerCredencialBiometrica(usuarioId);
        if (!guardada || !guardada.credentialId) {
            throw new Error('CREDENCIAL_NO_ENCONTRADA');
        }
        credId = guardada.credentialId;
    }

    if (typeof navigator === 'undefined' || !navigator.credentials || typeof navigator.credentials.get !== 'function') {
        throw new Error('WEBAUTHN_NO_SOPORTADO');
    }

    let challengeBytes;
    if (challenge instanceof Uint8Array) {
        challengeBytes = challenge;
    } else if (typeof challenge === 'string') {
        challengeBytes = new TextEncoder().encode(challenge);
    } else {
        challengeBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    }

    const rawIdBytes = base64ToUint8Array(credId);

    const publicKey = {
        challenge: challengeBytes,
        allowCredentials: [
            {
                id: rawIdBytes,
                type: 'public-key',
                transports: ['internal']
            }
        ],
        userVerification: 'required',
        timeout: 60000
    };

    const assertion = await navigator.credentials.get({ publicKey });
    if (!assertion) {
        throw new Error('AUTENTICACION_BIOMETRICA_FALLIDA');
    }

    return {
        success: true,
        assertion
    };
}

/* =========================================================
   3. ALMACENAMIENTO SEGURO DE CREDENCIALES BIOMÉTRICAS
   ========================================================= */

/**
 * Guarda la metadata de la credencial biométrica asociada a un usuario.
 *
 * @param {string} usuarioId
 * @param {object} credencialInfo
 */
export function guardarCredencialBiometrica(usuarioId, credencialInfo) {
    if (!usuarioId || typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(
            `${STORAGE_KEY_BIO_PREFIX}${usuarioId}`,
            JSON.stringify(credencialInfo)
        );
    } catch (e) {
        console.warn('[Biometria] No se pudo guardar la credencial:', e);
    }
}

/**
 * Obtiene la credencial biométrica guardada para un usuario.
 *
 * @param {string} usuarioId
 * @returns {object|null}
 */
export function obtenerCredencialBiometrica(usuarioId) {
    if (!usuarioId || typeof localStorage === 'undefined') return null;
    try {
        const data = localStorage.getItem(`${STORAGE_KEY_BIO_PREFIX}${usuarioId}`);
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

/**
 * Elimina la credencial biométrica y el PIN protegido de un usuario.
 *
 * @param {string} usuarioId
 */
export function eliminarCredencialBiometrica(usuarioId) {
    if (!usuarioId || typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(`${STORAGE_KEY_BIO_PREFIX}${usuarioId}`);
        localStorage.removeItem(`${STORAGE_KEY_PIN_PREFIX}${usuarioId}`);
    } catch (e) {
        console.warn('[Biometria] No se pudo eliminar la credencial:', e);
    }
}

/**
 * Verifica si el usuario tiene biometría configurada localmente.
 *
 * @param {string} usuarioId
 * @returns {boolean}
 */
export function tieneBiometriaRegistrada(usuarioId) {
    return Boolean(obtenerCredencialBiometrica(usuarioId));
}

/**
 * Guarda el PIN protegido en el dispositivo local para desbloqueo biométrico.
 * Solo se invoca cuando el usuario autorizó y registró exitosamente la biometría.
 *
 * @param {string} usuarioId
 * @param {string} pin
 */
export function guardarPinBiometricoProtegido(usuarioId, pin) {
    if (!usuarioId || !pin || typeof localStorage === 'undefined') return;
    try {
        const encoded = uint8ArrayToBase64(new TextEncoder().encode(pin));
        localStorage.setItem(`${STORAGE_KEY_PIN_PREFIX}${usuarioId}`, encoded);
    } catch (e) {
        console.warn('[Biometria] No se pudo almacenar el PIN protegido:', e);
    }
}

/**
 * Recupera el PIN protegido en el dispositivo tras una autenticación biométrica exitosa.
 *
 * @param {string} usuarioId
 * @returns {string|null}
 */
export function recuperarPinBiometricoProtegido(usuarioId) {
    if (!usuarioId || typeof localStorage === 'undefined') return null;
    try {
        const encoded = localStorage.getItem(`${STORAGE_KEY_PIN_PREFIX}${usuarioId}`);
        if (!encoded) return null;
        return new TextDecoder().decode(base64ToUint8Array(encoded));
    } catch {
        return null;
    }
}

/* =========================================================
   4. GESTIÓN DE CLAVE EN MEMORIA (SESIÓN ACTIVA)
   ========================================================= */

/**
 * Almacena la CryptoKey activa en memoria volátil durante la sesión desbloqueada
 * y opcionalmente persiste la credencial efímera en sessionStorage (remanente solo
 * mientras la pestaña siga abierta, sobreviviendo recargas F5 o pull-to-refresh).
 *
 * @param {CryptoKey} clave Clave derivada para AES-GCM
 * @param {string|null} [pin] PIN maestro (opcional, solo en memoria)
 * @param {string|null} [salt] Salt asociado
 * @param {string|null} [usuarioId] UID del usuario (opcional para indexar sesión en pestaña)
 * @returns {boolean}
 */
export function establecerClaveActiva(clave, pin = null, salt = null, usuarioId = null) {
    if (!clave) {
        throw new Error('CLAVE_REQUERIDA');
    }
    _claveActiva = clave;
    _pinActivo = pin;
    _saltActivo = salt;

    // Persistencia efímera en sessionStorage durante la vida de la pestaña activa
    if (pin && salt && typeof sessionStorage !== 'undefined') {
        try {
            const claveStorage = `${STORAGE_KEY_SESSION_PREFIX}${usuarioId || 'activa'}`;
            sessionStorage.setItem(claveStorage, JSON.stringify({
                pin,
                salt,
                usuarioId: usuarioId || null,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('[Biometria] No se pudo guardar la sesión en sessionStorage:', e);
        }
    }

    return true;
}

/**
 * Intenta restaurar la sesión criptográfica activa desde sessionStorage.
 * Permite que recargas de página (F5 o refresh táctil) en la misma pestaña mantengan
 * la sesión desbloqueada sin volver a solicitar la huella dactilar ni el PIN.
 *
 * @param {string|null} [usuarioId] UID del usuario (opcional)
 * @returns {Promise<boolean>} Retorna true si se re-derivó y restauró la clave activa, o false si no hay sesión
 */
export async function restaurarSesionCriptoDesdeSessionStorage(usuarioId = null) {
    if (typeof sessionStorage === 'undefined') return false;

    try {
        let rawData = null;
        if (usuarioId) {
            rawData = sessionStorage.getItem(`${STORAGE_KEY_SESSION_PREFIX}${usuarioId}`);
        }
        if (!rawData) {
            rawData = sessionStorage.getItem(`${STORAGE_KEY_SESSION_PREFIX}activa`);
        }
        if (!rawData) {
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith(STORAGE_KEY_SESSION_PREFIX)) {
                    rawData = sessionStorage.getItem(k);
                    break;
                }
            }
        }

        if (!rawData) return false;

        const sesion = JSON.parse(rawData);
        if (!sesion || !sesion.pin || !sesion.salt) {
            return false;
        }

        const clave = await derivarClave(sesion.pin, sesion.salt);
        _claveActiva = clave;
        _pinActivo = sesion.pin;
        _saltActivo = sesion.salt;

        return true;
    } catch (err) {
        console.warn('[Biometria] Error al restaurar sesión cripto desde sessionStorage:', err);
        return false;
    }
}

/**
 * Retorna la CryptoKey activa en memoria o null si la sesión está bloqueada.
 *
 * @returns {CryptoKey|null}
 */
export function obtenerClaveActiva() {
    return _claveActiva;
}

/**
 * Retorna el salt activo en memoria.
 *
 * @returns {string|null}
 */
export function obtenerSaltActivo() {
    return _saltActivo;
}

/**
 * Indica si la sesión criptográfica está actualmente desbloqueada.
 *
 * @returns {boolean}
 */
export function estaSesionDesbloqueada() {
    return Boolean(_claveActiva);
}

/**
 * Destruye la referencia de la clave en memoria volátil y elimina la sesión efímera en sessionStorage.
 * Debe invocarse al cerrar sesión, por inactividad o bloqueo explícito.
 *
 * @param {string|null} [usuarioId]
 * @returns {boolean}
 */
export function bloquearSesionCripto(usuarioId = null) {
    _claveActiva = null;
    _pinActivo = null;
    _saltActivo = null;

    if (typeof sessionStorage !== 'undefined') {
        try {
            if (usuarioId) {
                sessionStorage.removeItem(`${STORAGE_KEY_SESSION_PREFIX}${usuarioId}`);
            }
            sessionStorage.removeItem(`${STORAGE_KEY_SESSION_PREFIX}activa`);

            const clavesABorrar = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith(STORAGE_KEY_SESSION_PREFIX)) {
                    clavesABorrar.push(k);
                }
            }
            clavesABorrar.forEach(k => sessionStorage.removeItem(k));
        } catch (e) {
            console.warn('[Biometria] No se pudo limpiar sessionStorage en bloqueo:', e);
        }
    }

    return true;
}

/* =========================================================
   5. PROTECCIÓN CONTRA FUERZA BRUTA Y VALIDACIONES
   ========================================================= */

/**
 * Registra un intento fallido de PIN. Si se superan los intentos permitidos,
 * calcula un tiempo de espera con retroceso exponencial (1s, 2s, 4s, 8s...).
 *
 * @returns {{ bloqueado: boolean, esperaMs: number, intentosFallidos: number }}
 */
export function registrarIntentoFallido() {
    _intentosFallidos++;
    if (_intentosFallidos > MAX_INTENTOS_SIN_PENALIZACION) {
        const exponente = _intentosFallidos - MAX_INTENTOS_SIN_PENALIZACION - 1;
        const esperaMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, exponente), MAX_BACKOFF_MS);
        _bloqueadoHasta = Date.now() + esperaMs;
        return {
            bloqueado: true,
            esperaMs,
            intentosFallidos: _intentosFallidos
        };
    }
    return {
        bloqueado: false,
        esperaMs: 0,
        intentosFallidos: _intentosFallidos
    };
}

/**
 * Comprueba si el ingreso de PIN está bloqueado temporalmente por fuerza bruta.
 *
 * @returns {{ bloqueado: boolean, restanteMs: number }}
 */
export function estaBloqueadoPorFuerzaBruta() {
    const ahora = Date.now();
    const restante = _bloqueadoHasta - ahora;
    if (restante > 0) {
        return { bloqueado: true, restanteMs: restante };
    }
    return { bloqueado: false, restanteMs: 0 };
}

/**
 * Reinicia el contador de intentos fallidos y el bloqueo.
 */
export function reiniciarIntentosFallidos() {
    _intentosFallidos = 0;
    _bloqueadoHasta = 0;
}

/**
 * Retorna la cantidad actual de intentos fallidos.
 *
 * @returns {number}
 */
export function obtenerIntentosFallidos() {
    return _intentosFallidos;
}

/**
 * Retorna el estado global de fuerza bruta.
 *
 * @returns {{ intentosFallidos: number, bloqueado: boolean, restanteMs: number }}
 */
export function obtenerEstadoFuerzaBruta() {
    const { bloqueado, restanteMs } = estaBloqueadoPorFuerzaBruta();
    return {
        intentosFallidos: _intentosFallidos,
        bloqueado,
        restanteMs: Math.max(0, restanteMs)
    };
}

/**
 * Valida que el formato del PIN sea de 4 a 6 dígitos numéricos.
 *
 * @param {string} pin
 * @returns {{ valido: boolean, error?: string }}
 */
export function validarFormatoPin(pin) {
    if (typeof pin !== 'string') {
        return { valido: false, error: 'El PIN debe ser una cadena numérica' };
    }
    if (!/^\d{4,6}$/.test(pin)) {
        return { valido: false, error: 'El PIN debe contener entre 4 y 6 dígitos numéricos' };
    }
    return { valido: true };
}

/**
 * Valida la coincidencia entre el PIN nuevo y su confirmación.
 *
 * @param {string} pin
 * @param {string} confirmacion
 * @returns {{ valido: boolean, error?: string }}
 */
export function validarConfirmacionPin(pin, confirmacion) {
    const resPin = validarFormatoPin(pin);
    if (!resPin.valido) {
        return resPin;
    }
    if (pin !== confirmacion) {
        return { valido: false, error: 'Los PINs ingresados no coinciden' };
    }
    return { valido: true };
}
