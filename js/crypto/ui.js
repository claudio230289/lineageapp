/* =========================================================
   INTERFAZ Y MODALES DE CIFRADO CERO CONOCIMIENTO (js/crypto/ui.js)
   Fase 2 del Plan Cero Conocimiento
   Modales de Configuración, Desbloqueo y Teclado Táctil
   ========================================================= */

import {
    derivarClave
} from './nucleo.js';

import {
    esBiometriaDisponible,
    registrarBiometria,
    autenticarConBiometria,
    tieneBiometriaRegistrada,
    guardarPinBiometricoProtegido,
    recuperarPinBiometricoProtegido,
    establecerClaveActiva,
    estaSesionDesbloqueada,
    bloquearSesionCripto,
    registrarIntentoFallido,
    estaBloqueadoPorFuerzaBruta,
    reiniciarIntentosFallidos,
    validarFormatoPin,
    validarConfirmacionPin,
    MAX_INTENTOS_SIN_PENALIZACION
} from './biometria.js';

// Timer activo para la cuenta regresiva de fuerza bruta
let _timerCuentaRegresiva = null;

// Contexto de la sesión actual de desbloqueo
let _contextoDesbloqueo = {
    usuarioId: null,
    salt: null,
    alDesbloquear: null,
    alCancelar: null
};

/* =========================================================
   1. MODAL: CONFIGURACIÓN DE CIFRADO (#modal-configurar-cifrado)
   ========================================================= */

/**
 * Abre el modal de configuración de cifrado cero conocimiento.
 *
 * @param {string} [usuarioId] ID del usuario actual
 */
export async function abrirModalConfigurarCifrado(usuarioId = null) {
    const modal = document.getElementById('modal-configurar-cifrado');
    if (!modal) return;

    const inputNuevo = document.getElementById('input-nuevo-pin');
    const inputConfirmar = document.getElementById('input-confirmar-pin');
    const feedback = document.getElementById('feedback-config-cifrado');
    const contenedorBio = document.getElementById('contenedor-opcion-biometria');
    const checkBio = document.getElementById('check-activar-biometria');

    if (inputNuevo) inputNuevo.value = '';
    if (inputConfirmar) inputConfirmar.value = '';
    if (feedback) {
        feedback.textContent = '';
        feedback.className = 'hidden text-xs p-2.5 rounded-xl';
    }

    // Verificar compatibilidad biométrica del dispositivo
    if (contenedorBio) {
        const disponible = await esBiometriaDisponible();
        if (disponible) {
            contenedorBio.classList.remove('hidden');
            if (checkBio && usuarioId) {
                checkBio.checked = tieneBiometriaRegistrada(usuarioId);
            }
        } else {
            contenedorBio.classList.add('hidden');
            if (checkBio) checkBio.checked = false;
        }
    }

    modal.classList.remove('hidden');
    if (inputNuevo) inputNuevo.focus();
}

/**
 * Cierra el modal de configuración de cifrado.
 */
export function cerrarModalConfigurarCifrado() {
    const modal = document.getElementById('modal-configurar-cifrado');
    if (modal) {
        modal.classList.add('hidden');
    }
    const inputNuevo = document.getElementById('input-nuevo-pin');
    const inputConfirmar = document.getElementById('input-confirmar-pin');
    if (inputNuevo) inputNuevo.value = '';
    if (inputConfirmar) inputConfirmar.value = '';
}

/**
 * Alterna la visibilidad (tipo de input password/text) y el ícono del botón.
 *
 * @param {string} inputId ID del input
 * @param {string} iconId ID del elemento <i> del ícono
 */
