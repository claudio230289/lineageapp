import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as acorn from 'acorn';
import { JSDOM } from 'jsdom';
import { esPagado, normalizarCategoria } from '../js/calculos/nucleo.js';
import { formatARS } from '../js/utils/formato.js';

/* =========================================================
   TEST DE RALLO: creaItemGasto de js/app.js ejecutado de verdad
   =========================================================
   POR QUÉ EXISTE ESTE TEST
   -------------------------
   El 9 de octubre de 2026 se descubrió que al expandir una
   categoría de gastos CON gastos, el bloque completo (flechita,
   cantidad y total) desaparecía de la pantalla.

   La causa era un ReferenceError: crearItemGasto usaba
   ${estaPagado} y ${estaDesestimado}, variables que no estaban
   declaradas en ningún lado (las locales se llaman `pagado` y
   `desestimado`). Como los módulos ESM corren en modo estricto,
   leer una variable inexistente lanza ReferenceError.

   El error no se veía porque:
     1. renderizarListaGastos vaciaba los contenedores ANTES de
        construir los items (innerHTML = '' en las 3 listas).
     2. La excepción abortaba la construcción a mitad de camino.
     3. renderizarTodo capturaba el error y sólo lo logueaba.
   Resultado: contenedores vacíos, header nunca re-insertado,
   y la persona veía "todo desapareció".

   Ningún test lo atrapó porque js/app.js no es importable desde
   Node: arrastra Firebase y Chart.js por import.

   LA SOLUCIÓN DE ESTE TEST
   ------------------------
   En vez de importar app.js, se EXTRAEN las funciones del
   archivo con acorn (parser real, no regex) y se ejecutan en un
   entorno controlado con las dependencias inyectadas. Así corre
   el código real de producción en modo estricto, que es
   exactamente la condición donde el bug aparecía.
   ========================================================= */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUENTE_APP = path.join(RAIZ, 'js', 'app.js');

/**
 * Extrae el código fuente de una función declarada por nombre.
 * Usa acorn para parsear el archivo completo y localizar el
 * rango exacto, así que no depende de regex sobre el texto.
 *
 * @param {string} nombre Nombre de la función (ej. 'crearItemGasto')
 * @param {'declarada'|'exportada'} tipo
 * @returns {string} Código fuente de la función
 */
function extraerFuncion(nombre, tipo = 'declarada') {
    const codigo = readFileSync(FUENTE_APP, 'utf8');
    const ast = acorn.parse(codigo, {
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

        if (esDeclarada && tipo === 'declarada' && !encontrada) {
            encontrada = nodo;
        }
        if (esExportada && tipo === 'exportada' && !encontrada) {
            encontrada = nodo.declaration;
        }

        for (const clave of Object.keys(nodo)) {
            const valor = nodo[clave];
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object' && valor.type) visitar(valor);
        }
    };

    visitar(ast);

    if (!encontrada) {
        throw new Error(`No se encontró la función "${nombre}" (${tipo}) en js/app.js`);
    }
    return codigo.slice(encontrada.start, encontrada.end);
}

/**
 * Réplica fiel de tieneRollover (js/app.rollover.js:161-162).
 * No se puede importar el módulo real porque arrastra db.js →
 * Firebase. El test de guardia de abajo verifica que esta
 * réplica siga coincidiendo con el fuente, así que si alguien
 * cambia la lógica real, este test avisa en vez de mentir.
 */
function tieneRollover(gasto) {
    return !!(gasto && gasto.origenMes);
}

/* =========================================================
   GUARDIA: la réplica de tieneRollover debe coincidir con el
   fuente real. Si alguien cambia app.rollover.js, esto falla.
   ========================================================= */
describe('guarda: réplica de tieneRollover', () => {
    it('coincide con la implementación de js/app.rollover.js', () => {
        const fuente = readFileSync(path.join(RAIZ, 'js', 'app.rollover.js'), 'utf8');
        const cuerpo = extraerDeArchivo(fuente, 'app.rollover.js', 'tieneRollover', 'exportada');

        // La implementación real debe seguir siendo una sola expresión
        // sobre gasto.origenMes. Si se complica, hay que revisar este test.
        expect(cuerpo.replace(/\s+/g, ' ')).toContain('return !!(gasto && gasto.origenMes)');
    });
});

/** Igual que extraerFuncion pero para un archivo arbitrario. */
function extraerDeArchivo(fuente, _etiqueta, nombre, tipo) {
    const ast = acorn.parse(fuente, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
    });

    let encontrada = null;
    const visitar = (nodo) => {
        if (!nodo || typeof nodo !== 'object') return;
        if (nodo.type === 'ExportNamedDeclaration'
            && nodo.declaration?.type === 'FunctionDeclaration'
            && nodo.declaration.id?.name === nombre && !encontrada) {
            encontrada = nodo.declaration;
        }
        if (nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre && !encontrada) {
            encontrada = nodo;
        }
        for (const clave of Object.keys(nodo)) {
            const valor = nodo[clave];
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object' && valor.type) visitar(valor);
        }
    };
    visitar(ast);

    if (!encontrada) throw new Error(`No se encontró "${nombre}" en ${_etiqueta}`);
    return fuente.slice(encontrada.start, encontrada.end);
}

