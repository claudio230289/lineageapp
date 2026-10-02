import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pintarVersionApp, piezasVersion } from '../js/dom/version-ui.js';
import { APP_VERSION } from '../js/version.js';

/* =========================================================
   Tests del pintado de versión en pantalla.

   El bug que los justifica: con la app ya en 14.0, el
   encabezado seguía diciendo "Mis Finanzas v13.9". Estaba escrito
   a mano en index.html y nada lo sobreescribía; el guard de
   coherencia chequeaba un solo elemento (#app-version-label) y
   se dejó pasar los otros dos.

   Estos tests usan jsdom sobre un fragmento que reproduce las
   tres superficies reales, así que verifican el texto que la
   persona lee de verdad, no una copia del formato.
   ========================================================= */

function montarHtml() {
    document.head.innerHTML = '<title>Control Financiero - Claudio</title>';
    document.body.innerHTML = `
        <div id="login-panel">
            <div id="app-version-label">Versión</div>
        </div>
        <header>
            <h1 id="app-title-header">Mis Finanzas</h1>
        </header>
    `;
}

describe('piezasVersion', () => {
    it('debe derivar las tres piezas de APP_VERSION', () => {
        // Se compara contra APP_VERSION y no contra un literal:
        // un test con "14.0" escrito a mano pasa aunque la app
        // cambie de versión, que es exactamente el drift que se
        // quiere cazar.
        expect(piezasVersion()).toEqual({
            titulo: `Control Financiero - Claudio (v${APP_VERSION})`,
            encabezado: `Mis Finanzas v${APP_VERSION}`,
            etiqueta: `Versión ${APP_VERSION}`
        });
    });

    it('las tres piezas deben llevar el número de la app', () => {
        Object.values(piezasVersion()).forEach((texto) => {
            expect(texto).toContain(APP_VERSION);
        });
    });
});

describe('pintarVersionApp', () => {
    beforeEach(montarHtml);

    it('debe escribir el número en el encabezado', () => {
        pintarVersionApp(document);

        expect(document.getElementById('app-title-header').textContent)
            .toBe(`Mis Finanzas v${APP_VERSION}`);
    });

    it('debe escribir el número en la etiqueta del login', () => {
        pintarVersionApp(document);

        expect(document.getElementById('app-version-label').textContent)
            .toBe(`Versión ${APP_VERSION}`);
    });

    it('debe escribir el número en el título de la pestaña', () => {
        pintarVersionApp(document);

        expect(document.title).toBe(`Control Financiero - Claudio (v${APP_VERSION})`);
    });

    it('debe sobreescribir un número viejo que venga en el HTML', () => {
        // El caso exacto del bug reportado: el encabezado llega con
        // un 13.9 cocido dentro del HTML.
        document.getElementById('app-title-header').textContent = 'Mis Finanzas v13.9';
        document.getElementById('app-version-label').textContent = 'Versión 13.9';
        document.title = 'Control Financiero - Claudio (v13.9)';

        pintarVersionApp(document);

        expect(document.getElementById('app-title-header').textContent)
            .toBe(`Mis Finanzas v${APP_VERSION}`);
        expect(document.getElementById('app-version-label').textContent)
            .toBe(`Versión ${APP_VERSION}`);
        expect(document.title).toBe(`Control Financiero - Claudio (v${APP_VERSION})`);
    });

    it('no debe dejar ningún 13.9 o 13.8 en pantalla', () => {
        pintarVersionApp(document);

        [document.title, document.body.textContent].forEach((texto) => {
            expect(texto).not.toMatch(/13\.[89]/);
        });
    });

    it('debe ser idempotente', () => {
        pintarVersionApp(document);
        const primera = {
            titulo: document.title,
            encabezado: document.getElementById('app-title-header').textContent,
            etiqueta: document.getElementById('app-version-label').textContent
        };

        pintarVersionApp(document);
        pintarVersionApp(document);

        expect(document.title).toBe(primera.titulo);
        expect(document.getElementById('app-title-header').textContent).toBe(primera.encabezado);
        expect(document.getElementById('app-version-label').textContent).toBe(primera.etiqueta);
    });

    it('no debe romper si falta alguno de los dos elementos', () => {
        document.getElementById('app-title-header').remove();
        document.getElementById('app-version-label').remove();

        expect(() => pintarVersionApp(document)).not.toThrow();
        // El title se escribe igual: no depende de ningún id.
        expect(document.title).toBe(`Control Financiero - Claudio (v${APP_VERSION})`);
    });

    it('sin argumento debe usar el document global', () => {
        // Contrato: el parámetro es opcional y si no se pasa, o se
        // pasa null, se usa el document global. Por eso no hay un
        // test de "sin documento": en jsdom siempre existe uno.
        expect(() => pintarVersionApp()).not.toThrow();
        expect(pintarVersionApp()).toBe(true);
        expect(document.getElementById('app-title-header').textContent)
            .toBe(`Mis Finanzas v${APP_VERSION}`);
    });

    it('debe escribir el título aunque no exista ningún otro elemento', () => {
        // El title no depende de un id, así que es lo último que se
        // pierde si el HTML cambia de forma.
        document.head.innerHTML = '<title>Sin nada</title>';
        document.body.innerHTML = '';

        expect(pintarVersionApp(document)).toBe(true);
        expect(document.title).toBe(`Control Financiero - Claudio (v${APP_VERSION})`);
    });

    it('no debe interpretar HTML en el número', () => {
        // textContent y no innerHTML: si el número viniera con una
        // etiqueta dentro, no podría inyectar nodos.
        pintarVersionApp(document);
        expect(document.getElementById('app-title-header').children.length).toBe(0);
    });
});

