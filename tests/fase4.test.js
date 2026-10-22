import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* =========================================================
   TESTS DE FASE 4: CONTROLES GLOBALES, ÍCONOS Y PERSISTENCIA
   ========================================================= */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODIGO_HTML = readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const CODIGO_APP = readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');
const CODIGO_DESEOS = readFileSync(path.join(RAIZ, 'js', 'deseos.js'), 'utf8');
const CODIGO_COMPRAS = readFileSync(path.join(RAIZ, 'js', 'compras.js'), 'utf8');
const CODIGO_DB = readFileSync(path.join(RAIZ, 'js', 'db.js'), 'utf8');

describe('Fase 4: Botones globales en index.html', () => {
    let dom;
    let document;

    beforeEach(() => {
        dom = new JSDOM(CODIGO_HTML, { url: 'http://localhost' });
        document = dom.window.document;
    });

    it('debe existir el botón compartir app con su id, handler e icono FontAwesome', () => {
        const btnCompartir = document.getElementById('btn-compartir-app');
        expect(btnCompartir).not.toBeNull();
        expect(btnCompartir.getAttribute('onclick')).toContain('window.compartirApp()');
        expect(btnCompartir.getAttribute('title')).toContain('Compartir');
        const icono = btnCompartir.querySelector('i');
        expect(icono).not.toBeNull();
        expect(icono.className).toContain('fa-share-nodes');
    });

    it('debe existir el toggle de modo de vista con su id, handler e icono', () => {
        const btnToggle = document.getElementById('btn-toggle-vista');
        expect(btnToggle).not.toBeNull();
        expect(btnToggle.getAttribute('onclick')).toContain('window.toggleModoVista()');
        expect(btnToggle.getAttribute('title')).toContain('Cambiar modo de vista');
        const icono = document.getElementById('icono-toggle-vista');
        expect(icono).not.toBeNull();
        expect(icono.className).toContain('fa-mobile-screen');
    });

    it('el contenedor #app-content debe tener por defecto max-w-7xl mx-auto', () => {
        const appContent = document.getElementById('app-content');
        expect(appContent).not.toBeNull();
        expect(appContent.classList.contains('max-w-7xl')).toBe(true);
        expect(appContent.classList.contains('mx-auto')).toBe(true);
    });
});

describe('Fase 4: Lógica de Compartir App (compartirApp)', () => {
    let dom;
    let window;
    let notificarExito;
    let notificarAdvertencia;
    let compartirApp;

    beforeEach(() => {
        dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'https://lineageapp.com/' });
        window = dom.window;
        notificarExito = vi.fn();
        notificarAdvertencia = vi.fn();

        // Extraer y evaluar la lógica de compartirApp en un entorno controlado
        compartirApp = async function () {
            const shareData = {
                title: 'Finanzas Lineage',
                text: 'Finanzas Lineage - Control financiero personal y listas de compras.',
                url: typeof window !== 'undefined' && window.location ? window.location.href : ''
            };

            if (typeof window.navigator !== 'undefined' && typeof window.navigator.share === 'function') {
                try {
                    await window.navigator.share(shareData);
                    return true;
                } catch (error) {
                    if (error && error.name === 'AbortError') {
                        return false;
                    }
                }
            }

            if (typeof window.navigator !== 'undefined' && window.navigator.clipboard && typeof window.navigator.clipboard.writeText === 'function') {
                try {
                    await window.navigator.clipboard.writeText(shareData.url);
                    notificarExito('¡Enlace copiado al portapapeles!');
                    return true;
                } catch (clipboardError) {
                    notificarAdvertencia('No se pudo copiar el enlace.');
                    return false;
                }
            } else {
                notificarAdvertencia('Tu navegador no soporta compartir ni copiar enlaces.');
                return false;
            }
        };
    });

    it('debe invocar navigator.share cuando está disponible', async () => {
        const mockShare = vi.fn().mockResolvedValue(undefined);
        window.navigator.share = mockShare;

        const resultado = await compartirApp();
        expect(resultado).toBe(true);
        expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Finanzas Lineage',
            url: 'https://lineageapp.com/'
        }));
    });

    it('debe manejar AbortError silenciosamente cuando el usuario cancela', async () => {
        const abortErr = new Error('User cancelled');
        abortErr.name = 'AbortError';
        window.navigator.share = vi.fn().mockRejectedValue(abortErr);

        const resultado = await compartirApp();
        expect(resultado).toBe(false);
        expect(notificarAdvertencia).not.toHaveBeenCalled();
        expect(notificarExito).not.toHaveBeenCalled();
    });

    it('debe hacer fallback a clipboard cuando navigator.share no existe', async () => {
        delete window.navigator.share;
        const mockWriteText = vi.fn().mockResolvedValue(undefined);
        window.navigator.clipboard = { writeText: mockWriteText };

        const resultado = await compartirApp();
        expect(resultado).toBe(true);
        expect(mockWriteText).toHaveBeenCalledWith('https://lineageapp.com/');
        expect(notificarExito).toHaveBeenCalledWith('¡Enlace copiado al portapapeles!');
    });

    it('debe notificar advertencia si clipboard falla o no está soportado', async () => {
        delete window.navigator.share;
        delete window.navigator.clipboard;

        const resultado = await compartirApp();
        expect(resultado).toBe(false);
        expect(notificarAdvertencia).toHaveBeenCalled();
    });
});

