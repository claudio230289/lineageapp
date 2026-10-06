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

    const yaExiste = db.gastos[mesSiguiente].some(g => g.origenId === gasto.id && g.origenMes === mesActual);
    if (yaExiste) {
        return mostrarNotificacion('Este gasto ya fue pasado a ' + mesSiguiente + '.', 'info');
    }

    db.gastos[mesSiguiente].push({
        id: generarId(),
        concepto: gasto.concepto,
        categoria: gasto.categoria,
        monto: gasto.monto,
        pagado: false,
        origenMes: mesActual,
        origenId: gasto.id
    });

    guardarYRenderizar();
    notificarExito('Gasto pasado a ' + mesSiguiente + ' con trazabilidad (origen: ' + mesActual + ').');
}