export function toggleMostrarPin(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

/**
 * Procesa el formulario de configuración de cifrado.
 *
 * @param {Event} [event] Evento de envío del formulario
 * @param {string} [usuarioId] ID del usuario
 * @param {string} [saltActual] Salt existente (o se generará uno)
 * @param {Function} [alGuardar] Callback tras configurar con éxito
 * @returns {Promise<boolean>}
 */
export async function guardarConfiguracionCifrado(event = null, usuarioId = null, saltActual = null, alGuardar = null) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    const inputNuevo = document.getElementById('input-nuevo-pin');
    const inputConfirmar = document.getElementById('input-confirmar-pin');
    const feedback = document.getElementById('feedback-config-cifrado');
    const checkBio = document.getElementById('check-activar-biometria');

    const pin = inputNuevo ? inputNuevo.value.trim() : '';
    const confirmacion = inputConfirmar ? inputConfirmar.value.trim() : '';

    const validacion = validarConfirmacionPin(pin, confirmacion);
    if (!validacion.valido) {
        mostrarFeedback(feedback, validacion.error, 'error');
        return false;
    }

    mostrarFeedback(feedback, 'Generando llaves maestras seguras...', 'info');

    try {
        const salt = saltActual || (await import('./nucleo.js')).generarSalt(16);
        const clave = await derivarClave(pin, salt);

        establecerClaveActiva(clave, pin, salt);
        reiniciarIntentosFallidos();

        // Si se solicitó biometría y el navegador la soporta
        if (checkBio && checkBio.checked && usuarioId) {
            try {
                mostrarFeedback(feedback, 'Verificando biometría en el dispositivo...', 'info');
                await registrarBiometria(usuarioId);
                guardarPinBiometricoProtegido(usuarioId, pin);
            } catch (errBio) {
                console.warn('[CifradoUI] Registro biométrico omitido o fallido:', errBio);
                // Si la biometría falló, el PIN sigue siendo 100% válido
            }
        }

        mostrarFeedback(feedback, '¡Cifrado Cero Conocimiento activado correctamente!', 'exito');

        setTimeout(() => {
            cerrarModalConfigurarCifrado();
            if (typeof alGuardar === 'function') {
                alGuardar({ clave, salt, pin });
            }
        }, 600);

        return true;
    } catch (e) {
        console.error('[CifradoUI] Error al configurar cifrado:', e);
        mostrarFeedback(feedback, 'Ocurrió un error al generar las claves: ' + (e.message || String(e)), 'error');
        return false;
    }
}

/* =========================================================
   2. MODAL: DESBLOQUEO DE FINANZAS (#modal-desbloquear-cifrado)
   ========================================================= */

/**
 * Abre el modal de desbloqueo de finanzas cifradas.
 *
 * @param {object} opciones
 * @param {string} opciones.usuarioId
 * @param {string} opciones.salt
 * @param {Function} [opciones.alDesbloquear]
 * @param {Function} [opciones.alCancelar]
 */
export function abrirModalDesbloquearCifrado(opciones = {}) {
    _contextoDesbloqueo = { ...opciones };

    const modal = document.getElementById('modal-desbloquear-cifrado');
    if (!modal) return;

    const inputPin = document.getElementById('input-desbloquear-pin');
    const feedback = document.getElementById('feedback-desbloquear-cifrado');
    const contenedorBio = document.getElementById('contenedor-btn-biometria');

    if (inputPin) inputPin.value = '';
    if (feedback) {
        feedback.textContent = '';
        feedback.className = 'hidden text-xs p-2.5 rounded-xl text-center font-medium';
    }

    // Comprobar si el usuario tiene biometría previamente registrada en este dispositivo
    const tieneBio = Boolean(opciones.usuarioId && tieneBiometriaRegistrada(opciones.usuarioId));
    if (contenedorBio) {
        if (tieneBio) {
            contenedorBio.classList.remove('hidden');
        } else {
            contenedorBio.classList.add('hidden');
        }
    }

    // Comprobar estado de fuerza bruta
    actualizarEstadoFuerzaBrutaUI();

    modal.classList.remove('hidden');
    if (inputPin) inputPin.focus();
}

/**
 * Cierra el modal de desbloqueo de finanzas.
 */
export function cerrarModalDesbloquearCifrado() {
    const modal = document.getElementById('modal-desbloquear-cifrado');
    if (modal) {
        modal.classList.add('hidden');
    }
    const inputPin = document.getElementById('input-desbloquear-pin');
    if (inputPin) inputPin.value = '';

    if (_timerCuentaRegresiva) {
        clearInterval(_timerCuentaRegresiva);
        _timerCuentaRegresiva = null;
    }
}

/**
 * Ejecuta el desbloqueo mediante PIN numérico ingresado.
 *
 * @param {Event} [event]
 * @returns {Promise<boolean>}
 */
