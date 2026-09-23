/* =========================================================
   CONTROLADOR PRINCIPAL Y INTERFAZ DE USUARIO (app.js)
   ========================================================= */
let myChart = null;

function asegurarAnioEnSelect(anio) {
    const selectorAnio = document.getElementById('selector-anio');
    if (!selectorAnio) return;
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
    const selectorAnio = document.getElementById('selector-anio');
    if (!container || !selectorAnio) return;
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
    if (document.getElementById('tab-anual')?.classList.contains('active')) renderizarGraficoAnual();
    toggleAcordeon('sec-selector-mes', 'icon-sm');
}

function cambiarAnioCuadricula() {
    const selectorAnio = document.getElementById('selector-anio');
    if (!selectorAnio) return;
    const nuevoAnio = selectorAnio.value;
    const mesActualNum = db.mesActivo ? db.mesActivo.split('-')[1] : '01';
    db.mesActivo = `${nuevoAnio}-${mesActualNum}`;
    guardarBaseDatosLocal(db);
    renderizarCuadriculaMeses();
    renderizarTodo();
    if (document.getElementById('tab-anual')?.classList.contains('active')) renderizarGraficoAnual();
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
    if (document.getElementById('tab-anual')?.classList.contains('active')) renderizarGraficoAnual();
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
    const tipo = document.getElementById('ing-tipo')?.value;
    const modoSelect = document.getElementById('ing-modo-monto');
    const optPorc = document.getElementById('opt-porcentaje');
    if (!modoSelect || !optPorc) return;
    if (tipo === 'Basico') { modoSelect.value = 'importe'; optPorc.disabled = true; } 
    else { optPorc.disabled = false; }
    toggleModoMonto();
}

function toggleModoMonto() {
    const modo = document.getElementById('ing-modo-monto')?.value;
    const lbl = document.getElementById('label-valor-monto');
    if (lbl) lbl.innerText = modo === 'porcentaje' ? 'Porcentaje (%) del Básico' : 'Monto ($)';
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
    if (document.getElementById('tab-anual')?.classList.contains('active')) renderizarGraficoAnual();
}

function renderizarGraficoAnual() {
    const ctx = document.getElementById('graficoAnual');
    const selectorAnio = document.getElementById('selector-anio');
    if (!ctx || !selectorAnio) return;
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
        data: { labels, datasets: [{ label: 'Saldo Real ($)', data: saldos, borderColor: '#4f46e5', back
