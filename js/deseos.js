/* =========================================================
   MÓDULO DE DESEOS PROYECTIVOS & GRÁFICO DE CRUCE (deseos.js)
   ========================================================= */
let chartCruceInstance = null;

function renderizarDeseosYProyeccion() {
    const mes = obtenerMesActual();
    const ingCalc = calcularNetoMes(mes);
    const gasCalc = calcularGastosMes(mes);

    const selectOpt = document.getElementById('opt-recorte-gastos');
    const pctOpt = selectOpt ? parseFloat(selectOpt.value) : 0;

    const gastosDiscrecionales = gasCalc.unicos + gasCalc.cuotas;
    const ahorroPorRecorte = gastosDiscrecionales * (pctOpt / 100);
    const egresosOptimizados = gasCalc.total - ahorroPorRecorte;

    const capBase = ingCalc.neto - gasCalc.total;
    const capOptimizado = ingCalc.neto - egresosOptimizados;

    const capBaseEl = document.getElementById('deseos-cap-base');
    const capOptEl = document.getElementById('deseos-cap-optimizado');
    const ahorroRecorteEl = document.getElementById('deseos-ahorro-recorte');

    if (capBaseEl) capBaseEl.innerText = formatARS(capBase);
    if (capOptEl) capOptEl.innerText = formatARS(capOptimizado);
    if (ahorroRecorteEl) ahorroRecorteEl.innerText = formatARS(ahorroPorRecorte) + '/mes';

    const listaEl = document.getElementById('lista-deseos-proyectados');
    if (!listaEl) return;
    listaEl.innerHTML = '';

    const listaDeseos = db.deseos || [];
    if (listaDeseos.length === 0) {
        listaEl.innerHTML = '<p class="text-xs text-gray-400 text-center py-3 italic">No hay deseos cargados. Usá el formulario arriba para agregar uno.</p>';
        renderizarGraficoCruceDeseos([], capOptimizado, ingCalc.neto, egresosOptimizados);
        return;
    }

    listaDeseos.forEach((d, idx) => {
        const costoARS = d.moneda === 'USD' ? (Number(d.monto) * Number(db.dolar || 1250)) : Number(d.monto);

        let semaforoTag = '';
        let mesesBase = 0;
        let mesesOpt = 0;
        let textoPlazo = '';
        let tarjetaAcelerador = '';

        if (capBase >= costoARS) {
            semaforoTag = '<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟢 Compra Inmediata</span>';
            textoPlazo = '¡Comprás este mes sin deuda!';
        } else {
            mesesBase = capBase > 0 ? Math.ceil(costoARS / capBase) : 999;
            mesesOpt = capOptimizado > 0 ? Math.ceil(costoARS / capOptimizado) : 999;

            if (capOptimizado <= 0) {
                semaforoTag = '<span class="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔴 Bloqueado (Déficit)</span>';
                textoPlazo = `Requiere liberar ${formatARS(Math.abs(capOptimizado) + 1)}/mes en tus gastos`;
            } else {
                semaforoTag = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟡 En Camino (${mesesOpt} m)</span>`;

                const [y, m] = mes.split('-').map(Number);
                const fechaMeta = new Date(y, (m - 1) + mesesOpt, 1);
                const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                textoPlazo = `Fecha estimada: ${mesesNombres[fechaMeta.getMonth()]} ${fechaMeta.getFullYear()} (${mesesOpt} mes${mesesOpt > 1 ? 'es' : ''})`;

                if (pctOpt > 0 && mesesBase < 999 && mesesBase > mesesOpt) {
                    const gananciaMeses = mesesBase - mesesOpt;
                    tarjetaAcelerador = `
                        <div class="mt-2 text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-900 p-2 rounded-xl flex items-center justify-between">
                            <span><i class="fa-solid fa-bolt text-indigo-600 mr-1"></i>Acelerador (-${pctOpt}% gastos):</span>
                            <strong class="text-indigo-700 font-bold">¡Adelantás la compra ${gananciaMeses} mes${gananciaMeses > 1 ? 'es' : ''}!</strong>
                        </div>
                    `;
                }
            }
        }

        const card = document.createElement('div');
        card.className = 'bg-gray-50 border border-gray-200 p-3.5 rounded-2xl space-y-1.5';
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="flex items-center space-x-2">
                        <span class="text-xs font-bold text-gray-800">#${idx + 1} ${gastoEscaped(d.concepto)}</span>
                        ${semaforoTag}
                    </div>
                    <p class="text-[11px] text-gray-500 mt-1">
                        Costo: <strong class="text-gray-700">${d.moneda === 'USD' ? 'US$ ' + Number(d.monto).toLocaleString('es-AR') : formatARS(d.monto)}</strong>
                        ${d.moneda === 'USD' ? `<span class="text-[10px] text-gray-400">(≈ ${formatARS(costoARS)})</span>` : ''}
                    </p>
                </div>
                <button onclick="eliminarDeseo(${d.id})" class="text-red-400 hover:text-red-600 text-xs p-1" title="Eliminar deseo">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="text-[11px] text-gray-600 font-medium pt-1 border-t border-gray-200/60">
                ${textoPlazo}
            </div>
            ${tarjetaAcelerador}
        `;
        listaEl.appendChild(card);
    });

    renderizarGraficoCruceDeseos(listaDeseos, capOptimizado, ingCalc.neto, egresosOptimizados);
}

function gastoEscaped(txt) {
    return String(txt || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderizarGraficoCruceDeseos(deseos, capOptimizado, ingresoNeto, egresoOptimizado) {
    const ctx = document.getElementById('chartCruceDeseos');
    if (!ctx) return;

    const [baseYear, baseMonth] = db.mesActivo.split('-').map(Number);
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const labels = [];
    const serieAhorroAcumulado = [];
    const serieGastos = [];

    let acumulado = 0;
    const factorCap = Math.max(0, capOptimizado);

    for (let i = 0; i < 12; i++) {
        let m = baseMonth + i;
        let y = baseYear + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
        labels.push(`${mesesNombres[m - 1]} ${y}`);

        acumulado += factorCap;
        serieAhorroAcumulado.push(acumulado);
        serieGastos.push(egresoOptimizado);
    }

    const datasets = [
        {
            label: 'Ahorro Acumulado ($)',
            data: serieAhorroAcumulado,
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.3
        },
        {
            label: 'Egresos Optimizados ($)',
            data: serieGastos,
            borderColor: '#ef4444',
            borderWidth: 1.5,
            borderDash: [4, 4],
            fill: false
        }
    ];

    if (deseos && deseos.length > 0) {
        const primerDeseo = deseos[0];
        const costoDeseo1 = primerDeseo.moneda === 'USD' ? (Number(primerDeseo.monto) * Number(db.dolar || 1250)) : Number(primerDeseo.monto);
        const serieMetaDeseo = Array(12).fill(costoDeseo1);

        datasets.push({
            label: `Meta: ${primerDeseo.concepto}`,
            data: serieMetaDeseo,
            borderColor: '#10b981',
            borderWidth: 2,
            borderDash: [2, 2],
            fill: false
        });
    }

    if (chartCruceInstance) chartCruceInstance.destroy();

    chartCruceInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { boxWidth: 10, font: { size: 9 } }
                }
            },
            scales: {
                y: { ticks: { font: { size: 9 } } },
                x: { ticks: { font: { size: 9 } } }
            }
        }
    });
}

function guardarDeseo(e) {
    e.preventDefault();
    const concepto = document.getElementById('des-concepto').value.trim();
    const moneda = document.getElementById('des-moneda').value;
    const monto = parseFloat(document.getElementById('des-monto').value);
    if (!db.deseos) db.deseos = [];
    db.deseos.push({ id: Date.now(), concepto, moneda, monto });
    document.getElementById('form-deseo').reset();
    guardarYRenderizar();
}

function eliminarDeseo(id) {
    db.deseos = db.deseos.filter(d => d.id !== id);
    guardarYRenderizar();
}
