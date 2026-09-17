// js/app.js - Orquestador y renderizado de datos

document.addEventListener('DOMContentLoaded', () => {
    inicializarApp();
});

function inicializarApp() {
    actualizarVistaGeneral();
    
    // Listeners para formularios
    const formIngreso = document.getElementById('form-ingreso');
    if (formIngreso) {
        formIngreso.addEventListener('submit', (e) => {
            e.preventDefault();
            agregarIngreso();
        });
    }

    const formGasto = document.getElementById('form-gasto');
    if (formGasto) {
        formGasto.addEventListener('submit', (e) => {
            e.preventDefault();
            agregarGasto();
        });
    }

    const formDeseo = document.getElementById('form-deseo');
    if (formDeseo) {
        formDeseo.addEventListener('submit', (e) => {
            e.preventDefault();
            agregarDeseo();
        });
    }
}

// Cambio de pestañas (Tabs)
function cambiarTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });
    const target = document.getElementById('tab-' + tabId);
    if (target) {
        target.classList.add('active');
    }

    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('text-indigo-600');
        btn.classList.add('text-gray-400');
    });
    const activeNav = document.getElementById('nav-' + tabId);
    if (activeNav) {
        activeNav.classList.remove('text-gray-400');
        activeNav.classList.add('text-indigo-600');
    }
}

function cambiarMesGlobal() {
    actualizarVistaGeneral();
}

// Actualizar toda la interfaz con los datos del mes seleccionado
function actualizarVistaGeneral() {
    const selectMes = document.getElementById('global-month');
    if (!selectMes) return;
    const mesSeleccionado = selectMes.value; // Ej: "2026-09"

    const datosMes = obtenerDatosMes(mesSeleccionado);
    
    renderizarIngresos(datosMes.ingresos);
    renderizarGastos(datosMes.gastos);
    renderizarResumen(datosMes);
}