export async function desbloquearConPin(event = null) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    const { bloqueado } = estaBloqueadoPorFuerzaBruta();
    if (bloqueado) {
        actualizarEstadoFuerzaBrutaUI();
        return false;
    }

    const inputPin = document.getElementById('input-desbloquear-pin');
    const feedback = document.getElementById('feedback-desbloquear-cifrado');
    const pin = inputPin ? inputPin.value.trim() : '';

    const validacion = validarFormatoPin(pin);
    if (!validacion.valido) {
        mostrarFeedback(feedback, validacion.error, 'error');
        return false;
    }

    const salt = _contextoDesbloqueo.salt;
    if (!salt) {
        mostrarFeedback(feedback, 'Falta el salt criptográfico del usuario.', 'error');
        return false;
    }

    try {
        mostrarFeedback(feedback, 'Verificando PIN...', 'info');
        const clave = await derivarClave(pin, salt);

        // Si se proveyó una función verificadora o alDesbloquear
        if (typeof _contextoDesbloqueo.verificarClave === 'function') {
            const esValida = await _contextoDesbloqueo.verificarClave(clave);
            if (!esValida) {
                throw new Error('PIN_INCORRECTO');
            }
        }

        establecerClaveActiva(clave, pin, salt);
        reiniciarIntentosFallidos();

        mostrarFeedback(feedback, '¡Desbloqueado con éxito!', 'exito');

        setTimeout(() => {
            cerrarModalDesbloquearCifrado();
            if (typeof _contextoDesbloqueo.alDesbloquear === 'function') {
                _contextoDesbloqueo.alDesbloquear(clave);
            }
        }, 400);

        return true;
    } catch (e) {
        console.warn('[CifradoUI] Error al desbloquear con PIN:', e);
        const estadoFuerza = registrarIntentoFallido();
        if (inputPin) inputPin.value = '';

        if (estadoFuerza.bloqueado) {
            actualizarEstadoFuerzaBrutaUI();
        } else {
            const intentosRestantes = Math.max(0, MAX_INTENTOS_SIN_PENALIZACION - estadoFuerza.intentosFallidos);
            const msg = `PIN incorrecto. Intento ${estadoFuerza.intentosFallidos} de ${MAX_INTENTOS_SIN_PENALIZACION}. ${intentosRestantes > 0 ? `Te quedan ${intentosRestantes} intentos antes de bloqueo.` : ''}`;
            mostrarFeedback(feedback, msg, 'error');
        }

        return false;
    }
}

/**
 * Ejecuta el desbloqueo biométrico automático o al pulsar el botón.
 *
 * @returns {Promise<boolean>}
 */
export async function desbloquearConBiometriaUI() {
    const feedback = document.getElementById('feedback-desbloquear-cifrado');
    const usuarioId = _contextoDesbloqueo.usuarioId;
    const salt = _contextoDesbloqueo.salt;

    if (!usuarioId) {
        mostrarFeedback(feedback, 'Usuario no identificado para biometría.', 'error');
        return false;
    }

    try {
        mostrarFeedback(feedback, 'Coloca tu huella o usa Face ID...', 'info');
        await autenticarConBiometria(usuarioId);

        const pin = recuperarPinBiometricoProtegido(usuarioId);
        if (!pin) {
            mostrarFeedback(feedback, 'PIN biométrico no disponible. Ingrésalo manualmente.', 'alerta');
            return false;
        }

        const clave = await derivarClave(pin, salt);
        establecerClaveActiva(clave, pin, salt);
        reiniciarIntentosFallidos();

        mostrarFeedback(feedback, '¡Biometría confirmada! Desbloqueando...', 'exito');

        setTimeout(() => {
            cerrarModalDesbloquearCifrado();
            if (typeof _contextoDesbloqueo.alDesbloquear === 'function') {
                _contextoDesbloqueo.alDesbloquear(clave);
            }
        }, 400);

        return true;
    } catch (e) {
        console.warn('[CifradoUI] Autenticación biométrica no completada:', e);
        mostrarFeedback(feedback, 'Biometría no completada. Ingresa tu PIN numérico.', 'alerta');
        return false;
    }
}

/**
 * Maneja la acción de cancelar en el modal de desbloqueo.
 */
