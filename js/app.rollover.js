import { db, guardarTodo } from './db.js';
import { obtenerMesActual } from './calculos.js';
import { obtenerMesSiguiente, obtenerMesAnterior } from './utils/fechas.js';
import { generarId, coincideId } from './utils/id.js';
import { esPagado } from './calculos.js';
import { mostrarNotificacion, notificarExito } from './notificaciones.js';

/* =========================================================
   ROLLOVER DE GASTOS CON TRAZABILIDAD COMPLETA
   =========================================================
   El rollover MUEVE un gasto pendiente al mes siguiente (no lo
   copia). Así no duplica en pasivos ni en totales.

   Cada gasto movido acumula una cadena de origen en
   `cadenaOrigen`: si un gasto de octubre pasa a noviembre y
   luego a diciembre, en diciembre se ve "Viene de Octubre"
   (el origen original), no solo "Viene de Noviembre".

   La cadena se construye concatenando los meses de origen
   separados por ' → '. Si el gasto ya tenía cadena (venía de un
   rollover anterior), se extiende; si no, se crea desde cero.
   ========================================================= */

/**
 * Construye la cadena de origen para un gasto que se mueve.
 * Si el gasto ya tenía cadena (venía de otro rollover), la extiende.
 * Si no, la crea desde el mes actual.
 *
 * @param {Object} gasto Gasto que se está moviendo
 * @param {string} mesActual Mes desde el que se mueve
 * @returns {string} Cadena de origen acumulada
 */
function construirCadenaOrigen(gasto, mesActual) {
    const cadenaPrevia = (typeof gasto.cadenaOrigen === 'string' && gasto.cadenaOrigen.trim() !== '')
        ? gasto.cadenaOrigen.trim()
        : '';
    return cadenaPrevia ? `${cadenaPrevia} → ${mesActual}` : mesActual;
}

/**
 * Mueve un gasto pendiente al mes siguiente (rollover).
 *
 * A diferencia de la versión anterior que COPIABA, esta función
 * MUEVE: quita el gasto del mes original y lo pone en el mes
 * siguiente. Así no duplica en pasivos ni en totales.
 *
 * El gasto conserva su ID original para mantener la trazabilidad
 * y se guarda `origenMes` (mes del que viene) y `cadenaOrigen`
 * (cadena completa de meses de origen).
 *
 * @param {string} id ID del gasto a mover
 */
export function pasarGastoAlSiguiente(id) {
    const mesActual = obtenerMesActual();
    const mesSiguiente = obtenerMesSiguiente(mesActual);
    const listaActual = (db.gastos && db.gastos[mesActual]) || [];
    const gasto = listaActual.find(g => coincideId(g.id, id));

    if (!gasto) {
        return mostrarNotificacion('No se encontró el gasto a pasar.', 'warning');
    }
    if (esPagado(gasto)) {
        return mostrarNotificacion('Solo se pueden pasar gastos pendientes.', 'info');
    }

    if (!db.gastos) db.gastos = {};
    if (!db.gastos[mesSiguiente]) db.gastos[mesSiguiente] = [];

    // Verificar que no exista ya en el mes siguiente (evitar duplicados)
    const yaExiste = db.gastos[mesSiguiente].some(g => coincideId(g.id, gasto.id));
    if (yaExiste) {
        return mostrarNotificacion('Este gasto ya fue pasado a ' + mesSiguiente + '.', 'info');
    }

    // Construir la cadena de origen ANTES de mover
    const cadena = construirCadenaOrigen(gasto, mesActual);

    // MUEVE: quitar del mes original
    db.gastos[mesActual] = listaActual.filter(g => !coincideId(g.id, id));

    // Poner en el mes siguiente con trazabilidad
    db.gastos[mesSiguiente].push({
        id: gasto.id, // Conserva el mismo ID para trazabilidad
        concepto: gasto.concepto,
        categoria: gasto.categoria,
        monto: gasto.monto,
        pagado: false,
        origenMes: mesActual,
        cadenaOrigen: cadena,
        desestimado: gasto.desestimado || false
    });

    if (typeof window !== 'undefined' && window.guardarYRenderizar) {
        window.guardarYRenderizar();
    } else {
        guardarTodo && guardarTodo();
    }
    notificarExito('Gasto pasado a ' + mesSiguiente + ' con trazabilidad (origen: ' + cadena + ').');
}

/**
 * Deshace el rollover de un gasto: lo devuelve al mes original
 * y lo marca como no pasado.
 *
 * Solo disponible para gastos que tienen `origenMes` (es decir,
 * que fueron movidos por rollover). El gasto vuelve al mes
 * indicado en `origenMes` y se limpian los campos de trazabilidad.
 *
 * @param {string} id ID del gasto a deshacer
 */
export function deshacerRollover(id) {
    const mesActual = obtenerMesActual();
    const listaActual = (db.gastos && db.gastos[mesActual]) || [];
    const gasto = listaActual.find(g => coincideId(g.id, id));

    if (!gasto) {
        return mostrarNotificacion('No se encontró el gasto.', 'warning');
    }
    if (!gasto.origenMes) {
        return mostrarNotificacion('Este gasto no tiene rollover para deshacer.', 'info');
    }

    const mesOrigen = gasto.origenMes;

    if (!db.gastos) db.gastos = {};
    if (!db.gastos[mesOrigen]) db.gastos[mesOrigen] = [];

    // Verificar que no exista ya en el mes de origen (evitar duplicados)
    const yaExiste = db.gastos[mesOrigen].some(g => coincideId(g.id, gasto.id));
    if (yaExiste) {
        return mostrarNotificacion('Ya existe un gasto con este ID en ' + mesOrigen + '.', 'warning');
    }

    // Quitar del mes actual
    db.gastos[mesActual] = listaActual.filter(g => !coincideId(g.id, id));

    // Devolver al mes original, limpiando campos de rollover
    db.gastos[mesOrigen].push({
        id: gasto.id,
        concepto: gasto.concepto,
        categoria: gasto.categoria,
        monto: gasto.monto,
        pagado: false,
        desestimado: gasto.desestimado || false
        // No se copian origenMes, cadenaOrigen, pasado, pasadoAMes, pasadoEn
    });

    if (typeof window !== 'undefined' && window.guardarYRenderizar) {
        window.guardarYRenderizar();
    } else {
        guardarTodo && guardarTodo();
    }
    notificarExito('Rollover deshecho. Gasto devuelto a ' + mesOrigen + '.');
}

/**
 * Verifica si un gasto tiene rollover (fue movido desde otro mes).
 * @param {Object} gasto
 * @returns {boolean}
 */
export function tieneRollover(gasto) {
    return !!(gasto && gasto.origenMes);
}
