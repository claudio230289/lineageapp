/* =========================================================
   SIMULADOR DE METAS Y CASCADA DE AHORRO (js/deseos.js)
   ========================================================= */
import { db, guardarBaseDatosLocal } from './db.js';
import { calcularNetoMes, calcularGastosMes, formatARS, obtenerMesActual } from './calculos.js';

let chartDeseos = null;

export function renderizarDeseosYProyeccion() {
    const ctx = document.getElementById('chartCruceDeseos');
    const containerLista = document.getElementById('lista-deseos-proyectados');
    if (!containerLista) return;

    const mesBase = db.mesActivo || obtenerMesActual();
    const cotizacionDolar = db.dolar || 1250;

    // 1. Capacidad de Ahorro Mensual del mes activo
    const ingCalc = calcularNetoMes(mesBase);
    const gasCalc = calcularGastosMes(mesBase);
    const recortePct = parseFloat(document.getElementById('opt-recorte-gastos')?.value || 0);

    const gastosOptimizados = gasCalc.total * (1 - recortePct / 100);
    const ahorroBase = Math.max(0, ingCalc.neto - gasCalc.total);
    const ahorroOptimizado = Math.max(0, ingCalc.neto - gastosOptimizados);
    const liberadoMes = ahorroOptimizado - ahorroBase;

    // Actualizar UI de métricas superiores
    const elBase = document.getElementById('deseos-cap-base');
    if (elBase) elBase.innerText = formatARS(ahorroBase);
    const elOpt = document.getElementById('deseos-cap-optimizado');
    if (elOpt) elOpt.innerText = formatARS(ahorroOptimizado);
    const elLib = document.getElementById('deseos-ahorro-recorte');
    if (elLib) elLib.innerText = `${formatARS(liberadoMes)}/mes`;

    // 2. Mapeo de metas con conversión a ARS
    const deseosOriginales = (db.deseos || []).map((d, index) => {
        const costoARS = d.moneda === 'USD' ? d.monto * cotizacionDolar : d.monto;
        return {
            ...d,
            prioridad: index + 1,
            costoARS,
            alcanzado: false,
            mesAlcanzadoLabel: '',
            mesesRequeridos: 0
        };
    });

    // 3. Simulación de Cascada (Waterfall / Cola FIFO con drenaje de caja)
    let [year, month] = mesBase.split('-').map(Number);
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    let pozoAcumulado = 0;
    const labelsChart = [];
    const seriePozoChart = [];
    const metasEnCola = JSON.parse(JSON.stringify(deseosOriginales));

    for (let i = 0; i < 24; i++) {
        let m = month + i;
        let y = year + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
        const mesLabel = `${mesesNombres[m - 1]} ${y}`;
        labelsChart.push(mesLabel);

        // Sumamos el ingreso/ahorro mensual disponible
        pozoAcumulado += ahorroOptimizado;

        // Evaluación en Cascada Secuencial (FIFO)
        for (let meta of metasEnCola) {
            if (!meta.alcanzado) {
                if (pozoAcumulado >= meta.costoARS) {
                    // Se efectúa la compra: Drenamos el costo del pozo
                    pozoAcumulado -= meta.costoARS;
                    meta.alcanzado = true;
                    meta.mesAlcanzadoLabel = mesLabel;
                    meta.mesesRequeridos = i; // 0 = este mes
                } else {
                    // Si no alcanza para la meta prioritaria, se detiene la evaluación
                    break;
                }
            }
        }

        seriePozoChart.push(pozoAcumulado);
    }

    // 4. Renderizar Tarjetas de Metas
    containerLista.innerHTML = '';
    if (metasEnCola.length === 0) {
        containerLista.innerHTML = `<p class="text-xs text-gray-400 text-center py-4">No hay metas registradas.</p>`;
    } else {
        metasEnCola.forEach(meta => {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-2';

            let badge = '';
            let fechaTexto = '';

            if (meta.alcanzado) {
                if (meta.mesesRequeridos === 0) {
                    badge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟢 Compra Inmediata</span>`;
                    fechaTexto = `¡Comprás este mes sin deuda!`;
                } else {
                    badge = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟡 En Camino (${meta.mesesRequeridos} m)</span>`;
                    fechaTexto = `Fecha estimada: <strong>${meta.mesAlcanzadoLabel}</strong> (${meta.mesesRequeridos} meses)`;
                }
            } else {
                badge = `<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔴 +24 Meses</span>`;
                fechaTexto = `Supera el horizonte de proyección actual (24 meses)`;
            }

            const costoFormateado = meta.moneda === 'USD' 
                ? `US$ ${meta.monto.toLocaleString('es-AR')} (~${formatARS(meta.costoARS)})`
                : formatARS(meta.costoARS);

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-xs text-gray-800">#${meta.prioridad} ${meta.concepto}</span>
                            ${badge}
                        </div>
                        <p class="text-xs text-gray-500 mt-1">Costo: <strong>${costoFormateado}</strong></p>
                    </div>
                    <button onclick="window.eliminarDeseo(${meta.id})" class="text-red-400 hover:text-red-600 text-xs p-1">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <p class="text-[11px] text-gray-600 border-t border-gray-200/60 pt-2 mt-1">${fechaTexto}</p>
            `;
            containerLista.appendChild(card);
        });
    }

    // 5. Gráfico de Remanente de Caja
    if (ctx) {
        if (chartDeseos) chartDeseos.destroy();
        chartDeseos = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labelsChart,
                datasets: [
                    {
                        label: 'Fondo Remanente ($)',
                        data: seriePozoChart,
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
                },
                scales: {
                    y: {
                        ticks: { font: { size: 9 }, callback: value => '$' + (value / 1000000).toFixed(1) + 'M' }
                    },
                    x: {
                        ticks: { font: { size: 9 } }
                    }
                }
            }
        });
    }
}
