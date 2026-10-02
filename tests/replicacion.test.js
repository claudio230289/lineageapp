import { describe, it, expect } from 'vitest';
import {
    claveIngreso,
    ingresosEquivalentes,
    planificarReplicacion,
    aplicarPlan
} from '../js/negocio/replicacion.js';

/* =========================================================
   Tests de la replicación de ingresos.

   El requisito central es la idempotencia: pulsar el botón dos
   veces seguidas no puede duplicar ingresos. Y si el mes destino
   ya tiene datos, hay que detectar el conflicto y exigir
   confirmación, no decidirlo por código.
   ========================================================= */

const SUELDO = { id: 'a', concepto: 'Sueldo', tipo: 'Basico', modo: 'importe', valor: 1000000 };
const AGUINALDO = { id: 'b', concepto: 'Aguinaldo', tipo: 'NoRemunerativo', modo: 'importe', valor: 500000 };

const crearDb = () => ({
    ingresos: { '2026-10': [{ ...SUELDO }, { ...AGUINALDO }] },
    gastos: {}
});

const destinosVacios = (meses) => meses.map(mes => ({ mes, lista: [] }));

describe('claveIngreso', () => {
    it('debe combinar concepto, tipo y modo', () => {
        expect(claveIngreso(SUELDO)).toBe('sueldo|basico|importe');
    });

    it('debe normalizar mayúsculas y tildes', () => {
        expect(claveIngreso({ concepto: 'Alquiler', tipo: 'Fijo', modo: 'importe' }))
            .toBe(claveIngreso({ concepto: 'ALQUILER', tipo: 'fijo', modo: 'ImportE' }));
    });

    it('debe tratar como distintos ingresos que sólo comparten el nombre', () => {
        // Éste es el motivo de usar clave compuesta: "Sueldo" básico y
        // "Sueldo" remunerativo son dos ingresos legítimos y la
        // replicación no puede comerse uno.
        const basico = { concepto: 'Sueldo', tipo: 'Basico', modo: 'importe', valor: 1000000 };
        const rem = { concepto: 'Sueldo', tipo: 'Remunerativo', modo: 'importe', valor: 100000 };
        expect(claveIngreso(basico)).not.toBe(claveIngreso(rem));
    });

    it('debe tolerar entradas vacías', () => {
        expect(claveIngreso(null)).toBe('');
        expect(claveIngreso(undefined)).toBe('');
    });
});

describe('ingresosEquivalentes', () => {
    it('debe considerar equivalentes los mismos valores', () => {
        expect(ingresosEquivalentes(SUELDO, { ...SUELDO, id: 'otro' })).toBe(true);
    });

    it('debe tolerar la diferencia entre string y número', () => {
        expect(ingresosEquivalentes(SUELDO, { ...SUELDO, valor: '1000000' })).toBe(true);
    });

    it('debe detectar diferencia de importe', () => {
        expect(ingresosEquivalentes(SUELDO, { ...SUELDO, valor: 1200000 })).toBe(false);
    });

    it('debe tolerar diferencias de un centavo', () => {
        expect(ingresosEquivalentes(SUELDO, { ...SUELDO, valor: 1000000.004 })).toBe(true);
    });
});

