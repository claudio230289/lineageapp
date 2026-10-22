import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as acorn from 'acorn';
import {
    crearControlInactividad,
    MS_INACTIVIDAD,
    MINUTOS_INACTIVIDAD,
    EVENTOS_INACTIVIDAD,
    FrenoReinicioMs,
    CLAVE_STORAGE_INACTIVIDAD
} from '../js/core/inactividad.js';

/* =========================================================
   Tests del cierre por inactividad.

   Se usa reloj falso de vitest porque lo que importa es la
   relación entre "último evento" y "15 minutos después", y esperar
   15 minutos reales en un test no es una opción.

   Los riesgos cubiertos:
   1. Dos signOut concurrentes si el guardado tarda y la
      inactividad vuelve a disparar el cierre.
   2. Temporizadores en cadena: armar dos veces duplica el plazo.
   3. Listeners acumulados: cada arranque agrega otro juego de
      listeners y la app se pone lenta y cierra antes de tiempo.
   4. Suspensión en móvil / background: al volver por visibilitychange,
      calcular el tiempo real transcurrido para no reiniciar 15 min
      injustificadamente si ya venció el plazo.
   5. Descarga segura del respaldo JSON al cerrar la sesión por inactividad.
   ========================================================= */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUENTE_APP = path.join(RAIZ, 'js', 'app.js');
const FUENTE = readFileSync(FUENTE_APP, 'utf8');

function extraerFuncion(nombre, tipo = 'exportada') {
    const ast = acorn.parse(FUENTE, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
    });

    let encontrada = null;
    const visitar = (nodo) => {
        if (!nodo || typeof nodo !== 'object') return;
        const esDeclarada = nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre;
        const esExportada = nodo.type === 'ExportNamedDeclaration'
            && nodo.declaration?.type === 'FunctionDeclaration'
            && nodo.declaration.id?.name === nombre;

        if (esDeclarada && tipo === 'declarada' && !encontrada) encontrada = nodo;
        if (esExportada && tipo === 'exportada' && !encontrada) encontrada = nodo.declaration;

        for (const clave of Object.keys(nodo)) {
            const valor = nodo[clave];
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object' && valor.type) visitar(valor);
        }
    };

    visitar(ast);
    if (!encontrada) throw new Error(`No se encontró la función "${nombre}" (${tipo}) en js/app.js`);
    return FUENTE.slice(encontrada.start, encontrada.end);
}

