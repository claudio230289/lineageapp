/* =========================================================
   CONTROLADOR PRINCIPAL DE LA APLICACIÓN (js/app.js)
   ========================================================= */
import { db, cargarBaseDatosRemota, guardarBaseDatosLocal, esperarUsuario } from './db.js';
import { calcularNetoMes, calcularGastosMes, calcularPasivoPorKeyword, formatARS } from './calculos.js';
import { renderizarDeseosYProyeccion } from './deseos.js';

let graficoAnualInstancia = null;
const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/* ------------------------------------------------------------------
   Gestión de Pestañas y Navegación Visual
   ------------------------------------------------------------------ */
window.cambiarTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'font-bold');
        btn.classList.add('text-gray-400');
    });

    const targetTab = document.getElementById(`tab-${tabName}`);
    const targetNav = document.getElementById(`nav-${tabName}`);

    if (targetTab) targetTab.classList.add('active');
    if (targetNav) {
        targetNav.classList.remove('text-gray-400');
        targetNav.classList.add('text-indigo-600', 'font-bold');
    }

    if (tabName === 'deseos') {
        renderizarDeseosYProyeccion();
    } else if (tabName === 'anual') {
        renderizarGraficoAnual();
    }
};

window.toggleAcordeon = function(idContenedor, iconoId) {
    const el = document.getElementById(idContenedor);
    const icono = document.getElementById(iconoId);
    if (el) {
        el.classList.toggle('hidden');
        if (icono) icono.classList.toggle('rotate-180');
    }
};

/* ------------------------------------------------------------------
   Control de Secciones Colapsables de Gastos
   ------------------------------------------------------------------ */
window.toggleSeccionGastos = function(idContenedor, iconoId) {
    const contenedor = document.getElementById(idContenedor);
    const icono = document.getElementById(iconoId);
    
    if (contenedor) {
        contenedor.classList.toggle('hidden');
        if (icono) {
            icono.classList.toggle('rotate-180');
        }
    }
};

/* ------------------------------------------------------------------
   Navegación de Meses
   ------------------------------------------------------------------ */
window.mesSiguiente = function() {
    let [y, m] = db.mesActivo.split('-').map(Number);
    m++;
    if (m > 12) { m = 1; y++; }
    db.mesActivo = `${y}-${String(m).padStart(2, '0')}`;
    renderizarTodo();
};

window.mesAnterior = function() {
    let [y, m] = db.mesActivo.split('-').map(Number);
    m--;
    if (m < 1) { m = 12; y--; }
    db.mesActivo = `${y}-${String(m).padStart(2, '0')}`;
    renderizarTodo();
};

window.seleccionarMesCuadricula = function(y, m) {
    db.mesActivo = `${y}-${String(m).padStart(2, '0')}`;
    document.getElementById('sec-selector-mes').classList.add('hidden');
    renderizarTodo();
};

window.cambiarAnioCuadricula = function() {
    generarCuadriculaMeses();
};

function generarCuadriculaMeses() {
    const anioSelect = document.getElementById('selector-anio');
    const contenedor = document.getElementById('cuadricula-meses');
    if (!anioSelect || !contenedor) return;

    const anioActual = anioSelect.value;
    contenedor.innerHTML = '';

    MESES_NOMBRES.forEach((nombre, idx) => {
        const mNum = idx + 1;
        const mKey = `${anioActual}-${String(mNum).padStart(2, '0')}`;
        const esActivo = mKey === db.mesActivo;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `p-2 text-xs font-bold rounded-xl border transition ${esActivo ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`;
        btn.textContent = nombre.substring(0, 3);
        btn.onclick = () => window.seleccionarMesCuadricula(anioActual, mNum);
        contenedor.appendChild(btn);
    });
}

/* ------------------------------------------------------------------
   Gestión de Ingresos y Réplica Controlada hacia Adelante
   ------------------------------------------------------------------ */
