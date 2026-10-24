import { describe, it, expect } from 'vitest';
import {
    aNumero,
    normalizarTexto,
    normalizarCategoria,
    esPagado,
    calcularNetoDesde,
    calcularGastosDesde,
    calcularPasivoDesde,
    mesDesplazado,
    valorCalculadoIngreso,
    mapaValoresIngreso
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
        expect(aNumero('150,75')).toBe(150.75);
        expect(aNumero('50,5')).toBe(50.5);
        expect(aNumero('0,50')).toBe(0.5);
        expect(aNumero('1.500,')).toBe(1500);
        expect(aNumero('1.500')).toBe(1500);
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

    it('debe sumar el básico de CADA trabajo cuando hay más de uno', () => {
        // Con dos trabajos, el neto es la suma de los dos básicos. Si
        // se tomara "el básico" global, uno de los dos se perdería.
        const resultado = calcularNetoDesde([
            { trabajo: 'Hotel', tipo: 'Basico', valor: 1000000, modo: 'importe' },
            { trabajo: 'Kiosco', tipo: 'Basico', valor: 300000, modo: 'importe' }
        ]);

        expect(resultado.rem).toBe(1300000);
        expect(resultado.neto).toBe(1300000);
    });

    it('debe calcular el porcentaje sobre el básico de SU trabajo', () => {
        // El bug que esto previene: un 50% del Kiosco calculado sobre
        // el sueldo del Hotel pagaría cinco veces de más.
        const resultado = calcularNetoDesde([
            { trabajo: 'Hotel', tipo: 'Basico', valor: 1000000, modo: 'importe' },
            { trabajo: 'Kiosco', tipo: 'Basico', valor: 300000, modo: 'importe' },
            { trabajo: 'Hotel', tipo: 'Remunerativo', valor: 10, modo: 'porcentaje' },
            { trabajo: 'Kiosco', tipo: 'Remunerativo', valor: 50, modo: 'porcentaje' }
        ]);

        // 1000000 + 300000 + (10% de 1000000) + (50% de 300000)
        expect(resultado.rem).toBe(1550000);
        expect(resultado.neto).toBe(1550000);
    });

    it('debe valer 0 si el trabajo del porcentaje no tiene básico (nunca NaN)', () => {
        const resultado = calcularNetoDesde([
            { trabajo: 'Hotel', tipo: 'Basico', valor: 1000000, modo: 'importe' },
            { trabajo: 'Kiosco', tipo: 'Remunerativo', valor: 10, modo: 'porcentaje' }
        ]);

        // El Kiosco no tiene básico cargado: su 10% vale 0 y NO se toma
        // el básico del Hotel por error.
        expect(resultado.rem).toBe(1000000);
        expect(Number.isNaN(resultado.neto)).toBe(false);
    });

    it('si un trabajo tiene más de un Básico, todos suman a rem y el % usa el último', () => {
        // No debería pasar (guardarIngreso borra el básico previo del
        // mismo trabajo), pero el cálculo tiene que ser determinista:
        // la semántica histórica suma los dos básicos (así no se pierde
        // plata ya cargada) y el porcentaje se calcula sobre el último.
        const resultado = calcularNetoDesde([
            { trabajo: 'Hotel', tipo: 'Basico', valor: 1000000, modo: 'importe' },
            { trabajo: 'Hotel', tipo: 'Basico', valor: 1200000, modo: 'importe' },
            { trabajo: 'Hotel', tipo: 'Remunerativo', valor: 10, modo: 'porcentaje' }
        ]);

        // 1000000 + 1200000 + (10% del último básico = 120000)
        expect(resultado.rem).toBe(2320000);
    });

    it('debe sumar Bolsillo al neto junto al básico', () => {
        const resultado = calcularNetoDesde([
            { tipo: 'Basico', valor: 1000000, modo: 'importe' },
            { tipo: 'Bolsillo', valor: 50000, modo: 'importe' }
        ]);

        // Bolsillo es plata que entra al bolsillo: va en rem, no en un
        // cuarto cubo que el recibo no muestra.
        expect(resultado.rem).toBe(1050000);
        expect(resultado.norem).toBe(0);
        expect(resultado.neto).toBe(1050000);
    });
});

describe('valorCalculadoIngreso', () => {
    it('calcula el valor según el modo (importe/porcentaje) con básico por trabajo', () => {
        const mapa = new Map([['', 1000000]]);
        expect(valorCalculadoIngreso({ trabajo: '', modo: 'porcentaje', valor: 10 }, mapa)).toBe(100000);
        expect(valorCalculadoIngreso({ trabajo: '', modo: 'importe', valor: 50000 }, mapa)).toBe(50000);
    });

    it('si no hay básico para el trabajo, porcentaje es 0 (sin NaN)', () => {
        const mapa = new Map([['', 1000000]]);
        const v = valorCalculadoIngreso({ trabajo: 'Kiosco', modo: 'porcentaje', valor: 10 }, mapa);
        expect(v).toBe(0);
        expect(Number.isNaN(v)).toBe(false);
    });
});

describe('mapaValoresIngreso', () => {
    it('calcula correctamente porcentaje por trabajo', () => {
        const ingresos = [
            { id: 'b1', trabajo: 'Hotel', tipo: 'Basico', valor: 1000000, modo: 'importe' },
            { id: 'p1', trabajo: 'Hotel', tipo: 'Remunerativo', valor: 10, modo: 'porcentaje' }
        ];
        const m = mapaValoresIngreso(ingresos);
        expect(m.get('p1')).toBe(100000);
        expect(m.get('b1')).toBe(1000000);
    });
});

describe('mesDesplazado', () => {
    it('debe avanzar meses dentro del mismo año', () => {
        expect(mesDesplazado('2026-10', 0)).toBe('2026-10');
        expect(mesDesplazado('2026-10', 1)).toBe('2026-11');
        expect(mesDesplazado('2026-10', 2)).toBe('2026-12');
    });

    it('debe pasar de año correctamente (no debe dar 2026-13)', () => {
        // El bug que esto previene: sumar al campo del mes directo
        // produce "2026-13" al cruzar diciembre.
        expect(mesDesplazado('2026-12', 1)).toBe('2027-01');
        expect(mesDesplazado('2026-11', 2)).toBe('2027-01');
    });

    it('debe tolerar offsets negativos (módulo positivo)', () => {
        expect(mesDesplazado('2026-01', -1)).toBe('2025-12');
        expect(mesDesplazado('2026-03', -4)).toBe('2025-11');
    });

    it('debe cubrir varios años de desplazamiento', () => {
        expect(mesDesplazado('2026-01', 24)).toBe('2028-01');
        expect(mesDesplazado('2026-05', -18)).toBe('2024-11');
    });

    it('debe rellenar el mes con dos dígitos', () => {
        expect(mesDesplazado('2026-01', 8)).toBe('2026-09');
        expect(mesDesplazado('2026-09', 3)).toBe('2026-12');
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