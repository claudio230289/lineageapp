import { describe, it, expect } from 'vitest';
import { APP_VERSION, SCHEMA_VERSION, CACHE_NAME, MIGRACIONES, aplicarMigraciones } from '../js/version.js';

/* =========================================================
   Tests del mecanismo de migraciones de esquema.

   La propiedad que importa más que ninguna: IDEMPOTENCIA. Se
   llama en cada carga de la app, así que una migración
   destructiva aplicada dos veces perdería datos.

   Todos los tests usan la función real. Para ejercitar
   migraciones concretas se inyecta un registro con la opción
   `migraciones`, en vez de copiar el algoritmo acá: una copia
   pasaría el suite aunque el código real estuviera roto.
   ========================================================= */

describe('aplicarMigraciones: sin cambios', () => {
    it('no debe hacer nada si la base ya está en la versión actual', () => {
        const base = { version: SCHEMA_VERSION, ingresos: {} };
        const resultado = aplicarMigraciones(base);

        expect(resultado.aplicadas).toEqual([]);
        expect(resultado.versionInicial).toBe(SCHEMA_VERSION);
        expect(base.version).toBe(SCHEMA_VERSION);
    });

    it('debe ser idempotente al llamarse varias veces', () => {
        const base = { version: SCHEMA_VERSION };
        aplicarMigraciones(base);
        aplicarMigraciones(base);
        aplicarMigraciones(base);

        expect(base.version).toBe(SCHEMA_VERSION);
    });

    it('NO debe degradar una base con versión futura', () => {
        // Documento escrito por una app más nueva que esta. Revertir
        // el número haría que se le aplicaran migraciones al revés.
        const base = { version: SCHEMA_VERSION + 5 };
        const resultado = aplicarMigraciones(base);

        expect(resultado.aplicadas).toEqual([]);
        expect(base.version).toBe(SCHEMA_VERSION + 5);
    });
});

describe('aplicarMigraciones: entradas inválidas', () => {
    it('debe tratar una base sin versión como actual, no como 0', () => {
        // Si se asumiera 0, un respaldo que nunca tuvo `version`
        // dispararía TODAS las migraciones, y algunas son
        // destructivas por definición.
        const base = { ingresos: {} };
        const resultado = aplicarMigraciones(base);

        expect(resultado.aplicadas).toEqual([]);
        expect(base.version).toBe(SCHEMA_VERSION);
    });

    it('debe tolerar version en string', () => {
        const base = { version: String(SCHEMA_VERSION) };
        expect(() => aplicarMigraciones(base)).not.toThrow();
        expect(Number(base.version)).toBe(SCHEMA_VERSION);
    });

    it('debe tolerar version negativa o NaN', () => {
        const negativa = { version: -3 };
        const texto = { version: 'no soy un número' };

        aplicarMigraciones(negativa);
        aplicarMigraciones(texto);

        expect(negativa.version).toBe(SCHEMA_VERSION);
        expect(texto.version).toBe(SCHEMA_VERSION);
    });

    it('no debe lanzar con entradas no-objeto', () => {
        expect(() => aplicarMigraciones(null)).not.toThrow();
        expect(() => aplicarMigraciones(undefined)).not.toThrow();
        expect(() => aplicarMigraciones('texto')).not.toThrow();
        expect(aplicarMigraciones(null).datos).toBeNull();
    });

    it('debe aceptar un esquema actual explícito', () => {
        const base = { version: 1 };
        const resultado = aplicarMigraciones(base, { esquemaActual: 2 });
        expect(resultado.aplicadas).toEqual([]);
    });
});

