/* =========================================================
   SIMULADOR DE METAS Y CASCADA DE AHORRO (js/deseos.js)
   ========================================================= */
import { db } from './db.js';
import { calcularNetoMes, calcularGastosMes, formatARS } from './calculos.js';

let chartDeseos = null;

export function renderizarDeseosYProyeccion() {
    const ctx = document.getElementById('chartCruceDeseos');
    const containerLista = document.getElementById('lista-deseos-proyectados');
    if (!containerLista) return;

    const cotizacionDolar = db.dolar || 1250;

    // 1. ANCLAJE FIJO AL MES ACTUAL REAL (Septiembre 2026 -> Agosto 2027)
    const fechaActual = new Date();
    const currentYear = fechaActual.getFullYear();
    const currentMonth = fechaActual.getMonth() + 1; // 1 a 12

    // 2. CAPACIDAD DE AHORRO MENSUAL FIJA: Tomada del mes que estás visualizando o el actual
    const mesReferencia = db.mesActivo || `${currentYear}-${currentMonth < 10 ? '0' + currentMonth : currentMonth}`;
    const ingCalcRef = calcularNetoMes(mesReferencia);
    const gasCalcRef = calcularGastosMes(mesReferencia);
    const recortePct = parseFloat(document.getElementById('opt-recorte-gastos')?.value || 0);

    const gastosOptimizadosRef = gasCalcRef.total * (1 - recortePct / 100);
    const ahorroBase = ingCalcRef.neto - gasCalcRef.total;
    const ahorroOptimizado = ingCalcRef.neto - gastosOptimizadosRef;
    const liberadoMes = ahorroOptimizado - ahorroBase;

    // Actualizar tarjetas superiores
    const elBase = document.getElementById('deseos-cap-base');
    if (elBase) elBase.innerText = formatARS(ahorroBase);
    const elOpt = document.getElementById('deseos-cap-optimizado');
    if (elOpt) elOpt.innerText = formatARS(ahorroOptimizado);
    const elLib = document.getElementById('deseos-ahorro-recorte');
    if (elLib) elLib.innerText = `${formatARS(liberadoMes)}/mes`;

    // 3. Mapeo de metas
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

    // 4. SIMULACIÓN ACUMULATIVA DE 12 MESES (ROBUST Y ESTÁTICA)
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    let pozoAcumulado = 0;
    const labelsChart = [];
    const seriePozoChart = [];
    const hitMilestones = [];

    const colaMetas = JSON.parse(JSON.stringify(deseosOriginales));
    const metasProcesadas = [];

    // Recorremos estrictamente 12 meses hacia adelante fijos desde el mes actual real
    for (let i = 0; i < 12; i++) {
        let m = currentMonth + i;
        let y = currentYear + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
        
        const mesLabelCorto = `${mesesCortos[m - 1]} ${y}`;
        const mesLabelLargo = `${mesesNombres[m - 1]} de ${y}`;
        labelsChart.push(mesLabelCorto);

        // Acumulamos mes a mes la capacidad de ahorro optimizada constante
        pozoAcumulado += ahorroOptimizado;

        // Cascada estricta: Comprar metas en orden mientras el pozo acumulado alcance
        while (colaMetas.length > 0 && pozoAcumulado >= colaMetas[0].costoARS) {
            const meta = colaMetas.shift();
            pozoAcumulado -= meta.costoARS; // Drenaje exacto de caja
            meta.alcanzado = true;
            meta.mesAlcanzadoLabel = mesLabelLargo;
            meta.mesesRequeridos = i + 1;
            meta.xIndex = i;
            metasProcesadas.push(meta);

            hitMilestones.push({
                xIndex: i,
                label: `#${meta.prioridad} ${meta.concepto}`,
                mesLabel: mesLabelCorto
            });
        }

        seriePozoChart.push(pozoAcumulado);
    }

    // Metas no alcanzadas en los 12 meses
    colaMetas.forEach(meta => {
        meta.alcanzado = false;
        metasProcesadas.push(meta);
    });

    metasProcesadas.sort((a, b) => a.prioridad - b.prioridad);

    // 5. Renderizar Lista de Metas
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
                badge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟢 ${meta.mesAlcanzadoLabel}</span>`;
                fechaTexto = `Se cumple en <strong>${meta.mesAlcanzadoLabel}</strong> (acumulando ${meta.mesesRequeridos} mes(es) de ahorro).`;
            } else {
                badge = `<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔴 +12 Meses</span>`;
                fechaTexto = `Supera los 12 meses de proyección con el ahorro actual.`;
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

    // 6. Plugin Chart.js para dibujar líneas de hito verticales
    const goalMilestonesPlugin = {
        id: 'goalMilestonesPlugin',
        afterDatasetsDraw(chart) {
            if (!hitMilestones || hitMilestones.length === 0) return;
            const { ctx, chartArea, scales: { x } } = chart;
            if (!chartArea || !x) return;

            const { top, bottom } = chartArea;
            const grouped = {};
            hitMilestones.forEach(m => {
                if (!grouped[m.xIndex]) grouped[m.xIndex] = [];
                grouped[m.xIndex].push(m);
            });

            ctx.save();
            Object.keys(grouped).forEach(xIdxStr => {
                const xIdx = parseInt(xIdxStr, 10);
                if (isNaN(xIdx) || xIdx < 0 || xIdx >= chart.data.labels.length) return;

                const xPos = x.getPixelForValue(xIdx);
                const items = grouped[xIdxStr];

                // Línea vertical punteada verde
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#059669';
                ctx.lineWidth = 2;
                ctx.moveTo(xPos, top);
                ctx.lineTo(xPos, bottom);
                ctx.stroke();

                // Etiquetas arriba
                items.forEach((item, i) => {
                    const yPos = top - 18 - (i * 18);
                    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const text = `✓ ${item.label}`;
                    const textWidth = ctx.measureText(text).width;
                    const badgeWidth = textWidth + 10;
                    const badgeHeight = 16;

                    ctx.fillStyle = '#ecfdf5';
                    ctx.strokeStyle = '#059669';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([]);
                    
                    ctx.fillRect(xPos - badgeWidth / 2, yPos - badgeHeight / 2, badgeWidth, badgeHeight);
                    ctx.strokeRect(xPos - badgeWidth / 2, yPos - badgeHeight / 2, badgeWidth, badgeHeight);

                    ctx.fillStyle = '#047857';
                    ctx.fillText(text, xPos, yPos);
                });
            });
            ctx.restore();
        }
    };

    // 7. Instanciación del gráfico estático de 12 meses
    if (ctx) {
        if (chartDeseos) chartDeseos.destroy();
        chartDeseos = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labelsChart,
                datasets: [
                    {
                        label: 'Ahorro Acumulado ($)',
                        data: seriePozoChart,
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.2
                    }
                ]
            },
            plugins: [goalMilestonesPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 35
                    }
                },
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
