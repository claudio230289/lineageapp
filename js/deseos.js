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
window.explicarAhorroBase = function() {
    window.alert("ℹ️ AHORRO BASE:\n\nEs tu realidad financiera actual sin anestesia. Surge de restar tus gastos totales reales a tus ingresos netos (Ingresos - Gastos). Muestra cuánto dinero te queda limpio hoy con tu estructura actual.");
};

window.explicarCapOptimizada = function() {
    window.alert("ℹ️ CAPACIDAD OPTIMIZADA:\n\nEs tu potencial estratégico de ahorro. Es el resultado de aplicar el porcentaje de recorte de gastos que seleccionaste en el menú superior. El dinero que evitas gastar se suma directamente aquí para potenciar tus metas.");
};

window.explicarAhorrosAcumulados = function() {
    window.alert("ℹ️ AHORROS ACUMULADOS:\n\nEs el pozo histórico de caja resultante de sumar los flujos netos mes a mes desde el inicio hasta el mes que estás visualizando, descontando automáticamente los deseos ya comprados o alcanzados por la simulación hasta ese período.");
};

window.explicarAhorroMesPasado = function() {
    window.alert("ℹ️ AHORRO DEL MES PASADO:\n\nEs el resultado financiero del mes anterior. Por defecto muestra el valor teórico (Ingresos - Gastos), pero podés hacerle clic para editarlo manualmente si necesitás ajustar el punto de partida exacto de tu pozo.");
};

