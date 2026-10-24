import { describe, it, expect } from 'vitest';
import {
    APP_VERSION,
    SCHEMA_VERSION,
    CACHE_NAME,
    MIGRACIONES,
    aplicarMigraciones,
    slug,
    parsearCuota,
    formatearCuota
} from '../js/version.js';

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
    it('debe tratar una base sin versión como previa al esquema y correr migraciones', () => {
        // H3: documentos sin `version` deben correr TODAS las migraciones
        // antes de estampar SCHEMA_VERSION (backfill para respaldos antiguos).
        const base = { ingresos: {} };
        const resultado = aplicarMigraciones(base);

        expect(resultado.aplicadas).toContain(14);
        expect(base.version).toBe(SCHEMA_VERSION);
    });

    it('debe tolerar version en string', () => {
        const base = { version: String(SCHEMA_VERSION) };
        expect(() => aplicarMigraciones(base)).not.toThrow();
        expect(Number(base.version)).toBe(SCHEMA_VERSION);
    });

    it('debe tolerar version negativa o NaN como sin versión', () => {
        const negativa = { version: -3 };
        const texto = { version: 'no soy un número' };

        aplicarMigraciones(negativa);
        aplicarMigraciones(texto);

        expect(negativa.version).toBe(SCHEMA_VERSION);
        expect(texto.version).toBe(SCHEMA_VERSION);
        // Corren migraciones porque se tratan como sin versión declarada válida.
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

    it('la versión de la app debe tener formato de versión válido', () => {
        expect(APP_VERSION).toMatch(/^\d+\.\d+(\.\d+)?$/);
    });

    it('el nombre de caché debe derivarse de la versión de la app', () => {
        expect(CACHE_NAME).toBe(`finanzas-v${APP_VERSION}`);
    });
});

/* =========================================================
   Helpers de cuota y slug (js/version.js)

   Viven en version.js y no en nucleo.js porque la migración 14
   los necesita y version.js no puede importar nada. Se prueban
   acá, junto a la migración que los usa, porque comparten la
   misma razón de existir.
   ========================================================= */
describe('slug', () => {
    it('debe pasar a minúsculas y colapsar separadores a guiones', () => {
        expect(slug('Notebook')).toBe('notebook');
        expect(slug('Compra de Zapatillas')).toBe('compra-de-zapatillas');
    });

    it('debe quitar tildes', () => {
        expect(slug('Año Nuevo')).toBe('ano-nuevo');
        expect(slug('Café con Leche')).toBe('cafe-con-leche');
    });

    it('no debe dejar guiones al principio ni al final', () => {
        expect(slug('  Cafetera  ')).toBe('cafetera');
        expect(slug('...TV...')).toBe('tv');
        expect(slug('a   b')).toBe('a-b');
    });

    it('debe devolver "" para entradas vacías o no-string', () => {
        expect(slug('')).toBe('');
        expect(slug('   ')).toBe('');
        expect(slug(123)).toBe('');
        expect(slug(null)).toBe('');
        expect(slug(undefined)).toBe('');
    });
});

describe('parsearCuota y formatearCuota', () => {
    it('debe extraer base, número y total', () => {
        expect(parsearCuota('Notebook (Cuota 3/12)')).toEqual({
            base: 'Notebook',
            nro: 3,
            total: 12
        });
    });

    it('debe tolerar espacios de más alrededor de la barra', () => {
        expect(parsearCuota('Notebook (Cuota 3 / 12)')).toEqual({
            base: 'Notebook',
            nro: 3,
            total: 12
        });
        expect(parsearCuota('Notebook (Cuota  3/12)').base).toBe('Notebook');
    });

    it('debe devolver null si el concepto no TERMINA con el patrón', () => {
        // Un concepto que contiene "(Cuota 3/12)" en el medio pero
        // sigue con texto no es una cuota: agrupar mal uniría planes.
        expect(parsearCuota('Notebook (Cuota 3/12) extendida')).toBeNull();
        expect(parsearCuota('Notebook')).toBeNull();
        expect(parsearCuota('(Cuota 3/12)')).toBeNull(); // base vacía
    });

    it('debe devolver null para entradas no-string', () => {
        expect(parsearCuota(undefined)).toBeNull();
        expect(parsearCuota(null)).toBeNull();
        expect(parsearCuota(123)).toBeNull();
    });

    it('formatearCuota debe ser la inversa de parsearCuota', () => {
        const original = 'Notebook (Cuota 3/12)';
        const partes = parsearCuota(original);

        expect(formatearCuota(partes.base, partes.nro, partes.total)).toBe(original);
    });
});