describe('planificarReplicacion', () => {
    it('debe generar altas para cada mes destino vacío', () => {
        const plan = planificarReplicacion({
            origen: [SUELDO, AGUINALDO],
            destinos: destinosVacios(['2026-11', '2026-12'])
        });

        expect(plan.meses).toHaveLength(2);
        expect(plan.resumen.totalAltas).toBe(4);
        expect(plan.resumen.mesesAModificar).toBe(2);
        expect(plan.vacio).toBe(false);
        expect(plan.requiereConfirmacion).toBe(false);
    });

    it('debe asignar IDs nuevos y únicos a cada alta', () => {
        const plan = planificarReplicacion({ origen: [SUELDO, AGUINALDO], destinos: destinosVacios(['2026-11', '2026-12']) });
        const ids = plan.meses.flatMap(m => m.altas.map(i => i.id));
        expect(ids).toHaveLength(4);
        expect(new Set(ids).size).toBe(4);
        ids.forEach(id => expect(typeof id).toBe('string'));
    });

    it('IDEMPOTENCIA: replicar dos veces no debe generar nuevas altas', () => {
        const primero = planificarReplicacion({ origen: [SUELDO, AGUINALDO], destinos: destinosVacios(['2026-11']) });
        const yaReplicado = destinosVacios(['2026-11']).map(d => ({ mes: d.mes, lista: primero.meses[0].altas }));
        const segundo = planificarReplicacion({ origen: [SUELDO, AGUINALDO], destinos: yaReplicado });

        expect(segundo.resumen.totalAltas).toBe(0);
        expect(segundo.resumen.totalConflictos).toBe(0);
        expect(segundo.vacio).toBe(true);
    });

    it('debe omitir lo que ya es idéntico', () => {
        const plan = planificarReplicacion({
            origen: [SUELDO],
            destinos: [{ mes: '2026-11', lista: [{ ...SUELDO, id: 'viejo' }] }]
        });
        expect(plan.resumen.totalOmitidos).toBe(1);
        expect(plan.resumen.totalAltas).toBe(0);
    });

    it('debe detectar conflicto cuando el importe difiere', () => {
        const plan = planificarReplicacion({
            origen: [SUELDO],
            destinos: [{ mes: '2026-11', lista: [{ ...SUELDO, id: 'viejo', valor: 900000 }] }]
        });
        expect(plan.resumen.totalConflictos).toBe(1);
        expect(plan.requiereConfirmacion).toBe(true);
        expect(plan.meses[0].conflictos[0]).toMatchObject({ concepto: 'Sueldo', valorOrigen: 1000000, valorExistente: 900000 });
    });

    it('no debe modificar nada al planificar', () => {
        const origen = [{ ...SUELDO }];
        const listaDestino = [{ ...SUELDO, id: 'viejo', valor: 900000 }];
        const destinos = [{ mes: '2026-11', lista: listaDestino }];
        const copiaDestino = JSON.stringify(listaDestino);
        const copiaOrigen = JSON.stringify(origen);

        planificarReplicacion({ origen, destinos });

        expect(JSON.stringify(listaDestino)).toBe(copiaDestino);
        expect(JSON.stringify(origen)).toBe(copiaOrigen);
    });

    it('no debe marcar vacío un plan que sólo tiene conflictos', () => {
        // Regresión: si "vacío" se definiera sólo por las altas, un plan
        // sin altas pero con un importe distinto en el destino cortaría
        // la operación con "nada que hacer" y nunca le preguntaría a la
        // persona si sobreescribe.
        const plan = planificarReplicacion({
            origen: [SUELDO],
            destinos: [{ mes: '2026-11', lista: [{ ...SUELDO, id: 'viejo', valor: 900000 }] }]
        });
        expect(plan.resumen.totalAltas).toBe(0);
        expect(plan.resumen.totalConflictos).toBe(1);
        expect(plan.requiereConfirmacion).toBe(true);
        expect(plan.vacio).toBe(false);
    });

    it('debe marcar vacío sólo cuando no hay altas, ni conflictos, ni cambios', () => {
        const plan = planificarReplicacion({
            origen: [SUELDO],
            destinos: [{ mes: '2026-11', lista: [{ ...SUELDO, id: 'viejo' }] }]
        });
        expect(plan.requiereConfirmacion).toBe(false);
        expect(plan.vacio).toBe(true);
    });

    it('debe tolerar entradas vacías o inválidas', () => {
        expect(() => planificarReplicacion()).not.toThrow();
        expect(planificarReplicacion().meses).toEqual([]);
        expect(planificarReplicacion({ origen: [], destinos: [] }).vacio).toBe(true);
        expect(planificarReplicacion({ origen: null, destinos: null }).meses).toEqual([]);
    });

    it('debe caer en "omitir" si la estrategia no es válida', () => {
        const plan = planificarReplicacion({ origen: [SUELDO], destinos: destinosVacios(['2026-11']), estrategia: 'inventada' });
        expect(plan.estrategia).toBe('omitir');
    });
});