/* -----------------------------------------------------------
   Edición manual del ahorro del mes pasado
----------------------------------------------------------- */
window.editarAhorroMesPasado = async function() {
    const hoyDispositivo = new Date();
    const mesRealKey = `${hoyDispositivo.getFullYear()}-${String(hoyDispositivo.getMonth() + 1).padStart(2, '0')}`;
    
    // Calcular clave del mes pasado
    const [y, m] = mesRealKey.split('-').map(Number);
    let mAnt = m - 1;
    let yAnt = y;
    if (mAnt < 1) { mAnt = 12; yAnt--; }
    const mesPasadoKey = `${yAnt}-${String(mAnt).padStart(2, '0')}`;
    const mesPasadoLabel = `${MESES_NOMBRES[mAnt - 1]} de ${yAnt}`;

    const ingPasado = calcularNetoMes(mesPasadoKey);
    const gasPasado = calcularGastosMes(mesPasadoKey);
    const teoricoPasado = ingPasado.neto - gasPasado.total;

    if (!db.ahorrosManuales) db.ahorrosManuales = {};
    const valorActual = db.ahorrosManuales[mesPasadoKey] !== undefined ? db.ahorrosManuales[mesPasadoKey] : teoricoPasado;

    const nuevoValorStr = window.prompt(`Editar ahorro de ${mesPasadoLabel}\n(Teórico: ${formatARS(teoricoPasado)}):`, valorActual);
    if (nuevoValorStr === null) return; // Canceló

    const nuevoValor = parseFloat(String(nuevoValorStr).replace(',', '.'));
    if (isNaN(nuevoValor)) {
        window.alert('Monto inválido, no se guardaron cambios.');
        return;
    }

    db.ahorrosManuales[mesPasadoKey] = nuevoValor;
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

    // Auto-conectar eventos globales a las flechas de cambio de mes
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

    // 1. Mes navegado por el selector superior (sincronizado con db.mesActivo)
    const mesActualReal = db.mesActivo || obtenerMesActual(); 

    // Reloj real del dispositivo
    const hoyDispositivo = new Date();
    const mesRealKey = `${hoyDispositivo.getFullYear()}-${String(hoyDispositivo.getMonth() + 1).padStart(2, '0')}`;

    // Calcular mes pasado respecto al real
    let [currY, currM] = mesRealKey.split('-').map(Number);
    let mAnt = currM - 1;
    let yAnt = currY;
    if (mAnt < 1) { mAnt = 12; yAnt--; }
    const mesPasadoKey = `${yAnt}-${String(mAnt).padStart(2, '0')}`;
    const mesPasadoLabel = `${MESES_NOMBRES[mAnt - 1]} ${yAnt}`;

    const recortePct = parseFloat(document.getElementById('opt-recorte-gastos')?.value || 0);

    // Obtener ahorro del mes pasado (con soporte de override manual en db.ahorrosManuales)
    function obtenerNetoMesConOverride(mk) {
        if (db.ahorrosManuales && db.ahorrosManuales[mk] !== undefined) {
            return db.ahorrosManuales[mk];
        }
        const ing = calcularNetoMes(mk);
        const gas = calcularGastosMes(mk);
        return (ing.neto - gas.total);
    }

    const ahorroMesPasadoValor = obtenerNetoMesConOverride(mesPasadoKey);

    // MOTOR DE PROYECCIÓN ESTABLE
    const ingMotor = calcularNetoMes(mesRealKey);
    const gasMotor = calcularGastosMes(mesRealKey);
    const gastosOptMotor = gasMotor.total * (1 - recortePct / 100);
    const capOptimizadaMotor = ingMotor.neto - gastosOptMotor;

    // CAPACIDAD DEL MES NAVEGADO
    const ingActual = calcularNetoMes(mesActualReal);
    const gasActual = calcularGastosMes(mesActualReal);
    const gastosOptActual = gasActual.total * (1 - recortePct / 100);
    const capOptimizadaActual = ingActual.neto - gastosOptActual;
    const ahorroBaseReal = ingActual.neto - gasActual.total;
    const liberadoMes = capOptimizadaActual - ahorroBaseReal;

    // Mapeo de metas previas para calcular costos en ARS
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

    // 2. SIMULACIÓN ACUMULATIVA DE 12 MESES
    const [currYear, currMonth] = mesRealKey.split('-').map(Number);

    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const clavesConDatos = Array.from(new Set([
        ...Object.keys(db.ingresos || {}),
        ...Object.keys(db.gastos || {}),
        mesRealKey,
        mesActualReal,
        mesPasadoKey
    ])).sort();

    const mesesCerrados = [...clavesConDatos].filter(k => k < mesRealKey).sort();
    let pozoHistoricoReal = 0;
    mesesCerrados.forEach(mk => {
        pozoHistoricoReal += obtenerNetoMesConOverride(mk);
    });

    const costoYaComprado = deseosOriginales
        .filter(d => d.confirmado)
        .reduce((acc, d) => acc + d.costoARS, 0);
    pozoHistoricoReal -= costoYaComprado;

    let pozoAcumulado = pozoHistoricoReal;
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

        const tieneDatosMes = !!(db.ingresos?.[mesKeyIter] && db.gastos?.[mesKeyIter]);
        let netoMesIter = 0;

        if (tieneDatosMes) {
            const ingM = calcularNetoMes(mesKeyIter);
            const gasM = calcularGastosMes(mesKeyIter);
            const gasOptM = gasM.total * (1 - recortePct / 100);
            netoMesIter = ingM.neto - gasOptM;
        } else {
            netoMesIter = capOptimizadaMotor;
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
    let acumuladoHastaMesNavegado = 0;
    const colaMetasAcum = JSON.parse(JSON.stringify(deseosOriginales));

    mesesAcumulacion.forEach(mk => {
        let netoMes = 0;
        if (mk < mesRealKey || (!db.ingresos?.[mk] && !db.gastos?.[mk])) {
            netoMes = obtenerNetoMesConOverride(mk);
        } else {
            const ingM = calcularNetoMes(mk);
            const gasM = calcularGastosMes(mk);
            const gasOptM = gasM.total * (1 - recortePct / 100);
            netoMes = (ingM.neto - gasOptM);
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

    // Actualizar tarjetas superiores
    const elBase = document.getElementById('deseos-cap-base');
    if (elBase) {
        elBase.innerText = formatARS(ahorroBaseReal);
        if (elBase.parentElement) elBase.parentElement.onclick = window.explicarAhorroBase;
    }

    const elOpt = document.getElementById('deseos-cap-optimizado');
    if (elOpt) {
        elOpt.innerText = formatARS(capOptimizadaActual);
        if (elOpt.parentElement) elOpt.parentElement.onclick = window.explicarCapOptimizada;
    }

    const elLib = document.getElementById('deseos-ahorro-recorte');
    if (elLib) elLib.innerText = `${formatARS(liberadoMes)}/mes`;

    // Inyectar o actualizar la tarjeta de Ahorros Acumulados
    let elAcum = document.getElementById('deseos-ahorros-acumulados');
    let elAcumCard = document.getElementById('card-ahorros-acumulados');
    if (!elAcum && elBase && elBase.parentElement && elBase.parentElement.parentElement) {
        const parentGrid = elBase.parentElement.parentElement;
        const cardAcum = document.createElement('div');
        cardAcum.id = 'card-ahorros-acumulados';
        cardAcum.className = 'bg-gray-50 rounded-2xl p-3 border border-gray-200 cursor-pointer shadow-sm';
        cardAcum.onclick = window.explicarAhorrosAcumulados;
        cardAcum.innerHTML = `
            <p id="deseos-ahorros-titulo" class="text-[10px] text-gray-400 font-semibold uppercase">Acumulado (${mesActualReal})</p>
            <p id="deseos-ahorros-acumulados" class="text-xs font-bold text-gray-800 mt-0.5">$ 0,00</p>
        `;
        parentGrid.appendChild(cardAcum);
        elAcum = document.getElementById('deseos-ahorros-acumulados');
    }
    if (elAcum) {
        elAcum.innerText = formatARS(acumuladoHastaMesNavegado);
    }
    const elAcumTitulo = document.getElementById('deseos-ahorros-titulo');
    if (elAcumTitulo) {
        elAcumTitulo.innerText = `Acumulado (${mesActualReal})`;
    }

    // Inyectar o actualizar la tarjeta de Ahorro Mes Pasado (Editable)
    let elMesPasado = document.getElementById('deseos-ahorro-mes-pasado');
    if (!elMesPasado && elBase && elBase.parentElement && elBase.parentElement.parentElement) {
        const parentGrid = elBase.parentElement.parentElement;
        const cardPasado = document.createElement('div');
        cardPasado.id = 'card-ahorro-mes-pasado';
        cardPasado.className = 'bg-amber-50/60 rounded-2xl p-3 border border-amber-200 cursor-pointer shadow-sm';
        cardPasado.title = "Haz clic para editar este valor";
        cardPasado.onclick = window.editarAhorroMesPasado;
        cardPasado.innerHTML = `
            <p id="deseos-pasado-titulo" class="text-[10px] text-amber-700 font-semibold uppercase flex items-center justify-between">
                <span>Mes Pasado (${mesPasadoLabel})</span>
                <span>✏️</span>
            </p>
            <p id="deseos-ahorro-mes-pasado" class="text-xs font-bold text-amber-900 mt-0.5">$ 0,00</p>
        `;
        parentGrid.appendChild(cardPasado);
        elMesPasado = document.getElementById('deseos-ahorro-mes-pasado');
    }
    if (elMesPasado) {
        elMesPasado.innerText = formatARS(ahorroMesPasadoValor);
    }
    const elPasadoTitulo = document.getElementById('deseos-pasado-titulo');
    if (elPasadoTitulo) {
        elPasadoTitulo.innerHTML = `<span>Pasado (${mesPasadoLabel})</span> <span>✏️</span>`;
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