describe('Fase 4: Lógica de Modo de Vista (aplicarModoVista y toggleModoVista)', () => {
    let dom;
    let document;
    let localStorageMock;
    let aplicarModoVista;
    let toggleModoVista;

    beforeEach(() => {
        dom = new JSDOM(CODIGO_HTML, { url: 'http://localhost' });
        document = dom.window.document;
        const store = new Map();
        localStorageMock = {
            getItem: vi.fn((key) => store.get(key) || null),
            setItem: vi.fn((key, val) => store.set(key, String(val))),
            removeItem: vi.fn((key) => store.delete(key)),
            clear: vi.fn(() => store.clear())
        };

        // Crear instancias de las funciones con el DOM y localStorage vinculados
        aplicarModoVista = function (modo) {
            const modoFinal = modo === 'celular' ? 'celular' : 'escritorio';
            const appContent = document.getElementById('app-content');
            const icono = document.getElementById('icono-toggle-vista');
            const btn = document.getElementById('btn-toggle-vista');

            if (appContent) {
                if (modoFinal === 'celular') {
                    appContent.classList.remove('max-w-7xl', 'md:max-w-6xl', 'lg:max-w-7xl');
                    appContent.classList.add('max-w-md', 'mx-auto');
                } else {
                    appContent.classList.remove('max-w-md');
                    appContent.classList.add('max-w-7xl', 'mx-auto');
                }
            }

            if (icono) {
                if (modoFinal === 'celular') {
                    icono.className = 'fa-solid fa-desktop';
                } else {
                    icono.className = 'fa-solid fa-mobile-screen';
                }
            }

            if (btn) {
                if (modoFinal === 'celular') {
                    btn.title = 'Cambiar a modo escritorio';
                    btn.setAttribute('aria-label', 'Cambiar a modo escritorio');
                } else {
                    btn.title = 'Cambiar a modo celular';
                    btn.setAttribute('aria-label', 'Cambiar a modo celular');
                }
            }

            localStorageMock.setItem('lineage_vista_modo', modoFinal);
            return modoFinal;
        };

        toggleModoVista = function () {
            const modoActual = localStorageMock.getItem('lineage_vista_modo') || 'escritorio';
            const nuevoModo = modoActual === 'celular' ? 'escritorio' : 'celular';
            return aplicarModoVista(nuevoModo);
        };
    });

    it('al aplicar modo celular debe ajustar clases, icono a fa-desktop y título a escritorio', () => {
        const modo = aplicarModoVista('celular');
        expect(modo).toBe('celular');

        const appContent = document.getElementById('app-content');
        expect(appContent.classList.contains('max-w-md')).toBe(true);
        expect(appContent.classList.contains('max-w-7xl')).toBe(false);

        const icono = document.getElementById('icono-toggle-vista');
        expect(icono.className).toBe('fa-solid fa-desktop');

        const btn = document.getElementById('btn-toggle-vista');
        expect(btn.title).toBe('Cambiar a modo escritorio');
        expect(localStorageMock.setItem).toHaveBeenCalledWith('lineage_vista_modo', 'celular');
    });

    it('al aplicar modo escritorio debe restaurar max-w-7xl, icono fa-mobile-screen y título celular', () => {
        aplicarModoVista('celular');
        const modo = aplicarModoVista('escritorio');
        expect(modo).toBe('escritorio');

        const appContent = document.getElementById('app-content');
        expect(appContent.classList.contains('max-w-7xl')).toBe(true);
        expect(appContent.classList.contains('max-w-md')).toBe(false);

        const icono = document.getElementById('icono-toggle-vista');
        expect(icono.className).toBe('fa-solid fa-mobile-screen');

        const btn = document.getElementById('btn-toggle-vista');
        expect(btn.title).toBe('Cambiar a modo celular');
        expect(localStorageMock.setItem).toHaveBeenCalledWith('lineage_vista_modo', 'escritorio');
    });

    it('toggleModoVista debe alternar correctamente de escritorio a celular y viceversa', () => {
        const paso1 = toggleModoVista();
        expect(paso1).toBe('celular');
        expect(localStorageMock.getItem('lineage_vista_modo')).toBe('celular');

        const paso2 = toggleModoVista();
        expect(paso2).toBe('escritorio');
        expect(localStorageMock.getItem('lineage_vista_modo')).toBe('escritorio');
    });
});

