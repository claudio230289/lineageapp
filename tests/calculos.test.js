import { describe, it, expect } from 'vitest';
import {
    aNumero,
    normalizarTexto,
    normalizarCategoria,
    esPagado,
    calcularNetoDesde,
    calcularGastosDesde,
    calcularPasivoDesde
} from '../js/calculos/nucleo.js';
import { formatARS } from '../js/utils/formato.js';

/* =========================================================
   Tests del núcleo de cálculos.
   Se prueba el módulo PURO (js/calculos/nucleo.js), no el
   adaptador calculos.js, porque el adaptador importa db.js y
   db.js importa Firebase desde URLs https:// que Node no
   puede resolver. Esta separación es la que permite testear
   la lógica financiera sin navegador ni red.
   ========================================================= */

describe('aNumero', () => {
    it('debe conservar números finitos', () => {
        expect(aNumero(1500.5)).toBe(1500.5);
        expect(aNumero(0)).toBe(0);
        expect(aNumero(-200)).toBe(-200);
    });

    it('debe convertir strings numéricos', () => {
        expect(aNumero('1500.5')).toBe(1500.5);
        expect(aNumero(' 42 ')).toBe(42);
    });

    it('debe entender el formato argentino de miles y decimales', () => {
        expect(aNumero('1.500,50')).toBe(1500.5);
        expect(aNumero('1.000.000,00')).toBe(1000000);
    });

    it('nunca debe devolver NaN', () => {
        // Si un importe contaminado llegara como NaN, se propagaría
        // a todos los totales y se renderizaría como "$ NaN".
        expect(aNumero(NaN)).toBe(0);
        expect(aNumero(undefined)).toBe(0);
        expect(aNumero(null)).toBe(0);
        expect(aNumero('')).toBe(0);
        expect(aNumero('   ')).toBe(0);
        expect(aNumero('abc')).toBe(0);
        expect(aNumero(Infinity)).toBe(0);
        expect(aNumero({})).toBe(0);
        expect(aNumero([])).toBe(0);
    });
});

describe('normalizarTexto y normalizarCategoria', () => {
    it('debe quitar tildes y pasar a minúsculas', () => {
        expect(normalizarTexto('Únicos')).toBe('unicos');
        expect(normalizarTexto('  Alquiler  ')).toBe('alquiler');
        expect(normalizarCategoria('ÚNICOS')).toBe('unicos');
        expect(normalizarCategoria('Fijos')).toBe('fijos');
        expect(normalizarCategoria('Cuotas')).toBe('cuotas');
    });

    it('debe tolerar valores que no son strings', () => {
        expect(normalizarTexto(null)).toBe('');
        expect(normalizarTexto(undefined)).toBe('');
        expect(normalizarCategoria(123)).toBe('');
    });
});

describe('esPagado', () => {
    it('debe aceptar los formatos legítimos de pagado', () => {
        expect(esPagado({ pagado: true })).toBe(true);
        expect(esPagado({ pagado: 1 })).toBe(true);
        expect(esPagado({ pagado: '1' })).toBe(true);
        expect(esPagado({ pagado: 'true' })).toBe(true);
        expect(esPagado({ pagado: 'TRUE' })).toBe(true);
        expect(esPagado({ pagado: 'si' })).toBe(true);
    });

    it('debe tratar cualquier otro valor como pendiente', () => {
        expect(esPagado({ pagado: false })).toBe(false);
        expect(esPagado({})).toBe(false);
        expect(esPagado({ pagado: undefined })).toBe(false);
        expect(esPagado({ pagado: null })).toBe(false);
        expect(esPagado({ pagado: 'no' })).toBe(false);
        expect(esPagado({ pagado: '' })).toBe(false);
        expect(esPagado(null)).toBe(false);
        expect(esPagado(undefined)).toBe(false);
    });
});

