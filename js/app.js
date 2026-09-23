/* =========================================================
   CONTROLADOR PRINCIPAL Y INTERFAZ DE USUARIO (app.js)
   ========================================================= */
let myChart = null;
const selectorAnio = document.getElementById('selector-anio');

try {
    const fechaObj = new Date();
    const dateEl = document.getElementById('current-date-label');
    if(dateEl) {
        dateEl.innerText = fechaObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
} catch (e) {
    console.error(e);
}

function asegurarAnioEnSelect(anio) {
    let existe = false;
    for (let i = 0; i < selectorAnio.options.length; i++) {
        if (selectorAnio.options[i].value === String(anio)) {
            existe = true;
            break;
        }
    }
    if (!existe) {
        const opt = document.createElement('option');
        opt.value = anio;
        opt.innerText = anio;
        selectorAnio.appendChild(opt);
    }
    selectorAnio.value = anio;
}

if (db.mesActivo) {
    asegurarAnioEnSelect(db.mesActivo.split('-')[0]);
} else {
    const now = new Date();
    db.mesActivo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    asegurarAnioEnSelect(now.getFullYear());
}

function actualizarTarjetaMesSeleccionado() {
    const label = document.getElementById('label-mes-seleccionado');
    if (!label) return;
    const partes = db.mesActivo.split('-');
    const anio = partes[0];
    const numMes = parseInt(partes[1], 10);
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    label.innerText = `${mesesNombres[numMes - 1]} ${anio}`;
}

function renderizarCuadriculaMeses() {
    actualizarTarjetaMesSeleccionado();
    const container = document.getElementById('cuadricula-meses');
    if (!container) return;
    container.innerHTML = '';
    const anioActual = selectorAnio.value;
    const mesSeleccionado = db.mesActivo;
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    mesesCortos.forEach((nombre, index) => {
        const numMes = String(index + 1).padStart(2, '0');
        const mesKey = `${anioActual}-${numMes}`;
        const isActive = (mesKey === mesSeleccionado);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `py-2 text-xs font-bold rounded-xl transition border ${isActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`;
        btn.innerText = nombre;
        btn.onclick = () => seleccionarMesCuadricula(mesKey);
        container.appendChild(btn);
    });
}

function seleccionarMesCuadricula(mesKey) {
    db.mesActivo = mesKey;
    guardarBaseDatosLocal(db);
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual').classList.contains('active')) renderizarGraficoAnual();
    toggleAcordeon('sec-selector-mes', 'icon-sm');
}

function cambiarAnioCuadricula() {
    const nuevoAnio = selectorAnio.value;
    const mesActualNum = db.mesActivo ? db.mesActivo.split('-')[1] : '01';
    db.mesActivo = `${nuevoAnio}-${mesActualNum}`;
    guardarBaseDatosLocal(db);
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual').classList.contains('active')) renderizarGraficoAnual();
}

function cambiarMesNavegacion(delta) {
    let [year, month] = db.mesActivo.split('-').map(Number);
    month += delta;
    if (month < 1) { month = 12; year -= 1; } 
    else if (month > 12) { month = 1; year += 1; }
    const nuevoMesKey = `${year}-${String(month).padStart(2, '0')}`;
    asegurarAnioEnSelect(year);
    db.mesActivo = nuevoMesKey;
    guardarBaseDatosLocal(db);
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual').classList.contains('active')) renderizarGraficoAnual();
}

function mesAnterior() { cambiarMesNavegacion(-1); }
function mesSiguiente() { cambiarMesNavegacion(1); }

function accionGuardarJSON() {
    alert("INSTRUCTIVO - GUARDAR RESPALDO JSON:\n\nEsta acción descargará un archivo con toda tu información financiera guardada.");
    if (confirm("¿Deseás proceder con la descarga del archivo de respaldo JSON ahora?")) {
        guardarYDescargarRespaldo();
    }
}

function accionIniciarImportacionJSON() {
    alert("INSTRUCTIVO - CARGAR RESPALDO JSON:\n\nBuscá el archivo descargado en tu dispositivo para restaurar tus datos.");
    if (confirm("¿Querés abrir el explorador de archivos para seleccionar tu respaldo JSON?")) {
        document.getElementById('import-file-resumen').click();
    }
}

function accionActualizarApp() {
    alert("INSTRUCTIVO - ACTUALIZAR APLICACIÓN:\n\nLimpia la caché temporal de tu navegador.");
    actualizarVersionApp();
}

function accionExportarPDF() {
    window.print();
}

function accionReporteWpGastos() {
    const filtroEl = document.getElementById('filtro-gastos');
    const filtroTexto = filtroEl ? (filtroEl.value || '').trim() : '';
    if (confirm(`¿Confirmás enviar por WhatsApp el comprobante ${filtroTexto ? 'filtrado por "' + filtroTexto + '"' : 'general'}?`)) {
        enviarReporteWhatsApp();
    }
}

function mostrarInstructivoCarga() {
    alert("INSTRUCTIVO COMPLETO DE RESPALDOS:\n\n1. GUARDAR JSON: Descarga el respaldo.\n2. CARGAR JSON: Restaura los datos.");
}

async function actualizarVersionApp() {
    if (confirm('¿Confirmás limpiar la caché temporal y recargar la aplicación?')) {
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let reg of regs) await reg.unregister();
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                for (let k of keys) await caches.delete(k);
            }
            window.location.reload(true);
        } catch (e) {
            window.location.reload();
        }
    }
}

