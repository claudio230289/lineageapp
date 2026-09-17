// js/gastos.js - Gestión de gastos, acreedores, filtros y rollover

// Agregar o editar un gasto (preservando localStorage y sumando acreedor y estado)
function guardarGasto(gastoObj) {
    const db = obtenerBaseDatos();
    
    // Si trae ID, es una edición; si no, es uno nuevo
    if (gastoObj.id) {
        const index = db.gastos.findIndex(g => g.id === gastoObj.id);
        if (index !== -1) {
            db.gastos[index] = { ...db.gastos[index], ...gastoObj };
        }
    } else {
        gastoObj.id = 'gasto_' + Date.now();
        gastoObj.estado = 'pendiente'; // pendiente, pagado, prorrogado
        db.gastos.push(gastoObj);
    }
    
    guardarBaseDatos(db);
}

// Calcular total adeudado agrupado por acreedor (ej: Carlitos)
function obtenerTotalesPorAcreedor(anioMes) {
    const datosMes = obtenerDatosMes(anioMes);
    const acreedores = {};

    datosMes.gastos.forEach(gasto => {
        if (gasto.acreedor && gasto.acreedor.trim() !== '') {
            const nombreAcreedor = gasto.acreedor.trim();
            if (!acreedores[nombreAcreedor]) {
                acreedores[nombreAcreedor] = 0;
            }
            // Sumamos solo si está pendiente o general
            acreedores[nombreAcreedor] += Number(gasto.monto);
        }
    });

    return acreedores;
}

// Prórroga de deuda al mes siguiente (Rollover)
function prorrogarGasto(gastoId, mesActual) {
    const db = obtenerBaseDatos();
    const gastoIndex = db.gastos.findIndex(g => g.id === gastoId);
    
    if (gastoIndex === -1) return;

    const gastoOriginal = db.gastos[gastoIndex];
    gastoOriginal.estado = 'prorrogado';

    // Calculamos el mes siguiente (ej: "2026-09" pasa a "2026-10")
    const [anio, mes] = mesActual.split('-').map(Number);
    let nuevoAnio = anio;
    let nuevoMes = mes + 1;
    if (nuevoMes > 12) {
        nuevoMes = 1;
        nuevoAnio += 1;
    }
    const mesSiguiente = `${nuevoAnio}-${String(nuevoMes).padStart(2, '0')}`;

    // Creamos el registro duplicado/movido al mes siguiente
    const gastoRollover = {
        ...gastoOriginal,
        id: 'gasto_' + Date.now(),
        mes: mesSiguiente,
        estado: 'pendiente',
        observacion: `Prórroga desde ${mesActual}`
    };

    db.gastos.push(gastoRollover);
    guardarBaseDatos(db);
}

// Ordenar gastos por nombre o por monto
function ordenarGastos(gastosArray, criterio = 'monto', orden = 'desc') {
    return [...gastosArray].sort((a, b) => {
        if (criterio === 'nombre') {
            const valA = (a.concepto || '').toLowerCase();
            const valB = (b.concepto || '').toLowerCase();
            return orden === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            const valA = Number(a.monto || 0);
            const valB = Number(b.monto || 0);
            return orden === 'asc' ? valA - valB : valB - valA;
        }
    });
}