describe('aplicarPlan', () => {
    it('debe agregar los ingresos en cada mes destino', () => {
        const db = crearDb();
        const plan = planificarReplicacion({ origen: db.ingresos['2026-10'], destinos: destinosVacios(['2026-11', '2026-12']) });

        const resultado = aplicarPlan(db, plan);

        expect(resultado).toEqual({ mesesModificados: 2, ingresosAgregados: 4, ingresosSobrescritos: 0 });
        expect(db.ingresos['2026-11']).toHaveLength(2);
        expect(db.ingresos['2026-12']).toHaveLength(2);
        expect(db.ingresos['2026-10']).toHaveLength(2);
    });

    it('IDEMPOTENCIA: aplicar dos veces no duplica nada', () => {
        const db = crearDb();
        const origen = db.ingresos['2026-10'];

        aplicarPlan(db, planificarReplicacion({ origen, destinos: destinosVacios(['2026-11']) }));
        const trasPrimero = db.ingresos['2026-11'].length;

        const segundo = planificarReplicacion({
            origen,
            destinos: [{ mes: '2026-11', lista: db.ingresos['2026-11'] }]
        });
        const resultado = aplicarPlan(db, segundo);

        expect(trasPrimero).toBe(2);
        expect(db.ingresos['2026-11']).toHaveLength(2);
        expect(resultado.ingresosAgregados).toBe(0);
        expect(resultado.mesesModificados).toBe(0);
    });

    it('debe preservar el orden: primero los del mes destino, luego los agregados', () => {
        const db = crearDb();
        db.ingresos['2026-11'] = [{ id: 'previo', concepto: 'Extra', tipo: 'Remunerativo', modo: 'importe', valor: 50000 }];

        aplicarPlan(db, planificarReplicacion({ origen: db.ingresos['2026-10'], destinos: [{ mes: '2026-11', lista: db.ingresos['2026-11'] }] }));

        expect(db.ingresos['2026-11'][0].concepto).toBe('Extra');
        expect(db.ingresos['2026-11']).toHaveLength(3);
    });

    it('con "fusionar" debe conservar el importe existente en conflicto', () => {
        const db = crearDb();
        db.ingresos['2026-11'] = [{ id: 'previo', concepto: 'Sueldo', tipo: 'Basico', modo: 'importe', valor: 900000 }];

        const plan = planificarReplicacion({
            origen: db.ingresos['2026-10'],
            destinos: [{ mes: '2026-11', lista: db.ingresos['2026-11'] }],
            estrategia: 'fusionar'
        });
        const resultado = aplicarPlan(db, plan);

        expect(db.ingresos['2026-11'].find(i => i.concepto === 'Sueldo').valor).toBe(900000);
        expect(resultado.ingresosSobrescritos).toBe(0);
    });

    it('con "sobrescribir" debe reemplazar el importe en conflicto sin duplicarlo', () => {
        const db = crearDb();
        db.ingresos['2026-11'] = [{ id: 'previo', concepto: 'Sueldo', tipo: 'Basico', modo: 'importe', valor: 900000 }];

        const plan = planificarReplicacion({
            origen: db.ingresos['2026-10'],
            destinos: [{ mes: '2026-11', lista: db.ingresos['2026-11'] }],
            estrategia: 'sobrescribir'
        });
        const resultado = aplicarPlan(db, plan);

        const sueldos = db.ingresos['2026-11'].filter(i => i.concepto === 'Sueldo');
        expect(sueldos).toHaveLength(1);
        expect(sueldos[0].valor).toBe(1000000);
        expect(resultado.ingresosSobrescritos).toBe(1);
    });

    it('debe seguir siendo idempotente después de sobrescribir', () => {
        const db = crearDb();
        db.ingresos['2026-11'] = [{ id: 'previo', concepto: 'Sueldo', tipo: 'Basico', modo: 'importe', valor: 900000 }];
        const origen = db.ingresos['2026-10'];

        aplicarPlan(db, planificarReplicacion({ origen, destinos: [{ mes: '2026-11', lista: db.ingresos['2026-11'] }], estrategia: 'sobrescribir' }));
        const segundo = planificarReplicacion({ origen, destinos: [{ mes: '2026-11', lista: db.ingresos['2026-11'] }] });

        expect(segundo.vacio).toBe(true);
        expect(db.ingresos['2026-11'].filter(i => i.concepto === 'Sueldo')).toHaveLength(1);
    });

    it('no debe crear el mes destino si no hay nada que aplicar', () => {
        const db = crearDb();
        const plan = planificarReplicacion({ origen: [], destinos: destinosVacios(['2026-11']) });
        aplicarPlan(db, plan);
        expect(db.ingresos['2026-11']).toBeUndefined();
    });

    it('debe tolerar una base sin la propiedad ingresos', () => {
        const db = {};
        const resultado = aplicarPlan(db, planificarReplicacion({ origen: [SUELDO], destinos: destinosVacios(['2026-11']) }));
        expect(resultado.ingresosAgregados).toBe(1);
        expect(db.ingresos['2026-11']).toHaveLength(1);
    });

    it('debe tolerar entradas inválidas', () => {
        expect(aplicarPlan(null, null)).toEqual({ mesesModificados: 0, ingresosAgregados: 0, ingresosSobrescritos: 0 });
    });
});