function limpiarFiltroGastos() {
    const input = document.getElementById('filtro-gastos');
    if (input) {
        input.value = '';
        renderizarTodo();
        input.focus();
    }
}

function enviarReporteWhatsApp() {
    try {
        const mes = obtenerMesActual();
        const filtroEl = document.getElementById('filtro-gastos');
        const filtroTexto = filtroEl ? (filtroEl.value || '').toLowerCase().trim() : '';
        const listaOriginal = (db.gastos && db.gastos[mes]) || [];
        const listaFiltrada = listaOriginal.filter(g => !filtroTexto || (g.concepto && g.concepto.toLowerCase().includes(filtroTexto)));
        
        let totalFiltrado = 0, pagadoFiltrado = 0, pendientesFiltrado = 0;
        listaFiltrada.forEach(g => {
            totalFiltrado += Number(g.monto || 0);
            if (g.pagado) pagadoFiltrado += Number(g.monto || 0);
            else pendientesFiltrado += Number(g.monto || 0);
        });

        let texto = `*Comprobante de Gastos - ${mes}*\n`;
        texto += `• Total a Pagar: ${formatARS(totalFiltrado)}\n• Pagado: ${formatARS(pagadoFiltrado)}\n• Pendiente: ${formatARS(pendientesFiltrado)}\n\n*Detalle de Conceptos:*\n`;
        
        listaFiltrada.forEach(g => {
            texto += `- [${g.pagado ? 'X' : ' '}] ${g.concepto}: ${formatARS(g.monto)} (${g.categoria})\n`;
        });

        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank');
    } catch (err) {
        console.error('Error al preparar reporte:', err);
    }
}

function toggleAcordeon(contentId, iconId) {
    const content = document.getElementById(contentId);
    const icon = document.getElementById(iconId);
    if (!content || !icon) return;
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    }
}

function cambiarTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById('tab-' + tabId);
    if (tabEl) tabEl.classList.add('active');
    ['resumen', 'ingresos', 'gastos', 'pasivos', 'deseos', 'anual'].forEach(t => {
        const btn = document.getElementById('nav-' + t);
        if (btn) {
            btn.className = (t === tabId) ? "flex flex-col items-center justify-center text-indigo-600 focus:outline-none py-1" : "flex flex-col items-center justify-center text-gray-400 focus:outline-none py-1";
        }
    });
    window.scrollTo(0, 0);
    renderizarTodo();
    if (tabId === 'anual') setTimeout(renderizarGraficoAnual, 50);
    if (tabId === 'deseos') setTimeout(renderizarDeseosYProyeccion, 50);
}

