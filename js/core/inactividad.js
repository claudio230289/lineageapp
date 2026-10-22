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

   Control por timestamp real:
   Cuando el usuario bloquea el celular o cambia de app, los navegadores
   móviles pausan los temporizadores setTimeout. Al volver (visibilitychange),
   se calcula el tiempo real transcurrido contra el último momento activo
   persistido (en memoria y localStorage). Si pasaron 15 minutos o más,
   se cierra de inmediato; si no, se programa el tiempo remanente.
   ========================================================= */

/** Plazo de inactividad, en minutos. */
export const MINUTOS_INACTIVIDAD = 15;
export const MS_INACTIVIDAD = MINUTOS_INACTIVIDAD * 60 * 1000;

/** Clave de localStorage para persistir el último timestamp activo */
export const CLAVE_STORAGE_INACTIVIDAD = 'finanzas_ultimo_momento_activo';

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
 * cambiar de pestaña no es actividad; volver a mirarla reevalúa
 * el tiempo real transcurrido.
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
 * @param {Storage|Object} [opciones.almacenamiento] Storage donde persistir
 *   el último momento activo para tolerar suspensiones del navegador.
 * @param {string} [opciones.claveStorage] Nombre de la clave en almacenamiento.
 * @param {Function} [opciones.programar] setTimeout inyectable.
 * @param {Function} [opciones.cancelar] clearTimeout inyectable.
 * @param {Function} [opciones.ahora] Reloj inyectable.
 * @returns {{armar:Function, detener:Function, reiniciar:Function, armado:Function, pendiente:Function}}
 */
export function crearControlInactividad({
    alCerrar,
    esperaMs = MS_INACTIVIDAD,
    documento = typeof document !== 'undefined' ? document : null,
    almacenamiento = typeof localStorage !== 'undefined' ? localStorage : null,
    claveStorage = CLAVE_STORAGE_INACTIVIDAD,
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
    let ultimoMomentoActivo = 0;
    let enListener = null;
    let enVisibilidad = null;

    function limpiarTemporizador() {
        if (temporizador !== null) {
            cancelar(temporizador);
            temporizador = null;
        }
    }

    function guardarMomentoActivo(ts = ahora()) {
        ultimoMomentoActivo = ts;
        if (almacenamiento) {
            try {
                almacenamiento.setItem(claveStorage, String(ts));
            } catch (_) {}
        }
    }

    function obtenerMomentoActivo() {
        if (almacenamiento) {
            try {
                const guardado = almacenamiento.getItem(claveStorage);
                if (guardado !== null && guardado !== undefined) {
                    const ts = Number(guardado);
                    if (Number.isFinite(ts) && ts > 0) {
                        return ts;
                    }
                }
            } catch (_) {}
        }
        return ultimoMomentoActivo;
    }

    function limpiarMomentoActivo() {
        ultimoMomentoActivo = 0;
        if (almacenamiento) {
            try {
                almacenamiento.removeItem(claveStorage);
            } catch (_) {}
        }
    }

    function programarCierre(ms = esperaMs) {
        limpiarTemporizador();
        if (!armado) return;
        temporizador = programar(disparar, Math.max(0, ms));
    }

    async function disparar() {
        // Se desarma ANTES de await. Si el guardado o el logout
        // tardan, la inactividad no vuelve a encolar un cierre
        // encima: dos signOut concurrentes fallan.
        const seguirArmado = armado;
        armado = false;
        limpiarTemporizador();
        quitarListeners();
        limpiarMomentoActivo();

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
        if (!armado) return;
        const t = ahora();
        const ultimo = obtenerMomentoActivo();
        if (ultimo > 0 && t - ultimo >= esperaMs) {
            disparar();
            return;
        }
        // Freno: mousemove genera decenas de eventos por segundo y
        // sin esto se cancelan y recrean el temporizador sin parar.
        if (t - ultimoReinicio < FrenoReinicioMs) return;
        ultimoReinicio = t;
        guardarMomentoActivo(t);
        programarCierre(esperaMs);
    }

    function alCambiarVisibilidad() {
        // Volver a mirar la pantalla reevalúa el plazo por timestamp real.
        // Si estuvo en segundo plano o el celular se bloqueó, el temporizador del navegador
        // se congela. Al volver a visible comprobamos el tiempo real transcurrido:
        // - Si transcurrido >= esperaMs: se dispara el cierre de inmediato sin reiniciar.
        // - Si transcurrido < esperaMs: se programa el temporizador con el tiempo restante.
        if (!documento || !armado) return;
        if (documento.visibilityState === 'visible' && documento.hidden !== true) {
            const t = ahora();
            const ultimo = obtenerMomentoActivo();
            const transcurrido = t - ultimo;
            if (ultimo > 0 && transcurrido >= esperaMs) {
                disparar();
                return;
            }
            const restante = Math.max(0, esperaMs - (ultimo > 0 ? transcurrido : 0));
            programarCierre(restante);
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
            const t = ahora();
            ultimoReinicio = t;
            guardarMomentoActivo(t);
            agregarListeners();
            programarCierre(esperaMs);
        },

        /** Corta el conteo y saca los listeners. Idempotente. */
        detener() {
            armado = false;
            limpiarTemporizador();
            quitarListeners();
            limpiarMomentoActivo();
        },

        /** Reinicia el plazo. Sólo cuenta si está armado. */
        reiniciar() {
            if (!armado) return;
            const t = ahora();
            ultimoReinicio = t;
            guardarMomentoActivo(t);
            programarCierre(esperaMs);
        },

        armado: () => armado,
        pendiente: () => temporizador !== null
    };
}
