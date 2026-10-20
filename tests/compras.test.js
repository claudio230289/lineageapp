import { describe, it, expect } from 'vitest';
import {
    crearItemCompra,
    calcularTotalesCompras,
    toggleItemComprado,
    editarItemCompra,
    eliminarItemCompra,
    limpiarComprados,
    filtrarCompras,
    prepararGastoDesdeCompras
} from '../js/compras/nucleo.js';

describe('Módulo de Compras: Lógica de Núcleo (js/compras/nucleo.js)', () => {

    describe('crearItemCompra', () => {
        it('debe crear un ítem válido con valores por defecto', () => {
            const item = crearItemCompra({ nombre: 'Leche' });
            expect(item.nombre).toBe('Leche');
            expect(item.cantidad).toBe('1 u');
            expect(item.precioEstimado).toBe(0);
            expect(item.categoria).toBe('Supermercado');
            expect(item.comprado).toBe(false);
            expect(item.id).toMatch(/^compra_/);
            expect(item.fecha).toBeDefined();
        });

        it('debe normalizar precios pasados como string con formato local', () => {
            const item = crearItemCompra({
                nombre: 'Carne',
                precioEstimado: '4.500,50',
                cantidad: '1.5 kg',
                categoria: 'Carnicería'
            });
            expect(item.nombre).toBe('Carne');
            expect(item.precioEstimado).toBe(4500.5);
            expect(item.cantidad).toBe('1.5 kg');
            expect(item.categoria).toBe('Carnicería');
        });

        it('debe lanzar error si el nombre está vacío', () => {
            expect(() => crearItemCompra({ nombre: '   ' })).toThrow(
                'El nombre o artículo de la compra es obligatorio.'
            );
        });
    });

    describe('calcularTotalesCompras', () => {
        it('debe calcular correctamente los totales para lista mixta', () => {
            const items = [
                { id: '1', nombre: 'Pan', precioEstimado: 1000, comprado: true },
                { id: '2', nombre: 'Leche', precioEstimado: 1500, comprado: true },
                { id: '3', nombre: 'Café', precioEstimado: 3500, comprado: false }
            ];

            const res = calcularTotalesCompras(items);
            expect(res.totalEstimado).toBe(6000);
            expect(res.totalComprados).toBe(2500);
            expect(res.totalPendiente).toBe(3500);
            expect(res.cantidadTotal).toBe(3);
            expect(res.cantidadComprados).toBe(2);
            expect(res.cantidadPendientes).toBe(1);
            expect(res.porcentajeCompletado).toBe(67);
        });

        it('debe devolver ceros si la lista está vacía o es inválida', () => {
            const res = calcularTotalesCompras([]);
            expect(res.totalEstimado).toBe(0);
            expect(res.totalComprados).toBe(0);
            expect(res.totalPendiente).toBe(0);
            expect(res.cantidadTotal).toBe(0);
            expect(res.porcentajeCompletado).toBe(0);
        });
    });

    describe('toggleItemComprado', () => {
        it('debe alternar el estado de comprado a true y false', () => {
            const items = [
                { id: 'a', nombre: 'Manzanas', comprado: false },
                { id: 'b', nombre: 'Peras', comprado: true }
            ];

            const paso1 = toggleItemComprado(items, 'a');
            expect(paso1.find(i => i.id === 'a').comprado).toBe(true);

            const paso2 = toggleItemComprado(paso1, 'a');
            expect(paso2.find(i => i.id === 'a').comprado).toBe(false);
        });
    });

    describe('editarItemCompra', () => {
        it('debe modificar sólo el ítem indicado sin mutar los demás', () => {
            const items = [
                { id: '1', nombre: 'Yogur', precioEstimado: 500, cantidad: '1 u', categoria: 'Supermercado' },
                { id: '2', nombre: 'Queso', precioEstimado: 2000, cantidad: '500 g', categoria: 'Supermercado' }
            ];

            const editado = editarItemCompra(items, '1', {
                nombre: 'Yogur Firme',
                precioEstimado: '650',
                cantidad: '2 u'
            });

            expect(editado[0].nombre).toBe('Yogur Firme');
            expect(editado[0].precioEstimado).toBe(650);
            expect(editado[0].cantidad).toBe('2 u');
            expect(editado[1].nombre).toBe('Queso');
        });
    });

    describe('eliminarItemCompra y limpiarComprados', () => {
        it('debe eliminar un ítem específico por id', () => {
            const items = [
                { id: '1', nombre: 'Arroz' },
                { id: '2', nombre: 'Fideos' }
            ];
            const resultado = eliminarItemCompra(items, '1');
            expect(resultado.length).toBe(1);
            expect(resultado[0].id).toBe('2');
        });

        it('limpiarComprados debe conservar sólo los ítems no comprados', () => {
            const items = [
                { id: '1', nombre: 'Item 1', comprado: true },
                { id: '2', nombre: 'Item 2', comprado: false },
                { id: '3', nombre: 'Item 3', comprado: true }
            ];
            const resultado = limpiarComprados(items);
            expect(resultado.length).toBe(1);
            expect(resultado[0].id).toBe('2');
        });
    });

    describe('filtrarCompras', () => {
        const lista = [
            { id: '1', nombre: 'Aspirina', categoria: 'Farmacia', comprado: false, cantidad: '1 caja' },
            { id: '2', nombre: 'Detergente', categoria: 'Hogar y Limpieza', comprado: true, cantidad: '1 botella' },
            { id: '3', nombre: 'Alcohol', categoria: 'Farmacia', comprado: true, cantidad: '500 ml' }
        ];

        it('debe filtrar por texto parcial en nombre o categoría', () => {
            const res = filtrarCompras(lista, { texto: 'deter' });
            expect(res.length).toBe(1);
            expect(res[0].id).toBe('2');
        });

        it('debe filtrar por estado (pendientes y comprados)', () => {
            const pendientes = filtrarCompras(lista, { filtroEstado: 'pendientes' });
            expect(pendientes.length).toBe(1);
            expect(pendientes[0].id).toBe('1');

            const comprados = filtrarCompras(lista, { filtroEstado: 'comprados' });
            expect(comprados.length).toBe(2);
        });

        it('debe filtrar por categoría específica', () => {
            const farmacia = filtrarCompras(lista, { categoria: 'Farmacia' });
            expect(farmacia.length).toBe(2);
        });
    });

    describe('prepararGastoDesdeCompras: Integración con Gastos de Finanzas', () => {
        it('debe consolidar los ítems comprados en un gasto único', () => {
            const lista = [
                { id: '1', nombre: 'Leche', precioEstimado: 1200, comprado: true },
                { id: '2', nombre: 'Pan', precioEstimado: 800, comprado: true },
                { id: '3', nombre: 'Carne', precioEstimado: 5000, comprado: false }
            ];

            const plan = prepararGastoDesdeCompras(lista, {
                concepto: 'Supermercado Coto',
                soloComprados: true
            });

            expect(plan.valido).toBe(true);
            expect(plan.montoTotal).toBe(2000);
            expect(plan.concepto).toBe('Supermercado Coto');
            expect(plan.cantidadItems).toBe(2);
            expect(plan.itemsTransferidos.length).toBe(2);
        });

        it('debe rechazar la operación si no hay ítems comprados', () => {
            const lista = [
                { id: '1', nombre: 'Carne', precioEstimado: 5000, comprado: false }
            ];

            const plan = prepararGastoDesdeCompras(lista, { soloComprados: true });
            expect(plan.valido).toBe(false);
            expect(plan.error).toContain('No hay ningún artículo marcado como comprado');
        });

        it('debe permitir pasar toda la lista si soloComprados es false', () => {
            const lista = [
                { id: '1', nombre: 'Item A', precioEstimado: 1000, comprado: false },
                { id: '2', nombre: 'Item B', precioEstimado: 2500, comprado: false }
            ];

            const plan = prepararGastoDesdeCompras(lista, { soloComprados: false });
            expect(plan.valido).toBe(true);
            expect(plan.montoTotal).toBe(3500);
            expect(plan.cantidadItems).toBe(2);
        });
    });
});
