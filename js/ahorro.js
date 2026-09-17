// js/ahorro.js - Cálculo del Resultado Estructural y Proyección de Deseos

// 1. Calcular el Resultado Estructural del mes (Ingresos - Gastos Operativos sin Ahorros)
function calcularResultadoEstructural(anioMes) {
    const datosMes = obtenerDatosMes(anioMes);
    
    // Total de ingresos
    const totalIngresos = datosMes.ingresos.reduce((acc, item) => acc + Number(item.monto), 0);

    // Gastos operativos obligatorios (excluyendo categoría de ahorro si la hubiera)
    const totalGastosOperativos = datosMes.gastos
        .filter(g => g.categoria !== 'Ahorro' && g.tipo !== 'ahorro')
        .reduce((acc, item) => acc + Number(item.monto), 0);

    // Resultado estructural (lo que realmente queda libre)
    const resultadoEstructural = totalIngresos - totalGastosOperativos;

    return {
        totalIngresos,
        totalGastosOperativos,
        resultadoEstructural
    };
}

// 2. Proyección de Deseos (Estilo reservas / metas)
function calcularProyeccionDeseo(costoDeseo, ahorroMensualPromedio) {
    if (!ahorroMensualPromedio || ahorroMensualPromedio <= 0) {
        return { meses: Infinity, mensaje: "Sin margen de ahorro estructural positivo para proyectar." };
    }

    const mesesNecesarios = Math.ceil(costoDeseo / ahorroMensualPromedio);
    
    // Calcular fecha estimada
    const fechaActual = new Date();
    fechaActual.setMonth(fechaActual.getMonth() + mesesNecesarios);
    
    const opcionesMes = { month: 'long', year: 'numeric' };
    const fechaEstimadaStr = fechaActual.toLocaleDateString('es-AR', opcionesMes);

    return {
        meses: mesesNecesarios,
        fechaEstimada: fechaEstimadaStr
    };
}

// Guardar o actualizar un deseo en la base de datos
function guardarDeseo(deseoObj) {
    const db = obtenerBaseDatos();
    if (!db.deseos) db.deseos = [];

    if (deseoObj.id) {
        const index = db.deseos.findIndex(d => d.id === deseoObj.id);
        if (index !== -1) {
            db.deseos[index] = { ...db.deseos[index], ...deseoObj };
        }
    } else {
        deseoObj.id = 'deseo_' + Date.now();
        db.deseos.push(deseoObj);
    }

    guardarBaseDatos(db);
}