function renderizarIngresos(ingresos) {
    const contenedor = document.getElementById('lista-ingresos');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    let totRem = 0;
    let totNoRem = 0;
    let totDed = 0;

    ingresos.forEach((item, index) => {
        if (item.tipo === 'Basico' || item.tipo === 'Remunerativo') totRem += Number(item.valor || 0);
        if (item.tipo === 'NoRemunerativo') totNoRem += Number(item.valor || 0);
        if (item.tipo === 'Deduccion') totDed += Number(item.valor || 0);

        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-xs';
        div.innerHTML = `
            <div>
                <span class="font-bold text-gray-800 block">${item.concepto}</span>
                <span class="text-[10px] text-gray-500 uppercase">${item.tipo}</span>
            </div>
            <div class="flex items-center space-x-3">
                <span class="font-mono font-bold">$ ${Number(item.valor || 0).toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>
                <button onclick="eliminarIngreso(${index})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        contenedor.appendChild(div);
    });

    const netoFinal = (totRem + totNoRem) - totDed;

    document.getElementById('recibo-tot-rem').innerText = `$ ${totRem.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    document.getElementById('recibo-tot-norem').innerText = `$ ${totNoRem.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    document.getElementById('recibo-tot-ded').innerText = `$ ${totDed.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    document.getElementById('recibo-neto-final').innerText = `$ ${netoFinal.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
}

function renderizarGastos(gastos) {
    const contFijos = document.getElementById('lista-gastos-fijos');
    const contDeudas = document.getElementById('lista-gastos-deudas');
    const contAhorros = document.getElementById('lista-gastos-ahorros');

    if (contFijos) contFijos.innerHTML = '';
    if (contDeudas) contDeudas.innerHTML = '';
    if (contAhorros) contAhorros.innerHTML = '';

    let sumFijos = 0;
    let sumDeudas = 0;
    let sumAhorros = 0;

    gastos.forEach((item, index) => {
        const monto = Number(item.monto || 0);
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-xs';
        div.innerHTML = `
            <div>
                <span class="font-bold text-gray-800 block">${item.concepto} ${item.acreedor ? `(${item.acreedor})` : ''}</span>
            </div>
            <div class="flex items-center space-x-3">
                <span class="font-mono font-bold">$ ${monto.toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>
                <button onclick="eliminarGasto(${index})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;

        if (item.categoria === 'Fijos') {
            sumFijos += monto;
            if (contFijos) contFijos.appendChild(div);
        } else if (item.categoria === 'Deudas') {
            sumDeudas += monto;
            if (contDeudas) contDeudas.appendChild(div);
        } else if (item.categoria === 'Ahorros') {
            sumAhorros += monto;
            if (contAhorros) contAhorros.appendChild(div);
        }
    });

    if (document.getElementById('summary-col-fijos')) document.getElementById('summary-col-fijos').innerText = `$ ${sumFijos.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    if (document.getElementById('summary-col-deudas')) document.getElementById('summary-col-deudas').innerText = `$ ${sumDeudas.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    if (document.getElementById('summary-col-ahorros')) document.getElementById('summary-col-ahorros').innerText = `$ ${sumAhorros.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
}

function renderizarResumen(datosMes) {
    let totRem = 0;
    let totNoRem = 0;
    let totDed = 0;
    datosMes.ingresos.forEach(item => {
        if (item.tipo === 'Basico' || item.tipo === 'Remunerativo') totRem += Number(item.valor || 0);
        if (item.tipo === 'NoRemunerativo') totNoRem += Number(item.valor || 0);
        if (item.tipo === 'Deduccion') totDed += Number(item.valor || 0);
    });
    const netoTeorico = (totRem + totNoRem) - totDed;

    let totalEgresos = 0;
    datosMes.gastos.forEach(item => {
        totalEgresos += Number(item.monto || 0);
    });

    const disponible = netoTeorico - totalEgresos;

    if (document.getElementById('card-sueldo-neto-teorico')) document.getElementById('card-sueldo-neto-teorico').innerText = `$ ${netoTeorico.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    if (document.getElementById('card-total-egresos')) document.getElementById('card-total-egresos').innerText = `$ ${totalEgresos.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    if (document.getElementById('card-saldo-disponible-pagado')) document.getElementById('card-saldo-disponible-pagado').innerText = `$ ${disponible.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    if (document.getElementById('gastos-saldo-disponible')) document.getElementById('gastos-saldo-disponible').innerText = `$ ${disponible.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    if (document.getElementById('gastos-sueldo-neto')) document.getElementById('gastos-sueldo-neto').innerText = `$ ${netoTeorico.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
}

function agregarIngreso() {
    const mes = document.getElementById('global-month').value;
    const concepto = document.getElementById('ing-concepto').value;
    const tipo = document.getElementById('ing-tipo').value;
    const valor = parseFloat(document.getElementById('ing-valor').value) || 0;

    const db = obtenerBaseDatos();
    db.ingresos.push({ mes, concepto, tipo, valor });
    guardarBaseDatos(db);

    document.getElementById('form-ingreso').reset();
    actualizarVistaGeneral();
}

function agregarGasto() {
    const mes = document.getElementById('global-month').value;
    const concepto = document.getElementById('gas-concepto').value;
    const categoria = document.getElementById('gas-categoria').value;
    const monto = parseFloat(document.getElementById('gas-monto').value) || 0;
    const acreedor = document.getElementById('gas-acreedor').value;

    const db = obtenerBaseDatos();
    db.gastos.push({ mes, concepto, categoria, monto, acreedor });
    guardarBaseDatos(db);

    document.getElementById('form-gasto').reset();
    actualizarVistaGeneral();
}

function eliminarIngreso(indexGlobal) {
    const mes = document.getElementById('global-month').value;
    const db = obtenerBaseDatos();
    
    const filtrados = db.ingresos.map((item, idx) => ({...item, realIndex: idx})).filter(item => item.mes === mes);
    if (filtrados[indexGlobal]) {
        db.ingresos.splice(filtrados[indexGlobal].realIndex, 1);
        guardarBaseDatos(db);
        actualizarVistaGeneral();
    }
}

function eliminarGasto(indexGlobal) {
    const mes = document.getElementById('global-month').value;
    const db = obtenerBaseDatos();
    
    const filtrados = db.gastos.map((item, idx) => ({...item, realIndex: idx})).filter(item => item.mes === mes);
    if (filtrados[indexGlobal]) {
        db.gastos.splice(filtrados[indexGlobal].realIndex, 1);
        guardarBaseDatos(db);
        actualizarVistaGeneral();
    }
}

function editarDolarManual() {
    const nuevoDolar = prompt("Ingrese la cotización actual del Dólar Oficial:", "1250");
    if (nuevoDolar && !isNaN(nuevoDolar)) {
        const el = document.getElementById('dolar-oficial-val');
        if (el) el.innerText = `$ ${Number(nuevoDolar).toLocaleString('es-AR')}`;
    }
}

function instalarApp() {
    console.log("Instalación PWA solicitada");
}
