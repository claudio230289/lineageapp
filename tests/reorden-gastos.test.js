import { describe, it, expect, beforeAll, afterEach, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as acorn from 'acorn';
import { JSDOM } from 'jsdom';
import { esPagado, normalizarCategoria } from '../js/calculos/nucleo.js';
import { coincideId } from '../js/utils/id.js';
import { formatARS } from '../js/utils/formato.js';
import { delegar } from '../js/dom/delegacion.js';

/* =========================================================
   TEST DEL REORDENAMIENTO DE GASTOS Y DEL RENDER INMEDIATO
   =========================================================
   LOS DOS BUGS QUE CUBRE
   ----------------------
   BUG 1 - "el botón de subir al principio no funciona".
   subirGastoAlPrincipio usaba `coincidesId` (con S), un
   identificador que no existe en ningún lado. En un módulo ESM,
   que corre en modo estricto, eso lanza ReferenceError y el clic
   no hace absolutamente nada.

   BUG 2 - "a veces hay que tildar más de una vez para subir o
   bajar un gasto", que tenía tres causas:
     (a) guardarYRenderizar esperaba a la nube ANTES de renderizar.
     (b) el swap se hacía sobre el array, pero la lista se ordena
         por categoría y por estado antes de pintar: mover un
         pendiente por encima de un pagado cambiaba el array y no
         cambiaba la pantalla.
     (c) en móvil, el primer toque sobre un botón dentro de una
         fila draggable a veces se lo quedaba el gesto de arrastre
         y el click se perdía.

   CÓMO SE PRUEBAN
   ---------------
   js/app.js no se puede importar desde Node: arrastra Firebase
   por URL y Chart.js. Entonces se EXTRAEN las funciones del
   fuente real con acorn (parser de verdad, no regex) y se
   ejecutan con `new Function(..., "'use strict'; ...")` y las
   dependencias inyectadas. Corre el código de producción en la
   misma condición en la que apareció el bug original.
   ========================================================= */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUENTE_APP = path.join(RAIZ, 'js', 'app.js');
const FUENTE = readFileSync(FUENTE_APP, 'utf8');

/**
 * Extrae el código fuente de una función por nombre, buscándola
 * en el AST completo del archivo (no con regex sobre el texto).
 *
 * @param {string} nombre
 * @param {'declarada'|'exportada'} tipo
 * @returns {string} Código fuente de la función
 */
function extraerFuncion(nombre, tipo = 'declarada') {
    const ast = acorn.parse(FUENTE, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
    });

    let encontrada = null;
    const visitar = (nodo) => {
        if (!nodo || typeof nodo !== 'object') return;
        const esDeclarada = nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre;
        const esExportada = nodo.type === 'ExportNamedDeclaration'
            && nodo.declaration?.type === 'FunctionDeclaration'
            && nodo.declaration.id?.name === nombre;

        if (esDeclarada && tipo === 'declarada' && !encontrada) encontrada = nodo;
        if (esExportada && tipo === 'exportada' && !encontrada) encontrada = nodo.declaration;

        for (const clave of Object.keys(nodo)) {
            const valor = nodo[clave];
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object' && valor.type) visitar(valor);
        }
    };

    visitar(ast);
    if (!encontrada) throw new Error(`No se encontró la función "${nombre}" (${tipo}) en js/app.js`);
    return FUENTE.slice(encontrada.start, encontrada.end);
}

/**
 * Extrae una declaración de variable de nivel superior del fuente
 * real (por ejemplo, el WeakMap de registro).
 *
 * Hace falta porque `configurarDragDropGastos` ya no funciona sin
 * `dragGastosRegistrado`: si la declaración se reescribiera a mano
 * dentro del test, el test probaría la copia y no el código de
 * producción.
 *
 * @param {string} nombre
 * @returns {string} Código fuente de la declaración
 */
function extraerDeclaracion(nombre) {
    const ast = acorn.parse(FUENTE, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
    });

    let encontrada = null;
    const visitar = (nodo) => {
        if (!nodo || typeof nodo !== 'object') return;
        if (nodo.type === 'VariableDeclaration'
            && nodo.declarations?.some(d => d.id?.name === nombre)
            && !encontrada) {
            encontrada = nodo;
        }
        for (const clave of Object.keys(nodo)) {
            const valor = nodo[clave];
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object' && valor.type) visitar(valor);
        }
    };

    visitar(ast);
    if (!encontrada) throw new Error(`No se encontró la declaración "${nombre}" en js/app.js`);
    return FUENTE.slice(encontrada.start, encontrada.end);
}

/** Réplica fiel de tieneRollover (js/app.rollover.js). */
function tieneRollover(gasto) {
    return !!(gasto && gasto.origenMes);
}

const MES_PRUEBA = '2026-10';

/** Fabrica un gasto con valores sanos y los overrides pedidos. */
const gasto = (id, extra = {}) => ({
    id,
    concepto: `Gasto ${id}`,
    monto: 1000,
    categoria: 'Fijos',
    pagado: false,
    ...extra
});

/** IDs en el orden en que quedaron en el array del mes. */
const ids = (lista) => lista.map(g => g.id);

/* =========================================================
   1. REORDENAMIENTO: código real ejecutado en modo estricto
   ========================================================= */
