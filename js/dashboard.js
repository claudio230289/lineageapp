// js/dashboard.js - Renderizado de paneles, reportes y exportación a WhatsApp

// Generar texto formateado para enviar por WhatsApp
function generarReporteWhatsApp(anioMes) {
    const datosMes = obtenerDatosMes(anioMes);
    const estructural = calcularResultadoEstructural(anioMes);
    const acreedores = obtenerTotalesPorAcreedor(anioMes);

    let mensaje = `📊 *Resumen Financiero - ${anioMes}* 📊\n\n`;
    
    mensaje += `💰 *Ingresos Totales:* $${estructural.totalIngresos.toLocaleString('es-AR')}\n`;
    mensaje += `📉 *Gastos Operativos:* $${estructural.totalGastosOperativos.toLocaleString('es-AR')}\n`;
    mensaje += `✨ *Resultado Estructural:* $${estructural.resultadoEstructural.toLocaleString('es-AR')}\n\n`;

    if (Object.keys(acreedores).length > 0) {
        mensaje += `🤝 *Deudas por Acreedor:*\n`;
        for (const [acreedor, monto] of Object.entries(acreedores)) {
            mensaje += `- ${acreedor}: $${monto.toLocaleString('es-AR')}\n`;
        }
        mensaje += `\n`;
    }

    mensaje += `📝 *Detalle de Gastos del Mes:*\n`;
    datosMes.gastos.forEach(g => {
        const estadoTxt = g.estado && g.estado !== 'pendiente' ? ` [${g.estado}]` : '';
        const acreedorTxt = g.acreedor ? ` (Acreedor: ${g.acreedor})` : '';
        mensaje += `• ${g.concepto}: $${Number(g.monto).toLocaleString('es-AR')}${acreedorTxt}${estadoTxt}\n`;
    });

    // Codificar para enlace de WhatsApp
    return encodeURIComponent(mensaje);
}

// Abrir WhatsApp con el reporte precargado
function enviarReporteWhatsApp(anioMes, numeroTelefono = '') {
    const mensajeCodificado = generarReporteWhatsApp(anioMes);
    const url = `https://wa.me/${numeroTelefono}?text=${mensajeCodificado}`;
    window.open(url, '_blank');
}