describe('constantes', () => {
    it('el plazo debe ser de 15 minutos', () => {
        expect(MINUTOS_INACTIVIDAD).toBe(15);
        expect(MS_INACTIVIDAD).toBe(15 * 60 * 1000);
    });

    it('debe escuchar los eventos que delatan a alguien presente', () => {
        expect(EVENTOS_INACTIVIDAD).toContain('mousemove');
        expect(EVENTOS_INACTIVIDAD).toContain('keydown');
        expect(EVENTOS_INACTIVIDAD).toContain('touchstart');
    });

    it('debe definir la clave de almacenamiento para el último momento activo', () => {
        expect(CLAVE_STORAGE_INACTIVIDAD).toBe('finanzas_ultimo_momento_activo');
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

describe('visibilidad y control por timestamp real', () => {
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

    it('volver a mirar la pestaña debe reprogramar con el tiempo restante, no con 15 minutos nuevos', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        // Pasan 10 minutos con el usuario fuera (en background o con pantalla apagada)
        vi.advanceTimersByTime(10 * 60 * 1000);

        Object.defineProperty(document, 'visibilityState', {
            value: 'visible', configurable: true
        });
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        // Quedan 5 minutos. A los 4 minutos todavía no debe cerrar.
        vi.advanceTimersByTime(4 * 60 * 1000);
        expect(cerrar).not.toHaveBeenCalled();

        // 1 minuto y 1ms después (total > 15 minutos) debe disparar el cierre.
        vi.advanceTimersByTime(1 * 60 * 1000 + 1);
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('volver a mirar la pestaña cuando ya pasaron los 15 minutos en background debe cerrar inmediatamente', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        // Simular que el teléfono se bloqueó o la pestaña estuvo pausada 16 minutos
        vi.advanceTimersByTime(16 * 60 * 1000);

        Object.defineProperty(document, 'visibilityState', {
            value: 'visible', configurable: true
        });
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        // Debe cerrar de inmediato sin requerir esperar ningún temporizador adicional
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('interactuar tras haber vencido el plazo en segundo plano debe invocar el cierre de inmediato', () => {
        const cerrar = vi.fn();
        const control = crearControlInactividad({ alCerrar: cerrar });
        control.armar();

        // Avanzar el tiempo real más allá del plazo
        vi.advanceTimersByTime(16 * 60 * 1000);

        document.dispatchEvent(new Event('mousemove'));
        expect(cerrar).toHaveBeenCalledTimes(1);
    });

    it('persiste el último momento activo en almacenamiento y lo limpia al detener', () => {
        const almacenamientoMock = {
            datos: {},
            setItem(k, v) { this.datos[k] = String(v); },
            getItem(k) { return this.datos[k] ?? null; },
            removeItem(k) { delete this.datos[k]; }
        };

        const cerrar = vi.fn();
        const control = crearControlInactividad({
            alCerrar: cerrar,
            almacenamiento: almacenamientoMock
        });

        control.armar();
        expect(almacenamientoMock.getItem(CLAVE_STORAGE_INACTIVIDAD)).not.toBeNull();

        control.detener();
        expect(almacenamientoMock.getItem(CLAVE_STORAGE_INACTIVIDAD)).toBeNull();
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

describe('descarga de respaldo y cierre en app.js', () => {
    function crearCerrarPorInactividad(mocks) {
        const src = extraerFuncion('cerrarPorInactividad', 'exportada');
        const fabrica = new Function(
            'document', 'db', 'auth', 'localStorage', 'guardarYRenderizar',
            'descargarJson', 'bloquearSesionCripto', 'authCerrarSesion', 'mostrarPantallaLogin',
            `'use strict'; ${src}; return cerrarPorInactividad;`
        );
        return fabrica(
            mocks.document,
            mocks.db,
            mocks.auth,
            mocks.localStorage,
            mocks.guardarYRenderizar,
            mocks.descargarJson,
            mocks.bloquearSesionCripto,
            mocks.authCerrarSesion,
            mocks.mostrarPantallaLogin
        );
    }

    it('cerrarPorInactividad debe invocar descargarJson y completar el cierre de sesión', async () => {
        const ordenEjecucion = [];
        const mocks = {
            document: {
                getElementById: vi.fn(() => ({ textContent: '' }))
            },
            db: { timestamp: 0 },
            auth: { currentUser: { uid: 'usr_test_123' } },
            localStorage: { setItem: vi.fn() },
            guardarYRenderizar: vi.fn().mockImplementation(async (motivo) => {
                ordenEjecucion.push(`guardar:${motivo}`);
                return { ok: true, destino: 'nube' };
            }),
            descargarJson: vi.fn().mockImplementation(() => {
                ordenEjecucion.push('descargarJson');
            }),
            bloquearSesionCripto: vi.fn().mockImplementation(() => {
                ordenEjecucion.push('bloquearSesionCripto');
            }),
            authCerrarSesion: vi.fn().mockImplementation(async () => {
                ordenEjecucion.push('authCerrarSesion');
            }),
            mostrarPantallaLogin: vi.fn().mockImplementation(() => {
                ordenEjecucion.push('mostrarPantallaLogin');
            })
        };

        const cerrar = crearCerrarPorInactividad(mocks);
        await cerrar();

        expect(mocks.descargarJson).toHaveBeenCalledTimes(1);
        expect(mocks.bloquearSesionCripto).toHaveBeenCalledTimes(1);
        expect(mocks.authCerrarSesion).toHaveBeenCalledTimes(1);
        expect(mocks.mostrarPantallaLogin).toHaveBeenCalledTimes(1);

        // Verificar el orden estricto de seguridad:
        // Primero guardado -> luego descarga JSON de respaldo -> luego bloqueo criptográfico -> auth logout -> login UI
        expect(ordenEjecucion).toEqual([
            'guardar:cierre',
            'descargarJson',
            'bloquearSesionCripto',
            'authCerrarSesion',
            'mostrarPantallaLogin'
        ]);
    });

    it('un fallo en descargarJson no debe interrumpir el bloqueo ni el cierre de sesión', async () => {
        const mocks = {
            document: { getElementById: () => null },
            db: { timestamp: 0 },
            auth: { currentUser: { uid: 'usr_test_456' } },
            localStorage: { setItem: vi.fn() },
            guardarYRenderizar: vi.fn().mockResolvedValue({ ok: true }),
            descargarJson: vi.fn().mockImplementation(() => {
                throw new Error('Fallo simulado al descargar blob');
            }),
            bloquearSesionCripto: vi.fn(),
            authCerrarSesion: vi.fn().mockResolvedValue(),
            mostrarPantallaLogin: vi.fn()
        };

        const cerrar = crearCerrarPorInactividad(mocks);
        await expect(cerrar()).resolves.not.toThrow();

        expect(mocks.bloquearSesionCripto).toHaveBeenCalledTimes(1);
        expect(mocks.authCerrarSesion).toHaveBeenCalledTimes(1);
        expect(mocks.mostrarPantallaLogin).toHaveBeenCalledTimes(1);
    });
});
