import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* =========================================================
   Guarda de cableado entre index.html y js/app.js.

   El bug original de la app ("pagué el gasto pero figura
   pendiente") venía de handlers inline mal formados: los
   onclick se interpolaban con IDs y el navegador no lograba
   ni compilar la función. Un onclick que llama a un
   `window.X` inexistente falla igual de silencioso, tanto
   en el navegador como en producción.

   Estos tests no reemplazan la prueba en navegador, pero
   detectan en segundos lo que antes aparecía recién al
   hacer clic: una función referenciada que no existe, o una
   que se expone con otro nombre.
   ========================================================= */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const leer = (relativo) => readFileSync(join(RAIZ, relativo), 'utf8');

const html = leer('index.html');
const app = leer('js/app.js');

/** Nombres asignados a `window.X = ...` dentro de app.js. */
const exponidos = new Set(
    [...app.matchAll(/^\s*window\.([A-Za-z_$][\w$]*)\s*=/gm)].map(m => m[1])
);

/** Funciones referenciadas desde atributos inline del HTML. */
const referenciados = new Set(
    [...html.matchAll(/on(?:click|change|input|submit|load)="([^"]*)"/g)]
        .flatMap(m => [...m[1].matchAll(/window\.([A-Za-z_$][\w$]*)/g)])
        .map(m => m[1])
);

/**
 * IDs interpolados dentro de atributos inline.
 *
 * `onclick="window.f(1761000000000-abc)"` genera un error de
 * sintaxis en el navegador porque el ID no está entre comillas.
 * Si algún día vuelve a aparecer un argumento que no sea un
 * literal seguro, este test lo marca.
 */
const argumentosInline = [...html.matchAll(/on(?:click|change|input|submit)="([^"]*)"/g)]
    .flatMap(m => [...m[1].matchAll(/window\.[A-Za-z_$][\w$]*\(([^)]*)\)/g)].map(m => m[1].trim()))
    // `event` es un argumento legítimo y seguro: los formularios
    // lo pasan para poder leer los campos. Sólo interesan los
    // argumentos que embebieron valores por interpolación.
    .filter(arg => arg.length > 0 && arg !== 'event');

describe('cableado index.html -> app.js', () => {
    it('debe tener al menos un handler inline para verificar', () => {
        // Si el test pasa sin encontrar nada, la extracción se
        // rompió y el resto de las comprobaciones no valen nada.
        expect(referenciados.size).toBeGreaterThan(10);
    });

    it('no debe referenciar funciones de window que no existen', () => {
        const huerfanos = [...referenciados].filter(nombre => !exponidos.has(nombre));
        expect(huerfanos).toEqual([]);
    });

    it('no debe pasar IDs interpolados sin comillas a los handlers', () => {
        // Los handlers con argumentos interpolados son
        // precisamente los que rompieron la app. Si esta lista
        // crece, hay que volver a delegación de eventos.
        const sospechosos = argumentosInline.filter(arg => /^[A-Za-z0-9_$-]/.test(arg));
        expect(sospechosos).toEqual([]);
    });
});

describe('superficie de window', () => {
    it('no debe exponer la misma función con dos nombres distintos', () => {
        const asignaciones = [...app.matchAll(/^\s*window\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/gm)];
        const origen = new Map(asignaciones.map(m => [m[1], m[2]]));
        const duplicados = [...origen.entries()]
            .filter(([, fn], i, todas) => todas.some(([, otra], j) => otra === fn && j !== i))
            .map(([nombre]) => nombre);

        expect(duplicados).toEqual([]);
    });
});

describe('referencias a document.getElementById', () => {
    it('debe apuntar a IDs que existen en index.html', () => {
        const idsHtml = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
        const idsJs = [...app.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)].map(m => m[1]);
        const inexistentes = [...new Set(idsJs)].filter(id => !idsHtml.has(id));

        // Algunos IDs se crean dinámicamente o viven en otros
        // módulos; se listan explícitos para que la guarda siga
        // siendo útil y la excepción sea deliberada, no accidental.
        const dinamicos = new Set([
            'input-buscar-ganancias',
            'mes-activo-cuadricula',
            'input-dolar-valor'
        ]);
        const reales = inexistentes.filter(id => !dinamicos.has(id));

        expect(reales).toEqual([]);
    });
});