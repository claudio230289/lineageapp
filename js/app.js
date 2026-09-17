// js/app.js - Inicializador principal de la aplicación

document.addEventListener('DOMContentLoaded', () => {
    console.log("Aplicación de Finanzas inicializada correctamente.");

    // Obtener mes actual por defecto (ej: "2026-09")
    const fechaActual = new Date();
    const anioActual = fechaActual.getFullYear();
    const mesActualNum = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const anioMesDefault = `${anioActual}-${mesActualNum}`;

    // Referencias básicas comunes (pueden ajustarse según tus IDs actuales en el HTML)
    const selectorMes = document.getElementById('selector-mes');
    if (selectorMes) {
        if (!selectorMes.value) selectorMes.value = anioMesDefault;
        selectorMes.addEventListener('change', (e) => {
            actualizarVistaGeneral(e.target.value);
        });
        
        // Carga inicial
        actualizarVistaGeneral(selectorMes.value);
    } else {
        // Si no hay selector todavía, cargamos con el mes por defecto
        actualizarVistaGeneral(anioMesDefault);
    }

    // Configurar botón de WhatsApp si existe
    const btnWhatsApp = document.getElementById('btn-whatsapp');
    if (btnWhatsApp) {
        btnWhatsApp.addEventListener('click', () => {
            const mesActual = selectorMes ? selectorMes.value : anioMesDefault;
            enviarReporteWhatsApp(mesActual);
        });
    }
});

// Función central para refrescar los datos en pantalla
function actualizarVistaGeneral(anioMes) {
    const datosMes = obtenerDatosMes(anioMes);
    const estructural = calcularResultadoEstructural(anioMes);
    const acreedores = obtenerTotalesPorAcreedor(anioMes);

    console.log(`--- Resumen para ${anioMes} ---`);
    console.log(`Ingresos: $${estructural.totalIngresos}`);
    console.log(`Gastos Operativos: $${estructural.totalGastosOperativos}`);
    console.log(`Resultado Estructural: $${estructural.resultadoEstructural}`);
    console.log(`Acreedores:`, acreedores);

    // Aquí podés disparar la actualización de tus elementos visuales del DOM (tarjetas, tablas, etc.)
}