function toggleTipoIngreso() {
    const tipo = document.getElementById('ing-tipo').value;
    const modoSelect = document.getElementById('ing-modo-monto');
    const optPorc = document.getElementById('opt-porcentaje');
    if (tipo === 'Basico') { modoSelect.value = 'importe'; optPorc.disabled = true; } 
    else { optPorc.disabled = false; }
    toggleModoMonto();
}

function toggleModoMonto() {
    const modo = document.getElementById('ing-modo-monto').value;
    document.getElementById('label-valor-monto').innerText = modo === 'porcentaje' ? 'Porcentaje (%) del Básico' : 'Monto ($)';
}

function guardarIngreso(e) {
    e.preventDefault();
    const mes = obtenerMesActual();
    if (!db.ingresos[mes]) db.ingresos[mes] = [];
    const conceptoInput = document.getElementById('ing-concepto').value.trim();
    const tipo = document.getElementById('ing-tipo').value;
    const modo = document.getElementById('ing-modo-monto').value;
    const valor = parseFloat(document.getElementById('ing-valor').value);

    if (tipo === 'Basico') db.ingresos[mes] = db.ingresos[mes].filter(i => i.tipo !== 'Basico');
    db.ingresos[mes].push({ id: Date.now(), concepto: conceptoInput, tipo, modo, valor });
    document.getElementById('form-ingreso').reset();
    toggleTipoIngreso();
    guardarYRenderizar();
}

function eliminarIngreso(id) {
    const mes = obtenerMesActual();
    if (db.ingresos[mes]) {
        db.ingresos[mes] = db.ingresos[mes].filter(i => i.id !== id);
        guardarYRenderizar();
    }
}

function replicarIngresosMes() {
    const mesActual = obtenerMesActual();
    const itemsActuales = db.ingresos[mesActual];
    if (!itemsActuales || itemsActuales.length === 0) return alert('No hay ingresos para replicar.');
    if (confirm('¿Replicar ingresos para meses futuros?')) {
        let [y, m] = mesActual.split('-').map(Number);
        for (let i = 1; i <= 24; i++) {
            m++;
            if (m > 12) { m = 1; y++; }
            let mVal = `${y}-${m < 10 ? '0' + m : m}`;
            if (!db.ingresos[mVal]) db.ingresos[mVal] = [];
            itemsActuales.forEach(item => {
                if (!db.ingresos[mVal].some(x => x.concepto.toLowerCase() === item.concepto.toLowerCase())) {
                    db.ingresos[mVal].push({ ...item, id: Date.now() + Math.random() });
                }
            });
        }
        guardarYRenderizar();
        alert('¡Replicado con éxito!');
    }
}

function guardarGasto(e) {
    e.preventDefault();
    const mesActual = obtenerMesActual();
    const editId = document.getElementById('gas-edit-id').value;
    const conceptoInput = document.getElementById('gas-concepto').value.trim();
    const categoria = document.getElementById('gas-categoria').value;
    const monto = parseFloat(document.getElementById('gas-monto').value);

    if (!db.gastos[mesActual]) db.gastos[mesActual] = [];

    if (editId) {
        const gastoOriginal = db.gastos[mesActual].find(g => g.id == editId);
        const conceptoAnterior = gastoOriginal ? gastoOriginal.concepto : '';
        const categoriaAnterior = gastoOriginal ? gastoOriginal.categoria : '';

        if (gastoOriginal) {
            gastoOriginal.concepto = conceptoInput;
            gastoOriginal.categoria = categoria;
            gastoOriginal.monto = monto;
        }
        cancelarEdicionGasto();

        if (categoria === 'Fijos' || categoriaAnterior === 'Fijos') {
            let [y, m] = mesActual.split('-').map(Number);
            for (let i = 1; i <= 24; i++) {
                m++;
                if (m > 12) { m = 1; y++; }
                let mVal = `${y}-${m < 10 ? '0' + m : m}`;
                if (db.gastos[mVal]) {
                    const idx = db.gastos[mVal].findIndex(g => g.categoria === 'Fijos' && g.concepto.toLowerCase() === conceptoAnterior.toLowerCase());
                    if (idx >= 0) {
                        db.gastos[mVal][idx].concepto = conceptoInput;
                        db.gastos[mVal][idx].monto = monto;
                        db.gastos[mVal][idx].categoria = categoria;
                    }
                }
            }
        }
    } else {
        db.gastos[mesActual].push({ id: Date.now(), concepto: conceptoInput, categoria, monto, pagado: false });
        document.getElementById('form-gasto').reset();

        if (categoria === 'Fijos') {
            let [y, m] = mesActual.split('-').map(Number);
            for (let i = 1; i <= 24; i++) {
                m++;
                if (m > 12) { m = 1; y++; }
                let mVal = `${y}-${m < 10 ? '0' + m : m}`;
                if (!db.gastos[mVal]) db.gastos[mVal] = [];
                const idx = db.gastos[mVal].findIndex(g => g.categoria === 'Fijos' && g.concepto.toLowerCase() === conceptoInput.toLowerCase());
                if (idx >= 0) {
                    db.gastos[mVal][idx].monto = monto;
                } else {
                    db.gastos[mVal].push({ id: Date.now() + Math.random(), concepto: conceptoInput, categoria: 'Fijos', monto, pagado: false });
                }
            }
        }
    }
    guardarYRenderizar();
}

