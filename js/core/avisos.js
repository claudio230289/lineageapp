/* =========================================================
   POLÍTICA DE AVISOS DE PERSISTENCIA (js/core/avisos.js)
   =========================================================
   Traduce los eventos de db.js a avisos para la persona. Vive
   aparte de app.js por dos razones:

     1. app.js importa db.js, que importa Firebase por URL.
        En Node eso falla con ERR_UNSUPPORTED_ESM_URL_SCHEME y
        la política quedaría sin ningún test posible.
     2. La decisión de qué se avisa es una regla de negocio, no
        parte del renderizado. Merece su propio archivo.

   No toca el DOM: recibe las funciones de notificación como
   argumento, así se puede probar con dobles.
   ========================================================= */

/**
 * Motivos cuyo guardado no genera toast.
 *
 * 'auto'    temporizador de 10 minutos: nadie lo pidió.
 * 'edicion' alta o borrado: la fila ya cambió en pantalla y un
 *           aviso encima sería redundante.
 *
 * 'manual' e 'importacion' NO están acá a propósito. La
 * importación anuncia su propio resultado, y el guardado manual
 * es el único caso en que la persona hizo una acción explícita
 * esperando una respuesta.
 */
/**
 * Motivos que no muestran toast.
 *
 * `auto` es el guardado cada 10 minutos, que nadie pidió: si
 * anunciara cada guardado, cada 10 minutos saltaría un aviso sin
 * motivo aparente. `edicion` cubre escrituras internas de bajo
 * nivel que no son una acción de la persona. `cierre` es el
 * guardado previo al cierre por inactividad, donde la persona no
 * está mirando: el aviso se perdería.
 */
export const MOTIVOS_SILENCIOSOS = new Set(['auto', 'edicion', 'cierre']);

/**
 * Qué se le dice a la persona según la operación que falló.
 *
 * Un código como "unavailable" o "permission-denied" no le dice
 * nada. Lo que necesita saber es si perdió algo o si sólo tiene
 * que reintentar más tarde.
 */
export const MENSAJE_FALLA = {
    cargar: 'No se pudieron leer los datos de la nube. Se está mostrando la copia local, que puede estar desactualizada.',
    guardar: 'No se pudo guardar en la nube. Los cambios quedaron sólo en este dispositivo.',
    'guardar-local': 'No se pudo guardar en la nube. Los cambios quedaron sólo en este dispositivo.'
};

const TRAZA = '[Persistencia]';

/**
 * Suscripciones ya creadas, por bus.
 *
 * Hace falta porque app.js engancha esto al importarse el módulo,
 * pero nada impide que alguien lo mueva dentro de initApp, que se
 * vuelve a ejecutar. Con doble suscripción, cada error pintaría
 * dos toasts idénticos, y nadie lo notaría porque "se ven dos".
 *
 * Se usa WeakMap y no un Set de módulos para que el bus pueda ser
 * recolectado cuando la app se deseche.
 */
const suscripciones = new WeakMap();

/**
 * Suscribe la política de avisos a un bus de eventos.
 *
 * @param {{on:Function}} bus Emisor (js/core/eventos.js)
 * @param {{notificarError:Function, notificarExito:Function}} avisos
 * @returns {{bajar:Function, contar:Function}} Para desuscribir y
 *   para que un test pueda comprobar que no se duplicó.
 */
export function suscribirAvisosPersistencia(bus, { notificarError, notificarExito }) {
    if (!bus || typeof bus.on !== 'function') {
        throw new TypeError('suscribirAvisosPersistencia: hace falta un bus con .on()');
    }
    if (typeof notificarError !== 'function' || typeof notificarExito !== 'function') {
        throw new TypeError('suscribirAvisosPersistencia: hacen falta notificarError y notificarExito');
    }

    // Idempotente: una segunda llamada sobre el mismo bus devuelve
    // la suscripción existente en lugar de duplicar los avisos.
    if (suscripciones.has(bus)) return suscripciones.get(bus);

    const bajaError = bus.on('db:error', (detalle) => {
        if (!detalle) return;

        const { operacion, mensaje, error } = detalle;

        // Traza completa para diagnóstico. El texto del aviso
        // deliberadamente NO incluye el código de Firebase: es
        // técnico y hace Noise sin ayudar a decidir qué hacer.
        console.error(`${TRAZA}:${operacion}`, error || mensaje);

        const texto = MENSAJE_FALLA[operacion]
            || `Error de sincronización: ${mensaje || 'desconocido'}`;

        // La clave evita apilar copias: con la nube caída, cada
        // operación emitiría el mismo aviso y en un rato se
        // cubriría media pantalla de textos idénticos.
        notificarError(texto, { clave: `db-error-${operacion}` });
    });

    const bajaCarga = bus.on('db:cargado', (detalle) => {
        if (!detalle) return;
        if (MOTIVOS_SILENCIOSOS.has(detalle.motivo)) return;
        if (detalle.motivo !== 'manual') return;

        // Sólo el guardado que llegó a la nube se confirma como
        // guardado. Si quedó en local, db:error ya avisó.
        if (detalle.destino !== 'nube') return;

        notificarExito('Cambios guardados en la nube');
    });

    const suscripcion = {
        bajar() {
            bajaError();
            bajaCarga();
            // Se olvida para que, tras bajar, volver a montar sí
            // cree una suscripción nueva y funcional.
            suscripciones.delete(bus);
        },
        contar() {
            return bus.listenerCount('db:error') + bus.listenerCount('db:cargado');
        }
    };

    suscripciones.set(bus, suscripcion);
    return suscripcion;
}