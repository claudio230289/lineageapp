import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { delegar } from '../js/dom/delegacion.js';
import { generarId, coincideId } from '../js/utils/id.js';

const raizProyecto = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* =========================================================
   Tests de la delegación de eventos y del formato de IDs.

   El bug que se corrige acá: generarId() devuelve
   "1761000000000-a1b2c3d4", y al interpolarlo sin comillas en
   onclick="window.f(${id})" se generaba JavaScript inválido
   (SyntaxError). El handler nunca compilaba, el click no hacía
   nada y el checkbox quedaba tildado sólo visualmente.
   ========================================================= */

describe('generarId y coincideId', () => {
    it('debe generar IDs únicos y con el formato timestamp-random', () => {
        const id = generarId();
        expect(typeof id).toBe('string');
        expect(id).toMatch(/^\d+-[a-z0-9]{1,}$/);
    });

    it('debe comparar IDs tolerando la mezcla de tipos', () => {
        // Conviven IDs nuevos (string) con los numéricos que generaba
        // la versión anterior (Date.now() + Math.random()).
        expect(coincideId('1761000000000-a1b2', '1761000000000-a1b2')).toBe(true);
        expect(coincideId(1761000000000.123, '1761000000000.123')).toBe(true);
        expect(coincideId('1', 1)).toBe(true);
        expect(coincideId('1', '2')).toBe(false);
    });

    it('nunca debe considerar que null o undefined son el mismo id', () => {
        expect(coincideId(null, null)).toBe(false);
        expect(coincideId(undefined, undefined)).toBe(false);
        expect(coincideId(null, 'a')).toBe(false);
    });
});

describe('delegar', () => {
    let contenedor;

    beforeEach(() => {
        document.body.innerHTML = '<div id="lista"></div>';
        contenedor = document.getElementById('lista');
    });

    it('debe invocar el manejador con el data-id del elemento', () => {
        contenedor.innerHTML = '<button data-accion="eliminar" data-id="gasto-123">Del</button>';
        const llamadas = [];

        delegar(contenedor, 'click', {
            eliminar: (el, id) => llamadas.push({ accion: el.dataset.accion, id })
        });

        contenedor.querySelector('button').click();

        expect(llamadas).toEqual([{ accion: 'eliminar', id: 'gasto-123' }]);
    });

    it('debe funcionar con IDs del generador real', () => {
        // Este es el caso exacto que fallaba: el ID contiene un guion
        // y un sufijo alfanumérico.
        const id = generarId();
        contenedor.innerHTML = `<button data-accion="toggle-pago" data-id="${id}">x</button>`;
        let recibido = null;

        delegar(contenedor, 'click', { 'toggle-pago': (_el, valor) => { recibido = valor; } });
        contenedor.querySelector('button').click();

        expect(recibido).toBe(id);
    });

    it('debe resolver el elemento correcto cuando el click cae sobre un hijo', () => {
        contenedor.innerHTML = '<button data-accion="eliminar" data-id="gasto-9"><span id="hijo">Del</span></button>';
        let id = null;

        delegar(contenedor, 'click', { eliminar: (_el, valor) => { id = valor; } });
        contenedor.querySelector('#hijo').click();

        expect(id).toBe('gasto-9');
    });

    it('no debe duplicar la acción si se registra varias veces', () => {
        // renderizarTodo() se llama en cada interacción; si el listener
        // se registrara de nuevo cada vez, cada clic pagaría dos veces.
        contenedor.innerHTML = '<button data-accion="eliminar" data-id="gasto-1">Del</button>';
        let contador = 0;

        expect(delegar(contenedor, 'click', { eliminar: () => { contador++; } })).toBe(true);
        expect(delegar(contenedor, 'click', { eliminar: () => { contador++; } })).toBe(false);

        contenedor.querySelector('button').click();
        expect(contador).toBe(1);
    });

    it('no debe disparar el checkbox en click, sólo en change', () => {
        contenedor.innerHTML = '<input type="checkbox" data-accion="toggle-pago" data-id="gasto-5">';
        let llamadas = 0;

        delegar(contenedor, 'click', { 'toggle-pago': () => { llamadas++; } });
        delegar(contenedor, 'change', { 'toggle-pago': () => { llamadas++; } });

        const checkbox = contenedor.querySelector('input');
        checkbox.click();
        expect(llamadas).toBe(1);
    });

    it('debe ignorar elementos sin data-accion y acciones desconocidas', () => {
        contenedor.innerHTML = '<p>texto suelto</p><button data-accion="otra" data-id="x">b</button>';
        let llamadas = 0;
        const manejadores = { eliminar: () => { llamadas++; } };

        delegar(contenedor, 'click', manejadores);
        contenedor.querySelector('p').click();
        contenedor.querySelector('button').click();

        expect(llamadas).toBe(0);
    });

    it('no debe fallar si el contenedor no existe', () => {
        expect(delegar(null, 'click', { eliminar: () => { } })).toBe(false);
    });
});

describe('guardián anti-regresión de handlers inline', () => {
    // El patrón roto era interpolar un ID dentro de JavaScript en un
    // atributo HTML. Se falla el test si vuelve a aparecer, porque no
    // hay forma de detectarlo en ejecución: el handler simplemente
    // deja de existir y el botón queda muerto.
    it('app.js no debe interpolar IDs dentro de handlers on*', () => {
        const fuente = readFileSync(resolve(raizProyecto, 'js/app.js'), 'utf8');
        const patrones = [
            /on(?:click|change|input|submit|load)\s*=\s*["'][^"']*\$\{/g
        ];
        for (const patron of patrones) {
            const encontrados = fuente.match(patron);
            expect(encontrados || [], `handlers inline con interpolación: ${encontrados}`).toHaveLength(0);
        }
    });

    it('todo data-id debe venir de una expresión escapada o de un literal conocido', () => {
        // Se extrae cada interpolación dentro de un data-id y se exige
        // que sea una de las expresiones permitidas. La alternativa
        // (buscar sólo "escapeHTML(") daría falsos positivos con las
        // variables precomputadas, y un falso positivo en un guardián
        // es peor que no tener guardián: entrena a ignorar el test.
        const fuente = readFileSync(resolve(raizProyecto, 'js/app.js'), 'utf8');
        const expresiones = [...fuente.matchAll(/data-id="\$\{([^}]+)\}"/g)].map(m => m[1].trim());

        // Lista blanca:
        //  - escapeHTML(...)  -> dato de usuario, escapado en el momento
        //  - idAttr           -> alias precomputado con escapeHTML dentro
        //  - categoria        -> literal del propio render ('fijos'|'unicos'|'cuotas')
        const permitidas = [/^escapeHTML\(/, /^idAttr$/, /^categoria$/];

        const invalidas = expresiones.filter(expr => !permitidas.some(p => p.test(expr)));
        expect(invalidas, `data-id con expresión no permitida: ${invalidas.join(', ')}`).toHaveLength(0);
        expect(expresiones.length, 'no se encontró ningún data-id: el guardián no está probando nada').toBeGreaterThan(0);
    });
});