function editarGasto(id) {
    const mes = obtenerMesActual();
    const gasto = db.gastos[mes].find(g => g.id === id);
    if (!gasto || gasto.categoria === 'Cuotas') return;
    document.getElementById('gas-edit-id').value = gasto.id;
    document.getElementById('gas-concepto').value = gasto.concepto;
    document.getElementById('gas-categoria').value = gasto.categoria;
    document.getElementById('gas-monto').value = gasto.monto;
    document.getElementById('form-gasto-titulo').innerText = 'Editar Gasto';
    document.getElementById('btn-submit-gasto').innerText = 'Actualizar Gasto';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    window.scrollTo({ top: 300, behavior: 'smooth' });
}

function cancelarEdicionGasto() {
    document.getElementById('gas-edit-id').value = '';
    document.getElementById('form-gasto').reset();
    document.getElementById('form-gasto-titulo').innerText = 'Cargar Gasto / Único';
    document.getElementById('btn-submit-gasto').innerText = 'Agregar Gasto';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
}

function ejecutarRollOverDeudas() {
    const mesActual = obtenerMesActual();
    const pendientes = (db.gastos[mesActual] || []).filter(g => !g.pagado);
    if (pendientes.length === 0) return alert('No hay gastos pendientes en este mes.');

    let [year, month] = mesActual.split('-').map(Number);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    let mesSiguiente = `${year}-${month < 10 ? '0' + month : month}`;

    if (!db.gastos[mesSiguiente]) db.gastos[mesSiguiente] = [];

    let migrados = 0;
    pendientes.forEach(p => {
        if (!db.gastos[mesSiguiente].some(g => g.concepto === p.concepto && g.origenMes === mesActual)) {
            db.gastos[mesSiguiente].push({ id: Date.now() + Math.random(), concepto: p.concepto, categoria: p.categoria, monto: p.monto, pagado: false, origenMes: mesActual });
            migrados++;
        }
    });

    guardarYRenderizar();
    alert(`¡Se han migrado ${migrados} pendientes al mes ${mesSiguiente}!`);
}

function guardarCompraTarjeta(e) {
    e.preventDefault();
    const mesInicio = obtenerMesActual();
    const conceptoBase = document.getElementById('tar-concepto').value.trim();
    const cuotaInicio = parseInt(document.getElementById('tar-cuota-inicio').value) || 1;
    const totalCuotas = parseInt(document.getElementById('tar-cuotas').value);
    const montoCuota = parseFloat(document.getElementById('tar-monto').value);

    let [year, month] = mesInicio.split('-').map(Number);
    let generadas = 0;
    for (let i = 0; i <= (totalCuotas - cuotaInicio); i++) {
        let nroActual = cuotaInicio + i;
        let m = month + i, y = year + Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
        let mesKey = `${y}-${m < 10 ? '0' + m : m}`;
        if (!db.gastos[mesKey]) db.gastos[mesKey] = [];
        let nombreCuota = `${conceptoBase} (Cuota ${nroActual}/${totalCuotas})`;
        if (!db.gastos[mesKey].some(g => g.concepto === nombreCuota)) {
            db.gastos[mesKey].push({ id: Date.now() + i + Math.random(), concepto: nombreCuota, categoria: 'Cuotas', monto: montoCuota, pagado: false });
            generadas++;
        }
    }
    document.getElementById('form-tarjeta').reset();
    guardarYRenderizar();
    alert(`¡Programadas ${generadas} cuotas!`);
}

