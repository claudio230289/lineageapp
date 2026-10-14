import { describe, it, expect } from 'vitest';
import { cuotasEnAlcance, planificarEdicionPlan } from '../js/negocio/cuotas-plan.js';
import { formatearCuota } from '../js/version.js';
import { mesDesplazado } from '../js/calculos/nucleo.js';

/* =========================================================
   Plan de cuotas: lógica pura (js/negocio/cuotas-plan.js)

   Estos tests existen por una razón concreta: el bug de "editar
   el plan tocaba las cuotas PAGADAS y las de meses PASADOS" no
   tenía ningún test que lo frenara, porque la función vivía en
   js/app.js, que importa Firebase por URL y no se puede cargar
   en Node. Acá se prueba la regla de alcance directamente.
   ========================================================= */

/**
 * Arma el mapa de gastos de un plan de cuotas.
 *
 * Datos FICTICIOS: sólo se usan montos y meses redondos para que
 * las aserciones sean legibles.
 *
 * @param {Object} opciones
 * @returns {{[mes:string]: Array<Object>}}
 */
function armarPlan({
    grupoId = 'plan-auto',
    base = 'Auto',
    desde = '2026-01',
    total = 6,
    monto = 10000,
    montos = null,
    pagadas = []
} = {}) {
    const gastos = {};
    for (let nro = 1; nro <= total; nro++) {
        const mes = mesDesplazado(desde, nro - 1);
        const montoCuota = Array.isArray(montos) ? montos[nro - 1] : monto;
        if (!gastos[mes]) gastos[mes] = [];
        gastos[mes].push({
            id: `${grupoId}-n${nro}`,
            concepto: formatearCuota(base, nro, total),
            categoria: 'Cuotas',
            monto: montoCuota,
            pagado: pagadas.includes(nro),
            grupoId,
            cuotaNro: nro,
            cuotaTotal: total
        });
    }
    return gastos;
}

describe('cuotasEnAlcance', () => {
    it('sólo incluye cuotas impagas del mes activo o de meses futuros del mismo grupo', () => {
        // 6 cuotas desde 2026-01. mes activo 2026-04 => el alcance son
        // 04, 05 y 06 (01, 02 y 03 son pasados).
        const gastos = armarPlan({ desde: '2026-01', total: 6 });
        const enAlcance = cuotasEnAlcance(gastos, 'plan-auto', '2026-04');

        expect(enAlcance.map(c => [c.mes, c.gasto.cuotaNro])).toEqual([
            ['2026-04', 4],
            ['2026-05', 5],
            ['2026-06', 6]
        ]);
    });

    it('excluye las cuotas pagadas dentro del alcance', () => {
        const gastos = armarPlan({ desde: '2026-01', total: 6, pagadas: [4, 5] });
        const enAlcance = cuotasEnAlcance(gastos, 'plan-auto', '2026-04');

        expect(enAlcance.map(c => c.gasto.cuotaNro)).toEqual([6]);
    });

    it('trata pagado:"si" como pagada', () => {
        const gastos = {
            '2026-05': [{
                id: 'a', categoria: 'Cuotas', grupoId: 'plan-auto', pagado: 'si'
            }]
        };
        expect(cuotasEnAlcance(gastos, 'plan-auto', '2026-05')).toEqual([]);
    });

    it('excluye otros grupos y otras categorías', () => {
        const gastos = {
            '2026-05': [
                {
                    id: 'a', concepto: 'Otro (Cuota 1/2)', categoria: 'Cuotas',
                    monto: 1, grupoId: 'plan-otro', cuotaNro: 1, cuotaTotal: 2
                },
                {
                    id: 'b', concepto: 'Alquiler', categoria: 'Fijos',
                    monto: 1, grupoId: 'plan-auto'
                },
                {
                    id: 'c', concepto: 'Algo', categoria: 'Otros',
                    monto: 1, grupoId: 'plan-auto'
                }
            ]
        };
        expect(cuotasEnAlcance(gastos, 'plan-auto', '2026-05')).toEqual([]);
    });

    it('tolera entradas corruptas sin romper', () => {
        expect(cuotasEnAlcance(null, 'plan-auto', '2026-05')).toEqual([]);
        expect(cuotasEnAlcance(undefined, 'plan-auto', '2026-05')).toEqual([]);
        expect(cuotasEnAlcance({ '2026-05': 'no soy array' }, 'plan-auto', '2026-05')).toEqual([]);
        expect(cuotasEnAlcance(
            { '2026-05': [null, 'texto', 42] },
            'plan-auto',
            '2026-05'
        )).toEqual([]);
    });

    it('ordena por mes y, dentro del mes, por número de cuota', () => {
        const gastos = {
            '2026-07': [
                { id: 'b', categoria: 'Cuotas', grupoId: 'g', cuotaNro: 3, cuotaTotal: 3 },
                { id: 'a', categoria: 'Cuotas', grupoId: 'g', cuotaNro: 1, cuotaTotal: 3 }
            ],
            '2026-06': [
                { id: 'c', categoria: 'Cuotas', grupoId: 'g', cuotaNro: 2, cuotaTotal: 3 }
            ]
        };
        const enAlcance = cuotasEnAlcance(gastos, 'g', '2026-06');
        expect(enAlcance.map(c => c.gasto.id)).toEqual(['c', 'a', 'b']);
    });
});

