/* =========================================================
   NÚCLEO DE CÁLCULOS FINANCIEROS (js/calculos/nucleo.js)
   =========================================================
   Funciones PURAS: no importan db.js, no tocan el DOM y no
   mutan la información recibida. Todo entra por parámetro.

   Motivo de la separación: calculos.jsneeds leer el estado
   global (db.js), y db.js importa Firebase desde URLs https://
   que Node no puede resolver. Eso hacía imposible testear la
   lógica de cálculo y dejaba tests/calculos.test.js sin poder
   cargarse. acá vive el cálculo real y testeable; calculos.js
   queda como adaptador delgado que conserva las firmas
   públicas existentes.
   ========================================================= */

/* ---------- Conversiones defensivas ---------- */

/**
 * Convierte cualquier valor a número finito, sin romper con
 * basura guardada en respaldos JSON importados.
 *
 * Es crítico que NUNCA devuelva NaN: un NaN en un importe se
 * propaga a los totales y termina renderizado como "$ NaN" en
 * pantalla, que es peor que mostrar $ 0,00 porque oculta que
 * el dato está corrupto.
 *
 * @param {*} valor
 * @returns {number} Número finito, o 0 si no se pudo interpretar
 */
export function aNumero(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    if (typeof valor !== 'string') return 0;

    const limpio = valor.trim();
    if (limpio === '') return 0;

    // Formato argentino: "1.500,50" -> separador de miles con punto y decimal con coma.
    // Number() no lo entiende, así que se normaliza antes de convertir.
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio)) {
        const normalizado = limpio.replace(/\./g, '').replace(',', '.');
        const n = Number(normalizado);
        return Number.isFinite(n) ? n : 0;
    }

    const n = Number(limpio);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza texto para comparaciones: recorta, pasa a minúsculas
 * y quita tildes. Así "Únicos" y "unicos" se reconocen como la
 * misma categoría aunque uno venga de un select y otro de un
 * respaldo JSON importado a mano.
 *
 * @param {*} valor
 * @returns {string} Texto normalizado
 */
export function normalizarTexto(valor) {
    if (typeof valor !== 'string') return '';
    return valor
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza la categoría de un gasto a su clave interna
 * ('fijos' | 'unicos' | 'cuotas'), o '' si no es reconocible.
 *
 * @param {*} categoria
 * @returns {string}
 */
export function normalizarCategoria(categoria) {
    return normalizarTexto(categoria);
}

/* ---------- Estado de pago ---------- */

/**
 * Interpreta el atributo `pagado` de forma defensiva.
 *
 * El atributo está unificado en `pagado` en toda la app, pero
 * los datos pueden venir de respaldos JSON editados a mano, de
 * importaciones antiguas o de checkbox HTML, donde el valor
 * puede ser true, 1, '1' o 'true'. Cualquier otro valor
 * (incluido undefined) significa pendiente.
 *
 * @param {*} gasto
 * @returns {boolean}
 */
export function esPagado(gasto) {
    const valor = gasto ? gasto.pagado : undefined;
    if (valor === true || valor === 1) return true;
    if (typeof valor === 'string') {
        const t = normalizarTexto(valor);
        return t === 'true' || t === '1' || t === 'si';
    }
    return false;
}

/* ---------- Ingresos ---------- */

/**
 * Calcula el neto de ingresos de una lista ya extraída del mes.
 *
 * Preserva la semántica histórica del módulo: si hubiera más de
 * un ingreso de tipo 'Basico', gana el último (en la práctica
 * nunca hay más de uno, porque guardarIngreso borra el previo).
 *
 * @param {Array} ingresos Lista de ingresos del período
 * @returns {{rem:number, norem:number, ded:number, neto:number}}
 */
export function calcularNetoDesde(ingresos) {
    const lista = Array.isArray(ingresos) ? ingresos : [];

    let basico = 0;
    for (const ing of lista) {
        if (ing && ing.tipo === 'Basico') basico = aNumero(ing.valor);
    }

    let rem = 0;
    let norem = 0;
    let ded = 0;
    for (const ing of lista) {
        if (!ing) continue;
        // Un ingreso en porcentaje se calcula sobre el básico; si
        // viene sin valor numérico se trata como 0, no como NaN.
        const valor = ing.modo === 'porcentaje'
            ? (basico * aNumero(ing.valor)) / 100
            : aNumero(ing.valor);

        if (ing.tipo === 'Basico' || ing.tipo === 'Remunerativo') rem += valor;
        else if (ing.tipo === 'NoRemunerativo') norem += valor;
        else if (ing.tipo === 'Deduccion') ded += valor;
    }

    return { rem, norem, ded, neto: rem + norem - ded };
}

/* ---------- Gastos ---------- */

/**
 * Calcula el desglose de gastos de una lista ya extraída del mes.
 *
 * `total` suma TODOS los gastos, tengan o no categoría
 * reconocida. Antes se armaba como fijos+unicos+cuotas, lo que
 * dejaba afuera del total los gastos sin categoría o con una
 * categoría desconocida: el total mostraba menos que el detalle
 * que selista abajo, y que la suma del filtro y del
 * comprobante. Un gasto sin categoría sigue siendo un gasto que
 * hay que pagar.
 *
 * @param {Array} gastos Lista de gastos del período
 * @returns {{fijos:number, unicos:number, cuotas:number, total:number, pagado:number, pendientes:number}}
 */
export function calcularGastosDesde(gastos) {
    const lista = Array.isArray(gastos) ? gastos : [];

    let fijos = 0;
    let unicos = 0;
    let cuotas = 0;
    let total = 0;
    let pagado = 0;
    let pendientes = 0;

    for (const gasto of lista) {
        if (!gasto) continue;
        const monto = aNumero(gasto.monto);
        const categoria = normalizarCategoria(gasto.categoria);

        if (categoria === 'fijos') fijos += monto;
        else if (categoria === 'unicos') unicos += monto;
        else if (categoria === 'cuotas') cuotas += monto;

        total += monto;
        if (gasto && gasto.pasado) {
            // Gasto pasado al mes siguiente: no se cuenta como pendiente ni como pagado en este mes
        } else if (esPagado(gasto)) {
            pagado += monto;
        } else {
            pendientes += monto;
        }
    }

    return { fijos, unicos, cuotas, total, pagado, pendientes };
}

/* ---------- Pasivos ---------- */

/**
 * Suma la deuda de cuotas impagas que coincidan con una palabra
 * clave, sobre todos los meses cargados.
 *
 * @param {Object} gastosPorMes Mapa { 'YYYY-MM': Array<Gasto> }
 * @param {string} keyword Palabra clave de la regla de pasivo
 * @returns {{totalDeuda:number, cuotasRestantes:number}}
 */
export function calcularPasivoDesde(gastosPorMes, keyword) {
    const clave = normalizarTexto(keyword);
    const meses = gastosPorMes && typeof gastosPorMes === 'object' ? gastosPorMes : {};

    let totalDeuda = 0;
    let cuotasRestantes = 0;

    for (const mesKey of Object.keys(meses)) {
        const lista = Array.isArray(meses[mesKey]) ? meses[mesKey] : [];
        for (const gasto of lista) {
            if (!gasto) continue;
            if (normalizarCategoria(gasto.categoria) !== 'cuotas') continue;
            const concepto = normalizarTexto(gasto.concepto);
            if (clave && !concepto.includes(clave)) continue;
            if (esPagado(gasto)) continue;

            totalDeuda += aNumero(gasto.monto);
            cuotasRestantes++;
        }
    }

    return { totalDeuda, cuotasRestantes };
}