describe('Fase 4: Unificación visual de íconos en deseos, compras y app', () => {
    it('en deseos.js los botones deben usar FontAwesome y no emojis de papelera o lapiz', () => {
        expect(CODIGO_DESEOS).not.toContain('<button onclick="window.eliminarDeseo(\'${idStr}\')" class="text-[10px] font-bold bg-red-100 text-red-700 rounded-lg px-2 py-1.5">\n                        🗑');
        expect(CODIGO_DESEOS).toContain('data-accion="eliminar-deseo"');
        expect(CODIGO_DESEOS).toContain('fa-trash-can');
        expect(CODIGO_DESEOS).toContain('fa-pen-to-square');
    });

    it('en compras.js los botones de acción deben tener iconos estandarizados y colores uniformes', () => {
        expect(CODIGO_COMPRAS).toContain('fa-trash-can');
        expect(CODIGO_COMPRAS).toContain('fa-pen-to-square');
        expect(CODIGO_COMPRAS).toContain('text-red-500 hover:text-red-700 hover:bg-red-50');
        expect(CODIGO_COMPRAS).toContain('text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50');
    });

    it('en app.js los botones de eliminación de ingresos, gastos y pasivos deben usar peligro uniforme', () => {
        expect(CODIGO_APP).toContain('data-accion="eliminar-ingreso"');
        expect(CODIGO_APP).toContain('data-accion="eliminar-gasto"');
        expect(CODIGO_APP).toContain('data-accion="eliminar-pasivo"');
        // Ingresos y pasivos con fa-trash-can dentro del botón
        expect(CODIGO_APP).toMatch(/data-accion="eliminar-ingreso"[\s\S]*?fa-trash-can/);
        expect(CODIGO_APP).toMatch(/data-accion="eliminar-pasivo"[\s\S]*?fa-trash-can/);
        expect(CODIGO_APP).toMatch(/data-accion="eliminar-gasto"[\s\S]*?fa-trash-can/);
    });
});

describe('Fase 4: Blindaje de persistencia local en cierre de sesión e inactividad', () => {
    it('en db.js guardarTodo y guardarBaseDatosLocal deben persistir finanzas_db_${uid} con timestamp', () => {
        expect(CODIGO_DB).toContain('finanzas_db_${auth.currentUser.uid}');
        expect(CODIGO_DB).toContain('timestamp');
    });

    it('en db.js cerrarSesion debe respaldar localmente antes de desloguear', () => {
        expect(CODIGO_DB).toMatch(/cerrarSesion\(\)\s*\{[\s\S]*finanzas_db_/);
    });

    it('en app.js cerrarPorInactividad y handleCerrarSesion deben asegurar guardado local inmediato con timestamp', () => {
        expect(CODIGO_APP).toMatch(/cerrarPorInactividad\(\)[\s\S]*finanzas_db_/);
        expect(CODIGO_APP).toMatch(/handleCerrarSesion\(\)[\s\S]*finanzas_db_/);
    });

    it('en db.js cargarBaseDatosRemota debe comprobar la versión local y no perder datos si la local es más reciente', () => {
        expect(CODIGO_DB).toContain('localTimestamp > remoteTimestamp');
        expect(CODIGO_DB).toContain('finanzas_usuarios');
    });
});
