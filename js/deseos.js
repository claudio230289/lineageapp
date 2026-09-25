/* =========================================================
   SIMULADOR DE METAS Y CASCADA DE AHORRO (js/deseos.js)
   ========================================================= */
import { db, guardarBaseDatosLocal } from './db.js';
import { calcularNetoMes, calcularGastosMes, formatARS, obtenerMesActual } from './calculos.js';

let chartDeseos = null;

const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function formatMesLargo(claveYYYYMM) {
    const [y, m] = claveYYYYMM.split('-').map(Number);
    return `${MESES_NOMBRES[m - 1]} de ${y}`;
}

function parseMesLargoAKey(mesLargo) {
    if (!mesLargo) return null;
    const partes = mesLargo.split(' de ');
    if (partes.length !== 2) return null;
    const idx = MESES_NOMBRES.findIndex(m => m.toLowerCase() === partes[0].trim().toLowerCase());
    if (idx === -1) return null;
    return `${partes[1].trim()}-${String(idx + 1).padStart(2, '0')}`;
}

function claveMesHoy() {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

/* -----------------------------------------------------------
   Explicaciones interactivas al hacer clic en las tarjetas
----------------------------------------------------------- */
window.explicarAhorroMes = function() {
    window.alert("ℹ️ AHORRO MES:\n\nEs tu realidad financiera del mes actual sin anestesia. Surge de restar tus gastos totales reales a tus ingresos netos (Ingresos - Gastos). Muestra cuánto dinero te queda limpio hoy con tu estructura actual.");
};

window.explicarCapOptimizada = function() {
    window.alert("ℹ️ CAPACIDAD OPTIMIZADA:\n\nEs tu potencial estratégico de ahorro. Es el resultado de aplicar el porcentaje de recorte de gastos que seleccionaste en el menú superior. El dinero que evitas gastar se suma directamente aquí para potenciar tus metas.");
};

window.explicarAhorroAcumuladoEsperado = function() {
    window.alert("ℹ️ AHORRO ACUMULADO ESPERADO:\n\nEs el pozo histórico de caja hasta el mes que estás visualizando. Hacé clic en la tarjeta para editarlo y sobreescribir el valor manualmente. Si dejás el campo vacío, volverá a calcularse automáticamente por defecto.");
};

/* -----------------------------------------------------------
   Edición manual del Ahorro Acumulado Esperado
----------------------------------------------------------- */
window.editarAhorroAcumuladoEsperado = async function() {
    const mesActualReal = db.mesActivo || obtenerMesActual();
    
    if (!db.ahorrosAcumuladosManuales) db.ahorrosAcumuladosManuales = {};
    const valorActual = db.ahorrosAcumuladosManuales[mesActualReal] !== undefined 
        ? db.ahorrosAcumuladosManuales[mesActualReal] 
        : window._ultimoAcumuladoCalculado || 0;

    const nuevoValorStr = window.prompt(`Editar Ahorro Acumulado Esperado para (${mesActualReal}):\n(Dejar vacío para volver al valor por defecto)`, valorActual);
    if (nuevoValorStr === null) return; // Canceló

    if (nuevoValorStr.trim() === '') {
        // Si se deja vacío, se borra el override y vuelve al cálculo por defecto
        delete db.ahorrosAcumuladosManuales[mesActualReal];
    } else {
        const nuevoValor = parseFloat(String(nuevoValorStr).replace(',', '.'));
        if (isNaN(nuevoValor)) {
            window.alert('Monto inválido, no se guardaron cambios.');
            return;
        }
        db.ahorrosAcumuladosManuales[mesActualReal] = nuevoValor;
    }

    await persistirDB();
    renderizarDeseosYProyeccion();
};

/* -----------------------------------------------------------
   Persistencia real
----------------------------------------------------------- */
async function persistirDB() {
    try {
        await guardarBaseDatosLocal(db);
    } catch (e) {
        console.warn('[deseos.js] Error al persistir db:', e);
    }
}

/* -----------------------------------------------------------
   ACCIONES EXPLÍCITAS
----------------------------------------------------------- */
window.confirmarDeseoComprado = async function (id) {
    const deseo = (db.deseos || []).find(d => d.id === id);
    if (!deseo) return;
    if (deseo.comprado) return;

    deseo.comprado = true;
    deseo.fechaCompra = formatMesLargo(claveMesHoy());

    await persistirDB();
    renderizarDeseosYProyeccion();
};

window.editarDeseo = async function (id) {
    const deseo = (db.deseos || []).find(d => d.id === id);
    if (!deseo) return;

    const nuevoConcepto = window.prompt('Concepto / Meta:', deseo.concepto);
    if (nuevoConcepto === null) return;

    const nuevaMoneda = window.prompt('Moneda (ARS o USD):', deseo.moneda || 'ARS');
    if (nuevaMoneda === null) return;

    const nuevoMontoStr = window.prompt('Costo estimado:', deseo.monto);
    if (nuevoMontoStr === null) return;

    const nuevoMonto = parseFloat(String(nuevoMontoStr).replace(',', '.'));
    if (isNaN(nuevoMonto) || nuevoMonto <= 0) {
        window.alert('Monto inválido, no se guardaron cambios.');
        return;
    }

    deseo.concepto = nuevoConcepto.trim() || deseo.concepto;
    deseo.moneda = nuevaMoneda.trim().toUpperCase() === 'USD' ? 'USD' : 'ARS';
    deseo.monto = nuevoMonto;

    await persistirDB();
    renderizarDeseosYProyeccion();
};

if (typeof window.eliminarDeseo !== 'function') {
    window.eliminarDeseo = async function (id) {
        if (!window.confirm('¿Eliminar este deseo/meta? Esta acción no se puede deshacer.')) return;
        db.deseos = (db.deseos || []).filter(d => d.id !== id);
        await persistirDB();
        renderizarDeseosYProyeccion();
    };
}

export function renderizarDeseosYProyeccion() {
    const ctx = document.getElementById('chartCruceDeseos');
    const containerLista = document.getElementById('lista-deseos-proyectados');
    if (!containerLista) return;

    if (!window._deseosMonthListenerSet) {
        window._deseosMonthListenerSet = true;
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (btn && (btn.querySelector('.fa-chevron-left, .fa-chevron-right, .fa-angle-left, .fa-angle-right') || btn.textContent.includes('‹') || btn.textContent.includes('›'))) {
                setTimeout(renderizarDeseosYProyeccion, 150);
            }
        });
    }

    const cotizacionDolar = db.dolar || 1250;
    const mesActualReal = db.mesActivo || obtenerMesActual(); 
    const hoyDispositivo = new Date();
    const mesRealKey = `${hoyDispositivo.getFullYear()}-${String(hoyDispositivo.getMonth() + 1).padStart(2, '0')}`;
    const recortePct = parseFloat(document.getElementById('opt-recorte-gastos')?.value || 0);

    function obtenerNetoMesTeorico(mk) {
        const ing = calcularNetoMes(mk);
        const gas = calcularGastosMes(mk);
        return (ing.neto - gas.total);
    }

    const ingMotor = calcularNetoMes(mesRealKey);
    const gasMotor = calcularGastosMes(mesRealKey);
    const gastosOptMotor = gasMotor.total * (1 - recortePct / 100);
    const capOptimizadaMotor = ingMotor.neto - gastosOptMotor;

    const ingActual = calcularNetoMes(mesActualReal);
    const gasActual = calcularGastosMes(mesActualReal);
    const gastosOptActual = gasActual.total * (1 - recortePct / 100);
    const capOptimizadaActual = ingActual.neto - gastosOptActual;
    const ahorroMesReal = ingActual.neto - gasActual.total;
    const liberadoMes = capOptimizadaActual - ahorroMesReal;

    const deseosOriginales = (db.deseos || []).map((d, index) => {
        const costoARS = d.moneda === 'USD' ? d.monto * cotizacionDolar : d.monto;
        return {
            ...d,
            prioridad: index + 1,
            costoARS,
            alcanzado: !!d.comprado,
            mesAlcanzadoLabel: d.fechaCompra || '',
            mesesRequeridos: 0,
            confirmado: !!d.comprado
        };
    });

    const [currYear, currMonth] = mesRealKey.split('-').map(Number);
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const clavesConDatos = Array.from(new Set([
        ...Object.keys(db.ingresos || {}),
        ...Object.keys(db.gastos || {}),
        mesRealKey,
        mesActualReal
    ])).sort();

    const mesesCerrados = [...clavesConDatos].filter(k => k < mesRealKey).sort();

    // 2. SIMULACIÓN ACUMULATIVA DE 12 MESES (Respetando override en mesRealKey si existe)
    let pozoAcumulado = 0;
    const usarOverrideReal = (db.ahorrosAcumuladosManuales && db.ahorrosAcumuladosManuales[mesRealKey] !== undefined);

    if (usarOverrideReal) {
        pozoAcumulado = db.ahorrosAcumuladosManuales[mesRealKey];
    } else {
        let pozoHistoricoReal = 0;
        mesesCerrados.forEach(mk => {
            pozoHistoricoReal += obtenerNetoMesTeorico(mk);
        });
        const costoYaComprado = deseosOriginales
            .filter(d => d.confirmado)
            .reduce((acc, d) => acc + d.costoARS, 0);
        pozoHistoricoReal -= costoYaComprado;
        pozoAcumulado = pozoHistoricoReal;
    }

    const labelsChart = [];
    const seriePozoChart = [];
    const hitMilestones = [];

    const colaMetasGrafico = JSON.parse(JSON.stringify(deseosOriginales.filter(d => !d.confirmado)));
    const metasProcesadas = deseosOriginales.filter(d => d.confirmado);
    const mesAlcanzadoMap = {};

    for (let i = 0; i < 12; i++) {
        let m = currMonth + i;
        let y = currYear + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;

        const mesKeyIter = `${y}-${m < 10 ? '0' + m : m}`;
        const mesLabelCorto = `${mesesCortos[m - 1]} ${y}`;
        const mesLabelLargo = `${mesesNombres[m - 1]} de ${y}`;
        labelsChart.push(mesLabelCorto);

        let netoMesIter = 0;
        if (i === 0 && usarOverrideReal) {
            netoMesIter = 0; // Si hay override en el mes real, el mes 0 arranca directo con el valor editado
        } else {
            const tieneDatosMes = !!(db.ingresos?.[mesKeyIter] && db.gastos?.[mesKeyIter]);
            if (tieneDatosMes) {
                const ingM = calcularNetoMes(mesKeyIter);
                const gasM = calcularGastosMes(mesKeyIter);
                const gasOptM = gasM.total * (1 - recortePct / 100);
                netoMesIter = ingM.neto - gasOptM;
            } else {
                netoMesIter = capOptimizadaMotor;
            }
        }

        pozoAcumulado += netoMesIter;

        while (colaMetasGrafico.length > 0 && pozoAcumulado >= colaMetasGrafico[0].costoARS) {
            const meta = colaMetasGrafico.shift();
            pozoAcumulado -= meta.costoARS; 
            meta.alcanzado = true;
            meta.mesAlcanzadoLabel = mesLabelLargo;
            meta.mesKeyAlcanzado = mesKeyIter;
            meta.mesesRequeridos = i + 1;
            meta.xIndex = i;
            metasProcesadas.push(meta);

            mesAlcanzadoMap[meta.id] = mesKeyIter;

            hitMilestones.push({
                xIndex: i,
                label: `#${meta.prioridad} ${meta.concepto}`,
                mesLabel: mesLabelCorto
            });
        }

        seriePozoChart.push(pozoAcumulado);
    }

    colaMetasGrafico.forEach(meta => {
        meta.alcanzado = false;
        metasProcesadas.push(meta);
    });

    metasProcesadas.sort((a, b) => a.prioridad - b.prioridad);

    // 3. CÁLCULO DE AHORROS ACUMULADOS HASTA EL MES NAVEGADO
    let acumuladoHastaMesNavegado = 0;
    
    if (db.ahorrosAcumuladosManuales && db.ahorrosAcumuladosManuales[mesActualReal] !== undefined) {
        acumuladoHastaMesNavegado = db.ahorrosAcumuladosManuales[mesActualReal];
    } else {
        let primerMes = mesesCerrados.length > 0 ? mesesCerrados[0] : mesRealKey;
        if (mesActualReal < primerMes) primerMes = mesActualReal;

        function generarMesesEntre(mInicio, mFin) {
            const lista = [];
            let [y, m] = mInicio.split('-').map(Number);
            const [yf, mf] = mFin.split('-').map(Number);
            
            while (y < yf || (y === yf && m <= mf)) {
                lista.push(`${y}-${m < 10 ? '0' + m : m}`);
                m++;
                if (m > 12) {
                    m = 1;
                    y++;
                }
            }
            return lista;
        }

        const mesesAcumulacion = generarMesesEntre(primerMes, mesActualReal);
        const colaMetasAcum = JSON.parse(JSON.stringify(deseosOriginales));

        mesesAcumulacion.forEach(mk => {
            const tieneDatosMes = !!(db.ingresos?.[mk] && db.gastos?.[mk]);
            let netoMes = 0;
            if (mk < mesRealKey) {
                netoMes = obtenerNetoMesTeorico(mk);
            } else if (tieneDatosMes) {
                const ingM = calcularNetoMes(mk);
                const gasM = calcularGastosMes(mk);
                const gasOptM = gasM.total * (1 - recortePct / 100);
                netoMes = (ingM.neto - gasOptM);
            } else {
                netoMes = capOptimizadaMotor;
            }

            acumuladoHastaMesNavegado += netoMes;

            while (colaMetasAcum.length > 0) {
                const meta = colaMetasAcum[0];
                let compradoEnEsteMes = false;

                if (meta.confirmado && meta.fechaCompra) {
                    const compraKey = parseMesLargoAKey(meta.fechaCompra);
                    if (compraKey && compraKey <= mk) compradoEnEsteMes = true;
                } else if (mesAlcanzadoMap[meta.id] && mesAlcanzadoMap[meta.id] <= mk) {
                    compradoEnEsteMes = true;
                }

                if (compradoEnEsteMes && acumuladoHastaMesNavegado >= meta.costoARS) {
                    acumuladoHastaMesNavegado -= meta.costoARS;
                    colaMetasAcum.shift();
                } else {
                    break;
                }
            }
        });
    }

    window._ultimoAcumuladoCalculado = acumuladoHastaMesNavegado;

    // ORDEN EXACTO Y RECONSTRUCCIÓN DEL CONTENEDOR DE TARJETAS SUPERIORES
    const elBaseOld = document.getElementById('deseos-cap-base');
    const parentGrid = elBaseOld ? elBaseOld.closest('.grid') || elBaseOld.parentElement.parentElement : null;

    if (parentGrid) {
        parentGrid.innerHTML = `
            <!-- 1. Ahorro Acumulado Esperado (Editable, primera en aparecer) -->
            <div id="card-ahorro-acumulado-esperado" class="bg-indigo-50/75 rounded-2xl p-3 border border-indigo-200 cursor-pointer shadow-sm" title="Haz clic para editar este valor acumulado" onclick="window.editarAhorroAcumuladoEsperado()">
                <p id="deseos-acumulado-titulo" class="text-[10px] text-indigo-700 font-semibold uppercase flex items-center justify-between">
                    <span>Acum. Esperado (${mesActualReal})</span>
                    <span>✏️</span>
                </p>
                <p id="deseos-ahorro-acumulado-esperado" class="text-xs font-bold text-indigo-900 mt-0.5">${formatARS(acumuladoHastaMesNavegado)}</p>
            </div>

            <!-- 2. Ahorro Mes (Antes Ahorro Base) -->
            <div class="bg-gray-50 rounded-2xl p-3 border border-gray-200 cursor-pointer shadow-sm" onclick="window.explicarAhorroMes()">
                <p class="text-[10px] text-gray-400 font-semibold uppercase">Ahorro Mes</p>
                <p id="deseos-cap-base" class="text-xs font-bold text-gray-800 mt-0.5">${formatARS(ahorroMesReal)}</p>
            </div>

            <!-- 3. Capacidad Optimizada -->
            <div class="bg-gray-50 rounded-2xl p-3 border border-gray-200 cursor-pointer shadow-sm" onclick="window.explicarCapOptimizada()">
                <p class="text-[10px] text-gray-400 font-semibold uppercase">Cap. Optimizada</p>
                <p id="deseos-cap-optimizado" class="text-xs font-bold text-gray-800 mt-0.5">${formatARS(capOptimizadaActual)}</p>
            </div>

            <!-- 4. Liberado / Mes -->
            <div class="bg-emerald-50/50 rounded-2xl p-3 border border-emerald-100 shadow-sm">
                <p class="text-[10px] text-emerald-700 font-semibold uppercase">Liberado/mes</p>
                <p id="deseos-ahorro-recorte" class="text-xs font-bold text-emerald-900 mt-0.5">${formatARS(liberadoMes)}/mes</p>
            </div>
        `;
    }

    function diffEnMeses(claveDesde, claveHasta) {
        const [y1, m1] = claveDesde.split('-').map(Number);
        const [y2, m2] = claveHasta.split('-').map(Number);
        return (y2 - y1) * 12 + (m2 - m1);
    }
    const mesNavegado = mesActualReal; 

    const paletaCorte = ['#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16', '#a855f7'];
    const lineasCorte = metasProcesadas
        .filter(m => !m.confirmado)
        .map((m, idx) => ({
            costoARS: m.costoARS,
            label: `#${m.prioridad} ${m.concepto}`,
            color: paletaCorte[idx % paletaCorte.length]
        }));

    const maxSerie = Math.max(0, ...seriePozoChart);
    const sugeridoMaxY = Math.max(
        maxSerie,
        ...lineasCorte
            .map(l => l.costoARS)
            .filter(c => c <= maxSerie * 2.5 || lineasCorte.length === 1)
    ) * 1.12;

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
                badge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟢 Comprada · ${meta.mesAlcanzadoLabel}</span>`;
                fechaTexto = `Confirmada en <strong>${meta.mesAlcanzadoLabel}</strong>. Ya descontada de tu ahorro acumulado.`;
            } else if (meta.alcanzado) {
                const dist = diffEnMeses(mesNavegado, meta.mesKeyAlcanzado);

                if (dist <= 0) {
                    badge = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟡 Comprado · ${meta.mesAlcanzadoLabel}</span>`;
                    fechaTexto = `Se cumplió en <strong>${meta.mesAlcanzadoLabel}</strong> según la simulación.`;
                } else if (dist === 1) {
                    badge = `<span class="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔵 El mes que viene</span>`;
                    fechaTexto = `Lo cumplís el mes que viene (<strong>${meta.mesAlcanzadoLabel}</strong>) si se mantiene el ritmo actual.`;
                } else {
                    badge = `<span class="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔵 En ${dist} meses</span>`;
                    fechaTexto = `Lo cumplís en ${dist} meses (<strong>${meta.mesAlcanzadoLabel}</strong>) si se mantiene el ritmo actual.`;
                }
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
                </div>
                <p class="text-[11px] text-gray-600 border-t border-gray-200/60 pt-2 mt-1">${fechaTexto}</p>
                <div class="flex gap-2 pt-1">
                    ${!meta.confirmado ? `
                        <button onclick="window.confirmarDeseoComprado(${meta.id})" class="flex-1 text-[10px] font-bold bg-emerald-600 text-white rounded-lg py-1.5">
                            ✅ Comprado
                        </button>
                    ` : ''}
                    <button onclick="window.editarDeseo(${meta.id})" class="flex-1 text-[10px] font-bold bg-gray-200 text-gray-700 rounded-lg py-1.5">
                        ✏️ Editar
                    </button>
                    <button onclick="window.eliminarDeseo(${meta.id})" class="flex-1 text-[10px] font-bold bg-red-100 text-red-700 rounded-lg py-1.5">
                        🗑 Eliminar
                    </button>
                </div>
            `;
            containerLista.appendChild(card);
        });
    }

    // 5. Plugin Chart.js para líneas de hito verticales + líneas de corte horizontales
    const goalMilestonesPlugin = {
        id: 'goalMilestonesPlugin',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea, scales: { x, y } } = chart;
            if (!chartArea) return;
            const { left, right, top, bottom } = chartArea;

            if (lineasCorte && lineasCorte.length > 0 && y) {
                ctx.save();
                lineasCorte.forEach(linea => {
                    if (linea.costoARS > y.max) return;
                    if (y.min != null && linea.costoARS < y.min) return;

                    const yPos = y.getPixelForValue(linea.costoARS);

                    ctx.beginPath();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = linea.color;
                    ctx.lineWidth = 1.5;
                    ctx.moveTo(left, yPos);
                    ctx.lineTo(right, yPos);
                    ctx.stroke();

                    ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'bottom';
                    const text = linea.label;
                    const textWidth = ctx.measureText(text).width;
                    const padX = 4;

                    ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.fillRect(right - textWidth - padX * 2, yPos - 13, textWidth + padX * 2, 12);

                    ctx.fillStyle = linea.color;
                    ctx.fillText(text, right - padX, yPos - 1);
                });
                ctx.restore();
            }

            if (!hitMilestones || hitMilestones.length === 0 || !x) return;

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

                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#059669';
                ctx.lineWidth = 2;
                ctx.moveTo(xPos, top);
                ctx.lineTo(xPos, bottom);
                ctx.stroke();

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
                        suggestedMax: sugeridoMaxY > 0 ? sugeridoMaxY : undefined,
                        ticks: { font: { size: 9 }, callback: value => '$' + (value / 1000000).toFixed(1) + 'M' }
                    },
                    x: {
                        ticks: { font: { size: 9 } }
                    }
                }
            }
        });
    }

    renderizarLeyendaCortes(ctx, lineasCorte);
}

function renderizarLeyendaCortes(canvasEl, lineasCorte) {
    if (!canvasEl || !canvasEl.parentElement) return;

    let leyendaEl = document.getElementById('leyenda-cortes-deseos');
    if (!leyendaEl) {
        leyendaEl = document.createElement('div');
        leyendaEl.id = 'leyenda-cortes-deseos';
        leyendaEl.className = 'flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2 px-2';
        canvasEl.parentElement.insertAdjacentElement('afterend', leyendaEl);
    }

    if (!lineasCorte || lineasCorte.length === 0) {
        leyendaEl.innerHTML = '';
        return;
    }

    leyendaEl.innerHTML = lineasCorte.map(l => `
        <span class="inline-flex items-center gap-1 text-[10px] text-gray-600">
            <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${l.color};"></span>
            ${l.label}
        </span>
    `).join('');
}
