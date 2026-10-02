import { describe, it, expect, vi } from 'vitest';
import { crearEmisor } from '../js/core/eventos.js';

/* =========================================================
   Tests del emisor de eventos.

   Lo que importa no es sólo que el evento llegue, sino que un
   manejador roto no rompa al resto. En producción el manejador
   es el toast: si ese falla, el guardado en la nube tiene que
   completarse igual.
   ========================================================= */

describe('crearEmisor: suscripción', () => {
    it('debe entregar el detalle al manejador', () => {
        const bus = crearEmisor();
        let recibido = null;
        bus.on('db:cargado', detalle => { recibido = detalle; });

        bus.emitir('db:cargado', { operacion: 'guardar' });

        expect(recibido).toEqual({ operacion: 'guardar' });
    });

    it('no debe invocar los manejadores de otros eventos', () => {
        const bus = crearEmisor();
        const otro = vi.fn();
        bus.on('db:error', otro);

        bus.emitir('db:cargado', {});

        expect(otro).not.toHaveBeenCalled();
    });

    it('debe tolerar varios suscriptores del mismo evento', () => {
        const bus = crearEmisor();
        const a = vi.fn();
        const b = vi.fn();
        bus.on('x', a);
        bus.on('x', b);

        bus.emitir('x', 1);

        expect(a).toHaveBeenCalledWith(1);
        expect(b).toHaveBeenCalledWith(1);
    });

    it('no debe registrar dos veces al mismo manejador', () => {
        const bus = crearEmisor();
        const manejador = vi.fn();
        bus.on('x', manejador);
        bus.on('x', manejador);

        bus.emitir('x');

        expect(manejador).toHaveBeenCalledTimes(1);
    });

    it('debe devolver una función de baja que funciona', () => {
        const bus = crearEmisor();
        const manejador = vi.fn();
        const desuscribir = bus.on('x', manejador);

        desuscribir();
        bus.emitir('x');

        expect(manejador).not.toHaveBeenCalled();
        expect(bus.listenerCount('x')).toBe(0);
    });

    it('debe rechazar entradas inválidas en vez de fallar en silencio', () => {
        const bus = crearEmisor();
        expect(() => bus.on('', () => {})).toThrow(TypeError);
        expect(() => bus.on('x', 'no soy función')).toThrow(TypeError);
    });
});

describe('crearEmisor: "una" (una sola vez)', () => {
    it('debe ejecutarse una única vez', () => {
        const bus = crearEmisor();
        const manejador = vi.fn();
        bus.una('x', manejador);

        bus.emitir('x');
        bus.emitir('x');
        bus.emitir('x');

        expect(manejador).toHaveBeenCalledTimes(1);
    });

    it('debe poder cancelarse antes de dispararse', () => {
        const bus = crearEmisor();
        const manejador = vi.fn();
        const cancelar = bus.una('x', manejador);

        cancelar();
        bus.emitir('x');

        expect(manejador).not.toHaveBeenCalled();
    });
});

describe('crearEmisor: aislamiento de fallos', () => {
    it('un manejador que lanza no debe impedir que corran los demás', () => {
        // Este es el escenario real: el toast falla y el resto de
        // la aplicación tiene que seguir funcionando.
        const bus = crearEmisor();
        const antes = vi.fn();
        const roto = () => { throw new Error('boom'); };
        const despues = vi.fn();
        bus.on('x', antes);
        bus.on('x', roto);
        bus.on('x', despues);

        bus.emitir('x', {});

        expect(antes).toHaveBeenCalled();
        expect(despues).toHaveBeenCalled();
    });

    it('debe reportar el fallo sin propagarlo', () => {
        const bus = crearEmisor();
        bus.on('x', () => { throw new Error('boom'); });

        expect(() => bus.emitir('x')).not.toThrow();
    });

    it('debe devolver un resultado por manejador, marcando el fallo', () => {
        const bus = crearEmisor();
        bus.on('x', () => 'ok');
        bus.on('x', () => { throw new Error('boom'); });

        const resultados = bus.emitir('x');

        expect(resultados).toHaveLength(2);
        expect(resultados[0]).toEqual({ ok: true, valor: 'ok' });
        expect(resultados[1].ok).toBe(false);
        expect(resultados[1].error.message).toBe('boom');
    });

    it('debe notificar a los observadores de error', () => {
        const bus = crearEmisor();
        const observador = vi.fn();
        bus.observarErrores(observador);
        bus.on('x', () => { throw new Error('boom'); });

        bus.emitir('x');

        expect(observador).toHaveBeenCalledTimes(1);
        expect(observador.mock.calls[0][0].evento).toBe('x');
    });

    it('debe seguir funcionando si el observador de error también falla', () => {
        const bus = crearEmisor();
        bus.observarErrores(() => { throw new Error('doble boom'); });
        bus.on('x', vi.fn());

        expect(() => bus.emitir('x')).not.toThrow();
    });
});

describe('crearEmisor: tolerancia a Emission durante la entrega', () => {
    it('un manejador puede desuscribirse a sí mismo sin romper la iteración', () => {
        const bus = crearEmisor();
        let llamadas = 0;
        const desuscribir = bus.on('x', () => {
            llamadas++;
            desuscribir();
        });

        expect(() => bus.emitir('x')).not.toThrow();
        bus.emitir('x');

        expect(llamadas).toBe(1);
    });

    it('un manejador puede suscribir otro sin saltarse el ninguno', () => {
        const bus = crearEmisor();
        const nuevo = vi.fn();
        bus.on('x', () => { bus.on('y', nuevo); });

        expect(() => bus.emitir('x')).not.toThrow();
        bus.emitir('y');

        expect(nuevo).toHaveBeenCalledTimes(1);
    });
});

describe('crearEmisor: casos borde', () => {
    it('debe devolver lista vacía si nadie escucha', () => {
        const bus = crearEmisor();
        expect(bus.emitir('x')).toEqual([]);
    });

    it('debe tolerar emitir sin detalle', () => {
        const bus = crearEmisor();
        const manejador = vi.fn();
        bus.on('x', manejador);

        expect(() => bus.emitir('x')).not.toThrow();
        expect(manejador).toHaveBeenCalledWith(undefined);
    });

    it('off sin manejador debe vaciar el evento', () => {
        const bus = crearEmisor();
        bus.on('x', vi.fn());
        bus.on('x', vi.fn());

        bus.off('x');

        expect(bus.listenerCount('x')).toBe(0);
    });

    it('bajar un evento inexistente no debe lanzar', () => {
        const bus = crearEmisor();
        expect(() => bus.off('nunca-existio', vi.fn())).not.toThrow();
    });

    it('limpiar debe vaciar todo', () => {
        const bus = crearEmisor();
        bus.on('x', vi.fn());
        bus.on('y', vi.fn());

        bus.limpiar();

        expect(bus.listenerCount('x')).toBe(0);
        expect(bus.listenerCount('y')).toBe(0);
    });

    it('dos emisores no deben compartir estado', () => {
        // Importa porque db.js y app.js podrían crear el suyo por
        // error: si cada módulo tiene el suyo, los eventos no
        // llegan y el fallo es invisible.
        const a = crearEmisor();
        const b = crearEmisor();
        const manejador = vi.fn();
        a.on('x', manejador);

        b.emitir('x');

        expect(manejador).not.toHaveBeenCalled();
    });
});