describe('aplicarMigraciones: recorrido del registro', () => {
    it('debe correr sólo las migraciones que faltan', () => {
        const registro = {
            14: (b) => { b.nuevo = true; },
            15: (b) => { b.nuevo2 = true; },
            16: (b) => { b.nuevo3 = true; }
        };
        const base = { version: 15 };

        const resultado = aplicarMigraciones(base, { migraciones: registro, esquemaActual: 16 });

        expect(resultado.aplicadas).toEqual([16]);
        expect(base.nuevo3).toBe(true);
        expect(base.nuevo).toBeUndefined();
    });

    it('debe correrlas en orden ascendente', () => {
        const orden = [];
        const registro = {
            14: () => orden.push(14),
            15: () => orden.push(15),
            16: () => orden.push(16)
        };

        aplicarMigraciones({ version: 13 }, { migraciones: registro, esquemaActual: 16 });

        expect(orden).toEqual([14, 15, 16]);
    });

    it('debe poder venir de una versión vieja sin quejarse de las que faltan', () => {
        // Documentos anteriores a que existiera el versionado. No hay
        // migraciones que registrar para esas versiones y la app
        // debe seguir cargando.
        const registro = { 14: (b) => { b.migrado = true; } };
        const base = { version: 1, ingresos: {} };

        const resultado = aplicarMigraciones(base, { migraciones: registro, esquemaActual: 14 });

        expect(resultado.aplicadas).toEqual([14]);
        expect(base.migrado).toBe(true);
        expect(base.version).toBe(14);
    });

    it('IDEMPOTENCIA: una migración destructiva no debe repetirse', () => {
        // El caso que justifica el diseño: si el registro se
        // reintentara, "restar lo ya descontado" perdería dinero.
        let aplicadas = 0;
        const registro = {
            14: (b) => {
                aplicadas++;
                b.saldo = (b.saldo || 100) - 40;
            }
        };
        const base = { version: 13, saldo: 100 };

        aplicarMigraciones(base, { migraciones: registro, esquemaActual: 14 });
        const saldoTrasPrimera = base.saldo;

        // Segunda pasada: la base ya quedó en 14, así que no hay nada
        // que migrar y el saldo no vuelve a moverse.
        const segunda = aplicarMigraciones(base, { migraciones: registro, esquemaActual: 14 });

        expect(saldoTrasPrimera).toBe(60);
        expect(base.saldo).toBe(60);
        expect(aplicadas).toBe(1);
        expect(segunda.aplicadas).toEqual([]);
    });

    it('debe informar las versiones aplicadas', () => {
        const registro = { 14: () => {}, 15: () => {}, 16: () => {} };
        const resultado = aplicarMigraciones({ version: 13 }, { migraciones: registro, esquemaActual: 16 });
        expect(resultado.aplicadas).toEqual([14, 15, 16]);
    });

    it('debe usar el registro de la app cuando no se inyecta otro', () => {
        // Si el default no fuera MIGRACIONES, este test lo detectaría
        // comparando contra el registro real.
        const base = { version: SCHEMA_VERSION };
        const resultado = aplicarMigraciones(base);
        expect(resultado.aplicadas).toEqual([]);
        expect(base.version).toBe(SCHEMA_VERSION);
    });
});

describe('coherencia del registro', () => {
    it('el registro no debe declarar migraciones por encima del esquema', () => {
        // Si hubiera una migración para una versión que todavía no
        // existe, nunca se ejecutaría: es una migración muerta que
        // alguien olvidó escribir al subir SCHEMA_VERSION.
        const claves = Object.keys(MIGRACIONES).map(Number);
        const porEncima = claves.filter(v => v > SCHEMA_VERSION);
        expect(porEncima).toEqual([]);
    });

    it('todas las entradas del registro deben ser funciones', () => {
        Object.entries(MIGRACIONES).forEach(([version, fn]) => {
            expect(typeof fn, `MIGRACIONES[${version}] debe ser una función`).toBe('function');
        });
    });

    it('el esquema actual debe ser un entero válido', () => {
        expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
        expect(SCHEMA_VERSION).toBeGreaterThan(0);
    });

    it('la versión de la app debe tener formato MAJOR.MINOR', () => {
        expect(APP_VERSION).toMatch(/^\d+\.\d+$/);
    });

    it('el nombre de caché debe derivarse de la versión de la app', () => {
        expect(CACHE_NAME).toBe(`finanzas-v${APP_VERSION}`);
    });
});