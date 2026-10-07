/* =========================================================
   CIERRE POR INACTIVIDAD (js/core/inactividad.js)
   =========================================================
   Tras 15 minutos sin actividad: guardar y cerrar sesión.

   Por qué guardar antes y no después: si se cerrara la sesión sin
   guardar, los últimos cambios quedan sólo en la pestaña y se
   pierden al recargar. El orden es guardar primero, y recién
   cuando el guardado terminó, cerrar.

   Por qué 15 minutos y no 5: con 5, la sesión cerraba antes de
   que el autoguardado de 15 minutos pudiera correr nunca en una
   pestaña inactiva, y los cambios dejaban de respaldarse en la
   nube ni bien la persona se apartaba de la pantalla.

   Por qué está aparte de app.js: la lógica de temporizadores es
   lo que hay que probar (reinicios, timers duplicados, disparos
   repetidos) y probarla contra el app entero no es viable. Acá no
   hay Firebase ni estado global, así que `setTimeout`, `clearTimeout`
   y el document entran por parámetro y el test los controla.

   Reglas que evita, y que están cubiertas por tests:
   - El temporizador no se duplica por armar dos veces.
   - Cada listener se registra una sola vez.
   - Al dispararse, se desarma antes de await: si el guardado tarda,
     la inactividad no vuelve a disparar el cierre.
   ========================================================= */

/** Plazo de inactividad, en minutos. */
export const MINUTOS_INACTIVIDAD = 15;
export const MS_INACTIVIDAD = MINUTOS_INACTIVIDAD * 60 * 1000;

/**
 * Eventos que cuentan como actividad.
 *
 * `mousemove` está a propósito: se genera en cada movimiento del
 * puntero, que es la señal más fiable de que hay alguien delante.
 * Por eso el reinicio está frenado (ver `FrenoReinicioMs`): sin
 * freno, cancelaría y recrearía el temporizador decenas de veces
 * por minuto.
 *
 * `visibilitychange` sólo cuenta cuando la pestaña vuelve a verse:
 * cambiar de pestaña no es actividad; volver a mirarla sí.
 */
export const EVENTOS_INACTIVIDAD = [
    'mousemove',
    'mousedown',
    'keydown',
    'scroll',
    'touchstart'
];

/** Freno: como mucho un reinicio cada 500 ms. */
export const FrenoReinicioMs = 500;

// Autoguardado fijo cada 15 minutos
const AUTO_SAVE_MS = 15 * 60 * 1000; // 900000
let _timerAutoSave = null;
let _onAutoSave = null;

export function setAutoSaveHandler(fn) {
    _onAutoSave = typeof fn === 'function' ? fn : null;
}

export function iniciarAutoguardado(fn) {
    detenerAutoguardado();
    if (typeof fn === 'function') _onAutoSave = fn;
    if (_onAutoSave) {
        _timerAutoSave = setInterval(async () => {
            try {
                await _onAutoSave();
            } catch (e) {
                console.warn('[inactividad] autoguardado error:', e);
            }
        }, AUTO_SAVE_MS);
    }
}

export function detenerAutoguardado() {
    if (_timerAutoSave) {
        clearInterval(_timerAutoSave);
        _timerAutoSave = null;
    }
}

/**
 * Crea el control de inactividad.
 *
 * @param {Object} opciones
 * @param {Function} opciones.alCerrar Se invoca al vencer el plazo. Puede
 *   ser async: se espera a que termine antes de considerar cerrado.
 * @param {number} [opciones.esperaMs] Plazo sin actividad. Por defecto 15 min.
 * @param {Document} [opciones.documento] Se usan `document` y sus
 *   listeners; no hace falta pasar `window` porque la visibilidad
 *   llega por evento.
 * @param {Function} [opciones.programar] setTimeout inyectable.
 * @param {Function} [opciones.cancelar] clearTimeout inyectable.
 * @param {Function} [opciones.ahora] Reloj inyectable.
 * @returns {{armar:Function, detener:Function, reiniciar:Function, armado:Function, pendiente:Function}}
 */
export function crearControlInactividad({
    alCerrar,
    esperaMs = MS_INACTIVIDAD,
    documento = typeof document !== 'undefined' ? document : null,
    programar = (fn, ms) => setTimeout(fn, ms),
    cancelar = (id) => clearTimeout(id),
    ahora = () => Date.now()
} = {}) {
    if (typeof alCerrar !== 'function') {
        throw new TypeError('crearControlInactividad necesita alCerrar');
    }

    let temporizador = null;
    let armado = false;
    let ultimoReinicio = 0;
    let enListener = null;
    let enVisibilidad = null;

    function limpiarTemporizador() {
        if (temporizador !== null) {
            cancelar(temporizador);
            temporizador = null;
        }
    }

    function programarCierre() {
        limpiarTemporizador();
        if (!armado) return;
        temporizador = programar(disparar, esperaMs);
    }

    async function disparar() {
        // Se desarma ANTES de await. Si el guardado o el logout
        // tardan, la inactividad no vuelve a encolar un cierre
        // encima: dos signOut concurrentes fallan.
        const seguirArmado = armado;
        armado = false;
        limpiarTemporizador();
        quitarListeners();

        try {
            await alCerrar();
        } catch (error) {
            console.error('[Inactividad] Falló el cierre por inactividad:', error);
        }

        // Si alguien re-armó el control mientras corría `alCerrar`
        // (por ejemplo, un login rápido), no se toca.
        if (seguirArmado && armado === false) return;
    }

    function registrarActividad() {
        const t = ahora();
        // Freno: mousemove genera decenas de eventos por segundo y
        // sin esto se cancelan y recrean el temporizador sin parar.
        if (t - ultimoReinicio < FrenoReinicioMs) return;
        ultimoReinicio = t;
        programarCierre();
    }

    function alCambiarVisibilidad() {
        // Volver a mirar la pantalla es actividad; cambiar de pestaña
        // no lo es. Sin esta distinción, cambiar de ventana para
        // consultar el banco dejaría la cuenta abierta.
        if (!documento) return;
        if (documento.visibilityState === 'visible' && documento.hidden === false) {
            registrarActividad();
        }
    }

    function agregarListeners() {
        if (!documento || enListener) return;
        enListener = registrarActividad;
        EVENTOS_INACTIVIDAD.forEach((evento) => {
            documento.addEventListener(evento, enListener, { passive: true });
        });
        enVisibilidad = alCambiarVisibilidad;
        documento.addEventListener('visibilitychange', enVisibilidad);
    }

    function quitarListeners() {
        if (!documento || !enListener) return;
        EVENTOS_INACTIVIDAD.forEach((evento) => {
            documento.removeEventListener(evento, enListener);
        });
        if (enVisibilidad) {
            documento.removeEventListener('visibilitychange', enVisibilidad);
            enVisibilidad = null;
        }
        enListener = null;
    }

    return {
        /** Empieza a contar. Idempotente: armar dos veces no duplica. */
        armar() {
            if (armado) return;
            armado = true;
            ultimoReinicio = ahora();
            agregarListeners();
            programarCierre();
        },

        /** Corta el conteo y saca los listeners. Idempotente. */
        detener() {
            armado = false;
            limpiarTemporizador();
            quitarListeners();
        },

        /** Reinicia el plazo. Sólo cuenta si está armado. */
        reiniciar() {
            if (!armado) return;
            registrarActividad();
        },

        armado: () => armado,
        pendiente: () => temporizador !== null
    };
}