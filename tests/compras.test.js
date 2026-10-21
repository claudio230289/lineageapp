import { describe, it, expect } from 'vitest';
import {
    crearItemCompra,
    calcularTotalesCompras,
    toggleItemComprado,
    editarItemCompra,
    eliminarItemCompra,
    limpiarComprados,
    filtrarCompras,
    prepararGastoDesdeCompras,
    CATEGORIAS_PREDETERMINADAS,
    obtenerCategoriasDisponibles,
    agregarCategoriaPersonalizada,
    agruparComprasPorCategoria,
    obtenerMetadatosCategoria,
    obtenerComprasDesdeDb,
    sincronizarComprasEnDb,
    sincronizarCategoriasEnDb
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

    describe('Categorías Predeterminadas y Personalizadas', () => {
        it('debe definir las 7 categorías predeterminadas estándar de Fase 2', () => {
            expect(CATEGORIAS_PREDETERMINADAS).toEqual([
                'Supermercado',
                'Verdulería',
                'Carnicería',
                'Farmacia',
                'Hogar',
                'Limpieza',
                'Otros'
            ]);
        });

        it('obtenerCategoriasDisponibles debe combinar predeterminadas, personalizadas y de ítems sin duplicar', () => {
            const personalizadas = ['Dietética', 'Ferretería', 'supermercado'];
            const items = [
                { nombre: 'Manzana', categoria: 'Verdulería' },
                { nombre: 'Café de especialidad', categoria: 'Tostaduría' }
            ];

            const resultado = obtenerCategoriasDisponibles(personalizadas, items);

            expect(resultado).toContain('Supermercado');
            expect(resultado).toContain('Dietética');
            expect(resultado).toContain('Ferretería');
            expect(resultado).toContain('Tostaduría');
            // No debe duplicar 'supermercado'
            const ocurrenciasSuper = resultado.filter(c => c.toLowerCase() === 'supermercado');
            expect(ocurrenciasSuper.length).toBe(1);
        });

        it('agregarCategoriaPersonalizada debe agregar una nueva categoría limpia', () => {
            const actuales = ['Dietética'];
            const res = agregarCategoriaPersonalizada(actuales, '  Bebidas  ');

            expect(res.exito).toBe(true);
            expect(res.categoria).toBe('Bebidas');
            expect(res.categorias).toEqual(['Dietética', 'Bebidas']);
            expect(res.yaExistia).toBe(false);
        });

        it('agregarCategoriaPersonalizada no debe duplicar categorías existentes (case-insensitive)', () => {
            const actuales = ['Bebidas'];
            const res = agregarCategoriaPersonalizada(actuales, 'bebidas');

            expect(res.exito).toBe(true);
            expect(res.categoria).toBe('Bebidas');
            expect(res.categorias).toEqual(['Bebidas']);
            expect(res.yaExistia).toBe(true);
        });

        it('agregarCategoriaPersonalizada debe rechazar nombres vacíos', () => {
            const res = agregarCategoriaPersonalizada(['Bebidas'], '   ');
            expect(res.exito).toBe(false);
            expect(res.error).toBeDefined();
        });
    });

    describe('Agrupación por Categorías y Subtotales (Acordeones)', () => {
        const lista = [
            { id: '1', nombre: 'Carne picada', categoria: 'Carnicería', precioEstimado: 4000, comprado: true },
            { id: '2', nombre: 'Bife de chorizo', categoria: 'Carnicería', precioEstimado: 6000, comprado: false },
            { id: '3', nombre: 'Leche', categoria: 'Supermercado', precioEstimado: 1200, comprado: true },
            { id: '4', nombre: 'Yogur', categoria: 'Supermercado', precioEstimado: 1800, comprado: true },
            { id: '5', nombre: 'Galletitas', categoria: 'Supermercado', precioEstimado: 1500, comprado: false },
            { id: '6', nombre: 'Pilas', precioEstimado: 2000, comprado: false } // sin categoría explícita
        ];

        it('debe agrupar los ítems por categoría correctamente', () => {
            const grupos = agruparComprasPorCategoria(lista);

            expect(grupos.length).toBe(3); // Carnicería, Supermercado, Otros
            const nombresGrupos = grupos.map(g => g.categoria);
            expect(nombresGrupos).toContain('Carnicería');
            expect(nombresGrupos).toContain('Supermercado');
            expect(nombresGrupos).toContain('Otros');
        });

        it('debe calcular los subtotales exactos por categoría', () => {
            const grupos = agruparComprasPorCategoria(lista);
            const carniceria = grupos.find(g => g.categoria === 'Carnicería');
            const superm = grupos.find(g => g.categoria === 'Supermercado');
            const otros = grupos.find(g => g.categoria === 'Otros');

            // Carnicería: 1 comprado ($4000), 1 pendiente ($6000) => Total $10.000
            expect(carniceria.totalEstimado).toBe(10000);
            expect(carniceria.totalComprados).toBe(4000);
            expect(carniceria.totalPendiente).toBe(6000);
            expect(carniceria.cantidadTotal).toBe(2);
            expect(carniceria.cantidadComprados).toBe(1);
            expect(carniceria.cantidadPendientes).toBe(1);

            // Supermercado: 2 comprados ($3000), 1 pendiente ($1500) => Total $4.500
            expect(superm.totalEstimado).toBe(4500);
            expect(superm.totalComprados).toBe(3000);
            expect(superm.totalPendiente).toBe(1500);
            expect(superm.cantidadTotal).toBe(3);
            expect(superm.cantidadComprados).toBe(2);
            expect(superm.cantidadPendientes).toBe(1);

            // Otros: 1 pendiente ($2000)
            expect(otros.totalEstimado).toBe(2000);
            expect(otros.totalComprados).toBe(0);
            expect(otros.totalPendiente).toBe(2000);
            expect(otros.cantidadTotal).toBe(1);
        });

        it('debe devolver array vacío si la lista de ítems es inválida o vacía', () => {
            expect(agruparComprasPorCategoria([])).toEqual([]);
            expect(agruparComprasPorCategoria(null)).toEqual([]);
        });
    });

    describe('Metadatos Visuales de Categorías', () => {
        it('debe devolver íconos y badges adecuados para cada categoría clave', () => {
            const superMeta = obtenerMetadatosCategoria('Supermercado');
            expect(superMeta.icono).toContain('basket');
            expect(superMeta.colorBadge).toContain('emerald');

            const carniceriaMeta = obtenerMetadatosCategoria('Carnicería');
            expect(carniceriaMeta.icono).toContain('drumstick');
            expect(carniceriaMeta.colorBadge).toContain('rose');

            const farmaciaMeta = obtenerMetadatosCategoria('Farmacia');
            expect(farmaciaMeta.icono).toContain('pills');

            const customMeta = obtenerMetadatosCategoria('Varios');
            expect(customMeta.icono).toContain('tag');
        });
    });

    describe('Persistencia y Sincronización en db.compras y db.comprasCategorias', () => {
        it('sincronizarComprasEnDb debe asignar la lista a db.compras de forma segura', () => {
            const fakeDb = { dolar: 1250 };
            const lista = [{ id: '1', nombre: 'Pan', precioEstimado: 500 }];

            const resultado = sincronizarComprasEnDb(fakeDb, lista);
            expect(fakeDb.compras).toEqual(lista);
            expect(resultado).toBe(fakeDb.compras);
        });

        it('sincronizarComprasEnDb debe tolerar listas no array', () => {
            const fakeDb = {};
            sincronizarComprasEnDb(fakeDb, null);
            expect(fakeDb.compras).toEqual([]);
        });

        it('obtenerComprasDesdeDb debe leer de db.compras si existe o devolver fallback', () => {
            const fakeDbConCompras = { compras: [{ id: 'x', nombre: 'Café' }] };
            expect(obtenerComprasDesdeDb(fakeDbConCompras)).toEqual([{ id: 'x', nombre: 'Café' }]);

            const fakeDbVacia = {};
            expect(obtenerComprasDesdeDb(fakeDbVacia, [{ id: 'fb' }])).toEqual([{ id: 'fb' }]);
        });

        it('sincronizarCategoriasEnDb debe guardar categorías personalizadas en db.comprasCategorias', () => {
            const fakeDb = {};
            sincronizarCategoriasEnDb(fakeDb, ['Electrónica', 'Bebidas']);
            expect(fakeDb.comprasCategorias).toEqual(['Electrónica', 'Bebidas']);
        });
    });
});
