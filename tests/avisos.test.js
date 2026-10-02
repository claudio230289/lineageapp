import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearEmisor } from '../js/core/eventos.js';
import { suscribirAvisosPersistencia, MOTIVOS_SILENCIOSOS, MENSAJE_FALLA } from '../js/core/avisos.js';

/* =========================================================
   Tests de la política de avisos de persistencia.

   El requisito es explícito: los errores y los guardados
   manuales se avisan, el auto-guardado NO. Estos tests fijan
   esa frontera, que es lo que evita una pantalla llena de
   toasts cada 10 minutos.
   ========================================================= */

let bus;
let notificarError;
let notificarExito;

const montar = () => {
    bus = crearEmisor('test');
    notificarError = vi.fn();
    notificarExito = vi.fn();
    return suscribirAvisosPersistencia(bus, { notificarError, notificarExito });
};

// Los manejadores de error escriben en consola a propósito. Se
// silencia sólo durante el test para que la salida sea legible.
let silencioConsola;
beforeEach(() => { silencioConsola = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { silencioConsola.mockRestore(); });

describe('suscribirAvisosPersistencia: errores', () => {
    it('debe avisar cuando falla el guardado en la nube', () => {
        montar();
        bus.emitir('db:error', { operacion: 'guardar', mensaje: 'unavailable', error: new Error('x') });

        expect(notificarError).toHaveBeenCalledTimes(1);
        expect(notificarError.mock.calls[0][0]).toContain('No se pudo guardar en la nube');
    });

    it('debe avisar cuando falla la carga, dizendo que se ve la copia local', () => {
        montar();
        bus.emitir('db:error', { operacion: 'cargar', mensaje: 'unavailable' });

        const texto = notificarError.mock.calls[0][0];
        expect(texto).toContain('No se pudieron leer los datos');
        expect(texto).toContain('copia local');
    });

    it('debe usar la misma clave para deduplicar', () => {
        // Sin clave, con la nube caída cada guardado pintaría un
        // aviso y se apilarían copias idénticas.
        montar();
        bus.emitir('db:error', { operacion: 'guardar', mensaje: 'unavailable' });
        bus.emitir('db:error', { operacion: 'guardar', mensaje: 'unavailable' });

        expect(notificarError.mock.calls[0][1]).toEqual({ clave: 'db-error-guardar' });
        expect(notificarError.mock.calls[1][1]).toEqual({ clave: 'db-error-guardar' });
    });

    it('debe usar claves distintas para operaciones distintas', () => {
        montar();
        bus.emitir('db:error', { operacion: 'guardar', mensaje: 'x' });
        bus.emitir('db:error', { operacion: 'cargar', mensaje: 'x' });

        expect(notificarError.mock.calls[0][1].clave).not.toBe(notificarError.mock.calls[1][1].clave);
    });

    it('debe avisar los errores del guardado automático', () => {
        // El silencio automático es sólo para el ÉXITO. Si la nube
        // se cae, el usuario tiene que enterarse igual: son sus
        // datos los que no se están respaldando.
        montar();
        bus.emitir('db:error', { operacion: 'guardar', motivo: 'auto', mensaje: 'unavailable' });

        expect(notificarError).toHaveBeenCalledTimes(1);
    });

    it('debe tolerar un error sin mensaje ni detalle de operación', () => {
        montar();
        expect(() => bus.emitir('db:error', {})).not.toThrow();
        expect(notificarError).toHaveBeenCalledTimes(1);
        expect(notificarError.mock.calls[0][0]).toContain('desconocido');
    });

    it('no debe romperse si le llega un evento vacío', () => {
        montar();
        expect(() => bus.emitir('db:error', null)).not.toThrow();
        expect(notificarError).not.toHaveBeenCalled();
    });

    it('debe dejar traza en consola para diagnóstico', () => {
        montar();
        bus.emitir('db:error', { operacion: 'guardar', error: new Error('boom') });
        expect(silencioConsola).toHaveBeenCalled();
    });
});

describe('suscribirAvisosPersistencia: guardado manual', () => {
    it('debe confirmar el guardado manual que llegó a la nube', () => {
        montar();
        bus.emitir('db:cargado', { operacion: 'guardar', motivo: 'manual', destino: 'nube' });

        expect(notificarExito).toHaveBeenCalledWith('Cambios guardados en la nube');
    });

    it('NO debe confirmar si el guardado manual quedó sólo en local', () => {
        // En ese caso lo que importa es que se le avise del
        // problema, y de eso se ocupa db:error.
        montar();
        bus.emitir('db:cargado', { operacion: 'guardar', motivo: 'manual', destino: 'local' });

        expect(notificarExito).not.toHaveBeenCalled();
    });
});

describe('suscribirAvisosPersistencia: silencios deliberados', () => {
    it('NO debe avisar el guardado automático', () => {
        montar();
        bus.emitir('db:cargado', { operacion: 'guardar', motivo: 'auto', destino: 'nube' });
        expect(notificarExito).not.toHaveBeenCalled();
    });

    it('NO debe avisar cada edición de la lista', () => {
        montar();
        for (let i = 0; i < 10; i++) {
            bus.emitir('db:cargado', { operacion: 'guardar', motivo: 'edicion', destino: 'nube' });
        }
        expect(notificarExito).not.toHaveBeenCalled();
    });

    it('NO debe avisar db:cargando', () => {
        montar();
        bus.emitir('db:cargando', { operacion: 'guardar', motivo: 'manual' });
        expect(notificarExito).not.toHaveBeenCalled();
        expect(notificarError).not.toHaveBeenCalled();
    });

    it('no debe duplicar suscripciones si se monta dos veces sobre el mismo bus', () => {
        // El arranque puede ejecutarse más de una vez. Con doble
        // suscripción, cada error pintaría dos toasts idénticos.
        montar();
        const primera = suscribirAvisosPersistencia(bus, { notificarError, notificarExito });
        const segunda = suscribirAvisosPersistencia(bus, { notificarError, notificarExito });

        expect(bus.listenerCount('db:error')).toBe(1);
        expect(segunda).toBe(primera);

        bus.emitir('db:error', { operacion: 'guardar', mensaje: 'x' });
        expect(notificarError).toHaveBeenCalledTimes(1);
    });

    it('debe poder volver a montar después de bajar', () => {
        montar();
        const primera = suscribirAvisosPersistencia(bus, { notificarError, notificarExito });
        primera.bajar();

        const segunda = suscribirAvisosPersistencia(bus, { notificarError, notificarExito });
        expect(segunda).not.toBe(primera);

        bus.emitir('db:error', { operacion: 'guardar', mensaje: 'x' });
        expect(notificarError).toHaveBeenCalledTimes(1);
    });
});

describe('suscribirAvisosPersistencia: ciclo de vida', () => {
    it('bajar debe detener los avisos', () => {
        const suscripcion = montar();
        suscripcion.bajar();

        bus.emitir('db:error', { operacion: 'guardar', mensaje: 'x' });
        bus.emitir('db:cargado', { operacion: 'guardar', motivo: 'manual', destino: 'nube' });

        expect(notificarError).not.toHaveBeenCalled();
        expect(notificarExito).not.toHaveBeenCalled();
    });

    it('debe rechazar dependencias faltantes en vez de fallar al primer evento', () => {
        expect(() => suscribirAvisosPersistencia(null, {})).toThrow(TypeError);
        expect(() => suscribirAvisosPersistencia(bus, {})).toThrow(TypeError);
        expect(() => suscribirAvisosPersistencia(bus, { notificarError: vi.fn() })).toThrow(TypeError);
    });

    it('debe exponer los mensajes para que sean consistentes', () => {
        expect(Object.keys(MENSAJE_FALLA)).toEqual(expect.arrayContaining(['cargar', 'guardar']));
        expect(MOTIVOS_SILENCIOSOS.has('auto')).toBe(true);
        expect(MOTIVOS_SILENCIOSOS.has('edicion')).toBe(true);
        expect(MOTIVOS_SILENCIOSOS.has('manual')).toBe(false);
    });
});