export function cancelarDesbloqueoOCerrar() {
    cerrarModalDesbloquearCifrado();
    if (typeof _contextoDesbloqueo.alCancelar === 'function') {
        _contextoDesbloqueo.alCancelar();
    }
}

/* =========================================================
   3. TECLADO NUMÉRICO TÁCTIL (MÓVIL Y ESCRITORIO)
   ========================================================= */

/**
 * Agrega un dígito numérico al input de desbloqueo.
 *
 * @param {string|number} digito
 */
export function tecladoPinPresionar(digito) {
    const inputPin = document.getElementById('input-desbloquear-pin');
    if (!inputPin) return;
    if (inputPin.value.length < 6) {
        inputPin.value += String(digito);
    }
}

/**
 * Borra el último dígito ingresado en el input de desbloqueo.
 */
export function tecladoPinBorrar() {
    const inputPin = document.getElementById('input-desbloquear-pin');
    if (!inputPin || !inputPin.value) return;
    inputPin.value = inputPin.value.slice(0, -1);
}

/**
 * Limpia por completo el valor del input de desbloqueo.
 */
export function tecladoPinLimpiar() {
    const inputPin = document.getElementById('input-desbloquear-pin');
    if (!inputPin) return;
    inputPin.value = '';
}

/* =========================================================
   4. CONTROL DE FUERZA BRUTA EN LA UI
   ========================================================= */

/**
 * Actualiza la interfaz con la cuenta regresiva y deshabilitación si hay bloqueo.
 */
function actualizarEstadoFuerzaBrutaUI() {
    const feedback = document.getElementById('feedback-desbloquear-cifrado');
    const inputPin = document.getElementById('input-desbloquear-pin');
    const btnSubmit = document.getElementById('btn-confirmar-desbloqueo');

    if (_timerCuentaRegresiva) {
        clearInterval(_timerCuentaRegresiva);
        _timerCuentaRegresiva = null;
    }

    const { bloqueado, restanteMs } = estaBloqueadoPorFuerzaBruta();

    if (!bloqueado) {
        if (inputPin) inputPin.disabled = false;
        if (btnSubmit) btnSubmit.disabled = false;
        return;
    }

    if (inputPin) inputPin.disabled = true;
    if (btnSubmit) btnSubmit.disabled = true;

    let restanteSegundos = Math.ceil(restanteMs / 1000);
    mostrarFeedback(
        feedback,
        `Demasiados intentos fallidos. Espera ${restanteSegundos} segundos para reintentar.`,
        'error'
    );

    _timerCuentaRegresiva = setInterval(() => {
        restanteSegundos--;
        if (restanteSegundos <= 0) {
            clearInterval(_timerCuentaRegresiva);
            _timerCuentaRegresiva = null;
            if (inputPin) inputPin.disabled = false;
            if (btnSubmit) btnSubmit.disabled = false;
            mostrarFeedback(feedback, 'Ya puedes intentar ingresar tu PIN nuevamente.', 'info');
        } else {
            mostrarFeedback(
                feedback,
                `Demasiados intentos fallidos. Espera ${restanteSegundos} segundos para reintentar.`,
                'error'
            );
        }
    }, 1000);
}

/* =========================================================
   5. UTILIDADES DE MENSAJES Y FEEDBACK
   ========================================================= */

/**
 * Muestra un mensaje visual estilizado en el contenedor de feedback.
 *
 * @param {HTMLElement} contenedor
 * @param {string} mensaje
 * @param {'error'|'exito'|'info'|'alerta'} tipo
 */
function mostrarFeedback(contenedor, mensaje, tipo = 'info') {
    if (!contenedor) return;
    contenedor.textContent = mensaje;
    contenedor.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'bg-green-50', 'text-green-700', 'bg-indigo-50', 'text-indigo-700', 'bg-amber-50', 'text-amber-700');

    if (tipo === 'error') {
        contenedor.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
    } else if (tipo === 'exito') {
        contenedor.classList.add('bg-green-50', 'text-green-700', 'border', 'border-green-200');
    } else if (tipo === 'alerta') {
        contenedor.classList.add('bg-amber-50', 'text-amber-700', 'border', 'border-amber-200');
    } else {
        contenedor.classList.add('bg-indigo-50', 'text-indigo-700', 'border', 'border-indigo-200');
    }
}