describe('crearItemGasto: código real ejecutado en modo estricto', () => {
    /** @type {JSDOM} */
    let dom;
    /** @type {typeof crearItemGasto} */
    let crearItemGasto;

    beforeAll(() => {
        dom = new JSDOM('<!doctype html><html><body></body></html>');
        const ventana = dom.window;

        // Se extraen escapeHTML y crearItemGasto del archivo real.
        const srcEscape = extraerFuncion('escapeHTML', 'declarada');
        const srcCrear = extraerFuncion('crearItemGasto', 'declarada');

        // 'use strict' replica la condición del módulo ESM, que es
        // justo donde el ReferenceError original se manifestaba.
        const fabrica = new Function(
            'document',
            'escapeHTML',
            'esPagado',
            'normalizarCategoria',
            'tieneRollover',
            'formatARS',
            `'use strict';
             ${srcEscape}
             ${srcCrear}
             return crearItemGasto;`
        );

        crearItemGasto = fabrica(
            ventana.document,
            // escapeHTML se toma de la fuente extraída arriba, no se
            // reimplementa: se evalúa junto con crearItemGasto.
            undefined,
            esPagado,
            normalizarCategoria,
            tieneRollover,
            formatARS
        );
    });

    /** Fabrica un gasto válido con los overrides pedidos. */
    const gastoBase = (extra = {}) => ({
        id: 'gasto-1700000000000-abc123',
        concepto: 'Expensas',
        monto: 25000,
        categoria: 'Fijos',
        pagado: false,
        ...extra
    });

    it('renderiza un gasto fijo pendiente sin lanzar ReferenceError', () => {
        const item = crearItemGasto(gastoBase());

        expect(item).toBeInstanceOf(dom.window.HTMLElement);
        expect(item.dataset.gastoId).toBe('gasto-1700000000000-abc123');
        expect(item.className).toContain('bg-amber-50'); // fijos = ámbar
    });

    it('el menú desplegable arranca oculto y tiene botón toggle', () => {
        const item = crearItemGasto(gastoBase());
        const menu = item.querySelector('[data-gasto-menu]');
        const toggle = item.querySelector('.gasto-menu-toggle');

        expect(menu).not.toBeNull();
        expect(menu.className).toContain('hidden');
        expect(toggle).not.toBeNull();
        expect(toggle.dataset.accion).toBe('toggle-menu-gasto');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('con pagado=true ofrece "Marcar como pendiente" (verifica que usa `pagado`)', () => {
        const item = crearItemGasto(gastoBase({ pagado: true }));
        const boton = item.querySelector('[data-accion="toggle-pago"]');

        // Si el bug de estaPagado volviera, la línea de arriba
        // jamás se alcanzaría: reventaría al construir el item.
        expect(boton.getAttribute('aria-label')).toBe('Marcar como pendiente');
        expect(boton.textContent).toContain('Marcar como pendiente');
        expect(item.querySelector('.font-bold')?.className).toContain('line-through');
    });

    it('con pagado=false ofrece "Marcar como pagado"', () => {
        const item = crearItemGasto(gastoBase({ pagado: false }));
        const boton = item.querySelector('[data-accion="toggle-pago"]');
        expect(boton.getAttribute('aria-label')).toBe('Marcar como pagado');
    });

    it('acepta pagado como string "true" y "1" (datos de respaldos viejos)', () => {
        for (const valor of ['true', '1', 'si', true, 1]) {
            const item = crearItemGasto(gastoBase({ pagado: valor }));
            const boton = item.querySelector('[data-accion="toggle-pago"]');
            expect(boton.getAttribute('aria-label')).toBe('Marcar como pendiente');
        }
    });

    it('con desestimado=true ofrece "Restaurar (sí cuenta)" y va en gris', () => {
        const item = crearItemGasto(gastoBase({ desestimado: true }));
        const boton = item.querySelector('[data-accion="desestimar-gasto"]');

        expect(boton.getAttribute('aria-label')).toBe('Restaurar gasto (sí cuenta)');
        expect(boton.textContent).toContain('Restaurar (sí cuenta)');
        expect(item.className).toContain('opacity-60');
    });

    it('con desestimado=false ofrece "Desestimar (no cuenta)"', () => {
        const item = crearItemGasto(gastoBase());
        const boton = item.querySelector('[data-accion="desestimar-gasto"]');
        expect(boton.getAttribute('aria-label')).toBe('Desestimar gasto (no cuenta)');
    });

    it('gasto pagado oculta el botón "pasar al mes siguiente"', () => {
        const item = crearItemGasto(gastoBase({ pagado: true }));
        expect(item.querySelector('[data-accion="pasar-al-siguiente"]')).toBeNull();
    });

    it('gasto pendiente muestra el botón "pasar al mes siguiente"', () => {
        const item = crearItemGasto(gastoBase());
        expect(item.querySelector('[data-accion="pasar-al-siguiente"]')).not.toBeNull();
    });

    it('gasto con rollover muestra "Deshacer rollover" y borde distintivo', () => {
        const item = crearItemGasto(gastoBase({ origenMes: 'Octubre 2026' }));

        expect(item.querySelector('[data-accion="deshacer-rollover"]')).not.toBeNull();
        expect(item.className).toContain('border-l-4');
        expect(item.innerHTML).toContain('Desde: Octubre 2026');
    });

    it('gasto con cadenaOrigen muestra la cadena completa de trazabilidad', () => {
        const item = crearItemGasto(gastoBase({
            origenMes: 'Septiembre 2026',
            cadenaOrigen: 'Septiembre 2026 → Octubre 2026'
        }));

        expect(item.innerHTML).toContain('Viene de: Septiembre 2026');
    });

    it('gasto pasado muestra a qué mes fue movido', () => {
        const item = crearItemGasto(gastoBase({ pasado: true, pasadoAMes: 'Octubre 2026' }));
        expect(item.innerHTML).toContain('Octubre 2026');
    });

    it('escapa HTML en el concepto (no permite inyección)', () => {
        const item = crearItemGasto(gastoBase({
            concepto: '<img src=x onerror=alert(1)>'
        }));

        expect(item.querySelector('img')).toBeNull();
        expect(item.querySelector('.font-bold')?.textContent)
            .toBe('&lt;img src=x onerror=alert(1)&gt;'.replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    });

    it('sobrevive a campos ausentes o corruptos', () => {
        const casos = [
            gastoBase({ id: undefined }),
            gastoBase({ concepto: undefined }),
            gastoBase({ monto: undefined }),
            gastoBase({ monto: null }),
            gastoBase({ monto: 'no es número' }),
            gastoBase({ categoria: undefined }),
            gastoBase({ categoria: 'Categoría Inventada' }),
            gastoBase({ pagadoAMes: undefined })
        ];

        for (const g of casos) {
            expect(() => crearItemGasto(g)).not.toThrow();
        }
    });

    it('acepta IDs con caracteres especiales en data-id', () => {
        const item = crearItemGasto(gastoBase({ id: 'gasto-1700000000000-a+b/c' }));
        const toggle = item.querySelector('.gasto-menu-toggle');

        expect(item.dataset.gastoId).toBe('gasto-1700000000000-a+b/c');
        expect(toggle.dataset.id).toBe('gasto-1700000000000-a+b/c');
    });
});

/* =========================================================
   El ciclo de abrir/cerrar menú, ejecutado de verdad
   ========================================================= */
describe('menú desplegable: ciclo abrir/cerrar con el código real', () => {
    /** @type {JSDOM} */
    let dom;
    let menu;

    beforeAll(() => {
        dom = new JSDOM('<!doctype html><html><body></body></html>');
        const ventana = dom.window;
        const documento = ventana.document;

        const srcEscape = extraerFuncion('escapeHTML', 'declarada');
        const srcObtener = extraerFuncion('obtenerItemGasto', 'declarada');
        const srcAbrir = extraerFuncion('abrirMenuGasto', 'declarada');
        const srcCerrar = extraerFuncion('cerrarMenuGasto', 'declarada');
        const srcCrear = extraerFuncion('crearItemGasto', 'declarada');

        const fabrica = new Function(
            'document', 'escapeHTML', 'esPagado', 'normalizarCategoria',
            'tieneRollover', 'formatARS',
            `'use strict';
             let gastoMenuAbiertoId = null;
             ${srcEscape}
             ${srcObtener}
             ${srcAbrir}
             ${srcCerrar}
             ${srcCrear}
             return { abrirMenuGasto, cerrarMenuGasto, crearItemGasto,
                      idAbierto: () => gastoMenuAbiertoId };`
        );

        menu = fabrica(
            documento,
            undefined,
            esPagado,
            normalizarCategoria,
            tieneRollover,
            formatARS
        );
    });

    it('abrir y cerrar alternan la clase hidden del menú', () => {
        const documento = dom.window.document;
        const gasto = {
            id: 'g-1', concepto: 'Luz', monto: 15000, categoria: 'Fijos', pagado: false
        };
        documento.body.appendChild(menu.crearItemGasto(gasto));

        const contenedor = documento.querySelector('[data-gasto-menu]');
        expect(contenedor.className).toContain('hidden');

        menu.abrirMenuGasto('g-1');
        expect(contenedor.className).not.toContain('hidden');
        expect(menu.idAbierto()).toBe('g-1');

        menu.cerrarMenuGasto();
        expect(contenedor.className).toContain('hidden');
        expect(menu.idAbierto()).toBeNull();
    });

    it('abrir un segundo gasto cierra el primero', () => {
        const documento = dom.window.document;
        documento.body.innerHTML = '';

        [['g-1', 'Luz'], ['g-2', 'Gas']].forEach(([id, concepto]) => {
            documento.body.appendChild(menu.crearItemGasto({
                id, concepto, monto: 1000, categoria: 'Fijos', pagado: false
            }));
        });

        menu.abrirMenuGasto('g-1');
        menu.abrirMenuGasto('g-2');

        const menus = documento.querySelectorAll('[data-gasto-menu]');
        expect(menus[0].className).toContain('hidden');
        expect(menus[1].className).not.toContain('hidden');
        expect(menu.idAbierto()).toBe('g-2');
    });

    it('funciona con IDs que rompen querySelector (caracteres especiales)', () => {
        const documento = dom.window.document;
        documento.body.innerHTML = '';

        // Un '+' tiene significado especial dentro de un selector CSS
        // de atributo. El querySelector con interpolación fallaba acá.
        const idRaro = 'gasto-1700000000000-a+b';
        documento.body.appendChild(menu.crearItemGasto({
            id: idRaro, concepto: 'Internet', monto: 9000, categoria: 'Fijos', pagado: false
        }));

        expect(() => menu.abrirMenuGasto(idRaro)).not.toThrow();
        expect(menu.idAbierto()).toBe(idRaro);

        const contenedor = documento.querySelector('[data-gasto-menu]');
        expect(contenedor.className).not.toContain('hidden');

        menu.cerrarMenuGasto();
        expect(contenedor.className).toContain('hidden');
    });

    it('abrir un ID inexistente no lanza', () => {
        const documento = dom.window.document;
        documento.body.innerHTML = '';
        expect(() => menu.abrirMenuGasto('no-existe')).not.toThrow();
        expect(menu.idAbierto()).toBeNull();
    });
});

/* =========================================================
   NOTA sobre por qué no hay guardia estática de ámbitos
   ---------------------------------------------------------
   La protección contra "variables sin declarar" ya está en los
   tests de arriba: el código real se ejecuta con 'use strict',
   que es la condición exacta donde un ReferenceError aparece.
   Cualquier identificador inexistente hace fallar esos tests.

   No se agregó además un verificador estático de ámbitos propio
   a propósito: recorrer el AST a mano para resolver closures es
   fácil de hacer mal y produce falsos positivos, que a la larga
   hacen que la gente borre el test. Para eso existe ESLint con
   la regla no-undef, que es la herramienta correcta.
   ========================================================= */
