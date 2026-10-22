import { describe, it, expect, beforeEach } from 'vitest';
import {
    CLAVE_INDICE_ROTACION,
    CLAVE_HISTORIAL_COPIAS,
    LIMITE_MAXIMO_COPIAS,
    obtenerIndiceRotacion,
    avanzarIndiceRotacion,
    generarNombreCopiaRotativa,
    formatearFechaCopia,
    extraerResumenBase,
    obtenerHistorialCopias,
    purgarCopiasAntiguas,
    guardarSnapshotEnHistorial,
    restaurarCopiaDesdeHistorial
} from '../js/core/respaldos.js';

function crearStorageFalso() {
    let store = {};
    return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; }
    };
}

describe('Módulo de Respaldos Rotativos (js/core/respaldos.js)', () => {
    let storage;

    beforeEach(() => {
        storage = crearStorageFalso();
    });

    describe('rotación de índice 1 a 5', () => {
        it('debe iniciar en 1 si no hay índice guardado', () => {
            expect(obtenerIndiceRotacion(storage)).toBe(1);
        });

        it('debe rotar secuencialmente de 1 a 5', () => {
            expect(obtenerIndiceRotacion(storage)).toBe(1);
            expect(avanzarIndiceRotacion(storage)).toBe(2);
            expect(avanzarIndiceRotacion(storage)).toBe(3);
            expect(avanzarIndiceRotacion(storage)).toBe(4);
            expect(avanzarIndiceRotacion(storage)).toBe(5);
        });

        it('debe reiniciar a 1 al superar 5 (rotación cíclica)', () => {
            storage.setItem(CLAVE_INDICE_ROTACION, '5');
            expect(obtenerIndiceRotacion(storage)).toBe(5);
            expect(avanzarIndiceRotacion(storage)).toBe(1);
            expect(obtenerIndiceRotacion(storage)).toBe(1);
        });

        it('debe tolerar valores corruptos o fuera de rango en storage retornando 1', () => {
            storage.setItem(CLAVE_INDICE_ROTACION, 'invalido');
            expect(obtenerIndiceRotacion(storage)).toBe(1);
            storage.setItem(CLAVE_INDICE_ROTACION, '99');
            expect(obtenerIndiceRotacion(storage)).toBe(1);
            storage.setItem(CLAVE_INDICE_ROTACION, '-3');
            expect(obtenerIndiceRotacion(storage)).toBe(1);
        });
    });

    describe('generarNombreCopiaRotativa', () => {
        it('debe generar el nombre según el índice rotativo', () => {
            storage.setItem(CLAVE_INDICE_ROTACION, '3');
            expect(generarNombreCopiaRotativa(null, storage)).toBe('Finanzas_Lineage_Copia_3.json');
        });

        it('debe respetar el índice pasado explícitamente', () => {
            expect(generarNombreCopiaRotativa(2)).toBe('Finanzas_Lineage_Copia_2.json');
            expect(generarNombreCopiaRotativa(5)).toBe('Finanzas_Lineage_Copia_5.json');
        });

        it('debe usar el índice por defecto si se pasa un valor inválido', () => {
            storage.setItem(CLAVE_INDICE_ROTACION, '4');
            expect(generarNombreCopiaRotativa(0, storage)).toBe('Finanzas_Lineage_Copia_4.json');
            expect(generarNombreCopiaRotativa(8, storage)).toBe('Finanzas_Lineage_Copia_4.json');
        });
    });

    describe('historial y límite estricto de 5 copias', () => {
        it('debe registrar un snapshot con sus metadatos y avanzar el índice', () => {
            const data = {
                mesActivo: '2026-10',
                ingresos: { '2026-10': [{ id: 1, concepto: 'Sueldo', monto: 1000 }] },
                gastos: { '2026-10': [{ id: 2, concepto: 'Alquiler', monto: 400 }] }
            };

            const guardado = guardarSnapshotEnHistorial(data, storage);
            expect(guardado).toBeDefined();
            expect(guardado.numero).toBe(1);
            expect(guardado.nombreArchivo).toBe('Finanzas_Lineage_Copia_1.json');

            const historial = obtenerHistorialCopias(storage);
            expect(historial.length).toBe(1);
            expect(historial[0].numero).toBe(1);
            expect(historial[0].data.mesActivo).toBe('2026-10');
            expect(historial[0].resumen).toContain('2026-10');
            expect(historial[0].resumen).toContain('1 ingresos');
            expect(historial[0].resumen).toContain('1 gastos');

            // El índice debe haber avanzado a 2 para la siguiente copia
            expect(obtenerIndiceRotacion(storage)).toBe(2);
        });

        it('debe mantener como máximo 5 copias, purgando las más antiguas', () => {
            for (let i = 1; i <= 7; i++) {
                guardarSnapshotEnHistorial({ mesActivo: `2026-0${i}`, paso: i }, storage);
            }

            const historial = obtenerHistorialCopias(storage);
            expect(historial.length).toBe(LIMITE_MAXIMO_COPIAS);
            expect(historial.length).toBe(5);

            // Los más recientes deben estar primero (7, 6, 5, 4, 3)
            expect(historial[0].data.paso).toBe(7);
            expect(historial[1].data.paso).toBe(6);
            expect(historial[2].data.paso).toBe(5);
            expect(historial[3].data.paso).toBe(4);
            expect(historial[4].data.paso).toBe(3);
        });

        it('purgarCopiasAntiguas debe recortar a 5 si por alguna razón había más', () => {
            const copiasExcedidas = Array.from({ length: 8 }, (_, i) => ({
                id: `bk_${i}`,
                numero: (i % 5) + 1,
                fecha: '22/10/2026',
                timestamp: Date.now() + i,
                data: { n: i }
            }));
            storage.setItem(CLAVE_HISTORIAL_COPIAS, JSON.stringify(copiasExcedidas));

            const purgadas = purgarCopiasAntiguas(storage);
            expect(purgadas.length).toBe(5);
            expect(obtenerHistorialCopias(storage).length).toBe(5);
        });
    });

    describe('restauración desde historial', () => {
        it('debe restaurar una copia mediante su ID', () => {
            const baseOriginal = { mesActivo: '2026-10', dolar: 1200 };
            const bk = guardarSnapshotEnHistorial(baseOriginal, storage);

            const restaurada = restaurarCopiaDesdeHistorial(bk.id, storage);
            expect(restaurada).toEqual(baseOriginal);
            // Debe ser una copia profunda (no misma referencia)
            expect(restaurada).not.toBe(baseOriginal);
        });

        it('debe restaurar pasando el objeto de la copia directamente', () => {
            const objetoCopia = {
                id: 'bk_directo',
                data: { clave: 'valor_secreto' }
            };
            const restaurada = restaurarCopiaDesdeHistorial(objetoCopia, storage);
            expect(restaurada).toEqual({ clave: 'valor_secreto' });
        });

        it('debe devolver null si el id no existe', () => {
            expect(restaurarCopiaDesdeHistorial('no-existe', storage)).toBeNull();
            expect(restaurarCopiaDesdeHistorial(null, storage)).toBeNull();
        });
    });

    describe('formatearFechaCopia', () => {
        it('debe generar una fecha legible con formato DD/MM/AAAA, HH:MM', () => {
            const fecha = new Date(2026, 9, 22, 15, 30);
            const str = formatearFechaCopia(fecha);
            expect(str).toBe('22/10/2026, 15:30');
        });
    });
});
