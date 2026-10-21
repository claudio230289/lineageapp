import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as acorn from 'acorn';
import { JSDOM } from 'jsdom';

/* =========================================================
   TESTS DE DESEOS: DRAG & DROP Y PROTECCIÓN DE SCROLL TÁCTIL
   ========================================================= */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUENTE_DESEOS = path.join(RAIZ, 'js', 'deseos.js');
const CODIGO_DESEOS = readFileSync(FUENTE_DESEOS, 'utf8');

function extraerFuncion(nombre, tipo = 'exportada') {
    const ast = acorn.parse(CODIGO_DESEOS, {
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
    if (!encontrada) throw new Error(`No se encontró "${nombre}" (${tipo}) en js/deseos.js`);
    return CODIGO_DESEOS.slice(encontrada.start, encontrada.end);
}

describe('Fase 1: Desensibilización de Drag & Drop y Scroll Táctil en Deseos', () => {
    let dom;
    let window;
    let document;
    let dbMock;
    let renderizarDeseosFn;

    beforeEach(() => {
        dom = new JSDOM(`<!DOCTYPE html>
            <html>
            <body>
                <select id="opt-recorte-gastos"><option value="0" selected>0%</option></select>
                <div id="lista-deseos-proyectados"></div>
            </body>
            </html>`, { url: 'http://localhost' });

        window = dom.window;
        document = window.document;

        dbMock = {
            dolar: 1250,
            mesActivo: '2026-10',
            deseos: [
                { id: 'deseo-1', concepto: 'Bicicleta', moneda: 'ARS', monto: 150000, comprado: false },
                { id: 'deseo-2', concepto: 'Monitor 4K', moneda: 'USD', monto: 300, comprado: false }
            ]
        };

        window.moverDeseo = vi.fn().mockResolvedValue(true);
        window.moverDeseoArrastrado = vi.fn().mockResolvedValue(true);

        const calcularNetoMes = () => ({ neto: 200000 });
        const calcularGastosMes = () => ({ total: 100000 });
        const formatARS = (n) => `$ ${n.toLocaleString('es-AR')}`;
        const obtenerMesActual = () => '2026-10';
        const renderizarLeyendaCortes = () => {};
        const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        const fnCodigo = extraerFuncion('renderizarDeseosYProyeccion', 'exportada');

        renderizarDeseosFn = new Function(
            'db', 'calcularNetoMes', 'calcularGastosMes', 'formatARS', 'obtenerMesActual',
            'renderizarLeyendaCortes', 'MESES_NOMBRES', 'MESES_CORTOS', 'window', 'document',
            `"use strict";
            let chartDeseos = null;
            ${fnCodigo};
            return renderizarDeseosYProyeccion;`
        )(
            dbMock, calcularNetoMes, calcularGastosMes, formatARS, obtenerMesActual,
            renderizarLeyendaCortes, MESES_NOMBRES, MESES_CORTOS, window, document
        );
    });

    it('el archivo js/deseos.js parsea como ESM sin errores de sintaxis', () => {
        expect(() => {
            acorn.parse(CODIGO_DESEOS, { ecmaVersion: 'latest', sourceType: 'module' });
        }).not.toThrow();
    });

    it('renderiza el tirador drag-handle con icono grip-vertical en cada tarjeta', () => {
        renderizarDeseosFn();
        const contenedor = document.getElementById('lista-deseos-proyectados');
        const cards = contenedor.querySelectorAll('.touch-pan-y');
        expect(cards.length).toBe(2);

        cards.forEach((card) => {
            expect(card.draggable).toBe(true);
            const handle = card.querySelector('.drag-handle');
            expect(handle).not.toBeNull();
            expect(handle.getAttribute('aria-label')).toBe('Arrastrar para reordenar deseo');
            expect(handle.classList.contains('touch-none')).toBe(true);
            expect(handle.classList.contains('cursor-grab')).toBe(true);

            const icon = handle.querySelector('.fa-grip-vertical');
            expect(icon).not.toBeNull();
        });
    });

    describe('Control de Arrastre en Desktop', () => {
        it('cancela dragstart si se inicia fuera del drag-handle', () => {
            renderizarDeseosFn();
            const card = document.getElementById('lista-deseos-proyectados').querySelector('.touch-pan-y');
            const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

            const evt = new window.Event('dragstart', { bubbles: true, cancelable: true });
            evt.dataTransfer = dataTransfer;

            // Disparo directo sobre la tarjeta (sin mousedown previo en el handle)
            card.dispatchEvent(evt);

            expect(evt.defaultPrevented).toBe(true);
            expect(dataTransfer.setData).not.toHaveBeenCalled();
            expect(card.classList.contains('opacity-50')).toBe(false);
        });

        it('permite dragstart y aplica opacity-50 si se inicia desde mousedown en drag-handle', () => {
            renderizarDeseosFn();
            const card = document.getElementById('lista-deseos-proyectados').querySelector('.touch-pan-y');
            const handle = card.querySelector('.drag-handle');
            const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

            // 1. Mousedown en handle
            handle.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));

            // 2. Dragstart en card
            const dragEvt = new window.Event('dragstart', { bubbles: true, cancelable: true });
            dragEvt.dataTransfer = dataTransfer;
            card.dispatchEvent(dragEvt);

            expect(dragEvt.defaultPrevented).toBe(false);
            expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'deseo-1');
            expect(card.classList.contains('opacity-50')).toBe(true);

            // 3. Dragend restaura la opacidad
            card.dispatchEvent(new window.Event('dragend', { bubbles: true }));
            expect(card.classList.contains('opacity-50')).toBe(false);
        });

        it('si se hace mousedown en handle pero luego mouseup sin arrastrar, resetea el permiso', () => {
            renderizarDeseosFn();
            const card = document.getElementById('lista-deseos-proyectados').querySelector('.touch-pan-y');
            const handle = card.querySelector('.drag-handle');
            const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

            handle.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
            card.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

            const dragEvt = new window.Event('dragstart', { bubbles: true, cancelable: true });
            dragEvt.dataTransfer = dataTransfer;
            card.dispatchEvent(dragEvt);

            expect(dragEvt.defaultPrevented).toBe(true);
            expect(dataTransfer.setData).not.toHaveBeenCalled();
        });
    });

    describe('Control de Arrastre en Móviles / Táctil', () => {
        it('el toque sobre el cuerpo de la tarjeta NO intercepta touchmove (scroll nativo libre)', () => {
            renderizarDeseosFn();
            const card = document.getElementById('lista-deseos-proyectados').querySelector('.touch-pan-y');

            // Toque en la tarjeta fuera del handle
            const touchEvt = new window.Event('touchmove', { bubbles: true, cancelable: true });
            touchEvt.touches = [{ clientY: 100 }];
            card.dispatchEvent(touchEvt);

            expect(touchEvt.defaultPrevented).toBe(false);
            expect(card.style.transform).toBe('');
            expect(card.classList.contains('opacity-50')).toBe(false);
        });

        it('el gesto táctil sobre el drag-handle activa el reordenamiento al superar 50px', async () => {
            renderizarDeseosFn();
            const card = document.getElementById('lista-deseos-proyectados').querySelector('.touch-pan-y');
            const handle = card.querySelector('.drag-handle');

            // 1. Touchstart en handle
            const touchStart = new window.Event('touchstart', { bubbles: true, cancelable: true });
            touchStart.touches = [{ clientY: 100 }];
            handle.dispatchEvent(touchStart);
            expect(card.classList.contains('opacity-50')).toBe(true);

            // 2. Touchmove de 60px hacia abajo
            const touchMove = new window.Event('touchmove', { bubbles: true, cancelable: true });
            touchMove.touches = [{ clientY: 160 }];
            handle.dispatchEvent(touchMove);
            expect(touchMove.defaultPrevented).toBe(true);
            expect(card.style.transform).toBe('translateY(60px)');

            // 3. Touchend
            const touchEnd = new window.Event('touchend', { bubbles: true, cancelable: true });
            touchEnd.changedTouches = [{ clientY: 160 }];
            handle.dispatchEvent(touchEnd);

            expect(card.style.transform).toBe('');
            expect(card.classList.contains('opacity-50')).toBe(false);
            expect(window.moverDeseo).toHaveBeenCalledWith('deseo-1', 'down');
        });

        it('el gesto táctil menor a 50px no mueve el deseo y limpia el estado', async () => {
            renderizarDeseosFn();
            const card = document.getElementById('lista-deseos-proyectados').querySelector('.touch-pan-y');
            const handle = card.querySelector('.drag-handle');

            const touchStart = new window.Event('touchstart', { bubbles: true, cancelable: true });
            touchStart.touches = [{ clientY: 100 }];
            handle.dispatchEvent(touchStart);

            const touchMove = new window.Event('touchmove', { bubbles: true, cancelable: true });
            touchMove.touches = [{ clientY: 120 }]; // solo 20px
            handle.dispatchEvent(touchMove);

            const touchEnd = new window.Event('touchend', { bubbles: true, cancelable: true });
            touchEnd.changedTouches = [{ clientY: 120 }];
            handle.dispatchEvent(touchEnd);

            expect(card.style.transform).toBe('');
            expect(card.classList.contains('opacity-50')).toBe(false);
            expect(window.moverDeseo).not.toHaveBeenCalled();
        });

        it('touchcancel restaura la opacidad y transforma la tarjeta sin disparar movimiento', () => {
            renderizarDeseosFn();
            const card = document.getElementById('lista-deseos-proyectados').querySelector('.touch-pan-y');
            const handle = card.querySelector('.drag-handle');

            const touchStart = new window.Event('touchstart', { bubbles: true, cancelable: true });
            touchStart.touches = [{ clientY: 100 }];
            handle.dispatchEvent(touchStart);
            expect(card.classList.contains('opacity-50')).toBe(true);

            const touchCancel = new window.Event('touchcancel', { bubbles: true, cancelable: true });
            handle.dispatchEvent(touchCancel);

            expect(card.style.transform).toBe('');
            expect(card.classList.contains('opacity-50')).toBe(false);
            expect(window.moverDeseo).not.toHaveBeenCalled();
        });
    });
});