describe('calcularNetoDesde', () => {
    it('debe calcular el neto con básico y deducción', () => {
        const resultado = calcularNetoDesde([
            { tipo: 'Basico', valor: 1000000, modo: 'importe' },
            { tipo: 'Deduccion', valor: 50000, modo: 'importe' }
        ]);

        expect(resultado.rem).toBe(1000000);
        expect(resultado.norem).toBe(0);
        expect(resultado.ded).toBe(50000);
        expect(resultado.neto).toBe(950000);
    });

    it('debe calcular remunerativos en porcentaje sobre el básico', () => {
        const resultado = calcularNetoDesde([
            { tipo: 'Basico', valor: 1000000, modo: 'importe' },
            { tipo: 'Remunerativo', valor: 10, modo: 'porcentaje' }
        ]);

        expect(resultado.rem).toBe(1100000);
        expect(resultado.neto).toBe(1100000);
    });

    it('debe separar remunerativo, no remunerativo y deducción', () => {
        const resultado = calcularNetoDesde([
            { tipo: 'Basico', valor: 1000000, modo: 'importe' },
            { tipo: 'Remunerativo', valor: 100000, modo: 'importe' },
            { tipo: 'NoRemunerativo', valor: 50000, modo: 'importe' },
            { tipo: 'Deduccion', valor: 30000, modo: 'importe' }
        ]);

        expect(resultado.rem).toBe(1100000);
        expect(resultado.norem).toBe(50000);
        expect(resultado.ded).toBe(30000);
        expect(resultado.neto).toBe(1120000);
    });

    it('debe retornar ceros si no hay ingresos', () => {
        expect(calcularNetoDesde([])).toEqual({ rem: 0, norem: 0, ded: 0, neto: 0 });
        expect(calcularNetoDesde(null)).toEqual({ rem: 0, norem: 0, ded: 0, neto: 0 });
    });

    it('no debe propagar NaN si un importe viene corrupto', () => {
        const resultado = calcularNetoDesde([
            { tipo: 'Basico', valor: 'importe corrupto', modo: 'importe' },
            { tipo: 'Deduccion', valor: undefined, modo: 'importe' }
        ]);

        expect(resultado.neto).toBe(0);
        expect(Number.isNaN(resultado.neto)).toBe(false);
    });

    it('debe tolerar ingresos con valor numérico en string', () => {
        const resultado = calcularNetoDesde([
            { tipo: 'Basico', valor: '1000000', modo: 'importe' }
        ]);

        expect(resultado.neto).toBe(1000000);
    });
});

