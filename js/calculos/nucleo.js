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

/* ---------- Fechas ---------- */

/**
 * Devuelve la clave "YYYY-MM" desplazada `offset` meses desde
 * `mesInicio`.
 *
 * Se calcula con aritmética de meses (año*12 + mes) y no sumando
 * al campo del mes, porque sumar directamente produce "2026-13" al
 * pasar de diciembre. Es tolerante a offsets negativos.
 *
 * Vive acá y no en js/utils/fechas.js porque: (a) es una función
 * pura que entra por parámetro, como el resto del núcleo, y (b) la
 * generación de cuotas la usa para ubicar cada cuota en su mes, así
 * que comparte la regla "todo cálculo nuevo va al núcleo".
 *
 * @param {string} mesInicio "YYYY-MM"
 * @param {number} offset Meses a desplazar (puede ser negativo)
 * @returns {string} "YYYY-MM"
 */
export function mesDesplazado(mesInicio, offset) {
    const [year, month] = String(mesInicio).split('-').map(Number);
    const totalMeses = year * 12 + (month - 1) + offset;
    const y = Math.floor(totalMeses / 12);
    // Módulo positivo: con offsets negativos el % de JS da negativo.
    const m = ((totalMeses % 12) + 12) % 12 + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
}

/* ---------- Ingresos ---------- */

/**
 * Calcula el neto de ingresos de una lista ya extraída del mes.
 *
 * El básico es POR TRABAJO, no global. Con dos o más trabajos
 * cargados en el mismo mes, tomar "el básico" global haría que un
 * porcentaje del trabajo B se calculara sobre el sueldo del
 * trabajo A. Cada ingreso en modo 'porcentaje' usa el básico del
 * trabajo al que pertenece (campo `trabajo`); si su trabajo no
 * tiene básico cargado, el porcentaje vale 0, nunca NaN.
 *
 * Si un mismo trabajo tuviera más de un ingreso 'Basico', TODOS
 * suman a `rem` —es la semántica histórica y evita perder plata
 * cargada— y el ÚLTIMO es el que se usa como base de los
 * porcentajes. En la práctica no hay más de uno por trabajo,
 * porque guardarIngreso borra el básico previo del mismo trabajo
 * antes de agregar.
 *
 * 'Bolsillo' es dinero que entra al bolsillo y suma al neto, así
 * que se acumula junto a 'Basico' y 'Remunerativo' en vez de abrir
 * un cuarto cubo que el recibo no muestra.
 *
 * @param {Array} ingresos Lista de ingresos del período
 * @returns {{rem:number, norem:number, ded:number, neto:number}}
 */
export function calcularNetoDesde(ingresos) {
    const lista = Array.isArray(ingresos) ? ingresos : [];

    // Un básico por trabajo. La clave es el trabajo normalizado:
    // los ingresos sin campo `trabajo` caen todos bajo la clave ''
    // (un solo trabajo implícito), que es el caso histórico.
    const basicosPorTrabajo = new Map();
    for (const ing of lista) {
        if (ing && ing.tipo === 'Basico') {
            basicosPorTrabajo.set(normalizarTexto(ing.trabajo), aNumero(ing.valor));
        }
    }

    let rem = 0;
    let norem = 0;
    let ded = 0;
    for (const ing of lista) {
        if (!ing) continue;
        // Un ingreso en porcentaje se calcula sobre el básico de SU
        // trabajo; si no hay básico para ese trabajo, el porcentaje
        // vale 0 en lugar de NaN.
        const basico = basicosPorTrabajo.get(normalizarTexto(ing.trabajo)) || 0;
        const valorCalculado = ing.modo === 'porcentaje'
            ? (basico * aNumero(ing.valor)) / 100
            : aNumero(ing.valor);

        if (ing.tipo === 'Basico' || ing.tipo === 'Remunerativo' || ing.tipo === 'Bolsillo') rem += valorCalculado;
        else if (ing.tipo === 'NoRemunerativo') norem += valorCalculado;
        else if (ing.tipo === 'Deduccion') ded += valorCalculado;
    }

    return { rem, norem, ded, neto: rem + norem - ded };
}

/**
 * Calcula el valor CALCULADO de un ingreso individual (para mostrarlo).
 * Replica exactamente la regla de calcularNetoDesde.
 * @param {Object} ingreso Ingreso del mes
 * @param {Map<string,number>} basicosPorTrabajo Mapa de básicos por trabajo
 * @returns {number}
 */
export function valorCalculadoIngreso(ingreso, basicosPorTrabajo) {
    if (!ingreso) return 0;
    const mapa = basicosPorTrabajo instanceof Map ? basicosPorTrabajo : new Map();
    const basico = mapa.get(normalizarTexto(ingreso.trabajo)) || 0;
    const valor = ingreso.modo === 'porcentaje'
        ? (basico * aNumero(ingreso.valor)) / 100
        : aNumero(ingreso.valor);
    return valor;
}

/**
 * Devuelve un mapa con valores calculados para todos los ingresos.
 * Para calcular porcentaje usa el último básico encontrado por trabajo (misma regla).
 * @param {Array} ingresos Lista de ingresos
 * @returns {Map<string,number>} Mapa por id
 */
export function mapaValoresIngreso(ingresos) {
    const lista = Array.isArray(ingresos) ? ingresos : [];
    const basicosPorTrabajo = new Map();
    for (const ing of lista) {
        if (ing && ing.id !== undefined && ing.tipo === 'Basico') {
            basicosPorTrabajo.set(normalizarTexto(ing.trabajo), aNumero(ing.valor));
        }
    }
    const mapa = new Map();
    for (const ing of lista) {
        if (ing && ing.id !== undefined) {
            mapa.set(ing.id, valorCalculadoIngreso(ing, basicosPorTrabajo));
        }
    }
    return mapa;
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
 * Los gastos desestimados (`desestimado === true`) NO se cuentan
 * en ningún total. Quedan visibles en la lista pero no afectan
 * los cálculos: ni fijos, ni únicos, ni cuotas, ni total, ni
 * pagado, ni pendientes. Esto permite marcar gastos que no se
 * quieren considerar temporalmente sin borrarlos.
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
        // Los gastos desestimados no cuentan en absoluto:
        // quedan visibles pero no afectan ningún total.
        if (gasto && gasto.desestimado) continue;
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