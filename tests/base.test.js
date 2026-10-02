import { describe, it, expect } from 'vitest';
import { crearBaseVacia, normalizarBase, prepararBase } from '../js/nucleo/base.js';
import { SCHEMA_VERSION } from '../js/version.js';

/* =========================================================
   Tests del núcleo de la base.

   El escenario que justifica este módulo: un documento de
   Firestore que viene incompleto. Antes, la carga remota hacía
   `Object.assign(db, snap.data())` sin pasar por acá, así que
   `db.deseos` podía quedar undefined y romper el render entero,
   mientras el mismo respaldo importado desde un archivo
   funcionaba bien. Estos tests fijan esa protección.
   ========================================================= */

const MES = '2026-03';

/** Base por defecto fija, para no depender del estado vivo de db.js. */
const porDefecto = () => ({
    version: SCHEMA_VERSION,
    dolar: 1250,
    mesActivo: MES,
    ingresos: {},
    gastos: {},
    deseos: [],
    pasivos: []
});

describe('crearBaseVacia', () => {
    it('debe traer todas las claves que el render espera', () => {
        const base = crearBaseVacia(MES);
        expect(Object.keys(base).sort()).toEqual(
            ['deseos', 'dolar', 'gastos', 'ingresos', 'mesActivo', 'pasivos', 'version']
        );
    });

    it('debe calcular el mes en curso si no se le pasa uno', () => {
        const ahora = new Date();
        const esperado = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
        expect(crearBaseVacia().mesActivo).toBe(esperado);
    });

    it('el mes debe tener dos dígitos, o "2026-3" no matchea ningún select', () => {
        expect(crearBaseVacia().mesActivo).toMatch(/^\d{4}-\d{2}$/);
    });

    it('debe arrancar con colecciones vacías, no con null', () => {
        const base = crearBaseVacia();
        expect(base.ingresos).toEqual({});
        expect(base.gastos).toEqual({});
        expect(base.deseos).toEqual([]);
        expect(base.pasivos).toEqual([]);
    });
});

describe('normalizarBase: completados de forma', () => {
    it('debe completar las claves que falten en un documento incompleto', () => {
        // El caso real: documento remoto sin deseos ni pasivos.
        const base = normalizarBase({ ingresos: { '2026-03': {} }, mesActivo: MES }, porDefecto());

        expect(base.deseos).toEqual([]);
        expect(base.pasivos).toEqual([]);
        expect(base.gastos).toEqual({});
        expect(base.ingresos).toEqual({ '2026-03': {} });
    });

    it('debe rechazar una lista donde se espera un mapa de meses', () => {
        // Un array es truthy: el chequeo viejo `typeof === 'object'`
        // lo aceptaba y `ingresos['2026-03']` daba undefined.
        const base = normalizarBase({ ingresos: ['a', 'b'], gastos: [] }, porDefecto());

        expect(base.ingresos).toEqual({});
        expect(base.gastos).toEqual({});
    });

    it('debe normalizar la cotización del dólar a número', () => {
        expect(normalizarBase({ dolar: '1250' }, porDefecto()).dolar).toBe(1250);
        expect(normalizarBase({ dolar: ' 980,50 ' }, porDefecto()).dolar).toBe(1250); // Number() no parsea coma
    });

    it('debe respetar un dólar válido en cero si viene así', () => {
        // Cero dólar no es un valor real, pero es una decisión del
        // dato, no del normalizador: lo decide la app, no acá.
        const base = normalizarBase({ dolar: 0 }, porDefecto());
        expect(base.dolar).toBe(1250); // cae al default, por `||`
    });

    it('debe tolerar entradas que no son objetos', () => {
        [null, undefined, 'texto', 42, [], true].forEach((entrada) => {
            const base = normalizarBase(entrada, porDefecto());
            expect(Array.isArray(base.deseos)).toBe(true);
            expect(typeof base.ingresos).toBe('object');
        });
    });

    it('no debe mutar ni la entrada ni la base por defecto', () => {
        const entrada = { deseos: ['x'], gastos: { m: {} } };
        const defecto = porDefecto();
        const copiaDefecto = JSON.parse(JSON.stringify(defecto));

        normalizarBase(entrada, defecto);

        expect(entrada).toEqual({ deseos: ['x'], gastos: { m: {} } });
        expect(defecto).toEqual(copiaDefecto);
    });

    it('debe devolver un objeto nuevo, no el mismo que la entrada', () => {
        const entrada = { mesActivo: MES };
        expect(normalizarBase(entrada, porDefecto())).not.toBe(entrada);
    });
});

describe('normalizarBase: versión', () => {
    it('NO debe estampar la versión actual sobre un documento declarado viejo', () => {
        // El bug que motivó el módulo: una base en versión 12
        // quedaba marcada como 13 sin pasar por migraciones, y
        // para siempre.
        const base = normalizarBase({ version: 12 }, porDefecto());
        expect(base.version).toBe(12);
    });

    it('debe asumir la versión actual si el documento no declara ninguna', () => {
        expect(normalizarBase({}, porDefecto()).version).toBe(SCHEMA_VERSION);
    });

    it('debe tolerar version en string y con decimales', () => {
        expect(normalizarBase({ version: '12' }, porDefecto()).version).toBe(12);
        expect(normalizarBase({ version: 12.9 }, porDefecto()).version).toBe(12);
    });

    it('debe rechazar una versión negativa o ilegible', () => {
        expect(normalizarBase({ version: -3 }, porDefecto()).version).toBe(SCHEMA_VERSION);
        expect(normalizarBase({ version: 'abc' }, porDefecto()).version).toBe(SCHEMA_VERSION);
    });
});

describe('prepararBase: normaliza y migra', () => {
    it('debe aplicar las migraciones que falten sobre datos viejos', () => {
        const { base, migracionesAplicadas } = prepararBase(
            { version: 12, deseos: 'no era un array' },
            porDefecto(),
            { migraciones: { 13: (b) => { b.migrado = true; } } }
        );

        expect(migracionesAplicadas).toEqual([13]);
        expect(base.migrado).toBe(true);
        expect(base.deseos).toEqual([]);   // además normalizado
        expect(base.version).toBe(13);
    });

    it('no debe migrar si el documento ya está al día', () => {
        const { migracionesAplicadas } = prepararBase(
            { version: SCHEMA_VERSION },
            porDefecto(),
            { migraciones: { 14: () => { throw new Error('no debía correr'); } } }
        );

        expect(migracionesAplicadas).toEqual([]);
    });

    it('debe devolver el mismo contrato en todos los casos', () => {
        const resultado = prepararBase({}, porDefecto());
        expect(resultado).toHaveProperty('base');
        expect(resultado).toHaveProperty('migracionesAplicadas');
        expect(Array.isArray(resultado.migracionesAplicadas)).toBe(true);
    });
});