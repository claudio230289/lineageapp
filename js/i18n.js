/* =========================================================
   INTERNACIONALIZACIÓN (js/i18n.js)
   Soporte multi-idioma para la aplicación
   ========================================================= */

const translations = {
    es: {
        // Navegación
        nav_resumen: 'Resumen',
        nav_ingresos: 'Ingresos',
        nav_gastos: 'Gastos',
        nav_pasivos: 'Pasivos',
        nav_deseos: 'Deseos',
        nav_anual: 'Anual',
        
        // Resumen
        saldo_real: 'Saldo Real del Mes',
        total_ingresos: 'TOTAL INGRESOS',
        total_egresos: 'TOTAL EGRESOS',
        gastos_pagados: 'Gastos Pagados',
        gastos_pendientes: 'Gastos Pendientes',
        desglose_egresos: 'Desglose de Egresos',
        fijos: 'FIJOS',
        unicos: 'ÚNICOS',
        cuotas: 'CUOTAS',
        
        // Ingresos
        cargar_ingreso: 'Cargar Concepto de Ingreso',
        concepto: 'Concepto',
        tipo: 'Tipo',
        modo_calculo: 'Modo Cálculo',
        monto: 'Monto ($)',
        porcentaje: 'Porcentaje (%) del Básico',
        guardar_ingreso: 'Guardar Ingreso',
        ingresos_mes: 'Ingresos del Mes',
        
        // Gastos
        cargar_gasto: 'Cargar Gasto / Único',
        categoria: 'Categoría',
        fijo_mensual: 'Fijo Mensual',
        unico_variable: 'Único / Variable',
        agregar_gasto: 'Agregar Gasto',
        buscar_gastos: 'Buscar en gastos...',
        total: 'Total',
        
        // Pasivos
        registrar_pasivo: 'Registrar Regla de Pasivo / Deuda',
        nombre_entidad: 'Nombre / Entidad',
        palabra_clave: 'Palabra Clave (Filtro en Cuotas)',
        agregar_deuda: 'Agregar Regla de Deuda',
        pasivos_consolidados: 'Pasivos Consolidados y Precancelación',
        
        // Deseos
        agregar_deseo: 'Agregar Deseo / Meta Financiera',
        concepto_meta: 'Concepto / Meta',
        moneda: 'Moneda',
        costo_estimado: 'Costo Estimado',
        agregar_meta: 'Agregar Meta',
        capacidad_simulacion: 'Capacidad y Simulación',
        proyeccion_ahorro: 'Proyección de Ahorro Acumulado',
        metas_proyectadas: 'Metas Proyectadas',
        
        // Anual
        evolucion_anual: 'Evolución Anual del Saldo',
        tabla_consolidada: 'Tabla Consolidada Anual',
        mes: 'Mes',
        ingresos: 'Ingresos',
        egresos: 'Egresos',
        saldo: 'Saldo',
        
        // Acciones
        guardar_nube: 'Guardar en Nube (Firebase)',
        importar_nube: 'Importar desde Firebase',
        guardar_local: 'Guardar en dispositivo local',
        cargar_local: 'Cargar desde dispositivo local',
        actualizar_app: 'Actualizar App',
        generar_pdf: 'Generar PDF',
        cerrar_sesion: 'Cerrar Sesión',
        
        // Mensajes
        datos_guardados: 'Datos guardados con éxito',
        datos_importados: 'Datos importados con éxito',
        error_guardado: 'Error al guardar datos',
        error_importacion: 'Error al importar datos',
        confirmar_salida: '¿Estás seguro?',
        
        // Meses
        enero: 'Enero', febrero: 'Febrero', marzo: 'Marzo',
        abril: 'Abril', mayo: 'Mayo', junio: 'Junio',
        julio: 'Julio', agosto: 'Agosto', septiembre: 'Septiembre',
        octubre: 'Octubre', noviembre: 'Noviembre', diciembre: 'Diciembre'
    },
    
    en: {
        // Navigation
        nav_resumen: 'Summary',
        nav_ingresos: 'Income',
        nav_gastos: 'Expenses',
        nav_pasivos: 'Liabilities',
        nav_deseos: 'Goals',
        nav_anual: 'Annual',
        
        // Summary
        saldo_real: 'Monthly Real Balance',
        total_ingresos: 'TOTAL INCOME',
        total_egresos: 'TOTAL EXPENSES',
        gastos_pagados: 'Paid Expenses',
        gastos_pendientes: 'Pending Expenses',
        desglose_egresos: 'Expense Breakdown',
        fijos: 'FIXED',
        unicos: 'UNIQUE',
        cuotas: 'INSTALLMENTS',
        
        // Income
        cargar_ingreso: 'Add Income Concept',
        concepto: 'Concept',
        tipo: 'Type',
        modo_calculo: 'Calculation Mode',
        monto: 'Amount ($)',
        porcentaje: 'Percentage (%) of Basic',
        guardar_ingreso: 'Save Income',
        ingresos_mes: 'Monthly Income',
        
        // Expenses
        cargar_gasto: 'Add Expense / One-time',
        categoria: 'Category',
        fijo_mensual: 'Monthly Fixed',
        unico_variable: 'One-time / Variable',
        agregar_gasto: 'Add Expense',
        buscar_gastos: 'Search expenses...',
        total: 'Total',
        
        // Liabilities
        registrar_pasivo: 'Register Liability / Debt Rule',
        nombre_entidad: 'Name / Entity',
        palabra_clave: 'Keyword (Filter in Installments)',
        agregar_deuda: 'Add Debt Rule',
        pasivos_consolidados: 'Consolidated Liabilities and Prepayment',
        
        // Goals
        agregar_deseo: 'Add Wish / Financial Goal',
        concepto_meta: 'Concept / Goal',
        moneda: 'Currency',
        costo_estimado: 'Estimated Cost',
        agregar_meta: 'Add Goal',
        capacidad_simulacion: 'Capacity and Simulation',
        proyeccion_ahorro: 'Accumulated Savings Projection',
        metas_proyectadas: 'Projected Goals',
        
        // Annual
        evolucion_anual: 'Annual Balance Evolution',
        tabla_consolidada: 'Consolidated Annual Table',
        mes: 'Month',
        ingresos: 'Income',
        egresos: 'Expenses',
        saldo: 'Balance',
        
        // Actions
        guardar_nube: 'Save to Cloud (Firebase)',
        importar_nube: 'Import from Firebase',
        guardar_local: 'Save to local device',
        cargar_local: 'Load from local device',
        actualizar_app: 'Update App',
        generar_pdf: 'Generate PDF',
        cerrar_sesion: 'Sign Out',
        
        // Messages
        datos_guardados: 'Data saved successfully',
        datos_importados: 'Data imported successfully',
        error_guardado: 'Error saving data',
        error_importacion: 'Error importing data',
        confirmar_salida: 'Are you sure?',
        
        // Months
        enero: 'January', febrero: 'February', marzo: 'March',
        abril: 'April', mayo: 'May', junio: 'June',
        julio: 'July', agosto: 'August', septiembre: 'September',
        octubre: 'October', noviembre: 'November', diciembre: 'December'
    }
};

let currentLanguage = 'es';

export function setLanguage(lang) {
    if (translations[lang]) {
        currentLanguage = lang;
        localStorage.setItem('app_language', lang);
        updateUI();
    }
}

export function getLanguage() {
    return currentLanguage;
}

export function t(key) {
    return translations[currentLanguage]?.[key] || translations.es[key] || key;
}

export function initI18n() {
    const savedLang = localStorage.getItem('app_language') || 'es';
    setLanguage(savedLang);
}

export function updateUI() {
    // Actualizar todos los elementos con data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    
    // Actualizar placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
}

export function getAvailableLanguages() {
    return Object.keys(translations);
}
