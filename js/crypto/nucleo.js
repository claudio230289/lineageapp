/* =========================================================
   MOTOR CRIPTOGRÁFICO PURO (js/crypto/nucleo.js)
   Arquitectura de Cero Conocimiento (Zero-Knowledge)
   AES-GCM 256 bits + PBKDF2 con SHA-256

   Implementación pura basada exclusivamente en la Web Crypto API
   estándar (globalThis.crypto.subtle).
   Sin dependencias externas ni librerías pesadas. Compatible con
   navegadores modernos (móviles y PC) y entornos Node.js / Vitest.
   ========================================================= */

/**
 * Convierte un Uint8Array a una cadena en formato Base64 de forma eficiente y segura
 * frente a desbordamientos de pila (stack overflow) en buffers grandes.
 *
 * @param {Uint8Array} bytes
 * @returns {string} Cadena en Base64
 */
export function uint8ArrayToBase64(bytes) {
    let binario = '';
    const len = bytes.byteLength;
    const chunk = 0x8000; // Bloques de 32KB
    for (let i = 0; i < len; i += chunk) {
        binario += String.fromCharCode.apply(
            null,
            bytes.subarray(i, Math.min(i + chunk, len))
        );
    }
    return globalThis.btoa(binario);
}

/**
 * Convierte una cadena Base64 a Uint8Array.
 *
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToUint8Array(base64) {
    const binario = globalThis.atob(base64);
    const len = binario.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binario.charCodeAt(i);
    }
    return bytes;
}

/**
 * Genera un salt criptográficamente seguro codificado en Base64.
 *
 * @param {number} [longitud=16] Cantidad de bytes aleatorios (16 bytes = 128 bits recomendados)
 * @returns {string} Salt en formato Base64
 */
export function generarSalt(longitud = 16) {
    if (!Number.isInteger(longitud) || longitud <= 0) {
        throw new TypeError('La longitud del salt debe ser un entero positivo');
    }
    const bytes = new Uint8Array(longitud);
    globalThis.crypto.getRandomValues(bytes);
    return uint8ArrayToBase64(bytes);
}

/**
 * Genera un Vector de Inicialización (IV) criptográficamente seguro de 12 bytes
 * (longitud óptima y estándar para AES-GCM según NIST SP 800-38D).
 *
 * @param {number} [longitud=12] Cantidad de bytes aleatorios (12 bytes recomendados para GCM)
 * @returns {Uint8Array} Vector de inicialización en Uint8Array
 */
export function generarIV(longitud = 12) {
    if (!Number.isInteger(longitud) || longitud <= 0) {
        throw new TypeError('La longitud del IV debe ser un entero positivo');
    }
    const bytes = new Uint8Array(longitud);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
}

/**
 * Normaliza un salt provisto en Base64, string plano o Uint8Array a Uint8Array.
 *
 * @param {string|Uint8Array} salt
 * @returns {Uint8Array}
 */
function normalizarSalt(salt) {
    if (salt instanceof Uint8Array) {
        return salt;
    }
    if (typeof salt === 'string') {
        try {
            return base64ToUint8Array(salt);
        } catch {
            return new TextEncoder().encode(salt);
        }
    }
    throw new TypeError('El salt debe ser un Uint8Array o una cadena Base64');
}

/**
 * Normaliza un IV provisto en Base64 o Uint8Array a Uint8Array.
 *
 * @param {string|Uint8Array} iv
 * @returns {Uint8Array}
 */
function normalizarIV(iv) {
    if (iv instanceof Uint8Array) {
        return iv;
    }
    if (typeof iv === 'string') {
        return base64ToUint8Array(iv);
    }
    throw new TypeError('El IV debe ser un Uint8Array o una cadena Base64');
}

/**
 * Deriva una CryptoKey de 256 bits para AES-GCM a partir del PIN del usuario
 * utilizando PBKDF2 con SHA-256.
 *
 * @param {string|number} pin PIN o contraseña maestra del usuario
 * @param {string|Uint8Array} salt Salt criptográfico
 * @param {number} [iteraciones=100000] Cantidad de iteraciones PBKDF2 (100,000 por defecto)
 * @returns {Promise<CryptoKey>} Clave criptográfica lista para cifrar/descifrar
 */