function togglePagoGasto(id) {
    const mes = obtenerMesActual();
    const gasto = (db.gastos[mes] || []).find(g => g.id === id);
    if (gasto) { gasto.pagado = !gasto.pagado; guardarYRenderizar(); }
}

function eliminarGasto(id) {
    const mes = obtenerMesActual();
    const gasto = (db.gastos[mes] || []).find(g => g.id === id);
    if (!gasto || !confirm(`¿Estás seguro de que querés eliminar el gasto "${gasto.concepto}"?`)) return;

    if (gasto.categoria === 'Fijos') {
        const conceptoTarget = gasto.concepto.toLowerCase();
        let [y, m] = mes.split('-').map(Number);
        for (let i = 0; i <= 24; i++) {
            let mVal = `${y}-${m < 10 ? '0' + m : m}`;
            if (db.gastos[mVal]) {
                db.gastos[mVal] = db.gastos[mVal].filter(g => !(g.categoria === 'Fijos' && g.concepto.toLowerCase() === conceptoTarget));
            }
            m++;
            if (m > 12) { m = 1; y++; }
        }
    } else {
        db.gastos[mes] = db.gastos[mes].filter(g => g.id !== id);
    }
    guardarYRenderizar();
}

function guardarReglaPasivo(e) {
    e.preventDefault();
    const keyword = document.getElementById('pas-keyword').value.trim().toLowerCase();
    const nombre = document.getElementById('pas-nombre').value.trim();
    if (!db.pasivos) db.pasivos = [];
    db.pasivos.push({ id: Date.now(), keyword, nombre });
    document.getElementById('form-pasivo').reset();
    guardarYRenderizar();
}

function eliminarPasivo(id) {
    db.pasivos = (db.pasivos || []).filter(p => p.id !== id);
    guardarYRenderizar();
}

function editarDolarManual() {
    const nuevo = prompt('Cotización Dólar Oficial ($):', db.dolar);
    if (nuevo && !isNaN(nuevo)) { db.dolar = parseFloat(nuevo); guardarYRenderizar(); }
}

function guardarYRenderizar() {
    db.version = DB_VERSION;
    guardarBaseDatosLocal(db);
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual').classList.contains('active')) renderizarGraficoAnual();
}

