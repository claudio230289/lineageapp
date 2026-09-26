/* =========================================================
   MÓDULO DE CÁLCULOS FINANCIEROS (js/calculos.js)
   ========================================================= */
import { db } from './db.js';

/* ------------------------------------------------------------------
   Cálculo del Neto del Mes con Herencia Automática de Ingresos Fijos
   ------------------------------------------------------------------ */
export function calcularNetoMes(mes) {
    if (!db.ingresos) db.ingresos = {};

    // Si el mes no tiene ingresos cargados, hereda automáticamente los fijos o recurrentes del período anterior
    if (!db.ingresos[mes] || db.ingresos[mes].length === 0) {
        const periodosRegistrados = Object.keys(db.ingresos).sort();
        if (periodosRegistrados.length > 0) {
            const periodosAnteriores = periodosRegistrados.filter(p => p < mes);
            const periodoBaseKey = periodosAnteriores.length > 0 
                ? periodosAnteriores[periodosAnteriores.length - 1] 
                : periodosRegistrados[0];
            
            const ingresosBase = db.ingresos[periodoBaseKey] || [];
            const recurrentes = ingresosBase.filter(i => i.fijo || i.recurrente || i.tipo === 'Basico');
            
            if (recurrentes.length > 0) {
                db.ingresos[mes] = recurrentes.map(i => ({ 
                    ...i, 
                    id: Date.now() + Math.floor(Math.random() * 1000) 
                }));
            }
        }
    }

    const lista = (db.ingresos && db.ingresos[mes]) || [];
    let basico = 0;
    lista.forEach(i => { if (i.tipo === 'Basico') basico = i.valor; });
    let rem = 0, norem = 0, ded = 0;
    lista.forEach(i => {
        let val = i.modo === 'porcentaje' ? (basico * i.valor) / 100 : i.valor;
        if (i.tipo === 'Basico' || i.tipo === 'Remunerativo') rem += val;
        else if (i.tipo === 'NoRemunerativo') norem += val;
        else if (i.tipo === 'Deduccion') ded += val;
    });
    return { rem, norem, ded, neto: (rem + norem - ded) };
}

/* ------------------------------------------------------------------
   Cálculo de Gastos del Mes
   ------------------------------------------------------------------ */
export function calcularGastosMes(mes) {
    const lista = (db.gastos && db.gastos[mes]) || [];
    let fijos = 0, unicos = 0, cuotas = 0, pagado = 0, pendientes = 0;
    lista.forEach(g => {
        const cat = (g.categoria || '').trim().toLowerCase();
        if (cat === 'fijos') fijos += Number(g.monto || 0);
        else if (cat === 'unicos') unicos += Number(g.monto || 0);
        else if (cat === 'cuotas') cuotas += Number(g.monto || 0);
        
        if (g.pagado) pagado += Number(g.monto || 0);
        else pendientes += Number(g.monto || 0);
    });
    return { fijos, unicos, cuotas, total: (fijos + unicos + cuotas), pagado, pendientes };
}

/* ------------------------------------------------------------------
   Cálculo de Pasivos por Palabra Clave
   ------------------------------------------------------------------ */
export function calcularPasivoPorKeyword(keyword) {
    let totalDeuda = 0;
    let cuotasRestantes = 0;
    const todosMeses = Object.keys(db.gastos || {});
    
    todosMeses.forEach(mKey => {
        const lista = db.gastos[mKey] || [];
        lista.forEach(g => {
            if (g.categoria === 'Cuotas' && g.concepto && g.concepto.toLowerCase().includes(keyword)) {
                if (!g.pagado) {
                    totalDeuda += Number(g.monto || 0);
                    cuotasRestantes++;
                }
            }
        });
    });
    return { totalDeuda, cuotasRestantes };
}

/* ------------------------------------------------------------------
   Funciones Utilitarias de Formato y Fechas
   ------------------------------------------------------------------ */
export function formatARS(val) {
    return '$ ' + Number(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function obtenerMesActual() {
    return db.mesActivo;
}