describe('sobre el index.html real', () => {
    // Los tests de arriba usan un fragmento hecho a mano. Estos cargan
    // el archivo que de verdad se publica, así que un id que se
    // renombre en index.html o un literal que vuelva a colarse rompen
    // acá, no en la pantalla de la persona.
    const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
    const htmlReal = readFileSync(join(RAIZ, 'index.html'), 'utf8');

    function cargarIndexReal() {
        const doc = new DOMParser().parseFromString(htmlReal, 'text/html');
        pintarVersionApp(doc);
        return doc;
    }

    it('el encabezado real debe mostrar el número de la app', () => {
        const doc = cargarIndexReal();
        expect(doc.getElementById('app-title-header').textContent)
            .toBe(`Mis Finanzas v${APP_VERSION}`);
    });

    it('la etiqueta real del login debe mostrar el número de la app', () => {
        const doc = cargarIndexReal();
        expect(doc.getElementById('app-version-label').textContent)
            .toBe(`Versión ${APP_VERSION}`);
    });

    it('el title real de la pestaña debe llevar el número de la app', () => {
        const doc = cargarIndexReal();
        expect(doc.title).toBe(`Control Financiero - Claudio (v${APP_VERSION})`);
    });

    it('no debe quedar ninguna versión distinta de la actual en el texto publicado', () => {
        const doc = cargarIndexReal();

        // No conviene una lista negra de números "viejos": se
        // quedaría corta en cuanto la app suba a 15.0 y el test
        // pasaría sin comprobar nada. Se extrae todo lo que tiene
        // forma de versión y se exige que sea la de APP_VERSION.
        //
        // El patrón pide un solo dígito en la parte menor para no
        // confundir un monto con separador de miles ("1.250") con
        // una versión.
        const versiones = (texto) =>
            (texto.match(/\bv?\d+\.\d(?!\d)(?:\.\d+)?\b/g) || [])
                .map((t) => t.replace(/^v/, ''));

        const encontradasBody = versiones(doc.body.textContent);
        const encontradasTitle = versiones(doc.title);

        expect(encontradasBody.filter((v) => v !== APP_VERSION),
            'versiones unexpectedes en el body tras pintar')
            .toEqual([]);
        expect(encontradasTitle.filter((v) => v !== APP_VERSION),
            'versiones inesperadas en el title tras pintar')
            .toEqual([]);

        // Y tiene que haber al menos una, o el test no comprobaría nada.
        expect(encontradasBody.length + encontradasTitle.length,
            'no se encontró ninguna versión: el assertion sería vacío')
            .toBeGreaterThan(0);
    });
});