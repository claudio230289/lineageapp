/* =========================================================
   SIMULADOR DE METAS Y CASCADA DE AHORRO (js/deseos.js)
   ========================================================= */
import { db } from './db.js';
import { calcularNetoMes, calcularGastosMes, formatARS, obtenerMesActual } from './calculos.js';

let chartDeseos = null;

export function renderizarDeseosYProyeccion() {
    const ctx = document.getElementById('chartCruceDeseos');
    const containerLista = document.getElementById('lista-deseos-proyectados');
    if (!containerLista) return;

    // Anclamos la proyección continuamente desde el mes actual real
    const mesInicio = obtenerMesActual();
    const mesActivoFiltro = db.mesActivo || mesInicio;
    const cotizacionDolar = db.dolar || 1250;

    // 1. Capacidad de Ahorro Mensual
    const ingCalc = calcularNetoMes(mesActivoFiltro);
    const gasCalc = calcularGastosMes(mesActivoFiltro);
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

    // 2. Mapeo de metas con conversión a ARS y prioridades
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

    // 3. Simulación de Cascada (Waterfall FIFO con drenaje de pozo)
    let [year, month] = mesInicio.split('-').map(Number);
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    let pozoAcumulado = 0;
    const labelsChart = [];
    const seriePozoChart = [];
    const hitMilestones = [];

    const colaMetas = JSON.parse(JSON.stringify(deseosOriginales));
    const metasProcesadas = [];

    // Proyección a 36 meses
    for (let i = 0; i < 36; i++) {
        let m = month + i;
        let y = year + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
        const mesLabel = `${mesesNombres[m - 1]} ${y}`;
        labelsChart.push(mesLabel);

        // Sumamos capacidad mensual disponible
        pozoAcumulado += ahorroOptimizado;

        // Compramos en cascada mientras el pozo alcance (permite varias compras en un mismo mes)
        while (colaMetas.length > 0 && pozoAcumulado >= colaMetas[0].costoARS) {
            const meta = colaMetas.shift();
            pozoAcumulado -= meta.costoARS; // Drenamos el costo
            meta.alcanzado = true;
            meta.mesAlcanzadoLabel = mesLabel;
            meta.mesesRequeridos = i; // 0 = mes actual
            meta.xIndex = i;
            metasProcesadas.push(meta);

            hitMilestones.push({
                xIndex: i,
                label: `#${meta.prioridad} ${meta.concepto}`,
                mesLabel
            });
        }

        seriePozoChart.push(pozoAcumulado);
    }

    // Metas no alcanzadas dentro del rango de 36 meses
    colaMetas.forEach(meta => {
        meta.alcanzado = false;
        metasProcesadas.push(meta);
    });

    // Reordenar por la prioridad original asignada por el usuario
    metasProcesadas.sort((a, b) => a.prioridad - b.prioridad);

    // 4. Renderizar Tarjetas de Metas
    containerLista.innerHTML = '';
    if (metasProcesadas.length === 0) {
        containerLista.innerHTML = `<p class="text-xs text-gray-400 text-center py-4">No hay metas registradas.</p>`;
    } else {
        metasProcesadas.forEach(meta => {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-2';

            let badge = '';
            let fechaTexto = '';

            if (meta.alcanzado) {
                if (meta.mesesRequeridos === 0) {
                    badge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟢 Inmediato (${meta.mesAlcanzadoLabel})</span>`;
                    fechaTexto = `¡Comprás este mes (${meta.mesAlcanzadoLabel}) sin deuda!`;
                } else {
                    badge = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟡 ${meta.mesAlcanzadoLabel} (${meta.mesesRequeridos}m)</span>`;
                    fechaTexto = `Meta alcanzada en <strong>${meta.mesAlcanzadoLabel}</strong> (requiere ${meta.mesesRequeridos} meses de ahorro).`;
                }
            } else {
                badge = `<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔴 +36 Meses</span>`;
                fechaTexto = `Supera el horizonte de 36 meses con la capacidad de ahorro actual.`;
            }

            const costoFormateado = meta.moneda === 'USD' 
                ? `US$ ${meta.monto.toLocaleString('es-AR')} (~${formatARS(meta.costoARS)})`
                : formatARS(meta.costoARS);

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
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

    // 5. Plugin de Chart.js para dibujar Líneas de Hito Verticales con Etiquetas
    const goalMilestonesPlugin = {
        id: 'goalMilestonesPlugin',
        afterDraw(chart) {
            if (!hitMilestones || hitMilestones.length === 0) return;
            const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;

            const grouped = {};
            hitMilestones.forEach(m => {
                if (!grouped[m.xIndex]) grouped[m.xIndex] = [];
                grouped[m.xIndex].push(m);
            });

            ctx.save();
            Object.keys(grouped).forEach(xIdxStr => {
                const xIdx = parseInt(xIdxStr, 10);
                if (xIdx < 0 || xIdx >= chart.data.labels.length) return;

                const xPos = x.getPixelForValue(xIdx);
                const items = grouped[xIdxStr];

                // Línea vertical verde punteada
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#059669';
                ctx.lineWidth = 1.5;
                ctx.moveTo(xPos, top);
                ctx.lineTo(xPos, bottom);
                ctx.stroke();

                // Dibuja las etiquetas apiladas en la parte superior
                items.forEach((item, i) => {
                    const yPos = top + 14 + (i * 15);
                    if (yPos < bottom - 20) {
                        ctx.font = 'bold 9px system-ui, sans-serif';
                        ctx.textAlign = 'center';

                        const text = `✓ ${item.label}`;
                        const textWidth = ctx.measureText(text).width;

                        ctx.fillStyle = 'rgba(236, 253, 245, 0.95)';
                        ctx.fillRect(xPos - textWidth / 2 - 4, yPos - 9, textWidth + 8, 13);

                        ctx.strokeStyle = '#10b981';
                        ctx.lineWidth = 0.8;
                        ctx.setLineDash([]);
                        ctx.strokeRect(xPos - textWidth / 2 - 4, yPos - 9, textWidth + 8, 13);

                        ctx.fillStyle = '#047857';
                        ctx.fillText(text, xPos, yPos);
                    }
                });
            });
            ctx.restore();
        }
    };

    // 6. Gráfico de Remanente de Caja
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
            plugins: [goalMilestonesPlugin],
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