window.guardarIngreso = async function(e) {
    e.preventDefault();
    const concepto = document.getElementById('ing-concepto').value.trim();
    const tipo = document.getElementById('ing-tipo').value;
    const modo = document.getElementById('ing-modo-monto').value;
    const valor = parseFloat(document.getElementById('ing-valor').value);

    if (!db.ingresos) db.ingresos = {};
    if (!db.ingresos[db.mesActivo]) db.ingresos[db.mesActivo] = [];

    db.ingresos[db.mesActivo].push({
        id: Date.now(),
        concepto,
        tipo,
        modo,
        valor
    });

    document.getElementById('form-ingreso').reset();
    await guardarBaseDatosLocal(db);
    renderizarTodo();
};

window.eliminarIngreso = async function(id) {
    if (!db.ingresos || !db.ingresos[db.mesActivo]) return;
    db.ingresos[db.mesActivo] = db.ingresos[db.mesActivo].filter(i => i.id !== id);
    await guardarBaseDatosLocal(db);
    renderizarTodo();
};

window.replicarIngresosAdelante = async function() {
    const ingresosActuales = db.ingresos?.[db.mesActivo] || [];
    if (ingresosActuales.length === 0) {
        alert('No hay ingresos cargados en el mes actual para replicar.');
        return;
    }

    let [y, m] = db.mesActivo.split('-').map(Number);
    m++;
    if (m > 12) { m = 1; y++; }
    const mesSiguienteKey = `${y}-${String(m).padStart(2, '0')}`;
    const nombreMesSiguiente = MESES_NOMBRES[m - 1];

    const confirmar = confirm(`⚠️ ATENCIÓN: Está a punto de replicar los ingresos del mes actual hacia el período siguiente (${nombreMesSiguiente} de ${y}).\n\n¿Desea continuar?`);
    
    if (!confirmar) return;

    if (!db.ingresos) db.ingresos = {};
    db.ingresos[mesSiguienteKey] = ingresosActuales.map(i => ({ 
        ...i, 
        id: Date.now() + Math.floor(Math.random() * 1000) 
    }));

    await guardarBaseDatosLocal(db);
    alert(`Ingresos replicados con éxito al período ${nombreMesSiguiente} de ${y}.`);
};

/* ------------------------------------------------------------------
   Gestión de Gastos y Cuotas
   ------------------------------------------------------------------ */
window.guardarGasto = async function(e) {
    e.preventDefault();
    const idEdit = document.getElementById('gas-edit-id').value;
    const concepto = document.getElementById('gas-concepto').value.trim();
    const categoria = document.getElementById('gas-categoria').value;
    const monto = parseFloat(document.getElementById('gas-monto').value);

    if (!db.gastos) db.gastos = {};
    if (!db.gastos[db.mesActivo]) db.gastos[db.mesActivo] = [];

    if (idEdit) {
        const item = db.gastos[db.mesActivo].find(g => g.id == idEdit);
        if (item) {
            item.concepto = concepto;
            item.categoria = categoria;
            item.monto = monto;
        }
        window.cancelarEdicionGasto();
    } else {
        db.gastos[db.mesActivo].push({
            id: Date.now(),
            concepto,
            categoria,
            monto,
            pagado: false
        });
        document.getElementById('form-gasto').reset();
    }

    await guardarBaseDatosLocal(db);
    renderizarTodo();
};

