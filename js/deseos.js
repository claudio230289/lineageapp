/* =========================================================
   SIMULADOR DE METAS Y CASCADA DE AHORRO (js/deseos.js)
   ========================================================= */
import { db, guardarBaseDatosLocal } from './db.js';
import { calcularNetoMes, calcularGastosMes, formatARS, obtenerMesActual } from './calculos.js';

let chartDeseos = null;

const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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
    window.alert("ℹ️ AHORRO NETO MES:\n\nEs tu realidad financiera del mes actual sin anestesia. Surge de restar tus gastos totales reales a tus ingresos netos (Ingresos - Gastos). Muestra cuánto dinero te queda limpio hoy con tu estructura actual.");
};

window.explicarCapOptimizada = function() {
    window.alert("ℹ️ CAPACIDAD OPTIMIZADA:\n\nEs tu potencial estratégico de ahorro. Es el resultado de aplicar el porcentaje de recorte de gastos que seleccionaste en el menú superior.");
};

window.explicarAhorroAcumuladoEsperado = function() {
    window.alert("ℹ️ INICIO ESPERADO:\n\nEs el pozo de caja inicial con el que arranca el mes. Hacé clic para editarlo (admite 0 y negativos). Al modificarlo, las metas proyectadas y las curvas se recalculan y desplazan inmediatamente.");
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

    const nuevoValorStr = window.prompt(`Editar Inicio Esperado para (${mesActualReal}):\n(Admite 0 y negativos. Dejar vacío para volver al valor teórico)`, valorActual);
    if (nuevoValorStr === null) return;

    if (nuevoValorStr.trim() === '') {
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
   ACCIONES EXPLÍCITAS (Deseos)
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
    const mesActualReal = db.mesActivo || obtenerMesActual(); // Mes seleccionado en el selector superior
    const hoyDispositivo = new Date();
    const mesRealKey = `${hoyDispositivo.getFullYear()}-${String(hoyDispositivo.getMonth() + 1).padStart(2, '0')}`;
    const recortePct = parseFloat(document.getElementById('opt-recorte-gastos')?.value || 0);

    function obtenerNetoOptimizadoMes(mk) {
        const ingM = calcularNetoMes(mk);
        const gasM = calcularGastosMes(mk);
        const gasOptM = gasM.total * (1 - recortePct / 100);
        return (ingM.neto - gasOptM);
    }

    const deseosOriginales = (db.deseos || []).map((d, index) => {
        const costoARS = d.moneda === 'USD' ? d.monto * cotizacionDolar : d.monto;
        return {
            ...d,
            prioridad: index + 1,
            costoARS,
            confirmado: !!d.comprado
        };
    });

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

    const clavesConDatos = Array.from(new Set([
        ...Object.keys(db.ingresos || {}),
        ...Object.keys(db.gastos || {}),
        mesRealKey,
        mesActualReal
    ])).sort();

    const primerMesHistorico = clavesConDatos.length > 0 ? clavesConDatos[0] : mesRealKey;

    const [lastY, lastM] = mesRealKey.split('-').map(Number);
    const fechaFutura = new Date(lastY, lastM + 17, 1);
    const mesFinHorizonte = `${fechaFutura.getFullYear()}-${String(fechaFutura.getMonth() + 1).padStart(2, '0')}`;
    const todosLosMeses = generarMesesEntre(primerMesHistorico, mesFinHorizonte);

    // --- MOTOR GLOBAL DE CASCADA Y PROYECCIÓN MÚLTIPLE ---
    let pozoCascada = 0;
    let colaMetasSimuladas = JSON.parse(JSON.stringify(deseosOriginales.filter(d => !d.confirmado)));
    const metasProcesadas = deseosOriginales.filter(d => d.confirmado);
    
    const mapaResultadosMeses = {};
    let inicioMesActual = 0;
    let cierreMesActual = 0;
    let ahorroMesActualNeto = 0;
    let deseoDelMesConcepto = 'Ninguno';
    let deseoDelMesMonto = 0;

    todosLosMeses.forEach((mk) => {
        if (db.ahorrosAcumuladosManuales && db.ahorrosAcumuladosManuales[mk] !== undefined) {
            pozoCascada = db.ahorrosAcumuladosManuales[mk];
        }

        const inicioMes = pozoCascada;
        const ahorroMes = obtenerNetoOptimizadoMes(mk);
        let subtotal = inicioMes + ahorroMes;

        let metasCumplidasEnMes = [];

        // 1. Revisar deseos confirmados manualmente para este mes exacto
        deseosOriginales.forEach(meta => {
            if (meta.confirmado && meta.fechaCompra) {
                const cKey = parseMesLargoAKey(meta.fechaCompra);
                if (cKey === mk) {
                    subtotal -= meta.costoARS;
                    metasCumplidasEnMes.push({ ...meta, tipo: 'confirmado' });
                }
            }
        });

        // 2. Bucle while: Consumir todos los deseos simulados que entren holgadamente en el subtotal de este mes
        while (colaMetasSimuladas.length > 0) {
            const metaSugerida = colaMetasSimuladas[0];
            if (subtotal > 0 && subtotal >= metaSugerida.costoARS) {
                subtotal -= metaSugerida.costoARS;
                const [yNum, mNum] = mk.split('-').map(Number);
                metaSugerida.alcanzado = true;
                metaSugerida.mesKeyAlcanzado = mk;
                metaSugerida.mesAlcanzadoLabel = `${MESES_NOMBRES[mNum - 1]} de ${yNum}`;
                metasProcesadas.push(metaSugerida);
                metasCumplidasEnMes.push({ ...metaSugerida, tipo: 'simulado' });
                colaMetasSimuladas.shift();
            } else {
                break;
            }
        }

        const cierreMes = subtotal;
        pozoCascada = cierreMes;

        mapaResultadosMeses[mk] = {
            inicio: inicioMes,
            ahorro: ahorroMes,
            cierre: cierreMes,
            metasDelMes: metasCumplidasEnMes
        };

        if (mk === mesActualReal) {
            inicioMesActual = inicioMes;
            ahorroMesActualNeto = ahorroMes;
            cierreMesActual = cierreMes;
            if (metasCumplidasEnMes.length > 0) {
                deseoDelMesConcepto = metasCumplidasEnMes.map(d => d.concepto).join(', ');
                deseoDelMesMonto = metasCumplidasEnMes.reduce((acc, d) => acc + d.costoARS, 0);
            }
        }
    });

    window._ultimoAcumuladoCalculado = inicioMesActual;

    colaMetasSimuladas.forEach(meta => {
        meta.alcanzado = false;
        metasProcesadas.push(meta);
    });
    metasProcesadas.sort((a, b) => a.prioridad - b.prioridad);

    // --- SIMULACIÓN 12 MESES FIJA PARA EL GRÁFICO ---
    const [currYear, currMonth] = mesRealKey.split('-').map(Number);
    const labelsChart = [];
    const seriePozoChart = [];
    const hitMilestones = [];

    let pozoChartIter = mapaResultadosMeses[mesRealKey]?.inicio || 0;
    seriePozoChart.push(pozoChartIter);

    for (let i = 0; i < 12; i++) {
        let m = currMonth + i;
        let y = currYear + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
        const mesKeyIter = `${y}-${m < 10 ? '0' + m : m}`;
        const mesLabelCorto = `${MESES_CORTOS[m - 1]} ${y}`;
        labelsChart.push(mesLabelCorto);

        const datosMesIt = mapaResultadosMeses[mesKeyIter];
        if (datosMesIt) {
            seriePozoChart.push(datosMesIt.cierre);
            if (datosMesIt.metasDelMes && datosMesIt.metasDelMes.length > 0) {
                datosMesIt.metasDelMes.forEach(metaItem => {
                    hitMilestones.push({
                        xIndex: i,
                        label: `#${metaItem.prioridad} ${metaItem.concepto}`,
                        mesLabel: mesLabelCorto
                    });
                });
            }
        } else {
            seriePozoChart.push(pozoChartIter);
        }
    }

    const esManualActual = db.ahorrosAcumuladosManuales && db.ahorrosAcumuladosManuales[mesActualReal] !== undefined;
    const badgeEditado = esManualActual 
        ? `<span class="bg-amber-200 text-amber-900 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ml-1">✏️ EDITADO</span>` 
        : '';

    // --- RENDERIZAR TARJETAS EN CASCADA VERTICAL (Estilo Flujo con Conectores) ---
    let parentGrid = document.getElementById('deseos-metricas-container');
    if (!parentGrid) {
        const elBaseOld = document.getElementById('deseos-cap-base');
        if (elBaseOld) {
            parentGrid = elBaseOld.closest('.grid') || elBaseOld.parentElement.parentElement;
            if (parentGrid) {
                parentGrid.id = 'deseos-metricas-container';
            }
        }
    }

    if (parentGrid) {
        parentGrid.className = 'flex flex-col gap-2 my-2';
        const tieneDeseoActivo = deseoDelMesConcepto !== 'Ninguno';

        parentGrid.innerHTML = `
            <div class="bg-white rounded-2xl p-4 border border-indigo-100 shadow-md space-y-2.5">
                <div class="text-[10px] font-extrabold text-indigo-900 uppercase tracking-wider flex items-center justify-between border-b border-gray-100 pb-2">
                    <span>📊 FLUJO DE CAJA EN CASCADA</span>
                    <span class="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full">${mesActualReal}</span>
                </div>

                <!-- Paso 1: Inicio Esperado -->
                <div id="card-ahorro-acumulado-esperado" class="bg-indigo-50/90 rounded-xl p-3 border border-indigo-200 cursor-pointer shadow-sm relative flex justify-between items-center transition-all active:scale-98" title="Haz clic para editar el inicio esperado" onclick="window.editarAhorroAcumuladoEsperado()">
                    <div>
                        <span class="text-[9px] text-indigo-700 font-bold uppercase">1. Caja Inicial (Inicio)</span>
                        <p class="text-xs font-extrabold text-indigo-950 mt-0.5">${formatARS(inicioMesActual)} ${badgeEditado}</p>
                    </div>
                    <span class="text-[10px] bg-white text-indigo-700 font-bold px-2 py-1 rounded-lg border border-indigo-100 shadow-sm">✏️ Editar</span>
                </div>

                <!-- Conector Visual ➕ -->
                <div class="flex justify-center -my-2 z-10 relative">
                    <span class="bg-gray-100 text-gray-700 font-black text-[10px] px-3 py-0.5 rounded-full border shadow-sm">➕ Suman Ahorros</span>
                </div>

                <!-- Paso 2: Ahorro Neto Mes -->
                <div class="bg-gray-50 rounded-xl p-3 border border-gray-200 cursor-pointer shadow-sm flex justify-between items-center" onclick="window.explicarAhorroMes()">
                    <div>
                        <span class="text-[9px] text-gray-500 font-bold uppercase">2. Ahorro Neto del Mes</span>
                        <p class="text-xs font-extrabold text-gray-900 mt-0.5">${formatARS(ahorroMesActualNeto)}</p>
                    </div>
                    <span class="text-[9px] bg-gray-200 text-gray-700 font-bold px-2 py-0.5 rounded">Operativo</span>
                </div>

                <!-- Conector Visual ➖ (Si hay deseo) o 🟰 -->
                ${tieneDeseoActivo ? `
                <div class="flex justify-center -my-2 z-10 relative">
                    <span class="bg-amber-100 text-amber-900 font-black text-[10px] px-3 py-0.5 rounded-full border border-amber-300 shadow-sm">➖ Restan Deseos / Metas</span>
                </div>

                <!-- Paso 3: Deseo / Retiro del Mes -->
                <div class="bg-amber-50 rounded-xl p-3 border border-amber-300 shadow-sm flex justify-between items-center">
                    <div>
                        <span class="text-[9px] text-amber-800 font-bold uppercase">3. Impacto de Deseo</span>
                        <p class="text-xs font-extrabold text-amber-950 mt-0.5">${deseoDelMesConcepto} (-${formatARS(deseoDelMesMonto)})</p>
                    </div>
                    <span class="text-[9px] bg-amber-500 text-white font-bold px-2 py-0.5 rounded">Ejecutado</span>
                </div>
                ` : ''}

                <!-- Conector Visual Final 🟰 -->
                <div class="flex justify-center -my-2 z-10 relative">
                    <span class="bg-purple-100 text-purple-900 font-black text-[10px] px-3 py-0.5 rounded-full border border-purple-300 shadow-sm">🟰 Cierre Final</span>
                </div>

                <!-- Paso Final: Cierre Estimado -->
                <div class="bg-purple-900 text-white rounded-xl p-3.5 shadow-md flex justify-between items-center ring-2 ring-purple-400/50">
                    <div>
                        <span class="text-[9px] text-purple-200 font-bold uppercase tracking-wider">4. Cierre Estimado (Pasa al Mes Siguiente)</span>
                        <p class="text-sm font-black text-white mt-0.5">${formatARS(cierreMesActual)}</p>
                    </div>
                    <span class="text-[10px] bg-purple-700 text-purple-100 font-bold px-2.5 py-1 rounded-lg">Resultado ➡️</span>
                </div>
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
        ...lineasCorte.map(l => l.costoARS)
    ) * 1.12;

    // --- RENDERIZAR LISTA DE METAS ---
    containerLista.innerHTML = '';

    const deseosCompradosLista = metasProcesadas.filter(m => m.confirmado);
    if (deseosCompradosLista.length > 0) {
        const totalCompradoARS = deseosCompradosLista.reduce((acc, d) => acc + d.costoARS, 0);
        const cardComprados = document.createElement('div');
        cardComprados.className = 'bg-emerald-50/70 rounded-2xl p-4 border border-emerald-200 space-y-2 mb-3 shadow-sm';
        cardComprados.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-bold text-xs text-emerald-900 uppercase">🟢 Deseos Comprados (Confirmados)</span>
                <span class="text-xs font-bold text-emerald-700">${formatARS(totalCompradoARS)}</span>
            </div>
            <div class="space-y-1 border-t border-emerald-200/60 pt-2">
                ${deseosCompradosLista.map(d => `
                    <div class="flex justify-between text-[11px] text-emerald-800">
                        <span>• ${d.concepto} (${d.fechaCompra || 'Registrado'})</span>
                        <span class="font-semibold">${d.moneda === 'USD' ? 'US$ ' + d.monto.toLocaleString('es-AR') : formatARS(d.costoARS)}</span>
                    </div>
                `).join('')}
            </div>
        `;
        containerLista.appendChild(cardComprados);
    }

    if (metasProcesadas.length === 0) {
        containerLista.innerHTML += `<p class="text-xs text-gray-400 text-center py-4">No hay metas registradas.</p>`;
    } else {
        metasProcesadas.forEach(meta => {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-2';

            let badge = '';
            let fechaTexto = '';

            if (meta.confirmado) {
                badge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟢 Comprado · ${meta.fechaCompra || 'Registrado'}</span>`;
                fechaTexto = `Compra confirmada manualmente. Ya descontada de tu caja.`;
            } else if (meta.alcanzado && meta.mesKeyAlcanzado) {
                const dist = diffEnMeses(mesNavegado, meta.mesKeyAlcanzado);

                if (dist <= 0) {
                    badge = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🟡 Alcanzable · ${meta.mesAlcanzadoLabel}</span>`;
                    fechaTexto = `Tu presupuesto alcanza para este deseo en <strong>${meta.mesAlcanzadoLabel}</strong> según la proyección.`;
                } else if (dist === 1) {
                    badge = `<span class="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔵 El mes que viene</span>`;
                    fechaTexto = `Será alcanzable el mes que viene (<strong>${meta.mesAlcanzadoLabel}</strong>) manteniendo tu ritmo.`;
                } else {
                    badge = `<span class="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔵 En ${dist} meses</span>`;
                    fechaTexto = `Será alcanzable en ${dist} meses (<strong>${meta.mesAlcanzadoLabel}</strong>) según la proyección.`;
                }
            } else {
                badge = `<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🔴 +12 Meses</span>`;
                fechaTexto = `Supera los 12 meses de proyección con tu ahorro actual.`;
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

    // --- PLUGIN CHART.JS ---
    const goalMilestonesPlugin = {
        id: 'goalMilestonesPlugin',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea, scales: { x, y } } = chart;
            if (!chartArea) return;
            const { left, right, top } = chartArea;

            if (lineasCorte && lineasCorte.length > 0 && y) {
                ctx.save();
                lineasCorte.forEach(linea => {
                    if (linea.costoARS > y.max || linea.costoARS < y.min) return;
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

                    ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.fillRect(right - textWidth - 8, yPos - 13, textWidth + 8, 12);
                    ctx.fillStyle = linea.color;
                    ctx.fillText(text, right - 4, yPos - 1);
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

                items.forEach((item, i) => {
                    const yPos = top + 12 + (i * 18);
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
                datasets: [{
                    label: 'Ahorro Acumulado ($)',
                    data: seriePozoChart,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2
                }]
            },
            plugins: [goalMilestonesPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 55 } },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
                },
                scales: {
                    y: {
                        suggestedMax: sugeridoMaxY > 0 ? sugeridoMaxY : undefined,
                        ticks: { font: { size: 9 }, callback: value => '$' + (value / 1000000).toFixed(1) + 'M' }
                    },
                    x: { ticks: { font: { size: 9 } } }
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
