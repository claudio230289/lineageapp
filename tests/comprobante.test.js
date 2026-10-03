import { describe, it, expect } from 'vitest';
import {
    filtrarPorConcepto,
    formatearPeriodo,
    formatearFechaHora,
    calcularTotalesComprobante,
    construirComprobante
} from '../js/comprobante.js';

/* =========================================================
   Tests del comprobante de pagos.
   Es la salida que el usuario lee y archiva, y el bug que la
   originó fue que un gasto tildado como pagado salía listado
   como pendiente. Estos tests fijan ese comportamiento.
   ========================================================= */

// Fecha fija para que el texto sea determinista entre corridas.
const EMISION = new Date(2026, 9, 2, 8, 32); // 02/10/2026 08:32 hora local

const GASTOS_MEZCLA = [
    { id: 1, concepto: 'Reparacion auto', categoria: 'Unicos', monto: 30000, pagado: true },
    { id: 2, concepto: 'Alquiler', categoria: 'Fijos', monto: 400000, pagado: true },
    { id: 3, concepto: 'Notebook (Cuota 1/6)', categoria: 'Cuotas', monto: 50000, pagado: false },
    { id: 4, concepto: 'Comida "rapida" & café', categoria: 'Unicos', monto: 15000.5, pagado: false }
];

describe('filtrarPorConcepto', () => {
    it('debe traer todo cuando no hay filtro', () => {
        expect(filtrarPorConcepto(GASTOS_MEZCLA, '')).toHaveLength(4);
        expect(filtrarPorConcepto(GASTOS_MEZCLA, '   ')).toHaveLength(4);
    });

    it('debe filtrar ignorando mayúsculas y tildes', () => {
        expect(filtrarPorConcepto(GASTOS_MEZCLA, 'REPARACION')).toHaveLength(1);
        expect(filtrarPorConcepto(GASTOS_MEZCLA, 'reparacion')).toHaveLength(1);
        expect(filtrarPorConcepto(GASTOS_MEZCLA, 'alquiler')).toHaveLength(1);
    });

    it('no debe modificar el array original', () => {
        const original = [...GASTOS_MEZCLA];
        filtrarPorConcepto(GASTOS_MEZCLA, 'alquiler');
        expect(GASTOS_MEZCLA).toEqual(original);
    });

    it('debe tolerar entradas inválidas', () => {
        expect(filtrarPorConcepto(null, 'x')).toEqual([]);
        expect(filtrarPorConcepto(undefined, '')).toEqual([]);
    });
});

describe('formatearPeriodo y formatearFechaHora', () => {
    it('debe pasar el mes de YYYY-MM a MM/AAAA', () => {
        expect(formatearPeriodo('2026-10')).toBe('10/2026');
        expect(formatearPeriodo('2027-01')).toBe('01/2027');
    });

    it('debe devolver el texto original si el mes no tiene formato válido', () => {
        expect(formatearPeriodo('algo raro')).toBe('algo raro');
        expect(formatearPeriodo('')).toBe('');
        expect(formatearPeriodo(null)).toBe('');
    });

    it('debe formatear la fecha y hora de emisión con ceros a la izquierda', () => {
        expect(formatearFechaHora(EMISION)).toBe('02/10/2026 08:32');
        expect(formatearFechaHora(new Date(2026, 0, 5, 7, 5))).toBe('05/01/2026 07:05');
    });

    it('debe caer a la hora actual si la fecha es inválida', () => {
        expect(formatearFechaHora(new Date('no es una fecha'))).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
        expect(formatearFechaHora(null)).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    });
});

