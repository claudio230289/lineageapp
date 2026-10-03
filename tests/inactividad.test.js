import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    crearControlInactividad,
    MS_INACTIVIDAD,
    MINUTOS_INACTIVIDAD,
    EVENTOS_INACTIVIDAD,
    FrenoReinicioMs
} from '../js/core/inactividad.js';

/* =========================================================
   Tests del cierre por inactividad.

   Se usa reloj falso de vitest porque lo que importa es la
   relación entre "último evento" y "5 minutos después", y esperar
   5 minutos reales en un test no es una opción.

   Los tres riesgos que estos tests cubren, y que en producción
   serían dolorosos:
   1. Dos signOut concurrentes si el guardado tarda y la
      inactividad vuelve a disparar el cierre.
   2. Temporizadores en cadena: armar dos veces duplica el plazo.
   3. Listeners acumulados: cada arranque agrega otro juego de
      listeners y la app se pone lenta y cierra antes de tiempo.
   ========================================================= */

describe('constantes', () => {
    it('el plazo debe ser de 5 minutos', () => {
        expect(MINUTOS_INACTIVIDAD).toBe(5);
        expect(MS_INACTIVIDAD).toBe(5 * 60 * 1000);
    });

    it('debe escuchar los eventos que delatan a alguien presente', () => {
        expect(EVENTOS_INACTIVIDAD).toContain('mousemove');
        expect(EVENTOS_INACTIVIDAD).toContain('keydown');
        expect(EVENTOS_INACTIVIDAD).toContain('touchstart');
    });
});