describe('planificarEdicionPlan: alcance', () => {
    it('(1) NO modifica una cuota PAGADA', () => {
        // 6 cuotas desde 2026-01, la 1 pagada, mes activo 2026-06.
        const gastos = armarPlan({ desde: '2026-01', total: 6, monto: 10000, pagadas: [1] });
        const antes = JSON.parse(JSON.stringify(gastos));

        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-06',
            base: 'Auto',
            montos: [20000],
            nuevoTotal: 1
        });

        const idPagada = 'plan-auto-n1';
        expect(plan.actualizaciones.some(a => a.id === idPagada)).toBe(false);
        expect(plan.bajas.some(b => b.id === idPagada)).toBe(false);
        expect(plan.altas.some(a => a.gasto.id === idPagada)).toBe(false);
        // Tampoco muta la base: el plan es sólo un cálculo.
        expect(gastos).toEqual(antes);
    });

    it('NO modifica una cuota PAGADA aunque esté en el mes activo o en el futuro', () => {
        // La cuota 6 (mes activo) está pagada: el alcance queda vacío.
        const gastos = armarPlan({ desde: '2026-01', total: 6, pagadas: [6] });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-06',
            base: 'Auto',
            montos: [20000],
            nuevoTotal: 3
        });

        expect(plan.actualizaciones).toEqual([]);
        expect(plan.bajas).toEqual([]);
        expect(plan.altas).toEqual([]);
        expect(plan.avisos.some(a => a.codigo === 'sin-cuotas-en-alcance')).toBe(true);
    });

    it('(2) NO modifica cuotas de meses PASADOS', () => {
        const gastos = armarPlan({ desde: '2026-01', total: 6, monto: 10000 });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-06',
            base: 'Auto',
            montos: [20000],
            nuevoTotal: 1
        });

        // Sólo entra la cuota del mes activo.
        expect(plan.actualizaciones.map(a => a.mes)).toEqual(['2026-06']);
        ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].forEach((mes) => {
            expect(plan.actualizaciones.some(a => a.mes === mes)).toBe(false);
            expect(plan.bajas.some(b => b.mes === mes)).toBe(false);
        });
    });

    it('(3) SÍ modifica cuotas impagas del mes activo y de meses futuros', () => {
        const gastos = armarPlan({ desde: '2026-01', total: 6, monto: 10000 });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-04',
            base: 'Auto Nuevo',
            montos: [20000, 20000, 20000],
            nuevoTotal: 3
        });

        expect(plan.actualizaciones.map(a => a.mes)).toEqual(['2026-04', '2026-05', '2026-06']);
        expect(plan.actualizaciones.every(a => a.monto === 20000)).toBe(true);
        expect(plan.actualizaciones[0].concepto).toBe('Auto Nuevo (Cuota 1/3)');
        expect(plan.actualizaciones[0].cuotaNro).toBe(1);
        expect(plan.actualizaciones[0].cuotaTotal).toBe(3);
    });
});