describe('reordenar gastos: subir / bajar / al principio / al final', () => {
    /** @type {JSDOM} */
    let dom;
    /** @type {HTMLInputElement} */
    let filtroEl;
    /** Base inyectada: los funciones la leen por parámetro. */
    let db;
    /** Espía que reemplaza a guardarYRenderizar. */
    let guardarYRenderizar;
    /** API con las funciones extraídas del fuente real. */
    let api;

    beforeAll(() => {
        dom = new JSDOM('<!doctype html><html><body><input id="filtro-gastos" type="text" value=""></body></html>');
        filtroEl = dom.window.document.getElementById('filtro-gastos');

        const piezas = [
            extraerFuncion('textoFiltroGastos'),
            extraerFuncion('gastosQueCoincidenFiltro'),
            extraerFuncion('ordenarGastosParaVista'),
            extraerFuncion('mismoBloqueVisible'),
            extraerFuncion('aplicarReordenVisible'),
            extraerFuncion('armarMovimientoSimple'),
            extraerFuncion('moverGastoEnOrdenVisible'),
            extraerFuncion('subirGastoUnLugar', 'exportada'),
            extraerFuncion('bajarGastoUnLugar', 'exportada'),
            extraerFuncion('subirGastoAlPrincipio', 'exportada'),
            extraerFuncion('bajarGastoAlFinal', 'exportada')
        ];

        // 'use strict' replica la condición del módulo ESM, que es
        // justo donde un identificador inexistente (coincidesId)
        // lanza ReferenceError en lugar de fallar en silencio.
        const fabrica = new Function(
            'document', 'db', 'obtenerMesActual', 'coincideId',
            'normalizarCategoria', 'esPagado', 'guardarYRenderizar',
            `'use strict';
             ${piezas.join('\n')}
             return {
                 subirGastoUnLugar, bajarGastoUnLugar,
                 subirGastoAlPrincipio, bajarGastoAlFinal,
                 ordenarGastosParaVista, moverGastoEnOrdenVisible
             };`
        );

        db = { mesActivo: MES_PRUEBA, gastos: { [MES_PRUEBA]: [] } };
        const obtenerMesActual = () => db.mesActivo;
        guardarYRenderizar = vi.fn();

        api = fabrica(
            dom.window.document,
            db,
            obtenerMesActual,
            coincideId,
            normalizarCategoria,
            esPagado,
            guardarYRenderizar
        );
    });

    /** Carga la lista del mes y resetea el espía de guardado. */
    const cargar = (lista) => {
        db.gastos[MES_PRUEBA] = lista;
        filtroEl.value = '';
        guardarYRenderizar.mockClear();
        return db.gastos[MES_PRUEBA];
    };

    /** Orden visible real (el que se pinta), calculado por el código de producción. */
    const enPantalla = (lista) => ids(api.ordenarGastosParaVista(lista, filtroEl.value.toLowerCase().trim()));

    it('subirGastoUnLugar intercambia con el vecino visible anterior', () => {
        const lista = cargar([gasto('a'), gasto('b'), gasto('c')]);

        api.subirGastoUnLugar('c');

        expect(ids(lista)).toEqual(['a', 'c', 'b']);
        expect(enPantalla(lista)).toEqual(['a', 'c', 'b']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('bajarGastoUnLugar intercambia con el vecino visible siguiente', () => {
        const lista = cargar([gasto('a'), gasto('b'), gasto('c')]);

        api.bajarGastoUnLugar('a');

        expect(ids(lista)).toEqual(['b', 'a', 'c']);
        expect(enPantalla(lista)).toEqual(['b', 'a', 'c']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('subirGastoAlPrincipio lleva al principio del grupo visible', () => {
        const lista = cargar([gasto('a'), gasto('b'), gasto('c')]);

        api.subirGastoAlPrincipio('c');

        expect(ids(lista)).toEqual(['c', 'a', 'b']);
        expect(enPantalla(lista)).toEqual(['c', 'a', 'b']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('bajarGastoAlFinal lleva al final del grupo visible', () => {
        const lista = cargar([gasto('a'), gasto('b'), gasto('c')]);

        api.bajarGastoAlFinal('a');

        expect(ids(lista)).toEqual(['b', 'c', 'a']);
        expect(enPantalla(lista)).toEqual(['b', 'c', 'a']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('dos llamadas seguidas mueven dos posiciones (no es idempotente)', () => {
        const lista = cargar([gasto('a'), gasto('b'), gasto('c')]);

        api.subirGastoUnLugar('c');
        api.subirGastoUnLugar('c');

        expect(ids(lista)).toEqual(['c', 'a', 'b']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(2);
    });

    /* ---------- bordes ---------- */

    it('ya está primero: no cambia nada y no guarda', () => {
        const lista = cargar([gasto('a'), gasto('b'), gasto('c')]);

        api.subirGastoUnLugar('a');
        api.subirGastoAlPrincipio('a');

        expect(ids(lista)).toEqual(['a', 'b', 'c']);
        expect(enPantalla(lista)).toEqual(['a', 'b', 'c']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('ya está último: no cambia nada y no guarda', () => {
        const lista = cargar([gasto('a'), gasto('b'), gasto('c')]);

        api.bajarGastoUnLugar('c');
        api.bajarGastoAlFinal('c');

        expect(ids(lista)).toEqual(['a', 'b', 'c']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('id inexistente: no lanza, no cambia nada y no guarda', () => {
        const lista = cargar([gasto('a'), gasto('b')]);

        expect(() => api.subirGastoUnLugar('no-existe')).not.toThrow();
        expect(() => api.bajarGastoUnLugar('no-existe')).not.toThrow();
        expect(() => api.subirGastoAlPrincipio('no-existe')).not.toThrow();
        expect(() => api.bajarGastoAlFinal('no-existe')).not.toThrow();

        expect(ids(lista)).toEqual(['a', 'b']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('mes sin gastos o gastos no leídos: no lanza', () => {
        cargar([]);
        db.gastos[MES_PRUEBA] = undefined;
        expect(() => api.subirGastoUnLugar('a')).not.toThrow();
        expect(() => api.bajarGastoAlFinal('a')).not.toThrow();
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    /* ---------- orden VISUAL vs orden del array ---------- */

    it('un pagado NO puede subir por encima de un pendiente (no se ve nada)', () => {
        // El render deja los pagados al final del grupo: mover 'g'
        // (pagado) una posición hacia arriba sobre el array no
        // cambiaría nada en pantalla, así que no se mueve.
        const lista = cargar([gasto('p1'), gasto('g', { pagado: true }), gasto('p2')]);

        api.subirGastoUnLugar('g');

        expect(ids(lista)).toEqual(['p1', 'g', 'p2']);
        expect(enPantalla(lista)).toEqual(['p1', 'p2', 'g']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('un pendiente SÍ baja por debajo de otro pendiente aunque haya un pagado en el medio', () => {
        // El array tiene el pagado en el medio, pero en pantalla los
        // pendientes van primero: bajar 'p1' tiene que saltar sobre
        // el pagado del array y dejar a p1 debajo de p2.
        const lista = cargar([gasto('p1'), gasto('g', { pagado: true }), gasto('p2')]);

        api.bajarGastoUnLugar('p1');

        expect(ids(lista)).toEqual(['g', 'p2', 'p1']);
        expect(enPantalla(lista)).toEqual(['p2', 'p1', 'g']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('un pagado no puede subir ni bajar fuera de su grupo', () => {
        // 'g' es el primero de los pagados: subir no lo mueve (no
        // puede aparecer arriba de un pendiente) y bajar sólo podría
        // intercambiar con otro pagado.
        const lista = cargar([gasto('p1'), gasto('p2'), gasto('g', { pagado: true })]);

        api.subirGastoUnLugar('g');

        expect(ids(lista)).toEqual(['p1', 'p2', 'g']);
        expect(enPantalla(lista)).toEqual(['p1', 'p2', 'g']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('"al final" de un pendiente lo deja el último de los pendientes, no del array', () => {
        const lista = cargar([gasto('p1'), gasto('g', { pagado: true }), gasto('p2')]);

        api.bajarGastoAlFinal('p1');

        // p1 queda después de p2 y antes del pagado: es el último
        // pendiente visible. Antes apuntaba al último de la lista y
        // el botón no hacía nada.
        expect(ids(lista)).toEqual(['g', 'p2', 'p1']);
        expect(enPantalla(lista)).toEqual(['p2', 'p1', 'g']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('"al principio" de un pagado lo deja el primero de los pagados', () => {
        const lista = cargar([
            gasto('p1'), gasto('g1', { pagado: true }), gasto('p2'), gasto('g2', { pagado: true })
        ]);

        api.subirGastoAlPrincipio('g2');

        expect(ids(lista)).toEqual(['p1', 'g2', 'g1', 'p2']);
        expect(enPantalla(lista)).toEqual(['p1', 'p2', 'g2', 'g1']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    /* ---------- agrupación por categoría ---------- */

    it('un gasto no se mezcla con otra categoría: subir no hace nada', () => {
        // La lista se pinta en tres bloques (fijos, únicos, cuotas).
        // 'u' ya es el primero de su bloque, así que subirlo sobre
        // el array no cambiaría nada de lo que se ve.
        const lista = cargar([gasto('f', { categoria: 'Fijos' }), gasto('u', { categoria: 'Únicos' })]);

        api.subirGastoUnLugar('u');
        api.subirGastoAlPrincipio('u');

        expect(ids(lista)).toEqual(['f', 'u']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('"al principio" de un fijo lo pone primero de su bloque, no del array', () => {
        const lista = cargar([
            gasto('u1', { categoria: 'Únicos' }),
            gasto('f1', { categoria: 'Fijos' }),
            gasto('u2', { categoria: 'Únicos' }),
            gasto('f2', { categoria: 'Fijos' })
        ]);

        api.subirGastoAlPrincipio('f2');

        expect(ids(lista)).toEqual(['u1', 'f2', 'f1', 'u2']);
        expect(enPantalla(lista)).toEqual(['f2', 'f1', 'u1', 'u2']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('gasto con categoría desconocida (no se dibuja) no se puede mover', () => {
        const lista = cargar([gasto('a'), gasto('x', { categoria: 'Inventada' })]);

        api.subirGastoUnLugar('x');
        api.subirGastoAlPrincipio('x');
        api.bajarGastoAlFinal('x');

        expect(ids(lista)).toEqual(['a', 'x']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    /* ---------- filtro de búsqueda activo ---------- */

    it('con el buscador activo, se mueve respecto del vecino VISIBLE', () => {
        const lista = cargar([
            gasto('luz', { concepto: 'Luz' }),
            gasto('gas', { concepto: 'Gas' }),
            gasto('agua', { concepto: 'Agua' })
        ]);
        filtroEl.value = 'a'; // visibles: gas, agua

        api.subirGastoUnLugar('agua');

        expect(ids(lista)).toEqual(['luz', 'agua', 'gas']);
        expect(enPantalla(lista)).toEqual(['agua', 'gas']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    /* ---------- guardia contra el typo que originó el bug ---------- */

    it('ninguna función usa el identificador coincidesId (typo histórico)', () => {
        // El typo `coincidesId` fue el que dejó muerto el botón
        // "Al principio". Con el código actual, la búsqueda del
        // gasto vive en moverGastoEnOrdenVisible y este test es la
        // red que impide que el nombre vuelva a aparecer.
        expect(FUENTE).not.toMatch(/\bcoincidesId\b/);
    });

    it('todas las funciones de reordenar usan coincideId', () => {
        for (const nombre of ['subirGastoUnLugar', 'bajarGastoUnLugar', 'subirGastoAlPrincipio', 'bajarGastoAlFinal']) {
            const cuerpo = extraerFuncion(nombre, 'exportada');
            expect(cuerpo, nombre).not.toMatch(/coincides/);
        }
        expect(extraerFuncion('moverGastoEnOrdenVisible')).toContain('coincideId(');
    });
});

/* =========================================================
   2. GUARDAR Y RENDERIZAR: la pantalla no espera a la nube
   ========================================================= */
describe('guardarYRenderizar: render inmediato y contrato intacto', () => {
    let guardarYRenderizar;
    let guardarTodo;
    let renderizarTodo;
    let descargarJson;
    /** Resuelve a mano la promesa de la nube cuando el test lo decide. */
    let resolverNube;
    let nubeResuelta;

    beforeAll(() => {
        const src = extraerFuncion('guardarYRenderizar', 'exportada');

        const fabrica = new Function(
            'guardarTodo', 'renderizarCuadriculaMeses', 'renderizarTodo',
            'renderizarGraficoAnual', 'document', 'descargarJson', 'db', 'localStorage',
            `'use strict'; ${src}; return guardarYRenderizar;`
        );

        const db = { mesActivo: MES_PRUEBA, gastos: {} };
        const document = { getElementById: () => null };
        const localStorageFalso = { setItem: vi.fn() };

        nubeResuelta = false;
        guardarTodo = vi.fn(() => new Promise((resolve) => {
            resolverNube = () => {
                nubeResuelta = true;
                resolve({ ok: true, destino: 'nube' });
            };
        }));

        renderizarTodo = vi.fn();
        descargarJson = vi.fn();

        guardarYRenderizar = fabrica(
            guardarTodo, vi.fn(), renderizarTodo,
            vi.fn(), document, descargarJson, db, localStorageFalso
        );
    });

    beforeEach(() => {
        nubeResuelta = false;
        renderizarTodo.mockClear();
        descargarJson.mockClear();
    });

    it('renderiza ANTES de que responda la nube', async () => {
        const promesa = guardarYRenderizar('edicion');

        // En este punto la nube todavía no respondió y el render ya
        // tuvo que haber corrido: eso es exactamente lo que arregla
        // el "hay que tocar dos veces".
        expect(renderizarTodo).toHaveBeenCalledTimes(1);
        expect(nubeResuelta).toBe(false);
        expect(guardarTodo).toHaveBeenCalledWith('edicion');

        resolverNube();
        const resultado = await promesa;

        expect(nubeResuelta).toBe(true);
        expect(resultado).toEqual({ ok: true, destino: 'nube' });
    });

    it('devuelve el resultado de guardarTodo tal cual (contrato del cierre por inactividad)', async () => {
        const fallo = { ok: false, destino: 'local', error: new Error('sin red') };
        guardarTodo.mockReturnValueOnce(Promise.resolve(fallo));

        const promesa = guardarYRenderizar('cierre');
        expect(renderizarTodo).toHaveBeenCalledTimes(1);

        // No rechaza ni disimula: el cierre por inactividad decide
        // con este objeto si el guardado llegó a la nube.
        await expect(promesa).resolves.toBe(fallo);
    });

    it('si el guardado revienta, el error llega al llamador (no se tapa)', async () => {
        // El autoguardado y el cierre por inactividad envuelven la
        // llamada en try/catch: necesitan recibir el fallo, no un
        // resultado vacío que parezca éxito.
        guardarTodo.mockReturnValueOnce(Promise.reject(new Error('boom')));

        await expect(guardarYRenderizar('cierre')).rejects.toThrow('boom');
    });

    it('descarga el JSON sólo en manual/cierre y recién cuando la nube respondió', async () => {
        const promesa = guardarYRenderizar('manual');

        expect(descargarJson).not.toHaveBeenCalled();
        resolverNube();
        await promesa;

        expect(descargarJson).toHaveBeenCalledTimes(1);
        expect(String(descargarJson.mock.calls[0][1])).toMatch(/^cf_.*\.json$/);
    });

    it('una edición común no genera JSON', async () => {
        const promesa = guardarYRenderizar('edicion');
        resolverNube();
        await promesa;
        expect(descargarJson).not.toHaveBeenCalled();
    });
});

/* =========================================================
   3. TOUCH + DRAGGABLE: los botones no deben iniciar arrastre
   ========================================================= */
describe('fila de gasto arrastrable: los botones se pueden tocar', () => {
    let dom;
    let crearItemGasto;
    let configurarDragDropGastos;

    beforeAll(() => {
        dom = new JSDOM('<!doctype html><html><body></body></html>');
        const ventana = dom.window;

        const fabrica = new Function(
            'document', 'escapeHTML', 'esPagado', 'normalizarCategoria',
            'tieneRollover', 'formatARS',
            `'use strict';
             ${extraerDeclaracion('dragGastosRegistrado')}
             ${extraerFuncion('escapeHTML')}
             ${extraerFuncion('crearItemGasto')}
             ${extraerFuncion('configurarDragDropGastos')}
             return { crearItemGasto, configurarDragDropGastos };`
        );

        const api = fabrica(
            ventana.document, undefined, esPagado, normalizarCategoria, tieneRollover, formatARS
        );
        crearItemGasto = api.crearItemGasto;
        configurarDragDropGastos = api.configurarDragDropGastos;
    });

    /** Arma una fila dentro de un contenedor ya conectado al drag & drop. */
    const armarFila = () => {
        const contenedor = dom.window.document.createElement('div');
        dom.window.document.body.appendChild(contenedor);
        configurarDragDropGastos(contenedor);
        const item = crearItemGasto(gasto('g1'));
        contenedor.appendChild(item);
        return { contenedor, item };
    };

    /** Dispara un evento del tipo pedido sobre el elemento. */
    const disparar = (elemento, tipo, dataTransfer) => {
        const evento = new dom.window.Event(tipo, { bubbles: true, cancelable: true });
        if (dataTransfer) evento.dataTransfer = dataTransfer;
        elemento.dispatchEvent(evento);
        return evento;
    };

    it('todos los botones del ítem tienen draggable="false"', () => {
        const { item } = armarFila();
        const botones = [...item.querySelectorAll('button')];

        expect(botones.length).toBeGreaterThan(0);
        for (const boton of botones) {
            expect(boton.getAttribute('draggable')).toBe('false');
        }
    });

    it('la fila sigue siendo arrastrable (el arrastre entre renglones no se rompió)', () => {
        const { item } = armarFila();
        expect(item.draggable).toBe(true);
    });

    it('un gesto que empieza en un botón NO inicia el arrastre', () => {
        const { item } = armarFila();
        const boton = item.querySelector('[data-accion="subir-un-lugar"]');
        const setData = vi.fn();

        // El toque entra por el botón...
        disparar(boton, 'pointerdown');
        // ...y el navegador, queriendo arrastrar la fila, larga el
        // dragstart igual. Tiene que cancelarse para no robarse el
        // click.
        const evento = disparar(boton, 'dragstart', { setData });

        expect(evento.defaultPrevented).toBe(true);
        expect(setData).not.toHaveBeenCalled();
    });

    it('un gesto que empieza en la fila SÍ inicia el arrastre', () => {
        const { item } = armarFila();
        const setData = vi.fn();

        disparar(item, 'pointerdown');
        const evento = disparar(item, 'dragstart', { setData });

        expect(evento.defaultPrevented).toBe(false);
        expect(setData).toHaveBeenCalledWith('text/plain', 'g1');
        expect(item.className).toContain('opacity-50');
    });

    it('un gesto que empieza en el texto del renglón también arrastra', () => {
        const { item } = armarFila();
        const texto = item.querySelector('p');
        const setData = vi.fn();

        disparar(texto, 'pointerdown');
        const evento = disparar(texto, 'dragstart', { setData });

        expect(evento.defaultPrevented).toBe(false);
        expect(setData).toHaveBeenCalledWith('text/plain', 'g1');
    });
});

/* =========================================================
   3.B. DRAG & DROP: los listeners se conectan UNA sola vez
   =========================================================
   configurarDragDropGastos se llama en cada render y los
   contenedores son nodos fijos de index.html. Sin deduplicación,
   cada render sumaba 8 listeners: con 5 renders, un solo drop
   ejecutaba el movimiento 5 veces y escribía 5 veces en
   Firestore, moviendo el gasto 5 posiciones en cascada.

   Estos tests fijan el registro único. El de "un solo drop, un
   solo movimiento" es el que reproduce la auditoría.
   ========================================================= */
describe('drag & drop: una sola registración de listeners por contenedor', () => {
    /** @type {JSDOM} */
    let dom;
    let crearItemGasto;
    let configurarDragDropGastos;
    /** Espía que reemplaza a moverGastoArrastrado. */
    let moverGastoArrastrado;

    beforeAll(() => {
        dom = new JSDOM('<!doctype html><html><body></body></html>');
        const ventana = dom.window;

        const fabrica = new Function(
            'document', 'escapeHTML', 'esPagado', 'normalizarCategoria',
            'tieneRollover', 'formatARS', 'moverGastoArrastrado',
            `'use strict';
             ${extraerDeclaracion('dragGastosRegistrado')}
             ${extraerFuncion('escapeHTML')}
             ${extraerFuncion('crearItemGasto')}
             ${extraerFuncion('configurarDragDropGastos')}
             return { crearItemGasto, configurarDragDropGastos };`
        );

        moverGastoArrastrado = vi.fn();
        const api = fabrica(
            ventana.document, undefined, esPagado, normalizarCategoria,
            tieneRollover, formatARS, moverGastoArrastrado
        );
        crearItemGasto = api.crearItemGasto;
        configurarDragDropGastos = api.configurarDragDropGastos;
    });

    /** Contenedor nuevo con dos filas, conectado `veces` veces. */
    const armarContenedor = (veces = 1) => {
        const contenedor = dom.window.document.createElement('div');
        dom.window.document.body.appendChild(contenedor);
        for (let i = 0; i < veces; i++) configurarDragDropGastos(contenedor);
        contenedor.appendChild(crearItemGasto(gasto('g1')));
        contenedor.appendChild(crearItemGasto(gasto('g2')));
        return contenedor;
    };

    /** Dispara un evento burbujeante sobre el elemento. */
    const disparar = (elemento, tipo, dataTransfer) => {
        const evento = new dom.window.Event(tipo, { bubbles: true, cancelable: true });
        if (dataTransfer) evento.dataTransfer = dataTransfer;
        elemento.dispatchEvent(evento);
        return evento;
    };

    const fila = (contenedor, id) => contenedor.querySelector(`[data-gasto-id="${id}"]`);
    const dataTransferFalso = (arrastrado) => ({ setData: vi.fn(), getData: () => arrastrado });

    it('un solo drop sobre un contenedor renderizado 3 veces mueve UNA sola vez', () => {
        moverGastoArrastrado.mockClear();
        const contenedor = armarContenedor(3);

        // El handler es async, pero la llamada a moverGastoArrastrado
        // ocurre antes del await: la aserción es determinista.
        disparar(fila(contenedor, 'g2'), 'drop', dataTransferFalso('g1'));

        expect(moverGastoArrastrado).toHaveBeenCalledTimes(1);
        expect(moverGastoArrastrado).toHaveBeenCalledWith('g1', 'g2', expect.anything());
    });

    it('con 5 renders (el caso de la auditoría) sigue siendo un solo movimiento', () => {
        moverGastoArrastrado.mockClear();
        const contenedor = armarContenedor(5);

        disparar(fila(contenedor, 'g2'), 'drop', dataTransferFalso('g1'));

        expect(moverGastoArrastrado).toHaveBeenCalledTimes(1);
    });

    it('el dragstart tampoco se duplica: un solo setData por arrastre', () => {
        const contenedor = armarContenedor(3);
        const setData = vi.fn();

        disparar(fila(contenedor, 'g1'), 'pointerdown');
        disparar(fila(contenedor, 'g1'), 'dragstart', { setData });

        // Sin dedup, los 3 handlers registrados escribían el dato 3
        // veces sobre el mismo elemento.
        expect(setData).toHaveBeenCalledTimes(1);
        expect(setData).toHaveBeenCalledWith('text/plain', 'g1');
    });

    it('avisa si conectó o si ya estaba conectado', () => {
        const contenedor = dom.window.document.createElement('div');

        expect(configurarDragDropGastos(contenedor)).toBe(true);
        expect(configurarDragDropGastos(contenedor)).toBe(false);
        expect(configurarDragDropGastos(contenedor)).toBe(false);
    });

    it('el registro es por contenedor: cada lista se conecta independiente', () => {
        const contA = dom.window.document.createElement('div');
        const contB = dom.window.document.createElement('div');

        expect(configurarDragDropGastos(contA)).toBe(true);
        expect(configurarDragDropGastos(contB)).toBe(true);
        expect(configurarDragDropGastos(contA)).toBe(false);

        // El drop sigue funcionando en los dos: el dedup no apagó
        // ninguno por error.
        moverGastoArrastrado.mockClear();
        contA.appendChild(crearItemGasto(gasto('a1')));
        contA.appendChild(crearItemGasto(gasto('a2')));
        contB.appendChild(crearItemGasto(gasto('b1')));
        contB.appendChild(crearItemGasto(gasto('b2')));
        disparar(fila(contA, 'a2'), 'drop', dataTransferFalso('a1'));
        disparar(fila(contB, 'b2'), 'drop', dataTransferFalso('b1'));

        expect(moverGastoArrastrado).toHaveBeenCalledTimes(2);
    });

    it('con un contenedor inválido no lanza', () => {
        expect(() => configurarDragDropGastos(null)).not.toThrow();
        expect(configurarDragDropGastos(null)).toBe(false);
    });

    it('tras varias registraciones, el gesto sobre un botón sigue cancelando el arrastre', () => {
        const contenedor = armarContenedor(3);
        const boton = fila(contenedor, 'g1').querySelector('[data-accion="subir-un-lugar"]');
        const setData = vi.fn();

        disparar(boton, 'pointerdown');
        const evento = disparar(boton, 'dragstart', { setData });

        expect(evento.defaultPrevented).toBe(true);
        expect(setData).not.toHaveBeenCalled();
    });

    it('tras varias registraciones, arrastrar desde la fila sigue funcionando', () => {
        const contenedor = armarContenedor(3);
        const setData = vi.fn();

        disparar(fila(contenedor, 'g1'), 'pointerdown');
        const evento = disparar(fila(contenedor, 'g1'), 'dragstart', { setData });

        expect(evento.defaultPrevented).toBe(false);
        expect(setData).toHaveBeenCalledTimes(1);
        expect(fila(contenedor, 'g1').className).toContain('opacity-50');
    });

    it('un drop sobre la misma fila no mueve nada', () => {
        moverGastoArrastrado.mockClear();
        const contenedor = armarContenedor(2);

        disparar(fila(contenedor, 'g1'), 'drop', dataTransferFalso('g1'));

        expect(moverGastoArrastrado).not.toHaveBeenCalled();
    });
});

/* =========================================================
   3.C. ARRASTRAR Y SOLTAR: coloca en el ORDEN VISIBLE
   =========================================================
   El drop mide sobre el orden que la persona ve en pantalla, no
   sobre el orden del array. La pantalla agrupa por categoría y
   manda pasados y pagados al final, así que un swap sobre el array
   crudo entre ítems de distinto bloque cambiaba los datos y no
   cambiaba la pantalla: el arrastre "no hacía nada".

   Regla, la misma que los botones de subir/bajar: sólo se mueve
   dentro del mismo bloque visible (misma categoría + mismo estado).
   Si el drop cruza bloques, no-op.

   Los bordes de clientY se conservan: cliente === 0 es un drop
   válido, pegado al borde superior de la ventana.
   ========================================================= */
describe('moverGastoArrastrado: coloca en el orden visible', () => {
    let dom;
    let moverGastoArrastrado;
    let db;
    let guardarYRenderizar;
    /** @type {HTMLInputElement} */
    let filtroEl;
    /** API con las funciones extraídas, para calcular el orden visible. */
    let apiOrden;
    const MES = '2026-10';

    beforeAll(() => {
        // El buscador forma parte del cálculo: con filtro activo, el
        // orden visible es el del subconjunto que se ve.
        dom = new JSDOM('<!doctype html><html><body><input id="filtro-gastos" type="text" value=""></body></html>');
        filtroEl = dom.window.document.getElementById('filtro-gastos');

        const piezas = [
            extraerFuncion('textoFiltroGastos'),
            extraerFuncion('gastosQueCoincidenFiltro'),
            extraerFuncion('ordenarGastosParaVista'),
            extraerFuncion('mismoBloqueVisible'),
            extraerFuncion('aplicarReordenVisible'),
            extraerFuncion('armarInsercionVisible'),
            extraerFuncion('soltoEnMitadSuperior'),
            extraerFuncion('moverGastoArrastrado')
        ];

        const fabrica = new Function(
            'document', 'db', 'obtenerMesActual', 'guardarYRenderizar',
            'coincideId', 'normalizarCategoria', 'esPagado',
            `'use strict';
             ${piezas.join('\n')}
             return { moverGastoArrastrado, ordenarGastosParaVista };`
        );

        db = { gastos: { [MES]: [] } };
        guardarYRenderizar = vi.fn();
        apiOrden = fabrica(
            dom.window.document, db, () => MES, guardarYRenderizar,
            coincideId, normalizarCategoria, esPagado
        );
        moverGastoArrastrado = apiOrden.moverGastoArrastrado;
    });

    /** Fila con geometría conocida: arranca en y=0 y mide 100px. */
    const fila = (id) => {
        const el = dom.window.document.createElement('div');
        el.dataset.gastoId = id;
        el.getBoundingClientRect = () => ({ top: 0, height: 100 });
        return el;
    };

    /** Evento de drop simulado sobre el renglón del destino. */
    const drop = (clientY, idDestino) => ({
        clientY,
        preventDefault: () => {},
        target: fila(idDestino),
        currentTarget: null
    });

    /** Carga la lista y ejecuta el arrastre. Devuelve el orden del array. */
    const ejecutar = async (lista, idOrigen, idDestino, clientY) => {
        db.gastos[MES] = lista;
        filtroEl.value = '';
        guardarYRenderizar.mockClear();
        await moverGastoArrastrado(idOrigen, idDestino, drop(clientY, idDestino));
        return ids(db.gastos[MES]);
    };

    /** Orden visible actual, calculado por el código de producción. */
    const enPantalla = () => ids(apiOrden.ordenarGastosParaVista(
        db.gastos[MES], filtroEl.value.toLowerCase().trim()
    ));

    /* ---------- bordes de clientY (cobertura que ya existía) ---------- */

    it('clientY === 0 (borde superior de la ventana) inserta ANTES', async () => {
        // Soltar sobre la mitad de arriba de g1 tiene que dejar a g3
        // por encima de g1. Con la prueba truthy (`e.clientY &&`) esto
        // caía al else y lo dejaba por debajo.
        const lista = [gasto('g1'), gasto('g2'), gasto('g3')];
        expect(await ejecutar(lista, 'g3', 'g1', 0)).toEqual(['g3', 'g1', 'g2']);
        expect(enPantalla()).toEqual(['g3', 'g1', 'g2']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('la mitad de abajo del renglón inserta DESPUÉS', async () => {
        const lista = [gasto('g1'), gasto('g2'), gasto('g3')];
        expect(await ejecutar(lista, 'g3', 'g1', 80)).toEqual(['g1', 'g3', 'g2']);
        expect(enPantalla()).toEqual(['g1', 'g3', 'g2']);
    });

    it('el límite exacto de la mitad queda documentado', async () => {
        // (clientY - top) < height/2: 49 < 50 es "antes", 50 < 50 es
        // falso, así que la mitad exacta cae para el lado de
        // "después". Se fija acá para que un cambio de comparación
        // no pase desapercibido.
        const lista = [gasto('g1'), gasto('g2'), gasto('g3')];
        expect(await ejecutar(lista, 'g3', 'g1', 49)).toEqual(['g3', 'g1', 'g2']);
        expect(await ejecutar([gasto('g1'), gasto('g2'), gasto('g3')], 'g3', 'g1', 50))
            .toEqual(['g1', 'g3', 'g2']);
    });

    it('sin clientY (null o undefined) inserta después, como antes', async () => {
        const lista = [gasto('g1'), gasto('g2'), gasto('g3')];
        expect(await ejecutar(lista, 'g3', 'g1', undefined)).toEqual(['g1', 'g3', 'g2']);
        expect(await ejecutar([gasto('g1'), gasto('g2'), gasto('g3')], 'g3', 'g1', null))
            .toEqual(['g1', 'g3', 'g2']);
    });

    it('un id que no existe no mueve nada ni guarda', async () => {
        const lista = [gasto('g1'), gasto('g2')];
        expect(await ejecutar(lista, 'g1', 'no-existe', 0)).toEqual(['g1', 'g2']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    /* ---------- no-ops del modelo visible ---------- */

    it('soltar sobre la misma fila no hace nada', async () => {
        const lista = [gasto('g1'), gasto('g2')];
        expect(await ejecutar(lista, 'g1', 'g1', 0)).toEqual(['g1', 'g2']);
        expect(await ejecutar([gasto('g1'), gasto('g2')], 'g1', 'g1', 80)).toEqual(['g1', 'g2']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('cruzar de pendiente a pagado es no-op (el cambio no se vería)', async () => {
        // Antes esto cambiaba el array y la pantalla no se movía: el
        // usuario veía que arrastrar "no funcionaba".
        const lista = [gasto('p1'), gasto('g', { pagado: true }), gasto('p2')];
        expect(await ejecutar(lista, 'p2', 'g', 0)).toEqual(['p1', 'g', 'p2']);
        expect(await ejecutar([gasto('p1'), gasto('g', { pagado: true }), gasto('p2')], 'g', 'p1', 0))
            .toEqual(['p1', 'g', 'p2']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('arrastrar un pendiente sobre el pagado del final es no-op', async () => {
        // Acá la guarda de bloque es la que decide. Sin ella, el
        // algoritmo colocaba a p1 "antes del pagado" en el orden
        // visible, que en la práctica lo bajaba un lugar entre los
        // pendientes: un movimiento que nadie pidió y que sólo se
        // entiende sabiendo cómo ordena el render.
        const lista = [gasto('p1'), gasto('p2'), gasto('g', { pagado: true })];
        expect(await ejecutar(lista, 'p1', 'g', 0)).toEqual(['p1', 'p2', 'g']);
        expect(await ejecutar([gasto('p1'), gasto('p2'), gasto('g', { pagado: true })], 'p1', 'g', 80))
            .toEqual(['p1', 'p2', 'g']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('cruzar de pagado a pendiente es no-op', async () => {
        const lista = [gasto('p1'), gasto('p2'), gasto('g', { pagado: true })];
        expect(await ejecutar(lista, 'g', 'p2', 0)).toEqual(['p1', 'p2', 'g']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('cruzar de categoría es no-op', async () => {
        const f1 = gasto('f1', { categoria: 'Fijos' });
        const u1 = gasto('u1', { categoria: 'Únicos' });
        expect(await ejecutar([f1, u1], 'u1', 'f1', 0)).toEqual(['f1', 'u1']);
        expect(await ejecutar([u1, f1], 'f1', 'u1', 0)).toEqual(['u1', 'f1']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('un gasto con categoría desconocida (no se dibuja) no se mueve', async () => {
        const lista = [gasto('a'), gasto('x', { categoria: 'Inventada' })];
        expect(await ejecutar(lista, 'x', 'a', 0)).toEqual(['a', 'x']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    it('si el movimiento no cambia lo que se ve, no toca el array ni guarda', async () => {
        // f2 ya está inmediatamente antes de f3, tanto en el array
        // como en la pantalla: arrastrarlo "antes de f3" es un
        // movimiento neutro, así que no hay mutación ni guardado.
        const lista = [gasto('f1'), gasto('f2'), gasto('f3')];
        expect(await ejecutar(lista, 'f2', 'f3', 0)).toEqual(['f1', 'f2', 'f3']);
        expect(enPantalla()).toEqual(['f1', 'f2', 'f3']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });

    /* ---------- colocación real dentro del mismo bloque ---------- */

    it('baja un lugar dentro del mismo bloque aunque haya otro bloque en el medio', async () => {
        // En el array, u1 (únicos) está entre los dos fijos; en la
        // pantalla los fijos van juntos. Soltar f2 debajo de f1
        // tiene que dejarlo justo ahí.
        const lista = [
            gasto('f2', { categoria: 'Fijos' }),
            gasto('u1', { categoria: 'Únicos' }),
            gasto('f1', { categoria: 'Fijos' })
        ];
        expect(await ejecutar(lista, 'f2', 'f1', 80)).toEqual(['u1', 'f1', 'f2']);
        expect(enPantalla()).toEqual(['f1', 'f2', 'u1']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('sube un lugar dentro del mismo bloque saltando el bloque del medio', async () => {
        const lista = [
            gasto('f1', { categoria: 'Fijos' }),
            gasto('u1', { categoria: 'Únicos' }),
            gasto('f2', { categoria: 'Fijos' })
        ];
        expect(await ejecutar(lista, 'f2', 'f1', 0)).toEqual(['f2', 'f1', 'u1']);
        expect(enPantalla()).toEqual(['f2', 'f1', 'u1']);
    });

    it('al final del bloque: un pendiente baja por debajo de otro pendiente', async () => {
        // El pagado queda en el medio del array pero al final de la
        // pantalla. Soltar p1 debajo de p2 lo deja ahí.
        const lista = [gasto('p1'), gasto('g', { pagado: true }), gasto('p2')];
        expect(await ejecutar(lista, 'p1', 'p2', 80)).toEqual(['g', 'p2', 'p1']);
        expect(enPantalla()).toEqual(['p2', 'p1', 'g']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    /* ---------- IDs y filtro ---------- */

    it('acepta IDs con caracteres especiales (comparación por dataset)', async () => {
        const raro = 'gasto-1700000000000-a+b/c';
        const lista = [gasto(raro), gasto('g2')];
        expect(await ejecutar(lista, 'g2', raro, 0)).toEqual(['g2', raro]);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('con el buscador activo se mueve respecto del vecino visible', async () => {
        const lista = [
            gasto('luz', { concepto: 'Luz' }),
            gasto('gas', { concepto: 'Gas' }),
            gasto('agua', { concepto: 'Agua' })
        ];
        db.gastos[MES] = lista;
        filtroEl.value = 'a'; // visibles: gas, agua
        guardarYRenderizar.mockClear();

        await moverGastoArrastrado('agua', 'gas', drop(0, 'gas'));

        expect(ids(db.gastos[MES])).toEqual(['agua', 'luz', 'gas']);
        expect(enPantalla()).toEqual(['agua', 'gas']);
        expect(guardarYRenderizar).toHaveBeenCalledTimes(1);
    });

    it('con filtro activo, soltar sobre un ítem que no coincide es no-op', async () => {
        const lista = [
            gasto('luz', { concepto: 'Luz' }),
            gasto('gas', { concepto: 'Gas' })
        ];
        db.gastos[MES] = lista;
        filtroEl.value = 'a'; // 'luz' no coincide: no está en pantalla
        guardarYRenderizar.mockClear();

        await moverGastoArrastrado('gas', 'luz', drop(0, 'luz'));

        expect(ids(db.gastos[MES])).toEqual(['luz', 'gas']);
        expect(guardarYRenderizar).not.toHaveBeenCalled();
    });
});

/* =========================================================
   3.D. FALLOS DE RENDER: se ven en vez de quedarse mudos
   =========================================================
   El 9-oct-2026 el render se cortó a mitad y la pantalla quedó
   vacía sin ninguna explicación, porque el catch de
   renderizarTodo sólo hacía console.error. Ahora ese catch
   registra una traza estructurada Y avisa a la persona con el
   mecanismo que ya existe (notificarError con clave, que es lo
   que usa core/avisos.js para no apilar avisos iguales).

   Estos tests fijan las dos cosas: que se avisa, y que NO se
   relanza (relanzar rompería los 13 llamadores sin try/catch y,
   sobre todo, impediría el signOut del cierre por inactividad).
   ========================================================= */
describe('renderizarTodo: el fallo se ve y no se propaga', () => {
    let dom;
    let renderizarTodo;
    let db;
    /** @type {ReturnType<typeof vi.fn>} */
    let notificarError;
    /** @type {{fase:string}>} */
    let falla;

    beforeAll(() => {
        dom = new JSDOM('<!doctype html><html><body></body></html>');

        const piezas = [
            extraerFuncion('textoDeError'),
            extraerFuncion('textoFiltroGastos'),
            extraerFuncion('gastosQueCoincidenFiltro'),
            extraerFuncion('ordenarGastosParaVista'),
            extraerFuncion('renderizarTodo', 'exportada')
        ];

        const fabrica = new Function(
            'document', 'db', 'obtenerMesActual', 'calcularNetoMes', 'calcularGastosMes',
            'renderizarDolar', 'renderizarResumenIngresos', 'renderizarListaIngresos',
            'renderizarTarjetasSaldo', 'renderizarDesgloseEgresos', 'renderizarTotalesGastos',
            'renderizarListaGastos', 'renderizarListaPasivos', 'renderizarDeseosYProyeccion',
            'renderizarTablaAnual', 'formatARS', 'notificarError',
            'normalizarCategoria', 'esPagado',
            `'use strict';
             ${piezas.join('\n')}
             return renderizarTodo;`
        );

        db = { mesActivo: '2026-10', gastos: { '2026-10': [gasto('g1')] }, ingresos: {}, pasivos: [] };
        notificarError = vi.fn();
        falla = { fase: 'ninguna' };

        const reventar = () => { throw new Error('boom en el render'); };
        const noop = () => {};
        const calculoVacio = () => ({ neto: 0, rem: 0, norem: 0, ded: 0, total: 0, fijos: 0, unicos: 0, cuotas: 0, pagado: 0, pendientes: 0 });

        // Cada fase puede reventar a pedido: el test decide por qué
        // paso pasa la ejecución antes de fallar.
        const porFase = (fase) => () => {
            if (falla.fase === fase) reventar();
        };

        renderizarTodo = fabrica(
            dom.window.document, db,
            () => db.mesActivo,
            () => { if (falla.fase === 'calculos') reventar(); return calculoVacio(); },
            () => calculoVacio(),
            porFase('resumen'), porFase('resumen'), porFase('resumen'),
            porFase('resumen'), porFase('resumen'), porFase('resumen'),
            () => { if (falla.fase === 'gastos') reventar(); },
            noop, noop, noop,
            formatARS, notificarError,
            normalizarCategoria, esPagado
        );
    });

    /** Espía el console.error para inspeccionar la traza. */
    const espiaConsola = () => vi.spyOn(console, 'error').mockImplementation(() => {});

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('el camino feliz no avisa nada', () => {
        falla.fase = 'ninguna';
        expect(() => renderizarTodo()).not.toThrow();
        expect(notificarError).not.toHaveBeenCalled();
    });

    it('si falla un paso, avisa a la persona con la clave deduplicada', () => {
        falla.fase = 'gastos';
        espiaConsola();

        // No relanza: los 13 llamadores (guardarGasto, cambiarTab, el
        // oninput del buscador...) lo invocan sin try/catch.
        expect(() => renderizarTodo()).not.toThrow();

        expect(notificarError).toHaveBeenCalledTimes(1);
        const [mensaje, opciones] = notificarError.mock.calls[0];
        expect(String(mensaje)).toMatch(/no se pudo actualizar la pantalla/i);
        expect(opciones).toEqual({ clave: 'render-error' });
    });

    it('el log trae fecha, módulo, paso, descripción, error y contexto', () => {
        // Fase 'gastos': el contexto ya tiene mes y cantidad cargados.
        falla.fase = 'gastos';
        const consola = espiaConsola();

        renderizarTodo();

        expect(consola).toHaveBeenCalledTimes(1);
        const traza = consola.mock.calls[0][1];
        expect(traza.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(traza.modulo).toBe('js/app.js');
        expect(traza.proceso).toBe('renderizarTodo');
        expect(traza.paso).toBe('gastos');
        expect(traza.descripcion).toMatch(/DOM anterior/);
        expect(traza.error).toMatch(/Error: boom en el render/);
        expect(traza.contexto).toEqual({ mes: '2026-10', gastos: 1, filtro: null });
    });

    it('el paso registrado es el que realmente estaba corriendo', () => {
        falla.fase = 'resumen';
        const consola = espiaConsola();

        renderizarTodo();

        expect(consola.mock.calls[0][1].paso).toBe('resumen');
        expect(consola.mock.calls[0][1].contexto.gastos).toBe(0);
    });

    it('si mostrar el aviso también falla, el error original queda registrado', () => {
        falla.fase = 'gastos';
        notificarError.mockImplementationOnce(() => { throw new Error('sin toasts acá'); });
        const consola = espiaConsola();

        expect(() => renderizarTodo()).not.toThrow();

        // El aviso roto se registra aparte, no tapa al primero.
        const textos = consola.mock.calls.map(c => String(c[0]));
        expect(textos.some(t => t.includes('No se pudo pintar la pantalla'))).toBe(true);
        expect(textos.some(t => t.includes('No se pudo mostrar el aviso'))).toBe(true);
    });
});

/* =========================================================
   3.E. RENDERIZAR LA LISTA: construir antes de reemplazar
   =========================================================
   El fallo documentado del 9-oct-2026: renderizarListaGastos
   vaciaba los contenedores al entrar y construía los ítems
   después. Si crearItemGasto reventaba a mitad, quedaban los tres
   contenedores vacíos y sin el encabezado de la categoría.

   Ahora se construyen los tres bloques COMPLETOS y recién ahí se
   reemplaza el contenido. Si algo falla, la pantalla anterior
   sigue en pie.
   ========================================================= */
describe('renderizarListaGastos: un fallo deja el DOM anterior intacto', () => {
    let dom;
    let renderizarListaGastos;
    /** @type {{actual:Function}} */
    let formato;

    beforeAll(() => {
        dom = new JSDOM(`<!doctype html><html><body>
            <div id="lista-gastos-fijos"></div>
            <div id="lista-gastos-unicos"></div>
            <div id="lista-gastos-cuotas"></div>
        </body></html>`);

        const piezas = [
            extraerDeclaracion('dragGastosRegistrado'),
            extraerFuncion('escapeHTML'),
            extraerFuncion('configurarDragDropGastos'),
            extraerFuncion('renderizarListaGastos')
        ];

        // `formato` envuelve al formatARS real y puede apagarse a
        // pedido: así el test decide cuándo tiene que reventar la
        // construcción de un ítem.
        formato = { actual: formatARS };

        const fabrica = new Function(
            'document', 'gastosExpandidos', 'delegar',
            'moverGastoArrastrado', 'formatARS',
            'esPagado', 'normalizarCategoria', 'tieneRollover',
            ...['toggleGastosCategoria', 'toggleMenuGasto', 'subirGastoAlPrincipio',
                'bajarGastoAlFinal', 'subirGastoUnLugar', 'bajarGastoUnLugar',
                'togglePagoGasto', 'editarGasto', 'eliminarGasto', 'desestimarGasto',
                'pasarGastoAlSiguiente', 'deshacerRollover', 'cerrarMenuGasto'],
            `'use strict';
             ${piezas.join('\n')}
             return renderizarListaGastos;`
        );

        const espia = () => vi.fn();
        renderizarListaGastos = fabrica(
            dom.window.document,
            { fijos: true, unicos: true, cuotas: true },
            delegar,
            espia(),
            (n) => formato.actual(n),
            esPagado, normalizarCategoria, tieneRollover,
            espia(), espia(), espia(), espia(), espia(), espia(),
            espia(), espia(), espia(), espia(), espia(), espia(), espia()
        );
    });

    const contenedor = (id) => dom.window.document.getElementById(id);
    /** Sólo el span del título, sin el monto ni la flecha. */
    const encabezados = (id) => [...contenedor(id).querySelectorAll('[data-accion="toggle-categoria"]')]
        .map(el => el.querySelector('span.font-bold')?.textContent.trim());
    const filas = (id) => contenedor(id).querySelectorAll('[data-gasto-id]').length;

    const pintar = (gastos) => {
        renderizarListaGastos(gastos, { fijos: 1000, unicos: 0, cuotas: 0, total: 1000 });
    };

    // Un test rompe formatARS a propósito: si no se restaura, el
    // siguiente arranca con el formato roto y falla por una razón que
    // no es la que está probando.
    afterEach(() => {
        formato.actual = formatARS;
    });

    it('camino feliz: pinta el encabezado y los ítems', () => {
        pintar([gasto('a'), gasto('b'), gasto('c', { categoria: 'Únicos' })]);

        expect(encabezados('lista-gastos-fijos')).toEqual(['Fijos (2)']);
        expect(encabezados('lista-gastos-unicos')).toEqual(['Únicos (1)']);
        expect(filas('lista-gastos-fijos')).toBe(2);
        expect(filas('lista-gastos-unicos')).toBe(1);
        expect(encabezados('lista-gastos-cuotas')).toEqual(['Cuotas (0)']);
    });

    it('si la construcción de un ítem revienta, queda la pantalla anterior', () => {
        // Primera pasada: la lista se pinta bien.
        pintar([gasto('a'), gasto('b')]);
        const antes = {
            fijos: contenedor('lista-gastos-fijos').innerHTML,
            unicos: contenedor('lista-gastos-unicos').innerHTML,
            cuotas: contenedor('lista-gastos-cuotas').innerHTML
        };

        // Segunda pasada con formatARS roto: antes esto vaciaba los
        // contenedores y recién construía, así que la pantalla
        // terminaba vacía y sin el encabezado de la categoría.
        formato.actual = () => { throw new Error('no puedo formatear'); };
        expect(() => pintar([gasto('x'), gasto('y')])).toThrow();

        // No quedó la pantalla en blanco: sigue lo de la pasada
        // anterior, en los tres bloques.
        expect(contenedor('lista-gastos-fijos').innerHTML).toBe(antes.fijos);
        expect(contenedor('lista-gastos-unicos').innerHTML).toBe(antes.unicos);
        expect(contenedor('lista-gastos-cuotas').innerHTML).toBe(antes.cuotas);
    });

    it('ni siquiera llega a tocar el contenedor si el bloque no se pudo armar', () => {
        pintar([gasto('a')]);
        const espiaInner = vi.spyOn(contenedor('lista-gastos-fijos'), 'innerHTML', 'set');

        formato.actual = () => { throw new Error('boom'); };
        expect(() => pintar([gasto('z')])).toThrow();

        // innerHTML nunca se asignó: la lista sigue en pie.
        expect(espiaInner).not.toHaveBeenCalled();
    });
});