function renderizarGraficoAnual() {
    const ctx = document.getElementById('graficoAnual');
    if (!ctx) return;
    const baseYear = selectorAnio.value;
    const labels = [], saldos = [];
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    for (let m = 1; m <= 12; m++) {
        const mKey = `${baseYear}-${m < 10 ? '0' + m : m}`;
        labels.push(`${mesesNombres[m-1]} ${baseYear}`);
        saldos.push(calcularNetoMes(mKey).neto - calcularGastosMes(mKey).total);
    }

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Saldo Real ($)', data: saldos, borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderWidth: 2, fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderizarTodo() {
    try {
        const mes = obtenerMesActual();
        const dolarEl = document.getElementById('dolar-oficial-val');
        if(dolarEl) dolarEl.innerText = '$ ' + Number(db.dolar || 1250).toLocaleString('es-AR');

        const ingCalc = calcularNetoMes(mes);
        document.getElementById('recibo-tot-rem').innerText = formatARS(ingCalc.rem);
        document.getElementById('recibo-tot-norem').innerText = formatARS(ingCalc.norem);
        document.getElementById('recibo-tot-ded').innerText = formatARS(ingCalc.ded);
        document.getElementById('recibo-neto-final').innerText = formatARS(ingCalc.neto);

        const listIng = document.getElementById('lista-ingresos');
        listIng.innerHTML = '';
        const ingresosMes = (db.ingresos && db.ingresos[mes]) || [];
        ingresosMes.forEach(i => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs';
            div.innerHTML = `<div><span class="font-bold block text-gray-800">${i.concepto}</span><span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium mt-0.5 bg-indigo-100 text-indigo-700">${i.tipo}</span></div><div class="text-right"><span class="font-mono font-bold text-gray-900 block">${formatARS(i.modo === 'porcentaje' ? (i.valor * (ingresosMes.find(x => x.tipo === 'Basico')?.valor || 0)) / 100 : i.valor)}</span><button onclick="eliminarIngreso(${i.id})" class="text-red-500 mt-1 text-[10px]">Eliminar</button></div>`;
            listIng.appendChild(div);
        });

        const gasCalc = calcularGastosMes(mes);
        const saldoReal = ingCalc.neto - gasCalc.total;

        document.getElementById('card-saldo-real').innerText = formatARS(saldoReal);
        document.getElementById('card-total-ingresos').innerText = formatARS(ingCalc.neto);
        document.getElementById('card-total-egresos').innerText = formatARS(gasCalc.total);
        document.getElementById('card-gastos-pagados').innerText = formatARS(gasCalc.pagado);
        document.getElementById('card-gastos-pendientes').innerText = formatARS(gasCalc.pendientes);

        document.getElementById('summary-col-fijos').innerText = formatARS(gasCalc.fijos);
        document.getElementById('summary-col-unicos').innerText = formatARS(gasCalc.unicos);
        document.getElementById('summary-col-cuotas').innerText = formatARS(gasCalc.cuotas);

        const gastosSueldoEl = document.getElementById('gastos-sueldo-neto');
        if (gastosSueldoEl) gastosSueldoEl.innerText = formatARS(ingCalc.neto);
        const gastosDispEl = document.getElementById('gastos-saldo-disponible');
        if (gastosDispEl) gastosDispEl.innerText = formatARS(ingCalc.neto - gasCalc.pagado);

        document.getElementById('gastos-tot-general').innerText = formatARS(gasCalc.total);
        document.getElementById('gastos-tot-pagado').innerText = formatARS(gasCalc.pagado);
        document.getElementById('gastos-tot-pendiente').innerText = formatARS(gasCalc.pendientes);

        const filtroEl = document.getElementById('filtro-gastos');
        const filtroTexto = filtroEl ? (filtroEl.value || '').toLowerCase().trim() : '';
        const btnLimpiar = document.getElementById('btn-limpiar-filtro');
        const badgeEl = document.getElementById('filtro-total-badge');

        if (filtroTexto && btnLimpiar) btnLimpiar.classList.remove('hidden');
        else if (btnLimpiar) btnLimpiar.classList.add('hidden');

        let totalFiltrado = 0;
        const gastosMes = (db.gastos && db.gastos[mes]) || [];
        const gastosFiltrados = gastosMes.filter(g => !filtroTexto || (g.concepto && g.concepto.toLowerCase().includes(filtroTexto)));
        gastosFiltrados.forEach(g => { totalFiltrado += Number(g.monto || 0); });
        if(badgeEl) badgeEl.innerText = `Total: ${formatARS(totalFiltrado)}`;

        const listaFijos = document.getElementById('lista-gastos-fijos');
        const listaUnicos = document.getElementById('lista-gastos-unicos');
        const listaCuotas = document.getElementById('lista-gastos-cuotas');
        if(listaFijos) listaFijos.innerHTML = '';
        if(listaUnicos) listaUnicos.innerHTML = '';
        if(listaCuotas) listaCuotas.innerHTML = '';

        gastosFiltrados.forEach(g => {
            const item = document.createElement('div');
            item.className = 'bg-gray-50 rounded-xl p-2.5 border border-gray-100';
            const catNorm = (g.categoria || '').trim().toLowerCase();
            const esCuotas = (catNorm === 'cuotas');
            
            item.innerHTML = `
                <div class="flex justify-between items-start gap-2">
                    <div class="min-w-0">
                        <p class="font-bold text-xs text-gray-800 truncate">${g.concepto || 'Sin concepto'}</p>
                        <p class="text-[10px] text-gray-500">${esCuotas ? 'Cuota / Tarjeta' : (catNorm === 'unicos' ? 'Único' : 'Fijo')}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-mono font-bold text-xs text-gray-900">${formatARS(g.monto)}</p>
                        <div class="flex gap-1.5 justify-end mt-1">
                            <button onclick="togglePagoGasto(${g.id})" class="text-[9px] ${g.pagado ? 'bg-emerald-600' : 'bg-gray-300'} text-white px-1.5 py-0.5 rounded">${g.pagado ? 'Pagado' : 'Pend.'}</button>
                            ${!esCuotas ? `<button onclick="editarGasto(${g.id})" class="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Edit</button>` : ''}
                            <button onclick="eliminarGasto(${g.id})" class="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Del</button>
                        </div>
                    </div>
                </div>
            `;

            if (catNorm === 'fijos' && listaFijos) listaFijos.appendChild(item);
            else if (catNorm === 'unicos' && listaUnicos) listaUnicos.appendChild(item);
            else if (listaCuotas) listaCuotas.appendChild(item);
        });

        document.getElementById('total-col-fijos').innerText = formatARS(gasCalc.fijos);
        document.getElementById('total-col-unicos').innerText = formatARS(gasCalc.unicos);
        document.getElementById('total-col-cuotas').innerText = formatARS(gasCalc.cuotas);

        const pasivosList = document.getElementById('lista-pasivos-consolidados');
        if (pasivosList) {
            pasivosList.innerHTML = '';
            (db.pasivos || []).forEach(p => {
                const calculo = calcularPasivoPorKeyword(p.keyword);
                const alcanza = saldoReal >= calculo.totalDeuda;
                const div = document.createElement('div');
                div.className = 'bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2';
                div.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <span class="font-bold text-xs text-gray-800 block">${p.nombre}</span>
                            <span class="text-[10px] text-gray-500">Filtro: "${p.keyword}"</span>
                        </div>
                        <button onclick="eliminarPasivo(${p.id})" class="text-red-500 text-[10px]">Eliminar</button>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-gray-200">
                        <div><span class="text-[10px] text-gray-500 block">Cuotas Pendientes</span><span class="font-mono font-bold">${calculo.cuotasRestantes} cuotas</span></div>
                        <div class="text-right"><span class="text-[10px] text-gray-500 block">Deuda Total</span><span class="font-mono font-bold text-red-600 text-sm">${formatARS(calculo.totalDeuda)}</span></div>
                    </div>
                    <div class="text-[10px] p-2 rounded-lg ${alcanza ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}">
                        ${alcanza ? '✔ Saldo suficiente para precancelar.' : '⚠ Tu saldo no cubre la cancelación total.'}
                    </div>
                `;
                pasivosList.appendChild(div);
            });
        }

        if (document.getElementById('tab-deseos')?.classList.contains('active')) {
            renderizarDeseosYProyeccion();
        }

        const tablaAnual = document.getElementById('tabla-anual-body');
        if (tablaAnual) {
            tablaAnual.innerHTML = '';
            const baseYear = selectorAnio.value;
            const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            
            for (let m = 1; m <= 12; m++) {
                const key = `${baseYear}-${m < 10 ? '0' + m : m}`;
                const net = calcularNetoMes(key).neto;
                const gasto = calcularGastosMes(key);
                const saldo = net - gasto.total;
                const tr = document.createElement('tr');
                tr.className = 'border-b border-gray-100';
                tr.innerHTML = `<td class="py-2 font-medium">${mesesNombres[m-1]} ${baseYear}</td><td class="py-2 text-right font-mono">${formatARS(net)}</td><td class="py-2 text-right font-mono text-red-600">${formatARS(gasto.total)}</td><td class="py-2 text-right font-mono ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}">${formatARS(saldo)}</td>`;
                tablaAnual.appendChild(tr);
            }
        }
    } catch (err) {
        console.error('Error en renderizarTodo:', err);
    }
}

try {
    toggleTipoIngreso();
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual').classList.contains('active')) renderizarGraficoAnual();
} catch (e) {
    console.error('Fallo de inicialización:', e);
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}