describe('planificarEdicionPlan: reducir', () => {
    it('(4) quita SÓLO la cola EN ALCANCE', () => {
        // mes activo 2026-03 => alcance 03, 04, 05 y 06. Reducir a 2
        // debe quitar 05 y 06 y conservar 03 y 04 (renumeradas 1/2 y 2/2).
        const gastos = armarPlan({ desde: '2026-01', total: 6, monto: 10000 });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-03',
            base: 'Auto',
            montos: [10000, 10000],
            nuevoTotal: 2
        });

        expect(plan.bajas.map(b => b.id).sort()).toEqual(['plan-auto-n5', 'plan-auto-n6'].sort());
        expect(plan.bajas.some(b => b.mes === '2026-04')).toBe(false);
        expect(plan.actualizaciones.map(a => [a.mes, a.concepto])).toEqual([
            ['2026-03', 'Auto (Cuota 1/2)'],
            ['2026-04', 'Auto (Cuota 2/2)']
        ]);
        // Los meses pasados nunca aparecen.
        expect(plan.bajas.some(b => b.mes < '2026-03')).toBe(false);
        expect(plan.actualizaciones.some(a => a.mes < '2026-03')).toBe(false);
    });

    it('nunca quita una cuota pagada, ni aunque esté en la cola', () => {
        // La cuota 5 está pagada; al reducir a 3 sólo se quitan cuotas
        // impagas en alcance (4 y 6).
        const gastos = armarPlan({ desde: '2026-01', total: 6, monto: 10000, pagadas: [5] });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-01',
            base: 'Auto',
            montos: [10000, 10000, 10000],
            nuevoTotal: 3
        });

        expect(plan.bajas.map(b => b.id).sort()).toEqual(['plan-auto-n4', 'plan-auto-n6'].sort());
        expect(plan.bajas.some(b => b.id === 'plan-auto-n5')).toBe(false);
    });
});

describe('planificarEdicionPlan: crecer', () => {
    it('(5) agrega cuotas DESPUÉS de la última en alcance, con el mismo grupo', () => {
        // mes activo 2026-02 => alcance 02 y 03. Crecer a 5 agrega 04, 05 y 06.
        const gastos = armarPlan({ desde: '2026-01', total: 3, monto: 10000 });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-02',
            base: 'Auto',
            montos: [10000, 10000],
            nuevoTotal: 5
        });

        expect(plan.altas.map(a => a.mes)).toEqual(['2026-04', '2026-05', '2026-06']);
        expect(plan.altas.map(a => a.gasto.cuotaNro)).toEqual([3, 4, 5]);
        expect(plan.altas.every(a => a.gasto.grupoId === 'plan-auto')).toBe(true);
        expect(plan.altas.every(a => a.gasto.categoria === 'Cuotas')).toBe(true);
        expect(plan.altas.every(a => a.gasto.pagado === false)).toBe(true);
        expect(plan.altas[0].gasto.concepto).toBe('Auto (Cuota 3/5)');
        expect(plan.altas[2].gasto.concepto).toBe('Auto (Cuota 5/5)');
        // Las conservadas 02 y 03 se renumeran dentro del alcance.
        expect(plan.actualizaciones.map(a => [a.mes, a.concepto])).toEqual([
            ['2026-02', 'Auto (Cuota 1/5)'],
            ['2026-03', 'Auto (Cuota 2/5)']
        ]);
    });

    it('no debe duplicar una cuota que ya existe en el mes destino', () => {
        const gastos = armarPlan({ desde: '2026-01', total: 3, monto: 10000 });
        // Ya hay una "Auto (Cuota 4/5)" suelta en 2026-05 (de otro grupo).
        gastos['2026-05'] = [{
            id: 'existente-2026-05',
            concepto: 'Auto (Cuota 4/5)',
            categoria: 'Cuotas',
            monto: 9999,
            pagado: false,
            grupoId: 'otro',
            cuotaNro: 4,
            cuotaTotal: 5
        }];

        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-02',
            base: 'Auto',
            montos: [10000, 10000],
            nuevoTotal: 5
        });

        // nro 4 se omite (duplicado); nro 3 (2026-04) y nro 5 (2026-06) se agregan.
        expect(plan.altas.map(a => a.gasto.cuotaNro)).toEqual([3, 5]);
        expect(plan.avisos.some(a => a.codigo === 'duplicado')).toBe(true);
    });
});