export async function derivarClave(pin, salt, iteraciones = 100000) {
    if (pin === undefined || pin === null || pin === '') {
        throw new Error('PIN_REQUERIDO');
    }
    if (!salt) {
        throw new Error('SALT_REQUERIDO');
    }
    if (!Number.isInteger(iteraciones) || iteraciones <= 0) {
        throw new TypeError('Las iteraciones deben ser un entero positivo');
    }

    const pinBytes = new TextEncoder().encode(String(pin));
    const saltBytes = normalizarSalt(salt);

    // 1. Importar el PIN como material de clave base para PBKDF2
    const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        pinBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    // 2. Derivar la clave simétrica AES-GCM de 256 bits
    return await globalThis.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: iteraciones,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Cifra un texto plano en UTF-8 utilizando AES-GCM de 256 bits.
 * Produce un IV aleatorio único en cada llamada garantizando no-determinismo.
 *
 * @param {string} textoPlano Texto a cifrar
 * @param {CryptoKey} clave Clave derivada para AES-GCM
 * @param {Uint8Array|string|null} [ivOpcional=null] IV opcional (si no se especifica, genera uno de 12 bytes)
 * @returns {Promise<{ ciphertext: string, iv: string }>} Objeto con texto cifrado e IV en Base64
 */
export async function cifrarTexto(textoPlano, clave, ivOpcional = null) {
    if (textoPlano === undefined || textoPlano === null) {
        throw new Error('TEXTO_REQUERIDO');
    }
    if (!clave) {
        throw new Error('CLAVE_REQUERIDA');
    }

    const ivBytes = ivOpcional ? normalizarIV(ivOpcional) : generarIV(12);
    const plaintextBytes = new TextEncoder().encode(String(textoPlano));

    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes },
        clave,
        plaintextBytes
    );

    return {
        ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
        iv: uint8ArrayToBase64(ivBytes)
    };
}

/**
 * Descifra un texto cifrado en Base64 utilizando AES-GCM.
 * Si la clave no coincide, el IV es incorrecto o los datos fueron alterados,
 * falla la autenticación de integridad (tag GCM) y lanza un error tipificado.
 *
 * @param {string} ciphertextBase64 Texto cifrado en Base64
 * @param {CryptoKey} clave Clave derivada para AES-GCM
 * @param {string|Uint8Array} ivBase64 Vector de inicialización en Base64 o Uint8Array
 * @returns {Promise<string>} Texto plano original descifrado en UTF-8
 * @throws {Error} 'PIN_INCORRECTO_O_CORRUPTO' si la verificación criptográfica falla
 */
export async function descifrarTexto(ciphertextBase64, clave, ivBase64) {
    if (!ciphertextBase64 || !clave || !ivBase64) {
        throw new Error('PIN_INCORRECTO_O_CORRUPTO');
    }

    try {
        const ivBytes = normalizarIV(ivBase64);
        const ciphertextBytes = base64ToUint8Array(ciphertextBase64);

        const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBytes },
            clave,
            ciphertextBytes
        );

        return new TextDecoder().decode(decryptedBuffer);
    } catch {
        throw new Error('PIN_INCORRECTO_O_CORRUPTO');
    }
}

/**
 * Cifra un objeto JavaScript arbitrario serializándolo a JSON y empaquetándolo
 * en el sobre estándar de cero conocimiento del sistema.
 *
 * @param {any} objeto Objeto o valor a cifrar
 * @param {CryptoKey} clave Clave derivada para AES-GCM
 * @param {string|Uint8Array} [salt] Salt asociado a la clave
 * @returns {Promise<{ esCifrado: true, versionCifrado: number, salt: string, iv: string, datos: string, timestamp: number }>}
 */
export async function cifrarObjeto(objeto, clave, salt = null) {
    if (objeto === undefined || objeto === null) {
        throw new Error('OBJETO_REQUERIDO');
    }
    if (!clave) {
        throw new Error('CLAVE_REQUERIDA');
    }

    const saltFinal = salt
        ? (typeof salt === 'string' ? salt : uint8ArrayToBase64(salt))
        : generarSalt(16);

    const textoPlano = JSON.stringify(objeto);
    const { ciphertext, iv } = await cifrarTexto(textoPlano, clave);

    return {
        esCifrado: true,
        versionCifrado: 1,
        salt: saltFinal,
        iv: iv,
        datos: ciphertext,
        timestamp: Date.now()
    };
}

/**
 * Descifra el sobre estándar de cero conocimiento y deserializa el JSON original.
 *
 * @param {object} sobreCifrado Documento con formato de sobre cifrado
 * @param {CryptoKey} clave Clave derivada para AES-GCM
 * @returns {Promise<any>} Objeto original deserializado
 * @throws {Error} 'DOCUMENTO_NO_CIFRADO' si la estructura del sobre es inválida
 * @throws {Error} 'PIN_INCORRECTO_O_CORRUPTO' si la clave o los datos son inválidos
 */
export async function descifrarObjeto(sobreCifrado, clave) {
    if (!esDocumentoCifrado(sobreCifrado)) {
        throw new Error('DOCUMENTO_NO_CIFRADO');
    }
    if (!clave) {
        throw new Error('CLAVE_REQUERIDA');
    }

    const textoPlano = await descifrarTexto(sobreCifrado.datos, clave, sobreCifrado.iv);

    try {
        return JSON.parse(textoPlano);
    } catch {
        throw new Error('PIN_INCORRECTO_O_CORRUPTO');
    }
}

/**
 * Verifica si un documento posee la estructura de un sobre cifrado válido.
 *
 * @param {any} doc Objeto a evaluar
 * @returns {boolean} Verdadero si cumple la firma del sobre cifrado
 */
export function esDocumentoCifrado(doc) {
    if (!doc || typeof doc !== 'object') {
        return false;
    }
    return doc.esCifrado === true &&
        Boolean(doc.datos) &&
        Boolean(doc.iv);
}