/* =========================================================
   Migración 14 real (MIGRACIONES[14])

   No se inyecta un registro: se llama la función real del
   registro de la app, porque es la que va a correr en
   producción sobre los datos ya guardados.
   ========================================================= */
describe('MIGRACIONES[14]: ingresos por trabajo y plan de cuotas', () => {
    it('debe agregar trabajo:"" a los ingresos que no lo tienen', () => {
        const base = {
            ingresos: {
                '2026-10': [
                    { concepto: 'Sueldo', tipo: 'Basico' },
                    { concepto: 'Aguinaldo', tipo: 'NoRemunerativo', trabajo: 'Hotel' }
                ]
            }
        };

        MIGRACIONES[14](base);

        expect(base.ingresos['2026-10'][0].trabajo).toBe('');
        // El que ya tenía trabajo no se toca.
        expect(base.ingresos['2026-10'][1].trabajo).toBe('Hotel');
    });

    it('debe agregar grupoId/cuotaNro/cuotaTotal a las cuotas parseables', () => {
        const base = {
            gastos: {
                '2026-10': [
                    { categoria: 'Cuotas', concepto: 'Notebook (Cuota 1/6)', monto: 50000 }
                ]
            }
        };

        MIGRACIONES[14](base);

        const cuota = base.gastos['2026-10'][0];
        expect(cuota.grupoId).toBe('plan-notebook-2026-10-6');
        expect(cuota.cuotaNro).toBe(1);
        expect(cuota.cuotaTotal).toBe(6);
    });

    it('el grupoId debe ser el MISMO para todas las cuotas del plan', () => {
        const base = {
            gastos: {
                '2026-10': [{ categoria: 'Cuotas', concepto: 'Notebook (Cuota 1/6)' }],
                '2026-11': [{ categoria: 'Cuotas', concepto: 'Notebook (Cuota 2/6)' }],
                '2026-12': [{ categoria: 'Cuotas', concepto: 'Notebook (Cuota 3/6)' }]
            }
        };

        MIGRACIONES[14](base);

        const grupoIds = [
            base.gastos['2026-10'][0].grupoId,
            base.gastos['2026-11'][0].grupoId,
            base.gastos['2026-12'][0].grupoId
        ];
        expect(new Set(grupoIds).size).toBe(1);
        // El discriminante es el mes de la PRIMERA cuota (2026-10),
        // calculado retrocediendo (nro - 1) meses desde cada cuota.
        expect(grupoIds[0]).toBe('plan-notebook-2026-10-6');
    });

    it('dos compras HOMÓNIMAS de meses distintos no deben compartir grupo', () => {
        // Mismo nombre ("Notebook") pero compras distintas arrancadas
        // en meses distintos: si compartieran grupoId, editar el plan
        // de una cambiaría la otra.
        const base = {
            gastos: {
                '2026-01': [{ categoria: 'Cuotas', concepto: 'Notebook (Cuota 1/6)' }],
                '2026-07': [{ categoria: 'Cuotas', concepto: 'Notebook (Cuota 1/6)' }]
            }
        };

        MIGRACIONES[14](base);

        const primera = base.gastos['2026-01'][0].grupoId;
        const segunda = base.gastos['2026-07'][0].grupoId;

        expect(primera).toBe('plan-notebook-2026-01-6');
        expect(segunda).toBe('plan-notebook-2026-07-6');
        expect(primera).not.toBe(segunda);
    });

    it('las cuotas de una misma compra homónima a la vez conservan un único grupo', () => {
        // Dos series homónimas entrelazadas en el tiempo: cada serie
        // debe agruparse consigo misma y no con la otra.
        const base = {
            gastos: {
                '2026-01': [{ categoria: 'Cuotas', concepto: 'Notebook (Cuota 1/3)' }],
                '2026-02': [{ categoria: 'Cuotas', concepto: 'Notebook (Cuota 2/3)' }],
                '2026-06': [{ categoria: 'Cuotas', concepto: 'Notebook (Cuota 1/3)' }],
                '2026-07': [{ categoria: 'Cuotas', concepto: 'Notebook (Cuota 2/3)' }]
            }
        };

        MIGRACIONES[14](base);

        expect(base.gastos['2026-01'][0].grupoId).toBe('plan-notebook-2026-01-3');
        expect(base.gastos['2026-02'][0].grupoId).toBe('plan-notebook-2026-01-3');
        expect(base.gastos['2026-06'][0].grupoId).toBe('plan-notebook-2026-06-3');
        expect(base.gastos['2026-07'][0].grupoId).toBe('plan-notebook-2026-06-3');
    });

    it('NO debe tocar gastos que no son de categoría cuotas', () => {
        // Un fijo cuyo nombre termina en "(Cuota 1/6)" por casualidad
        // no debe quedar dentro de un plan.
        const base = {
            gastos: {
                '2026-10': [
                    { categoria: 'Fijos', concepto: 'Alquiler (Cuota 1/6)' }
                ]
            }
        };

        MIGRACIONES[14](base);

        const gasto = base.gastos['2026-10'][0];
        expect(gasto.grupoId).toBeUndefined();
        expect(gasto.cuotaNro).toBeUndefined();
        expect(gasto.cuotaTotal).toBeUndefined();
    });

    it('NO debe tocar una cuota ya migrada (respeta valores propios)', () => {
        const base = {
            gastos: {
                '2026-10': [{
                    categoria: 'Cuotas',
                    concepto: 'Notebook (Cuota 1/6)',
                    grupoId: 'grupo-manual',
                    cuotaNro: 9,
                    cuotaTotal: 9
                }]
            }
        };

        MIGRACIONES[14](base);

        const cuota = base.gastos['2026-10'][0];
        expect(cuota.grupoId).toBe('grupo-manual');
        expect(cuota.cuotaNro).toBe(9);
        expect(cuota.cuotaTotal).toBe(9);
    });

    it('debe completar sólo los campos que faltan de una cuota a medias', () => {
        const base = {
            gastos: {
                '2026-10': [{
                    categoria: 'Cuotas',
                    concepto: 'Notebook (Cuota 4/6)',
                    grupoId: 'grupo-propio'
                }]
            }
        };

        MIGRACIONES[14](base);

        const cuota = base.gastos['2026-10'][0];
        expect(cuota.grupoId).toBe('grupo-propio'); // respetado
        expect(cuota.cuotaNro).toBe(4);            // completado
        expect(cuota.cuotaTotal).toBe(6);          // completado
    });

    it('si el número de cuota no es utilizable, usa el mes del gasto como discriminante', () => {
        // cuotaNro corrupto y grupoId ausente: no se puede deducir el
        // mes de la primera cuota, así que el grupo se ancla al mes
        // del propio gasto en vez de producir "plan-x-NaN".
        const base = {
            gastos: {
                '2026-10': [{
                    categoria: 'Cuotas',
                    concepto: 'Notebook (Cuota 2/6)',
                    cuotaNro: 'no-es-numero'
                }]
            }
        };

        MIGRACIONES[14](base);

        const cuota = base.gastos['2026-10'][0];
        expect(cuota.grupoId).toBe('plan-notebook-2026-10-6');
    });

    it('debe ser IDEMPOTENTE: correrla dos veces no cambia nada', () => {
        // Es la propiedad que más importa: corre en cada carga hasta
        // que el documento quede estampado en 14.
        const base = {
            ingresos: {
                '2026-10': [{ concepto: 'Sueldo', tipo: 'Basico' }]
            },
            gastos: {
                '2026-10': [
                    { categoria: 'Cuotas', concepto: 'Notebook (Cuota 1/6)' },
                    { categoria: 'Fijos', concepto: 'Alquiler' }
                ]
            }
        };

        MIGRACIONES[14](base);
        const trasPrimera = JSON.parse(JSON.stringify(base));

        MIGRACIONES[14](base);

        expect(base).toEqual(trasPrimera);
    });

    it('debe tolerar datos corruptos sin abortar el resto', () => {
        const base = {
            ingresos: {
                '2026-10': 'no soy un array',
                '2026-11': [null, 'texto suelto', { trabajo: 'Hotel' }, {}]
            },
            gastos: {
                '2026-10': 'tampoco',
                '2026-11': [
                    null,
                    'texto suelto',
                    { categoria: 'Cuotas' },                                  // sin concepto
                    { categoria: 'Cuotas', concepto: 'sin formato' },          // no parseable
                    { categoria: 'Cuotas', concepto: 'Auto (Cuota 2/12)' }     // válida
                ]
            }
        };

        expect(() => MIGRACIONES[14](base)).not.toThrow();

        // La entrada válida SÍ se migró pese a las corruptas de al lado.
        const auto = base.gastos['2026-11'][4];
        expect(auto.grupoId).toBe('plan-auto-2026-10-12');
        expect(auto.cuotaNro).toBe(2);
        expect(auto.cuotaTotal).toBe(12);

        // El ingreso que ya tenía trabajo no se tocó; el vacío sí.
        expect(base.ingresos['2026-11'][2].trabajo).toBe('Hotel');
        expect(base.ingresos['2026-11'][3].trabajo).toBe('');
    });

    it('no debe fallar si faltan por completo ingresos y gastos', () => {
        expect(() => MIGRACIONES[14]({})).not.toThrow();
        expect(() => MIGRACIONES[14]({ ingresos: null, gastos: undefined })).not.toThrow();
    });
});