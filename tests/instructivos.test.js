import { describe, it, expect } from 'vitest';
import {
    INSTRUCTIVOS_DATA,
    CATEGORIAS_INSTRUCTIVOS,
    normalizarTextoBusqueda,
    buscarInstructivos,
    obtenerCategorias,
    obtenerGuiaPorId
} from '../js/instructivos/nucleo.js';

describe('Módulo de Instructivos: Lógica de Núcleo (js/instructivos/nucleo.js)', () => {

    describe('Estructura e Integridad de Datos', () => {
        it('debe contener las 7 guías fundamentales solicitadas', () => {
            expect(Array.isArray(INSTRUCTIVOS_DATA)).toBe(true);
            expect(INSTRUCTIVOS_DATA.length).toBe(7);

            const idsEsperados = [
                'ciclo-mensual',
                'listas-compra',
                'cuotas-planes',
                'cierre-rollover',
                'pasivos-deudas',
                'deseos-metas',
                'respaldo-nube'
            ];

            const idsActuales = INSTRUCTIVOS_DATA.map(g => g.id);
            expect(idsActuales).toEqual(idsEsperados);
        });

        it('cada guía debe tener todas las propiedades obligatorias completas', () => {
            INSTRUCTIVOS_DATA.forEach(guia => {
                expect(guia.id, 'id presente').toBeTruthy();
                expect(guia.titulo, `titulo en ${guia.id}`).toBeTruthy();
                expect(guia.subtitulo, `subtitulo en ${guia.id}`).toBeTruthy();
                expect(guia.categoria, `categoria en ${guia.id}`).toBeTruthy();
                expect(guia.categoriaNombre, `categoriaNombre en ${guia.id}`).toBeTruthy();
                expect(guia.icono, `icono en ${guia.id}`).toBeTruthy();
                expect(guia.tabDestino, `tabDestino en ${guia.id}`).toBeTruthy();
                expect(guia.resumen, `resumen en ${guia.id}`).toBeTruthy();
                expect(guia.tipDestacado, `tipDestacado en ${guia.id}`).toBeTruthy();
                expect(Array.isArray(guia.pasos), `pasos array en ${guia.id}`).toBe(true);
                expect(guia.pasos.length, `al menos 3 pasos en ${guia.id}`).toBeGreaterThanOrEqual(3);
                expect(Array.isArray(guia.keywords), `keywords array en ${guia.id}`).toBe(true);

                guia.pasos.forEach((p, idx) => {
                    expect(p.numero, `paso ${idx + 1} numero`).toBe(idx + 1);
                    expect(p.titulo, `paso ${idx + 1} titulo`).toBeTruthy();
                    expect(p.descripcion, `paso ${idx + 1} descripcion`).toBeTruthy();
                });
            });
        });

        it('debe tener definidas las categorías estándar con la opción "todas"', () => {
            expect(Array.isArray(CATEGORIAS_INSTRUCTIVOS)).toBe(true);
            const tieneTodas = CATEGORIAS_INSTRUCTIVOS.some(c => c.id === 'todas');
            expect(tieneTodas).toBe(true);
        });
    });

    describe('normalizarTextoBusqueda', () => {
        it('debe remover acentos, diacríticos y pasar a minúsculas', () => {
            expect(normalizarTextoBusqueda('Crédito')).toBe('credito');
            expect(normalizarTextoBusqueda('Sincronización')).toBe('sincronizacion');
            expect(normalizarTextoBusqueda('Único')).toBe('unico');
            expect(normalizarTextoBusqueda('DÓLAR')).toBe('dolar');
        });

        it('debe manejar cadenas vacías, nulos o espacios', () => {
            expect(normalizarTextoBusqueda('')).toBe('');
            expect(normalizarTextoBusqueda(null)).toBe('');
            expect(normalizarTextoBusqueda(undefined)).toBe('');
            expect(normalizarTextoBusqueda('   Hola Mundo   ')).toBe('hola mundo');
        });
    });

    describe('buscarInstructivos', () => {
        it('debe devolver todas las guías si la búsqueda está vacía y categoría es "todas"', () => {
            const res = buscarInstructivos(INSTRUCTIVOS_DATA, { texto: '', categoria: 'todas' });
            expect(res.length).toBe(7);
        });

        it('debe filtrar correctamente por texto en el título', () => {
            const res = buscarInstructivos(INSTRUCTIVOS_DATA, { texto: 'cuotas' });
            expect(res.some(g => g.id === 'cuotas-planes')).toBe(true);
        });

        it('debe encontrar resultados independientemente de acentos en la consulta', () => {
            const resConAcento = buscarInstructivos(INSTRUCTIVOS_DATA, { texto: 'dólar' });
            const resSinAcento = buscarInstructivos(INSTRUCTIVOS_DATA, { texto: 'dolar' });

            expect(resConAcento.length).toBeGreaterThan(0);
            expect(resConAcento.length).toBe(resSinAcento.length);
            expect(resConAcento.map(g => g.id)).toEqual(resSinAcento.map(g => g.id));
        });

        it('debe encontrar coincidencias dentro del texto de los pasos', () => {
            const res = buscarInstructivos(INSTRUCTIVOS_DATA, { texto: 'precancelar' });
            expect(res.some(g => g.id === 'pasivos-deudas')).toBe(true);
        });

        it('debe encontrar coincidencias dentro de las keywords', () => {
            const res = buscarInstructivos(INSTRUCTIVOS_DATA, { texto: 'firestore' });
            expect(res.some(g => g.id === 'respaldo-nube')).toBe(true);
        });

        it('debe filtrar por categoría específica', () => {
            const inicio = buscarInstructivos(INSTRUCTIVOS_DATA, { categoria: 'inicio' });
            expect(inicio.every(g => g.categoria === 'inicio')).toBe(true);
            expect(inicio.length).toBe(2); // ciclo-mensual y cierre-rollover

            const tarjetas = buscarInstructivos(INSTRUCTIVOS_DATA, { categoria: 'tarjetas' });
            expect(tarjetas.every(g => g.categoria === 'tarjetas')).toBe(true);
            expect(tarjetas.length).toBe(2); // cuotas-planes y pasivos-deudas
        });

        it('debe combinar texto y categoría', () => {
            const res = buscarInstructivos(INSTRUCTIVOS_DATA, {
                texto: 'cuotas',
                categoria: 'tarjetas'
            });
            expect(res.length).toBeGreaterThanOrEqual(1);
            expect(res.every(g => g.categoria === 'tarjetas')).toBe(true);
        });

        it('debe devolver array vacío si ningún término coincide', () => {
            const res = buscarInstructivos(INSTRUCTIVOS_DATA, { texto: 'palabra_inexistente_xyz_123' });
            expect(res).toEqual([]);
        });

        it('debe tolerar inputs nulos o inválidos sin romper', () => {
            expect(buscarInstructivos(null)).toEqual([]);
            expect(buscarInstructivos(undefined)).toEqual(INSTRUCTIVOS_DATA);
            expect(buscarInstructivos([])).toEqual([]);
        });
    });

    describe('obtenerCategorias', () => {
        it('debe computar las cantidades exactas por categoría', () => {
            const cats = obtenerCategorias(INSTRUCTIVOS_DATA);
            const catTodas = cats.find(c => c.id === 'todas');
            expect(catTodas.cantidad).toBe(7);

            const catInicio = cats.find(c => c.id === 'inicio');
            expect(catInicio.cantidad).toBe(2);

            const catOperaciones = cats.find(c => c.id === 'operaciones');
            expect(catOperaciones.cantidad).toBe(1);
        });
    });

    describe('obtenerGuiaPorId', () => {
        it('debe recuperar una guía existente por su id', () => {
            const guia = obtenerGuiaPorId(INSTRUCTIVOS_DATA, 'listas-compra');
            expect(guia).not.toBeNull();
            expect(guia.titulo).toBe('Listas de Compra con Pase a Gastos');
        });

        it('debe retornar null para un id inexistente o nulo', () => {
            expect(obtenerGuiaPorId(INSTRUCTIVOS_DATA, 'inexistente')).toBeNull();
            expect(obtenerGuiaPorId(INSTRUCTIVOS_DATA, null)).toBeNull();
            expect(obtenerGuiaPorId([], 'ciclo-mensual')).toBeNull();
        });
    });
});
