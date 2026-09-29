import { describe, it, expect } from 'vitest';
import { generarMesesFuturos, generarMesesEntre, obtenerNombreMes, obtenerMesSiguiente, obtenerMesAnterior } from '../js/utils/fechas.js';

describe('generarMesesFuturos', () => {
    it('debe generar meses futuros correctamente', () => {
        const meses = generarMesesFuturos('2026-01', 3);
        expect(meses).toEqual(['2026-02', '2026-03', '2026-04']);
    });

    it('debe manejar cambio de año', () => {
        const meses = generarMesesFuturos('2026-11', 3);
        expect(meses).toEqual(['2026-12', '2027-01', '2027-02']);
    });

    it('debe generar 24 meses correctamente', () => {
        const meses = generarMesesFuturos('2026-01', 24);
        expect(meses.length).toBe(24);
        expect(meses[0]).toBe('2026-02');
        expect(meses[23]).toBe('2028-01');
    });
});

describe('generarMesesEntre', () => {
    it('debe generar meses entre dos fechas', () => {
        const meses = generarMesesEntre('2026-01', '2026-03');
        expect(meses).toEqual(['2026-01', '2026-02', '2026-03']);
    });

    it('debe manejar cambio de año', () => {
        const meses = generarMesesEntre('2026-11', '2027-02');
        expect(meses).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    });
});

describe('obtenerNombreMes', () => {
    it('debe retornar nombre largo por defecto', () => {
        expect(obtenerNombreMes(1)).toBe('Enero');
        expect(obtenerNombreMes(12)).toBe('Diciembre');
    });

    it('debe retornar nombre corto cuando se solicita', () => {
        expect(obtenerNombreMes(1, true)).toBe('Ene');
        expect(obtenerNombreMes(12, true)).toBe('Dic');
    });
});

describe('obtenerMesSiguiente', () => {
    it('debe retornar el mes siguiente', () => {
        expect(obtenerMesSiguiente('2026-01')).toBe('2026-02');
        expect(obtenerMesSiguiente('2026-12')).toBe('2027-01');
    });
});

describe('obtenerMesAnterior', () => {
    it('debe retornar el mes anterior', () => {
        expect(obtenerMesAnterior('2026-02')).toBe('2026-01');
        expect(obtenerMesAnterior('2026-01')).toBe('2025-12');
    });
});
