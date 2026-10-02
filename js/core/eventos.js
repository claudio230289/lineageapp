/* =========================================================
   EMISOR DE EVENTOS (js/core/eventos.js)
   =========================================================
   Canal de comunicación entre la capa de persistencia (db.js)
   y quien la escucha (app.js), sin que ninguno tenga que
   importar al otro.

   Por qué existe: hoy la capa de datos avisa sus errores con
   console.warn y sigue. Eso deja al usuario sin enterarse de
   que sus cambios quedaron sólo en el navegador. Para poder
   avisar sin alert() (que congela la app) hace falta un canal
   declarado, y que la decisión de qué se avisa y qué no se
   quede en la capa que entiende el contexto.

   Regla de oro: un manejador que lanza NO puede arrastrar al
   resto. Si el toast se rompe, el guardado tiene que funcionar
   igual.
   ========================================================= */

/**
 * Crea un emisor de eventos aislado.
 *
 * @param {string} [nombre] Sólo se usa para identificar el emisor
 *   en los mensajes de diagnóstico.
 * @returns {{emitir:Function, on:Function, una:Function, off:Function,
 *            limpiar:Function,(listenerCount:Function}}
 */
export function crearEmisor(nombre = 'bus') {
    /** @type {Map<string, Set<Function>>} */
    const suscriptores = new Map();
    /** @type {Set<Function>} Manejadores de fallo del propio bus. */
    const observadoresDeError = new Set();

    /**
     * Suscribe un manejador a un evento.
     *
     * @param {string} evento
     * @param {Function} manejador
     * @returns {Function} Función para desuscribir. Se devuelve en
     *   lugar de obligar a guardar la referencia, que es la forma
     *   habitual de acumular suscripciones que nunca se limpian.
     */
    function on(evento, manejador) {
        if (typeof evento !== 'string' || !evento) {
            throw new TypeError('eventos.on: el evento debe ser un string no vacío.');
        }
        if (typeof manejador !== 'function') {
            throw new TypeError(`eventos.on("${evento}"): el manejador debe ser una función.`);
        }

        if (!suscriptores.has(evento)) suscriptores.set(evento, new Set());
        suscriptores.get(evento).add(manejador);

        return function desuscribir() {
            off(evento, manejador);
        };
    }

    /**
     * Suscribe un manejador que se ejecuta una sola vez.
     * @param {string} evento
     * @param {Function} manejador
     * @returns {Function} Función para desuscribir antes de que corra.
     */
    function una(evento, manejador) {
        // Se declara antes que la envoltura por claridad: la
        // envoltura la invoca en el momento de dispararse, cuando
        // `baja` ya está asignada.
        let baja = null;

        const envoltura = (...args) => {
            // Baja ANTES de ejecutar: si el manejador vuelve a
            // emitir el mismo evento, no se vuelve a llamar.
            if (baja) baja();
            return manejador(...args);
        };

        // Se marca para que off() encuentre la envoltura cuando le
        // pasen la referencia original del manejador.
        envoltura.manejadorOriginal = manejador;
        baja = on(evento, envoltura);
        return baja;
    }

    /**
     * Da de baja un manejador. Si no se pasa manejador, vacía el
     * evento por completo.
     * @param {string} evento
     * @param {Function} [manejador]
     */
    function off(evento, manejador) {
        if (!suscriptores.has(evento)) return;

        if (typeof manejador === 'function') {
            const conjunto = suscriptores.get(evento);
            conjunto.delete(manejador);
            // La envoltura de `una()` no es la referencia original.
            for (const registrado of conjunto) {
                if (registrado.manejadorOriginal === manejador) conjunto.delete(registrado);
            }
            if (conjunto.size === 0) suscriptores.delete(evento);
            return;
        }

        suscriptores.delete(evento);
    }

    /**
     * Emite un evento. Nunca lanza: un manejador roto se aísla y se
     * reporta, y los demás siguen recibiendo el evento.
     *
     * @param {string} evento
     * @param {*} [detalle]
     * @returns {Array} Un resultado por manejador. Así un test puede
     *   afirmar qué devolvió cada uno sin Instrumentar la consola.
     */
    function emitir(evento, detalle) {
        const conjunto = suscriptores.get(evento);
        if (!conjunto || conjunto.size === 0) return [];

        // Se copia antes de iterar: un manejador podría desuscribirse
        // (o suscribir otro) durante la emisión y modificar el Set
        // mientras se recorre.
        const resultados = [];
        for (const manejador of [...conjunto]) {
            try {
                resultados.push({ ok: true, valor: manejador(detalle) });
            } catch (error) {
                resultados.push({ ok: false, error });
                reportarFallo(evento, error);
            }
        }
        return resultados;
    }

    /**
     * Notifica que un manejador de un evento falló.
     * @private
     */
    function reportarFallo(evento, error) {
        console.error(`[eventos:${nombre}] El manejador de "${evento}" falló:`, error);
        for (const observador of [...observadoresDeError]) {
            try {
                observador({ evento, error });
            } catch (e) {
                console.error(`[eventos:${nombre}] El observador de errores falló:`, e);
            }
        }
    }

    /** @param {string} evento @returns {number} */
    function listenerCount(evento) {
        const conjunto = suscriptores.get(evento);
        return conjunto ? conjunto.size : 0;
    }

    /** Elimina todas las suscripciones. Existe para tests. */
    function limpiar() {
        suscriptores.clear();
        observadoresDeError.clear();
    }

    return {
        emitir,
        on,
        una,
        off,
        limpiar,
        listenerCount,
        observarErrores: (fn) => {
            if (typeof fn === 'function') observadoresDeError.add(fn);
            return () => observadoresDeError.delete(fn);
        }
    };
}

/**
 * Bus compartido de la aplicación.
 *
 * Es único a propósito: db.js y app.js son módulos distintos que
 * se cargan en distinto orden, y ambos necesitan apuntar al mismo
 * objeto. Si cada uno creara el suyo, la mitad de los eventos no
 * llegaría a ningún lado y el fallo sería invisible.
 */
export const busEventos = crearEmisor('app');