describe('calcularTotalesComprobante', () => {
    it('debe separar abonado de pendiente', () => {
        const t = calcularTotalesComprobante(GASTOS_MEZCLA);
        expect(t.total).toBe(495000.5);
        expect(t.pagado).toBe(430000);
        expect(t.pendientes).toBe(65000.5);
        expect(t.salado).toBe(false);
    });

    it('debe marcar SALDADO sólo si no queda nada pendiente', () => {
        const t = calcularTotalesComprobante([
            { concepto: 'Alquiler', categoria: 'Fijos', monto: 400000, pagado: true }
        ]);
        expect(t.pendientes).toBe(0);
        expect(t.salado).toBe(true);
    });

    it('debe considerar SALDADO un saldo de menos de $5', () => {
        // Criterio del usuario: una diferencia menor a 5 pesos no
        // marca la cuenta como pendiente. Ojo con la semántica:
        // `pendientes` es el total que falta abonar, no la diferencia
        // entre lo pagado y lo total.
        const t = calcularTotalesComprobante([
            { concepto: 'a', categoria: 'Unicos', monto: 100.00, pagado: true },
            { concepto: 'b', categoria: 'Unicos', monto: 4.00, pagado: false }
        ]);
        expect(t.pendientes).toBe(4);
        expect(t.salado).toBe(true);
    });

    it('debe considerar PENDIENTE un saldo de exactamente $5', () => {
        // El límite es exclusivo porque el criterio dice "menor a 5".
        // Si algún día se quiere "hasta 5", esto pasa a ser SALDADO y
        // el cambio es un `>=` por un `>` en comprobante.js.
        const t = calcularTotalesComprobante([
            { concepto: 'a', categoria: 'Unicos', monto: 100.00, pagado: true },
            { concepto: 'b', categoria: 'Unicos', monto: 5.00, pagado: false }
        ]);
        expect(t.pendientes).toBe(5);
        expect(t.salado).toBe(false);
    });

    it('debe considerar PENDIENTE un saldo apenas mayor a $5', () => {
        const t = calcularTotalesComprobante([
            { concepto: 'a', categoria: 'Unicos', monto: 100.00, pagado: true },
            { concepto: 'b', categoria: 'Unicos', monto: 5.01, pagado: false }
        ]);
        expect(t.pendientes).toBeCloseTo(5.01, 2);
        expect(t.salado).toBe(false);
    });

    it('debe tolerar una diferencia de un centavo y seguir SALDADO', () => {
        // Un saldo de 0,001 no debe marcar la cuenta como pendiente.
        const t = calcularTotalesComprobante([
            { concepto: 'a', categoria: 'Unicos', monto: 100.004, pagado: true },
            { concepto: 'b', categoria: 'Unicos', monto: 0.001, pagado: false }
        ]);
        expect(t.pendientes).toBe(0.001);
        expect(t.salado).toBe(true);
    });

    it('debe usar esPagado para todos los tipos de gasto', () => {
        const t = calcularTotalesComprobante([
            { concepto: 'unico', categoria: 'Unicos', monto: 30000, pagado: true },
            { concepto: 'cuota', categoria: 'Cuotas', monto: 20000, pagado: 'true' },
            { concepto: 'legado', categoria: 'Fijos', monto: 50000, pagado: 1 },
            { concepto: 'sin pagar', categoria: 'Unicos', monto: 10000, pagado: false }
        ]);
        expect(t.pagado).toBe(100000);
        expect(t.pendientes).toBe(10000);
    });

    it('nunca debe devolver NaN con montos corruptos', () => {
        const t = calcularTotalesComprobante([
            { concepto: 'x', categoria: 'Unicos', monto: 'no es número', pagado: true },
            { concepto: 'y', categoria: 'Unicos', monto: '1.500,50', pagado: false }
        ]);
        expect(t.total).toBe(1500.5);
        expect(Number.isNaN(t.total)).toBe(false);
    });

    it('debe devolver ceros con lista vacía o inválida', () => {
        expect(calcularTotalesComprobante([])).toMatchObject({ total: 0, pagado: 0, pendientes: 0, salado: true });
        expect(calcularTotalesComprobante(null)).toMatchObject({ total: 0, pagado: 0, pendientes: 0 });
    });
});

