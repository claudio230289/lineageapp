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

    // 1. ANCLAJE FIJO: Mes actual real del sistema (Octubre 2026)
    const mesActualReal = obtenerMesActual(); // ej. '2026-10'
    const cotizacionDolar = db.dolar || 1250;

    // Buscar capacidad de ahorro: Si el mes activo está en 0, buscamos el primer mes con superávit en el sistema
    let mesReferencia = db.mesActivo || mesActualReal;
    let ingCalc = calcularNetoMes(mesReferencia);
    let gasCalc = calcularGastosMes(mesReferencia);
    let ahorroOptimizado = Math.max(0, ingCalc.neto - gasCalc.total);

    if (ahorroOptimizado <= 0) {
        // Buscar en los meses disponibles si hay alguno con ingresos para usar como base de proyección
        const mesesDisponibles = Object.keys(db.ingresos || {});
        for (let mKey of mesesDisponibles) {
            const ingT = calcularNetoMes(mKey);
            const gasT = calcularGastosMes(mKey);
            const ahT = Math.max(0, ingT.neto - gasT.total);
            if (ahT > 0) {
                ahorroOptimizado = ahT;
                break;
            }
        }
    }

    const recortePct = parseFloat(document.getElementById('opt-recorte-gastos')?.value || 0);
    if (recortePct > 0) {
        ahorroOptimizado += (gasCalc.total * (recortePct / 100));
    }

    const ahorroBase = Math.max(0, ingCalc.neto - gasCalc.total);
    const liberadoMes = ahorroOptimizado - ahorroBase;

    // Actualizar tarjetas superiores
    const elBase = document.getElementById('deseos-cap-base');
    if (elBase) elBase.innerText = formatARS(ahorroBase);
    const elOpt = document.getElementById('deseos-cap-optimizado');
    if (elOpt) elOpt.innerText = formatARS(ahorroOptimizado);
    const elLib = document.getElementById('deseos-ahorro-recorte');
    if (elLib) elLib.innerText = `${formatARS(liberadoMes)}/mes`;

    // 2. Mapeo de metas
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

    // 3. Simulación Acumulativa a 12 meses exactos (Arrancando en Octubre 2026 / mes actual)
    let [year, month] = mesActualReal.split('-').map(Number);
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    let pozoAcumulado = 0;
    const labelsChart = [];
    const seriePozoChart = [];
    const hitMilestones = [];

    const colaMetas = JSON.parse(JSON.stringify(deseosOriginales));
    const metasProcesadas = [];

    // 12 meses: i = 0 es el mes actual (Octubre), i = 1 es Noviembre, etc.
    for (let i = 0; i < 12; i++) {
        let m = month + i;
        let y = year + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
        
        const mesLabelCorto = `${mesesCortos[m - 1]} ${y}`;
        const mesLabelLargo = `${mesesNombres[m - 1]} de ${y}`;
        labelsChart.push(mesLabelCorto);

        // Sumamos el ahorro mensual al pozo acumulativo
        pozoAcumulado += ahorroOptimizado;

        // Cascada: Comprar todo lo que alcance en este mes
        while (colaMetas.length > 0 && pozoAcumulado >= colaMetas[0].costoARS) {
            const meta = colaMetas.shift();
            pozoAcumulado -= meta.costoARS; // Drenaje de caja
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

    // Metas no alcanzadas
    colaMetas.forEach(meta => {
        meta.alcanzado = false;
        metasProcesadas.push(meta);
    });

    metasProcesadas.sort((a, b) => a.prioridad - b.prioridad);

    // 4. Renderizar Lista de Metas
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

    // 5. Plugin Chart.js para líneas de hito verticales
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

                // Etiquetas apiladas arriba
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

    // 6. Instanciación del gráfico
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