describe('disparo del cierre', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('no debe cerrar antes de que venza el plazo', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        vi.advanceTimersByTime(MS_INACTIVIDAD - 1);
        expect(cerrar).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('la actividad debe patear el plazo', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        vi.advanceTimersByTime(MS_INACTIVIDAD - 1000);
        document.dispatchEvent(new Event('mousemove'));
        // El reloj no avanzó, así que sin reiniciar ya habría
        // disparado. Con el reinicio todavía no.
        vi.advanceTimersByTime(MS_INACTIVIDAD - 1000);

        expect(cerrar).not.toHaveBeenCalled();

        vi.advanceTimersByTime(2000);
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('varios eventos seguidos NO deben alargar el plazo sin parar', () => {
        // Sin el freno, 100 mousemove en el mismo instante dejarían
        // el plazo pendiente de 100 Reinicio distintos y la cuenta
        // no cerraría nunca. El freno los colapsa.
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        for (let i = 0; i < 100; i++) {
            document.dispatchEvent(new Event('mousemove'));
        }

        vi.advanceTimersByTime(MS_INACTIVIDAD);
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('un evento tras el freno sí debe reiniciar', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        vi.advanceTimersByTime(MS_INACTIVIDAD - 1000);
        document.dispatchEvent(new Event('mousemove'));
        vi.advanceTimersByTime(FrenoReinicioMs);
        document.dispatchEvent(new Event('mousemove'));

        vi.advanceTimersByTime(MS_INACTIVIDAD - 1);
        expect(cerrar).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('keydown y scroll también cuentan como actividad', () => {
        ['keydown', 'scroll', 'mousedown', 'touchstart'].forEach((evento) => {
            const cerrar = vi.fn();
            const control = crearControlInactividad({ alCerrar: cerrar });
            control.armar();

            vi.advanceTimersByTime(MS_INACTIVIDAD - 500);
            document.dispatchEvent(new Event(evento));
            vi.advanceTimersByTime(MS_INACTIVIDAD - 500);

            expect(cerrar, `${evento} debería haber reiniciado el plazo`).not.toHaveBeenCalled();
            control.detener();
        });
    });

    it('no debe cerrar dos veces aunque venza el plazo de nuevo', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        vi.advanceTimersByTime(MS_INACTIVIDAD);
        vi.advanceTimersByTime(MS_INACTIVIDAD);

        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('NO debe disparar un segundo cierre mientras el guardado sigue en vuelo', () => {
        // El escenario caro: el guardado a la nube tarda más que el
        // umbral y, si no se desarmara, se encolaría otro signOut.
        // Dos signOut a la vez fallan.
        let resolver;
        const guardar = vi.fn(() => new Promise((r) => { resolver = r; }));
        const control = crearControlInactividad({ alCerrar: guardar });
        control.armar();

        vi.advanceTimersByTime(MS_INACTIVIDAD);
        expect(guardar).toHaveBeenCalledTimes(1);
        expect(control.armado()).toBe(false);

        // Pasado otro plazo completo, el guardado sigue sin terminar.
        vi.advanceTimersByTime(MS_INACTIVIDAD * 3);
        expect(guardar).toHaveBeenCalledTimes(1);

        resolver();
    });

    it('un fallo en alCerrar no debe dejar el control armado a medias', () => {
        const error = new Error('falló el guardado');
        const control = crearControlInactividad({
            alCerrar: () => { throw error; },
            documento: null
        });
        control.armar();

        expect(() => vi.advanceTimersByTime(MS_INACTIVIDAD)).not.toThrow();
        expect(control.armado()).toBe(false);
    });
});

describe('armar y detener', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('armar dos veces no debe duplicar el plazo ni los listeners', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });

        control.armar();
        control.armar();
        control.armar();

        vi.advanceTimersByTime(MS_INACTIVIDAD);
        // Si hubiera tres temporizadores, el cierre correría tres
        // veces; el control debe ser idempotente.
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('detener debe cancelar el cierre por completo', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();
        control.detener();

        vi.advanceTimersByTime(MS_INACTIVIDAD * 10);
        expect(cerrar).not.toHaveBeenCalled();
        expect(control.pendiente()).toBe(false);
    });

    it('tras detener, la actividad NO debe rearmar', () => {
        // El riesgo real: un logout manual llama a detener(), y el primer
        // clic de la persona en la pantalla de login rearmaba el
        // temporizador con la sesión ya cerrada.
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();
        control.detener();

        document.dispatchEvent(new Event('mousemove'));
        vi.advanceTimersByTime(MS_INACTIVIDAD * 10);

        expect(cerrar).not.toHaveBeenCalled();
    });

    it('reiniciar no debe hacer nada si el control está detenido', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });

        control.reiniciar();
        vi.advanceTimersByTime(MS_INACTIVIDAD * 2);

        expect(cerrar).not.toHaveBeenCalled();
        expect(control.pendiente()).toBe(false);
    });

    it('volver a armar tras detener debe funcionar', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });

        control.armar();
        control.detener();
        control.armar();

        vi.advanceTimersByTime(MS_INACTIVIDAD);
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('no debe dejar listeners colgados al detenerse', () => {
        const quitar = vi.spyOn(document, 'removeEventListener');
        const control = crearControlInactividad({ alCerrar: vi.fn() });

        control.armar();
        control.detener();

        const quitados = quitar.mock.calls.map((c) => c[0]);
        EVENTOS_INACTIVIDAD.forEach((evento) => {
            expect(quitados, `no se sacó el listener de ${evento}`).toContain(evento);
        });
        expect(quitados).toContain('visibilitychange');

        quitar.mockRestore();
    });
});

describe('visibilidad', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('ocultar la pestaña NO debe reiniciar el plazo', () => {
        // Cambiar de pestaña para consultar el banco no es estar
        // delante de la pantalla.
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        vi.advanceTimersByTime(MS_INACTIVIDAD - 1000);
        Object.defineProperty(document, 'visibilityState', {
            value: 'hidden', configurable: true
        });
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        vi.advanceTimersByTime(MS_INACTIVIDAD - 1000);
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('volver a mirar la pestaña SÍ debe reiniciar el plazo', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        vi.advanceTimersByTime(MS_INACTIVIDAD - 1000);
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible', configurable: true
        });
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        vi.advanceTimersByTime(MS_INACTIVIDAD - 1000);
        expect(cerrar).not.toHaveBeenCalled();
    });
});

describe('validación', () => {
    it('debe exigir una función alCerrar', () => {
        expect(() => crearControlInactividad({})).toThrow(TypeError);
        expect(() => crearControlInactividad({ alCerrar: 'no soy función' })).toThrow(TypeError);
    });

    it('debe tolerar un plazo custom', () => {
        vi.useFakeTimers();
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar, esperaMs: 1000 });
        control.armar();

        vi.advanceTimersByTime(1000);
        expect(cerrar).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});