describe('construirComprobante', () => {
    it('debe listar los abonos con el ícono ✓ y lo que falta con ○', () => {
        const c = construirComprobante({ gastos: GASTOS_MEZCLA, periodo: '2026-10', fechaEmision: EMISION });
        expect(c.items.find(i => i.concepto === 'Reparacion auto').abonado).toBe(true);
        expect(c.texto).toContain('✓ Reparacion auto');
        expect(c.texto).toContain('✓ Alquiler');
        expect(c.texto).toContain('○ Notebook (Cuota 1/6)');
    });

    it('debe incluir fecha y hora de emisión y el período', () => {
        const c = construirComprobante({ gastos: GASTOS_MEZCLA, periodo: '2026-10', fechaEmision: EMISION });
        expect(c.texto).toContain('Periodo: 10/2026');
        expect(c.texto).toContain('Emitido: 02/10/2026 08:32');
    });

    it('debe formatear todos los importes como pesos argentinos', () => {
        const c = construirComprobante({ gastos: GASTOS_MEZCLA, periodo: '2026-10', fechaEmision: EMISION });
        expect(c.texto).toContain('$ 30.000,00');
        expect(c.texto).toContain('$ 400.000,00');
        expect(c.texto).toContain('$ 495.000,50');
        expect(c.texto).toContain('Total a pagar: $ 495.000,50');
        expect(c.texto).toContain('Abonado: $ 430.000,00');
        expect(c.texto).toContain('Pendiente: $ 65.000,50');
    });

    it('debe marcar SALDADO cuando no queda nada pendiente', () => {
        const c = construirComprobante({
            gastos: [{ concepto: 'Alquiler', categoria: 'Fijos', monto: 400000, pagado: true }],
            periodo: '2026-10',
            fechaEmision: EMISION
        });
        expect(c.salado).toBe(true);
        expect(c.texto).toContain('*Estado de cuenta: SALDADO*');
    });

    it('debe marcar PENDIENTE cuando algo quedó sin pagar', () => {
        const c = construirComprobante({ gastos: GASTOS_MEZCLA, periodo: '2026-10', fechaEmision: EMISION });
        expect(c.salado).toBe(false);
        expect(c.texto).toContain('*Estado de cuenta: PENDIENTE*');
        expect(c.texto).not.toContain('SALDADO');
    });

    it('debe aplicar el filtro y dejar los totales consistentes con la lista', () => {
        const c = construirComprobante({ gastos: GASTOS_MEZCLA, filtro: 'alquiler', periodo: '2026-10', fechaEmision: EMISION });
        expect(c.cantidadItems).toBe(1);
        expect(c.total).toBe(400000);
        expect(c.texto).toContain('Filtro: alquiler');
        expect(c.texto).not.toContain('Reparacion auto');
    });

    it('debe manejar una lista vacía sin romperse', () => {
        const c = construirComprobante({ gastos: [], periodo: '2026-10', fechaEmision: EMISION });
        expect(c.vacio).toBe(true);
        expect(c.texto).toContain('(sin conceptos para este filtro)');
        expect(c.texto).toContain('$ 0,00');
    });

    it('debe funcionar sin argumentos', () => {
        expect(() => construirComprobante()).not.toThrow();
        expect(construirComprobante().vacio).toBe(true);
    });

    it('REGRESIÓN: un gasto tildado en la UI nunca puede listarse como pendiente', () => {
        // El bug original: el gasto se calculaba en el total pero
        // aparecía como pendiente en la lista de texto.
        const c = construirComprobante({
            gastos: [{ id: 'x', concepto: 'Reparacion auto', categoria: 'Unicos', monto: 30000, pagado: true }],
            periodo: '2026-10',
            fechaEmision: EMISION
        });
        expect(c.texto).toContain('✓ Reparacion auto');
        expect(c.texto).not.toContain('○ Reparacion auto');
        expect(c.pagado).toBe(30000);
        expect(c.pendientes).toBe(0);
        expect(c.salado).toBe(true);
    });
});