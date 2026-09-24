/* =========================================================
   SIMULADOR DE METAS Y CASCADA DE AHORRO (js/deseos.js)
   ========================================================= */
import { db } from './db.js';
import { calcularNetoMes, calcularGastosMes, formatARS, obtenerMesActual } from './calculos.js';

let chartDeseos = null;

/* -----------------------------------------------------------
   Helper de persistencia. 
   TODO: ajustar esta función al mecanismo real de guardado
   que exponga tu db.js (ej: guardarDB(), db.guardar(), etc).
   Si no existe ninguno, al menos deja un warning visible.
----------------------------------------------------------- */
function persistirDB() {
    try {
        if (typeof window !== 'undefined' && typeof window.guardarDB === 'function') {
            window.guardarDB();
        } else if (typeof db.guardar === 'function') {
            db.guardar();
        } else if (typeof db.save === 'function') {
            db.save();
        } else {
            console.warn('[deseos.js] No se encontró función de guardado en db.js. Conectar persistirDB() con tu mecanismo real (localStorage/API/etc).');
        }
    } catch (e) {
        console.warn('[deseos.js] Error al persistir db:', e);
    }
}

export function renderizarDeseosYProyeccion() {
    const ctx = document.getElementById('chartCruceDeseos');
    const containerLista = document.getElementById('lista-deseos-proyectados');
    if (!containerLista) return;

    const cotizacionDolar = db.dolar || 1250;

    // 1. ANCLAJE FIJO AL MES ACTUAL REAL (INDEPENDIENTE DEL SELECTOR SUPERIOR)
    const mesActualReal = obtenerMesActual(); // ej. '2026-09'
    const [currYear, currMonth] = mesActualReal.split('-').map(Number);

    // Capacidad base del mes actual real para proyección
    const ingActual = calcularNetoMes(mesActualReal);
    const gasActual = calcularGastosMes(mesActualReal);
    const recortePct = parseFloat(document.getElementById('opt-recorte-gastos')?.value || 0);

    const gastosOptActual = gasActual.total * (1 - recortePct / 100);
    const capOptimizadaActual = ingActual.neto - gastosOptActual;
    const ahorroBaseReal = ingActual.neto - gasActual.total;
    const liberadoMes = capOptimizadaActual - ahorroBaseReal;

    // Actualizar tarjetas superiores
    const elBase = document.getElementById('deseos-cap-base');
    if (elBase) elBase.innerText = formatARS(ahorroBaseReal);
    const elOpt = document.getElementById('deseos-cap-optimizado');
    if (elOpt) elOpt.innerText = formatARS(capOptimizadaActual);
    const elLib = document.getElementById('deseos-ahorro-recorte');
    if (elLib) elLib.innerText = `${formatARS(liberadoMes)}/mes`;

    // 2. Mapeo de metas — respeta el estado persistido "comprado"
    const deseosOriginales = (db.deseos || []).map((d, index) => {
        const costoARS = d.moneda === 'USD' ? d.monto * cotizacionDolar : d.monto;
        return {
            ...d,
            prioridad: index + 1,
            costoARS,
            alcanzado: !!d.comprado,
            mesAlcanzadoLabel: d.fechaCompra || '',
            mesesRequeridos: 0,
            confirmado: !!d.comprado // ya comprada de verdad (no proyección)
        };
    });

    // 2b. NUEVO: POZO HISTÓRICO REAL — suma de todos los meses CERRADOS
    // (anteriores al mes actual) con datos cargados. Esto es lo que hace
    // que el gráfico "acumule" en vez de arrancar de cero cada vez.
    const clavesConDatos = new Set([
        ...Object.keys(db.ingresos || {}),
        ...Object.keys(db.gastos || {})
    ]);
    const mesesCerrados = [...clavesConDatos].filter(k => k < mesActualReal).sort();

    let pozoHistoricoReal = 0;
    mesesCerrados.forEach(mk => {
        const ing = calcularNetoMes(mk);
        const gas = calcularGastosMes(mk);
        pozoHistoricoReal += (ing.neto - gas.total); // ahorro real, SIN optimización hipotética
    });

    // Restar el costo de las metas que ya están marcadas como compradas,
    // para no volver a "gastarlas" en la simulación.
    const costoYaComprado = deseosOriginales
        .filter(d => d.confirmado)
        .reduce((acc, d) => acc + d.costoARS, 0);
    pozoHistoricoReal -= costoYaComprado;

    // 3. SIMULACIÓN ACUMULATIVA DE 12 MESES, partiendo del pozo histórico real
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    let pozoAcumulado = pozoHistoricoReal;
    const labelsChart = [];
    const seriePozoChart = [];
    const hitMilestones = [];
    let huboCompraReal = false;

    // Sólo entran a la cola las metas que TODAVÍA no fueron compradas de verdad
    const colaMetas = JSON.parse(JSON.stringify(deseosOriginales.filter(d => !d.confirmado)));
    const metasProcesadas = deseosOriginales.filter(d => d.confirmado); // ya confirmadas, van tal cual

    for (let i = 0; i < 12; i++) {
        let m = currMonth + i;
        let y = currYear + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;

        const mesKeyIter = `${y}-${m < 10 ? '0' + m : m}`;
        const mesLabelCorto = `${mesesCortos[m - 1]} ${y}`;
        const mesLabelLargo = `${mesesNombres[m - 1]} de ${y}`;
        labelsChart.push(mesLabelCorto);

        // FIX: antes era OR (||), lo que inflaba/desinflaba el neto si sólo
        // había ingresos o sólo gastos cargados para ese mes. Ahora exige ambos.
        const tieneDatosMes = !!(db.ingresos?.[mesKeyIter] && db.gastos?.[mesKeyIter]);
        let netoMesIter = 0;

        if (tieneDatosMes) {
            const ingM = calcularNetoMes(mesKeyIter);
            const gasM = calcularGastosMes(mesKeyIter);
            const gasOptM = gasM.total * (1 - recortePct / 100);
            netoMesIter = ingM.neto - gasOptM;
        } else {
            netoMesIter = capOptimizadaActual;
        }

        // Acumulación secuencial mes a mes (Efecto arrastre)
        pozoAcumulado += netoMesIter;

        // Cascada estricta: Comprar metas en orden mientras el pozo acumulado alcance
        while (colaMetas.length > 0 && pozoAcumulado >= colaMetas[0].costoARS) {
            const meta = colaMetas.shift();
            pozoAcumulado -= meta.costoARS; // Drenaje exacto de caja por la compra
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

            // NUEVO: si el hito cae en el mes actual real (i === 0) y hay
            // datos reales cargados, la compra ya "pasó de verdad" — se
            // persiste y se resta permanentemente del pozo histórico.
            if (i === 0 && tieneDatosMes) {
                const original = (db.deseos || []).find(d => d.id === meta.id);
                if (original && !original.comprado) {
                    original.comprado = true;
                    original.fechaCompra = mesLabelLargo;
                    meta.confirmado = true;
                    huboCompraReal = true;
                }
            }
        }

        seriePozoChart.push(pozoAcumulado);
    }

    // Metas no alcanzadas en los 12 meses simulados
    colaMetas.forEach(meta => {
        meta.alcanzado = false;
        metasProcesadas.push(meta);
    });

    metasProcesadas.sort((a, b) => a.prioridad - b.prioridad);

    // Si hubo una compra confirmada en el mes actual, persistir en db
    if (huboCompraReal) {
        persistirDB();
    }

    // 3b. NUEVO: Líneas de corte horizontales — una por cada deseo
    // todavía no comprado, a la altura de su costo en pesos. Donde esa
    // línea cruza la curva de ahorro acumulado es el mes en que se cumple.
    const paletaCorte = ['#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16', '#a855f7'];
    const lineasCorte = metasProcesadas
        .filter(m => !m.confirmado)
        .map((m, idx) => ({
            costoARS: m.costoARS,
            label: `#${m.prioridad} ${m.concepto}`,
            color: paletaCorte[idx % paletaCorte.length]
        }));

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

            if (meta.confirmado) {
                // Comprada de verdad, con plata real ya descontada
                badge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟢 Comprada · ${meta.mesAlcanzadoLabel}</span>`;
                fechaTexto = `Confirmada en <strong>${meta.mesAlcanzadoLabel}</strong>. Ya descontada de tu ahorro acumulado.`;
            } else if (meta.alcanzado) {
                // Alcanzada sólo en la proyección futura (todavía no ocurrió)
                badge = `<span class="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔵 Proyectada · ${meta.mesAlcanzadoLabel}</span>`;
                fechaTexto = `Se cumpliría en <strong>${meta.mesAlcanzadoLabel}</strong> (acumulando ${meta.mesesRequeridos} mes(es)) si se mantiene el ritmo actual.`;
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

    // 6. Instanciación del gráfico. Ahora la serie ya parte del pozo
    // histórico real, así que se ve la acumulación mes a mes en vez de
    // resetear siempre al mismo punto de partida.
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