describe('planificarEdicionPlan: montos variables', () => {
    it('(6) guardar sin cambios NO aplana los montos', () => {
        const gastos = armarPlan({ desde: '2026-01', total: 3, montos: [1000, 2000, 3000] });
        // El editor conserva los montos (los pasa tal cual) y sólo
        // cambia el concepto base.
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-01',
            base: 'Auto Renombrado',
            montos: [1000, 2000, 3000],
            nuevoTotal: 3
        });

        expect(plan.actualizaciones.map(a => a.monto)).toEqual([1000, 2000, 3000]);
        expect(plan.actualizaciones.map(a => a.concepto)).toEqual([
            'Auto Renombrado (Cuota 1/3)',
            'Auto Renombrado (Cuota 2/3)',
            'Auto Renombrado (Cuota 3/3)'
        ]);
        expect(plan.avisos.some(a => a.codigo === 'aplanado')).toBe(false);
    });

    it('si no se pasan montos, cada cuota conserva el suyo y no hay cambios', () => {
        const gastos = armarPlan({ desde: '2026-01', total: 3, montos: [1000, 2000, 3000] });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-01',
            base: 'Auto',
            nuevoTotal: 3
        });

        expect(plan.actualizaciones).toEqual([]);
        expect(plan.avisos).toEqual([]);
    });

    it('si el monto cambió en un plan variable, avisa que se aplana', () => {
        const gastos = armarPlan({ desde: '2026-01', total: 3, montos: [1000, 2000, 3000] });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-01',
            base: 'Auto',
            montos: [5000, 5000, 5000],
            nuevoTotal: 3
        });

        expect(plan.actualizaciones.map(a => a.monto)).toEqual([5000, 5000, 5000]);
        expect(plan.avisos.some(a => a.codigo === 'aplanado')).toBe(true);
    });
});

describe('planificarEdicionPlan: bordes', () => {
    it('devuelve un plan vacío con aviso cuando no hay cuotas en alcance', () => {
        const plan = planificarEdicionPlan({
            cuotasPorMes: {},
            grupoId: 'plan-auto',
            mesActual: '2026-06',
            base: 'Auto',
            montos: [1000],
            nuevoTotal: 3
        });
        expect(plan.actualizaciones).toEqual([]);
        expect(plan.altas).toEqual([]);
        expect(plan.bajas).toEqual([]);
        expect(plan.avisos.some(a => a.codigo === 'sin-cuotas-en-alcance')).toBe(true);
    });

    it('rechaza un total menor a 1 con aviso', () => {
        const gastos = armarPlan({ desde: '2026-01', total: 3 });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-01',
            base: 'Auto',
            nuevoTotal: 0
        });
        expect(plan.avisos.some(a => a.codigo === 'total-invalido')).toBe(true);
    });

    it('deriva la base del concepto si no se pasa', () => {
        const gastos = armarPlan({ desde: '2026-01', total: 2, monto: 1000 });
        const plan = planificarEdicionPlan({
            cuotasPorMes: gastos,
            grupoId: 'plan-auto',
            mesActual: '2026-01',
            base: '',
            montos: [1000, 1000],
            nuevoTotal: 2
        });
        // Sin cambios: no hay actualizaciones, pero tampoco excepción.
        expect(plan.actualizaciones).toEqual([]);
    });
});
