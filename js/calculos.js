/* =========================================================
   MÓDULO DE CÁLCULOS FINANCIEROS (js/calculos.js)
   ========================================================= */
import { db } from './db.js';

export function calcularNetoMes(mes) {
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

export function formatARS(val) {
    return '$ ' + Number(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function obtenerMesActual() {
    return db.mesActivo;
}