window.guardarCompraTarjeta = async function(e) {
    e.preventDefault();
    const concepto = document.getElementById('tar-concepto').value.trim();
    const cuotaInicio = parseInt(document.getElementById('tar-cuota-inicio').value);
    const totalCuotas = parseInt(document.getElementById('tar-cuotas').value);
    const montoCuota = parseFloat(document.getElementById('tar-monto').value);

    let [y, m] = db.mesActivo.split('-').map(Number);

    if (!db.gastos) db.gastos = {};

    for (let i = 0; i <= (totalCuotas - cuotaInicio); i++) {
        let mesIdx = m + i - 1;
        let anioCalc = y + Math.floor(mesIdx / 12);
        let mesCalc = (mesIdx % 12) + 1;
        let mk = `${anioCalc}-${String(mesCalc).padStart(2, '0')}`;

        if (!db.gastos[mk]) db.gastos[mk] = [];

        db.gastos[mk].push({
            id: Date.now() + i,
            concepto: `${concepto} (${cuotaInicio + i}/${totalCuotas})`,
            categoria: 'Cuotas',
            monto: montoCuota,
            pagado: false
        });
    }

    document.getElementById('form-tarjeta').reset();
    document.getElementById('tar-cuota-inicio').value = "1";
    await guardarBaseDatosLocal(db);
    renderizarTodo();
    alert('Compra en cuotas programada con éxito en los períodos correspondientes.');
};

window.togglePagoGasto = async function(id) {
    const lista = db.gastos[db.mesActivo] || [];
    const item = lista.find(g => g.id === id);
    if (item) {
        item.pagado = !item.pagado;
        await guardarBaseDatosLocal(db);
        renderizarTodo();
    }
};

window.eliminarGasto = async function(id) {
    if (!db.gastos || !db.gastos[db.mesActivo]) return;
    db.gastos[db.mesActivo] = db.gastos[db.mesActivo].filter(g => g.id !== id);
    await guardarBaseDatosLocal(db);
    renderizarTodo();
};

