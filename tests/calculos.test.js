import { describe, it, expect, beforeEach } from 'vitest';
import { calcularNetoMes, calcularGastosMes, formatARS } from '../js/calculos.js';

// Mock del estado global db
let db;

beforeEach(() => {
    db = {
        ingresos: {},
        gastos: {}
    };
});

describe('calcularNetoMes', () => {
    it('debe calcular correctamente el sueldo neto con básico y deducción', () => {
        db.ingresos = {
            '2026-01': [
                { tipo: 'Basico', valor: 1000000, modo: 'importe' },
                { tipo: 'Deduccion', valor: 50000, modo: 'importe' }
            ]
        };

        const resultado = calcularNetoMes('2026-01');

        expect(resultado.rem).toBe(1000000);
        expect(resultado.norem).toBe(0);
        expect(resultado.ded).toBe(50000);
        expect(resultado.neto).toBe(950000);
    });

    it('debe calcular correctamente con porcentaje remunerativo', () => {
        db.ingresos = {
            '2026-01': [
                { tipo: 'Basico', valor: 1000000, modo: 'importe' },
                { tipo: 'Remunerativo', valor: 10, modo: 'porcentaje' }
            ]
        };

        const resultado = calcularNetoMes('2026-01');

        expect(resultado.rem).toBe(1100000); // 1M + 10% de 1M
        expect(resultado.neto).toBe(1100000);
    });

    it('debe retornar ceros si no hay ingresos', () => {
        db.ingresos = {};

        const resultado = calcularNetoMes('2026-01');

        expect(resultado.rem).toBe(0);
        expect(resultado.norem).toBe(0);
        expect(resultado.ded).toBe(0);
        expect(resultado.neto).toBe(0);
    });

    it('debe manejar ingresos vacíos', () => {
        db.ingresos = { '2026-01': [] };

        const resultado = calcularNetoMes('2026-01');

        expect(resultado.rem).toBe(0);
        expect(resultado.neto).toBe(0);
    });
});

describe('calcularGastosMes', () => {
    it('debe calcular correctamente los gastos por categoría', () => {
        db.gastos = {
            '2026-01': [
                { categoria: 'Fijos', monto: 50000, pagado: true },
                { categoria: 'Unicos', monto: 30000, pagado: false },
                { categoria: 'Cuotas', monto: 20000, pagado: false }
            ]
        };

        const resultado = calcularGastosMes('2026-01');

        expect(resultado.total).toBe(100000);
        expect(resultado.pagado).toBe(50000);
        expect(resultado.pendientes).toBe(50000);
        expect(resultado.fijos).toBe(50000);
        expect(resultado.unicos).toBe(30000);
        expect(resultado.cuotas).toBe(20000);
    });

    it('debe retornar ceros si no hay gastos', () => {
        db.gastos = {};

        const resultado = calcularGastosMes('2026-01');

        expect(resultado.total).toBe(0);
        expect(resultado.pagado).toBe(0);
        expect(resultado.pendientes).toBe(0);
    });

    it('debe manejar gastos sin categoría definida', () => {
        db.gastos = {
            '2026-01': [
                { monto: 10000, pagado: true }
            ]
        };

        const resultado = calcularGastosMes('2026-01');

        expect(resultado.total).toBe(10000);
        expect(resultado.pagado).toBe(10000);
    });
});

describe('formatARS', () => {
    it('debe formatear números como pesos argentinos', () => {
        expect(formatARS(1000000)).toBe('$ 1.000.000,00');
        expect(formatARS(1500.5)).toBe('$ 1.500,50');
        expect(formatARS(0)).toBe('$ 0,00');
    });

    it('debe manejar valores nulos o undefined', () => {
        expect(formatARS(null)).toBe('$ 0,00');
        expect(formatARS(undefined)).toBe('$ 0,00');
    });
});
