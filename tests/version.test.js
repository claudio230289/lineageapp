import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { APP_VERSION, SCHEMA_VERSION, CACHE_NAME } from '../js/version.js';

/* =========================================================
   Guardia de versionado.

   El número de versión estaba duplicado en cuatro lugares y ya
   divergía: package.json 13.9.0, db.js '13.8', index.html 13.9 y
   sw.js finanzas-v14.0. Estos tests hacen que la duplicación sea
   imposible de mantener.

   La razón por la que hace falta una guardia y no "acordarse":
   sw.js es un service worker clásico que no puede importar nada,
   así que su CACHE_NAME tiene que seguir siendo un literal. Sin
   un test que lo compare, vuelve a desincronizarse en silencio
   y el síntoma es que la app sigue sirviendo la versión vieja
   sin que nadie entienda por qué.
   ========================================================= */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (relativo) => readFileSync(join(RAIZ, relativo), 'utf8');

describe('coherencia entre archivos', () => {
    it('el CACHE_NAME de sw.js debe coincidir con js/version.js', () => {
        const sw = leer('sw.js');
        const declarado = sw.match(/const CACHE_NAME\s*=\s*'([^']+)'/);

        expect(declarado, 'no se encontró CACHE_NAME en sw.js').not.toBeNull();
        expect(declarado[1]).toBe(CACHE_NAME);
        expect(declarado[1]).toBe(`finanzas-v${APP_VERSION}`);
    });

    it('la versión de package.json debe arrancar con APP_VERSION', () => {
        const pkg = JSON.parse(leer('package.json'));
        // Se compara por prefijo y no por igualdad exacta: package.json
        // lleva semver de tres partes ("14.0.0") y la app sólo muestra
        // dos ("14.0"). Exigir igualdad obligaría a elegir cuál miente.
        expect(pkg.version.startsWith(APP_VERSION)).toBe(true);
    });

    it('db.js no debe volver a declarar un número de versión propio', () => {
        const db = leer('js/db.js');

        // Debe importarlo de js/version.js...
        expect(db).toMatch(/from\s+"\.\/version\.js"/);

        // ...y no dejar un literal suelto que lo contradiga.
        expect(db).not.toMatch(/export const APP_VERSION\s*=\s*['"]\d/);
        expect(db).not.toMatch(/export const DB_VERSION\s*=\s*\d/);
    });

    it('index.html no debe escribir un número de versión a mano', () => {
        const html = leer('index.html');
        const etiqueta = html.match(/id="app-version-label"[^>]*>([^<]*)</);

        expect(etiqueta, 'no se encontró #app-version-label').not.toBeNull();
        // El marcador neutro no puede derivarse solo: si alguien
        // escribe "Versión 14.1" acá, el drift vuelve.
        expect(etiqueta[1]).not.toMatch(/\d/);
    });

    it('ningún texto visible de index.html debe traer un número de versión', () => {
        // El test anterior chequeaba UN elemento y dejó pasar dos
        // copias más: el <title> de la pestaña y el encabezado de
        // la app. Por eso esta versión mira el texto completo del
        // documento en vez de un id puntual.
        //
        // Se descartan comentarios y atributos (los atributos traen
        // cosas como tracking-[0.2em] o ?v=2, que son números pero no
        // versiones) y se busca sobre el texto que la persona lee.
        //
        // El patrón exige un ÚNICO dígito en la parte menor, por el
        // lookahead. No es arbitrario: los montos se formatean con
        // separador de miles ("1.250"), y exigir un dígito solo
        // separa las dos cosas sin depender de un signo monetario.
        // APP_VERSION es MAJOR.MINOR de un dígito, y otro test ya lo
        // valida con /^\d+\.\d+$/.
        const html = leer('index.html');
        const texto = html
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<[^>]+>/g, ' ');

        const numeros = texto.match(/\bv?\d+\.\d(?!\d)(?:\.\d+)?\b/g) || [];
        expect(
            numeros,
            `números con forma de versión escritos a mano en el texto visible: ${numeros.join(', ')}`
        ).toEqual([]);
    });

    it('el <title> no debe llevar un número de versión a mano', () => {
        const html = leer('index.html');
        const titulo = html.match(/<title>([^<]*)<\/title>/);

        expect(titulo, 'no se encontró <title>').not.toBeNull();
        expect(titulo[1]).not.toMatch(/\d+\.\d+/);
    });

    it('db.js debe delegar el pintado, y el pintado debe cubrir título y encabezado', () => {
        // Si aparece una tercera superficie con un número hardcodeado,
        // tiene que tener su id y ser escrita por el pintado, o el
        // guard de arriba la va a delatar.
        //
        // La lógica NO vive en db.js: vive en js/dom/version-ui.js
        // porque db.js importa Firebase por URL HTTPS y Node no
        // puede cargarlo (lo que dejaría la lógica intestable).
        const db = leer('js/db.js');
        const pintado = leer('js/dom/version-ui.js');

        expect(db).toContain('pintarVersionApp');

        expect(pintado).toContain("getElementById('app-title-header')");
        expect(pintado).toContain("getElementById('app-version-label')");
        expect(pintado).toMatch(/doc\.title\s*=/);

        const html = leer('index.html');
        expect(html, 'falta el id que se escribe en el encabezado')
            .toContain('id="app-title-header"');
    });

    it('todo archivo que use APP_VERSION debe tomarlo de js/version.js', () => {
        const archivos = ['js/db.js', 'js/app.js', 'js/comprobante.js', 'js/negocio/replicacion.js'];
        archivos.forEach((relativo) => {
            const contenido = leer(relativo);
            expect(contenido, relativo).not.toMatch(/const APP_VERSION\s*=\s*['"]\d/);
        });
    });
});

describe('cobertura de la caché del service worker', () => {
    // Un módulo nuevo que se importa pero no está en STATIC_ASSETS
    // funciona con internet y revienta sin conexión, y el fallo
    // aparece en casa de la persona, no en el desarrollo.

    it('todo módulo alcanzable desde index.html debe estar en STATIC_ASSETS', () => {
        const sw = leer('sw.js');
        const bloque = sw.match(/const STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/);
        expect(bloque, 'no se encontró STATIC_ASSETS en sw.js').not.toBeNull();

        const cacheados = new Set(
            (bloque[1].match(/'([^']+)'/g) || []).map((c) => c.replace(/'/g, ''))
        );

        const html = leer('index.html');
        const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
        expect(scripts.length, 'index.html no declara scripts').toBeGreaterThan(0);

        const alcanzables = new Set();
        const pendientes = scripts
            .filter((src) => src.startsWith('./js/'))
            .map((src) => src.replace(/^\.\//, ''));

        while (pendientes.length > 0) {
            const relativo = pendientes.pop();
            if (alcanzables.has(relativo)) continue;
            alcanzables.add(relativo);

            // Sólo los imports relativos: los de Firebase van por
            // https y el service worker no los cachea.
            const contenido = leer(relativo);
            const imports = [...contenido.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((m) => m[1]);
            imports.forEach((imp) => pendientes.push(normalizarRuta(relativo, imp)));
        }

        const faltantes = [...alcanzables].filter((r) => !cacheados.has(`./${r}`));
        expect(
            faltantes,
            `módulos importados pero ausentes de STATIC_ASSETS: ${faltantes.join(', ')}`
        ).toEqual([]);
    });

    it('no debe listar en STATIC_ASSETS archivos que no existen', () => {
        // Al revés del anterior: una entrada colgada hace que el
        // install del worker rechace la promesa y el worker no
        // instale, dejando la app sin cachear del todo.
        const sw = leer('sw.js');
        const bloque = sw.match(/const STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/);
        const rutas = (bloque[1].match(/'([^']+)'/g) || []).map((c) => c.replace(/'/g, ''));

        const inexistentes = rutas.filter((ruta) => {
            if (ruta === './') return false;
            try {
                leer(ruta.replace(/^\.\//, ''));
                return false;
            } catch {
                return true;
            }
        });

        expect(inexistentes, `entradas de STATIC_ASSETS que no existen: ${inexistentes.join(', ')}`)
            .toEqual([]);
    });
});

/** Resuelve un import relativo contra el archivo que lo declara. */
function normalizarRuta(desde, importacion) {
    const partes = desde.split('/').slice(0, -1);
    for (const segmento of importacion.split('/')) {
        if (segmento === '.' || segmento === '') continue;
        if (segmento === '..') partes.pop();
        else partes.push(segmento);
    }
    return partes.join('/');
}

describe('superficie de versión', () => {
    it('APP_VERSION y SCHEMA_VERSION deben ser números válidos', () => {
        expect(APP_VERSION).toMatch(/^\d+\.\d+$/);
        expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    });

    it('DB_VERSION debe seguir exportándose como alias de SCHEMA_VERSION', () => {
        // Se mantiene por compatibilidad con app.js y cualquier
        // import externo. Si desaparece, algo fuera de este repo
        // deja de resolver el símbolo sin avisar.
        const db = leer('js/db.js');
        expect(db).toContain('export const DB_VERSION = SCHEMA_VERSION;');
    });

    it('js/version.js no debe importar nada', () => {
        // Tiene que poder cargarse en cualquier contexto, incluso
        // desde un service worker o un test, sin arrastrar Firebase.
        const version = leer('js/version.js');
        expect(version).not.toMatch(/^\s*import\s/m);
    });
});