window.editarGasto = function(id) {
    const lista = db.gastos[db.mesActivo] || [];
    const item = lista.find(g => g.id === id);
    if (!item) return;

    document.getElementById('gas-edit-id').value = item.id;
    document.getElementById('gas-concepto').value = item.concepto;
    document.getElementById('gas-categoria').value = item.categoria;
    document.getElementById('gas-monto').value = item.monto;
    document.getElementById('form-gasto-titulo').textContent = 'Editar Gasto';
    document.getElementById('btn-submit-gasto').textContent = 'Guardar Cambios';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.cancelarEdicionGasto = function() {
    document.getElementById('gas-edit-id').value = '';
    document.getElementById('form-gasto').reset();
    document.getElementById('form-gasto-titulo').textContent = 'Cargar Gasto / Único';
    document.getElementById('btn-submit-gasto').textContent = 'Agregar Gasto';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
};

window.limpiarFiltroGastos = function() {
    document.getElementById('filtro-gastos').value = '';
    document.getElementById('btn-limpiar-filtro').classList.add('hidden');
    renderizarTodo();
};

/* ------------------------------------------------------------------
   Gestión de Deseos y Pasivos
   ------------------------------------------------------------------ */
window.guardarDeseo = async function(e) {
    e.preventDefault();
    const concepto = document.getElementById('des-concepto').value.trim();
    const moneda = document.getElementById('des-moneda').value;
    const monto = parseFloat(document.getElementById('des-monto').value);

    if (!db.deseos) db.deseos = [];
    db.deseos.push({ id: Date.now(), concepto, moneda, monto, comprado: false });

    document.getElementById('form-deseo').reset();
    await guardarBaseDatosLocal(db);
    renderizarDeseosYProyeccion();
};

window.guardarReglaPasivo = async function(e) {
    e.preventDefault();
    const nombre = document.getElementById('pas-nombre').value.trim();
    const keyword = document.getElementById('pas-keyword').value.trim().toLowerCase();

    if (!db.pasivos) db.pasivos = [];
    db.pasivos.push({ id: Date.now(), nombre, keyword });

    document.getElementById('form-pasivo').reset();
    await guardarBaseDatosLocal(db);
    renderizarPasivos();
};

window.eliminarPasivo = async function(id) {
    db.pasivos = (db.pasivos || []).filter(p => p.id !== id);
    await guardarBaseDatosLocal(db);
    renderizarPasivos();
};

window.editarDolarManual = async function() {
    const nuevoDolar = prompt('Ingrese cotización del Dólar Oficial:', db.dolar || 1250);
    if (nuevoDolar === null) return;
    const val = parseFloat(nuevoDolar.replace(',', '.'));
    if (!isNaN(val) && val > 0) {
        db.dolar = val;
        await guardarBaseDatosLocal(db);
        renderizarTodo();
    }
};

/* ------------------------------------------------------------------
   Funciones de Operaciones, Respaldo y Sincronización Cloud
   ------------------------------------------------------------------ */
window.accionGuardarNube = async function() {
    try {
        await guardarBaseDatosLocal(db);
        alert('Base de datos guardada y sincronizada correctamente en la nube y dispositivo.');
    } catch (e) {
        alert('Error al guardar en la nube: ' + e.message);
    }
};

window.accionCargarNube = async function() {
    const confirmar = confirm("⚠️ ATENCIÓN: Al importar desde la nube se sobrescribirán los datos locales actuales con la información guardada en Firebase. ¿Desea continuar?");
    if (!confirmar) return;

    try {
        const resultado = await cargarBaseDatosRemota();
        if (resultado && resultado.database) {
            renderizarTodo();
            alert("Datos importados y sincronizados desde la nube con éxito.");
        } else {
            alert("No se pudieron cargar los datos o la sesión no está activa.");
        }
    } catch (e) {
        alert("Error al importar desde la nube: " + e.message);
    }
};

window.accionGuardarJSON = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `finanzas_backup_${db.mesActivo}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
};

window.accionIniciarImportacionJSON = function() {
    const fileInput = document.getElementById('import-file-resumen');
    if (fileInput) fileInput.click();
};

window.importarRespaldoJSONAuto = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData && typeof importedData === 'object') {
                Object.assign(db, importedData);
                await guardarBaseDatosLocal(db);
                renderizarTodo();
                alert('Respaldo importado y cargado con éxito.');
            } else {
                alert('El archivo JSON no es válido.');
            }
        } catch (err) {
            alert('Error al leer el archivo JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
};

window.accionActualizarApp = function() {
    window.location.reload();
};

window.accionExportarPDF = function() {
    window.print();
};

/* ------------------------------------------------------------------
   Renderizado General de Pantallas y Componentes
   ------------------------------------------------------------------ */
export function renderizarTodo() {
    const [y, m] = db.mesActivo.split('-').map(Number);
    const labelMes = document.getElementById('label-mes-seleccionado');
    if (labelMes) labelMes.textContent = `${MESES_NOMBRES[m - 1]} de ${y}`;

    const labelFecha = document.getElementById('current-date-label');
    if (labelFecha) {
        const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        labelFecha.textContent = new Date().toLocaleDateString('es-AR', opciones);
    }

    const dolarVal = document.getElementById('dolar-oficial-val');
    if (dolarVal) dolarVal.textContent = `$ ${(db.dolar || 1250).toLocaleString('es-AR')}`;

    generarCuadriculaMeses();

    const resIngresos = calcularNetoMes(db.mesActivo);
    const resGastos = calcularGastosMes(db.mesActivo);
    const saldoReal = resIngresos.neto - resGastos.total;

    if (document.getElementById('card-saldo-real')) {
        document.getElementById('card-saldo-real').textContent = formatARS(saldoReal);
        document.getElementById('card-total-ingresos').textContent = formatARS(resIngresos.neto);
        document.getElementById('card-total-egresos').textContent = formatARS(resGastos.total);
        document.getElementById('card-gastos-pagados').textContent = formatARS(resGastos.pagado);
        document.getElementById('card-gastos-pendientes').textContent = formatARS(resGastos.pendientes);

        document.getElementById('summary-col-fijos').textContent = formatARS(resGastos.fijos);
        document.getElementById('summary-col-unicos').textContent = formatARS(resGastos.unicos);
        document.getElementById('summary-col-cuotas').textContent = formatARS(resGastos.cuotas);

        document.getElementById('recibo-tot-rem').textContent = formatARS(resIngresos.rem);
        document.getElementById('recibo-tot-norem').textContent = formatARS(resIngresos.norem);
        document.getElementById('recibo-tot-ded').textContent = `-${formatARS(resIngresos.ded)}`;
        document.getElementById('recibo-neto-final').textContent = formatARS(resIngresos.neto);
    }

    const listaIng = document.getElementById('lista-ingresos');
    if (listaIng) {
        const itemsIng = db.ingresos?.[db.mesActivo] || [];
        listaIng.innerHTML = itemsIng.length === 0 ? '<p class="text-xs text-gray-400 text-center py-2">No hay ingresos cargados.</p>' : '';
        itemsIng.forEach(i => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-xs';
            div.innerHTML = `
                <div>
                    <span class="font-bold text-gray-800">${i.concepto}</span>
                    <span class="text-[10px] text-indigo-600 block">${i.tipo} · ${formatARS(i.valor)}</span>
                </div>
                <button onclick="window.eliminarIngreso(${i.id})" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash text-xs"></i></button>
            `;
            listaIng.appendChild(div);
        });
    }

    const filtroVal = (document.getElementById('filtro-gastos')?.value || '').trim().toLowerCase();
    const btnLimpiar = document.getElementById('btn-limpiar-filtro');
    if (btnLimpiar) btnLimpiar.classList.toggle('hidden', !filtroVal);

    const gastosItems = db.gastos?.[db.mesActivo] || [];
    const gastosFiltrados = filtroVal ? gastosItems.filter(g => g.concepto.toLowerCase().includes(filtroVal)) : gastosItems;

    const divFijos = document.getElementById('lista-gastos-fijos');
    const divUnicos = document.getElementById('lista-gastos-unicos');
    const divCuotas = document.getElementById('lista-gastos-cuotas');

    if (divFijos && divUnicos && divCuotas) {
        divFijos.innerHTML = '';
        divUnicos.innerHTML = '';
        divCuotas.innerHTML = '';

        let totalFiltro = 0;
        gastosFiltrados.forEach(g => {
            totalFiltro += Number(g.monto || 0);
            const cat = (g.categoria || '').trim().toLowerCase();
            const targetDiv = cat === 'fijos' ? divFijos : (cat === 'unicos' ? divUnicos : divCuotas);

            const card = document.createElement('div');
            card.className = `flex justify-between items-center p-2.5 rounded-xl border text-xs ${g.pagado ? 'bg-emerald-50/60 border-emerald-200' : 'bg-gray-50 border-gray-100'}`;
            card.innerHTML = `
                <div class="flex items-center space-x-2">
                    <input type="checkbox" ${g.pagado ? 'checked' : ''} onchange="window.togglePagoGasto(${g.id})" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500">
                    <div>
                        <span class="font-bold ${g.pagado ? 'line-through text-emerald-800' : 'text-gray-800'}">${g.concepto}</span>
                        <span class="text-[10px] block text-gray-500">${formatARS(g.monto)}</span>
                    </div>
                </div>
                <div class="flex items-center space-x-1">
                    <button onclick="window.editarGasto(${g.id})" class="p-1 text-gray-500 hover:text-indigo-600"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="window.eliminarGasto(${g.id})" class="p-1 text-red-500 hover:text-red-700"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            `;
            targetDiv.appendChild(card);
        });

        document.getElementById('total-col-fijos').textContent = formatARS(resGastos.fijos);
        document.getElementById('total-col-unicos').textContent = formatARS(resGastos.unicos);
        document.getElementById('total-col-cuotas').textContent = formatARS(resGastos.cuotas);
        document.getElementById('filtro-total-badge').textContent = `Total: ${formatARS(totalFiltro)}`;

        document.getElementById('gastos-sueldo-neto').textContent = formatARS(resIngresos.neto);
        document.getElementById('gastos-saldo-disponible').textContent = formatARS(saldoReal);
        document.getElementById('gastos-tot-general').textContent = formatARS(resGastos.total);
        document.getElementById('gastos-tot-pagado').textContent = formatARS(resGastos.pagado);
        document.getElementById('gastos-tot-pendiente').textContent = formatARS(resGastos.pendientes);
    }

    renderizarPasivos();
}

function renderizarPasivos() {
    const contenedor = document.getElementById('lista-pasivos-consolidados');
    if (!contenedor) return;

    const pasivos = db.pasivos || [];
    contenedor.innerHTML = pasivos.length === 0 ? '<p class="text-xs text-gray-400 text-center py-2">No hay reglas de pasivos registradas.</p>' : '';

    pasivos.forEach(p => {
        const info = calcularPasivoPorKeyword(p.keyword);
        const card = document.createElement('div');
        card.className = 'bg-gray-50 rounded-xl p-3 border border-gray-200 flex justify-between items-center text-xs';
        card.innerHTML = `
            <div>
                <span class="font-bold text-gray-800 block">${p.nombre}</span>
                <span class="text-[10px] text-gray-500">Deuda restante: <strong class="text-rose-600">${formatARS(info.totalDeuda)}</strong> (${info.cuotasRestantes} cuotas)</span>
            </div>
            <button onclick="window.eliminarPasivo(${p.id})" class="text-red-500 hover:text-red-700 p-1.5"><i class="fa-solid fa-trash"></i></button>
        `;
        contenedor.appendChild(card);
    });
}

function renderizarGraficoAnual() {
    const ctx = document.getElementById('graficoAnual');
    const tbody = document.getElementById('tabla-anual-body');
    if (!ctx || !tbody) return;

    const [y] = db.mesActivo.split('-').map(Number);
    const labels = [];
    const dataIngresos = [];
    const dataEgresos = [];
    const dataSaldos = [];
    tbody.innerHTML = '';

    MESES_NOMBRES.forEach((nombre, idx) => {
        const mNum = idx + 1;
        const mk = `${y}-${String(mNum).padStart(2, '0')}`;
        labels.push(nombre.substring(0, 3));

        const ing = calcularNetoMes(mk).neto;
        const gas = calcularGastosMes(mk).total;
        const saldo = ing - gas;

        dataIngresos.push(ing);
        dataEgresos.push(gas);
        dataSaldos.push(saldo);

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition';
        tr.innerHTML = `
            <td class="py-2.5 pr-2 font-medium text-gray-700">${nombre}</td>
            <td class="py-2.5 px-2 text-right font-mono text-emerald-700">${formatARS(ing)}</td>
            <td class="py-2.5 px-2 text-right font-mono text-rose-700">${formatARS(gas)}</td>
            <td class="py-2.5 pl-2 text-right font-mono font-bold ${saldo >= 0 ? 'text-indigo-600' : 'text-rose-600'}">${formatARS(saldo)}</td>
        `;
        tbody.appendChild(tr);
    });

    if (graficoAnualInstancia) graficoAnualInstancia.destroy();
    graficoAnualInstancia = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Ingresos', data: dataIngresos, backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'Egresos', data: dataEgresos, backgroundColor: '#f43f5e', borderRadius: 4 },
                { label: 'Saldo', data: dataSaldos, backgroundColor: '#4f46e5', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
            scales: {
                y: { ticks: { font: { size: 9 }, callback: val => '$' + (val / 1000).toFixed(0) + 'k' } },
                x: { ticks: { font: { size: 9 } } }
            }
        }
    });
}

/* ------------------------------------------------------------------
   Inicialización de la Aplicación
   ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const user = await esperarUsuario();
        if (user) {
            await cargarBaseDatosRemota(user);
            renderizarTodo();
        } else {
            console.log('[LineageApp] Esperando acción de inicio de sesión del usuario.');
        }
    } catch (e) {
        console.error('Error al inicializar la aplicación:', e);
    }
});