describe('calcularGastosDesde', () => {
    it('debe desglosar por categoría y separar pagado de pendiente', () => {
        const resultado = calcularGastosDesde([
            { categoria: 'Fijos', monto: 50000, pagado: true },
            { categoria: 'Unicos', monto: 30000, pagado: false },
            { categoria: 'Cuotas', monto: 20000, pagado: false }
        ]);

        expect(resultado.fijos).toBe(50000);
        expect(resultado.unicos).toBe(30000);
        expect(resultado.cuotas).toBe(20000);
        expect(resultado.total).toBe(100000);
        expect(resultado.pagado).toBe(50000);
        expect(resultado.pendientes).toBe(50000);
    });

    it('debe incluir en el total los gastos sin categoría reconocida', () => {
        // Regresión: el total se armaba como fijos+unicos+cuotas y
        // dejaba afuera los gastos sin categoría, mostrando menos
        // que el detalle y que la suma del filtro.
        const resultado = calcularGastosDesde([
            { monto: 10000, pagado: true },
            { monto: 5000, pagado: false, categoria: 'Categoría inventada' }
        ]);

        expect(resultado.total).toBe(15000);
        expect(resultado.pagado).toBe(10000);
        expect(resultado.pendientes).toBe(5000);
    });

    it('debe reconocer la categoría con o sin tilde', () => {
        const resultado = calcularGastosDesde([
            { categoria: 'Únicos', monto: 30000, pagado: false }
        ]);

        expect(resultado.unicos).toBe(30000);
    });

    it('debe usar esPagado para todos los tipos de gasto', () => {
        // Este es el núcleo del bug reportado: el gasto único tildado
        // en la UI tiene queplyr en el total pagado, no en pendientes.
        const resultado = calcularGastosDesde([
            { categoria: 'Unicos', monto: 30000, pagado: true },
            { categoria: 'Fijos', monto: 50000, pagado: 1 },
            { categoria: 'Cuotas', monto: 20000, pagado: 'true' },
            { categoria: 'Cuotas', monto: 10000, pagado: false }
        ]);

        expect(resultado.pagado).toBe(100000);
        expect(resultado.pendientes).toBe(10000);
        expect(resultado.pagado + resultado.pendientes).toBe(resultado.total);
    });

    it('debe retornar ceros si no hay gastos', () => {
        const vacio = { fijos: 0, unicos: 0, cuotas: 0, total: 0, pagado: 0, pendientes: 0 };
        expect(calcularGastosDesde([])).toEqual(vacio);
        expect(calcularGastosDesde(null)).toEqual(vacio);
        expect(calcularGastosDesde(undefined)).toEqual(vacio);
    });

    it('no debe propagar NaN con montos corruptos', () => {
        const resultado = calcularGastosDesde([
            { categoria: 'Fijos', monto: '50.000,00', pagado: true },
            { categoria: 'Unicos', monto: 'no es un número', pagado: false }
        ]);

        expect(resultado.total).toBe(50000);
        expect(resultado.pagado).toBe(50000);
        expect(resultado.pendientes).toBe(0);
    });
});

describe('calcularPasivoDesde', () => {
    const gastosPorMes = {
        '2026-01': [
            { categoria: 'Cuotas', concepto: 'Notebook (Cuota 1/6)', monto: 50000, pagado: true },
            { categoria: 'Cuotas', concepto: 'Notebook (Cuota 2/6)', monto: 50000, pagado: false }
        ],
        '2026-02': [
            { categoria: 'Cuotas', concepto: 'Notebook (Cuota 3/6)', monto: 50000, pagado: false },
            { categoria: 'Fijos', concepto: 'Alquiler', monto: 400000, pagado: false }
        ]
    };

    it('debe sumar sólo las cuotas impagas que matcheen la clave', () => {
        const resultado = calcularPasivoDesde(gastosPorMes, 'notebook');
        expect(resultado.cuotasRestantes).toBe(2);
        expect(resultado.totalDeuda).toBe(100000);
    });

    it('no debe devolver NaN si el monto es texto', () => {
        const resultado = calcularPasivoDesde(
            { '2026-01': [{ categoria: 'Cuotas', concepto: 'Auto', monto: '1.500,50', pagado: false }] },
            'auto'
        );
        expect(resultado.totalDeuda).toBe(1500.5);
    });

    it('debe devolver ceros si no hay coincidencia', () => {
        expect(calcularPasivoDesde(gastosPorMes, 'moto')).toEqual({ totalDeuda: 0, cuotasRestantes: 0 });
        expect(calcularPasivoDesde(null, 'x')).toEqual({ totalDeuda: 0, cuotasRestantes: 0 });
    });
});

describe('formatARS', () => {
    it('debe formatear importes como pesos argentinos', () => {
        expect(formatARS(1000000)).toBe('$ 1.000.000,00');
        expect(formatARS(1500.5)).toBe('$ 1.500,50');
        expect(formatARS(0)).toBe('$ 0,00');
    });

    it('debe manejar valores nulos o corruptos sin romperse', () => {
        expect(formatARS(null)).toBe('$ 0,00');
        expect(formatARS(undefined)).toBe('$ 0,00');
        expect(formatARS('abc')).toBe('$ 0,00');
        expect(formatARS(NaN)).toBe('$ 0,00');
    });

    it('debe aceptar importes ya formateados como texto', () => {
        expect(formatARS('1.500,50')).toBe('$ 1.500,50');
    });
});