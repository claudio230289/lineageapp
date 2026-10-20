/* =========================================================
   NÚCLEO DEL MÓDULO DE INSTRUCTIVOS (js/instructivos/nucleo.js)
   Lógica pura, datos estructurados y funciones de búsqueda.
   Libre de DOM, Firebase y efectos secundarios.
   ========================================================= */

/**
 * Categorías temáticas de instructivos.
 */
export const CATEGORIAS_INSTRUCTIVOS = [
    { id: 'todas', nombre: 'Todas las Guías', icono: 'fa-solid fa-list-check' },
    { id: 'inicio', nombre: 'Ciclo Mensual y Básico', icono: 'fa-solid fa-arrows-rotate' },
    { id: 'operaciones', nombre: 'Compras y Gastos', icono: 'fa-solid fa-cart-shopping' },
    { id: 'tarjetas', nombre: 'Cuotas y Pasivos', icono: 'fa-solid fa-credit-card' },
    { id: 'avanzado', nombre: 'Proyecciones y Nube', icono: 'fa-solid fa-cloud-arrow-up' }
];

/**
 * Base de datos estructurada con las 7 guías maestras de la aplicación.
 */
export const INSTRUCTIVOS_DATA = [
    {
        id: 'ciclo-mensual',
        categoria: 'inicio',
        categoriaNombre: 'Ciclo Mensual y Básico',
        titulo: 'Guía Rápida: Ciclo Mensual y Balance',
        subtitulo: 'Cómo registrar ingresos, clasificar gastos y leer el saldo real en tu mes.',
        icono: 'fa-solid fa-arrows-rotate',
        colorBadge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        tabDestino: 'resumen',
        botonTexto: 'Ir al Resumen',
        keywords: ['ingresos', 'gastos', 'balance', 'saldo', 'dolar', 'ciclo', 'mes', 'inicio', 'basico'],
        resumen: 'Conocé el flujo mensual fundamental: configurar la cotización del dólar, registrar tus fuentes de ingresos, cargar gastos fijos o únicos y verificar el saldo real disponible.',
        pasos: [
            {
                numero: 1,
                titulo: 'Ajustar la cotización del Dólar Oficial',
                descripcion: 'En la barra superior de la app tenés a la vista la cotización del Dólar Oficial. Al tocarla podés actualizarla manualmente o consultar la API en tiempo real para mantener tus cuentas al día.'
            },
            {
                numero: 2,
                titulo: 'Cargar Ingresos en la pestaña "Ingresos"',
                descripcion: 'Registrá tus sueldos o cobros principales. Podés ingresar un importe directo o abrir la "Carga Avanzada" para discriminar básicos remunerativos, no remunerativos, deducciones de ley o conceptos porcentuales.'
            },
            {
                numero: 3,
                titulo: 'Registrar Gastos Fijos y Gastos Únicos',
                descripcion: 'Los gastos fijos (alquiler, abonos, suscripciones) se proyectan y replican automáticamente a meses futuros. Los gastos únicos corresponden a consumos puntuales de este mes en curso.'
            },
            {
                numero: 4,
                titulo: 'Monitorear el Saldo Real y Tildar Gastos Pagados',
                descripcion: 'A medida que abones tus facturas, hacé clic en el botón de check circular de cada gasto para marcarlo como Pagado. El Saldo Real descontará los egresos pendientes y te mostrará el dinero exacto que tenés disponible.'
            }
        ],
        tipDestacado: 'El Saldo Real refleja tu dinero neto real luego de restar los gastos comprometidos aún no pagados. Tildar lo pagado te garantiza no pagar dos veces la misma cuenta.'
    },
    {
        id: 'listas-compra',
        categoria: 'operaciones',
        categoriaNombre: 'Compras y Gastos',
        titulo: 'Listas de Compra con Pase a Gastos',
        subtitulo: 'Armá la lista para el súper, marcá lo comprado y pasalo a gastos en un clic.',
        icono: 'fa-solid fa-cart-shopping',
        colorBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        tabDestino: 'compras',
        botonTexto: 'Ir a Compras',
        keywords: ['compras', 'super', 'supermercado', 'lista', 'articulos', 'carrito', 'pase a gastos'],
        resumen: 'Organizá tus compras cotidianas sin mezclar cuentas preliminares con gastos confirmados. Cuando vuelvas del súper, transferí los artículos comprados a los egresos del mes con un solo toque.',
        pasos: [
            {
                numero: 1,
                titulo: 'Planificar la compra en la pestaña "Compras"',
                descripcion: 'Agregá los artículos indicando nombre, cantidad estimada (ej: 2 kg, 1 u) y precio aproximado. Podés categorizarlos por Supermercado, Verdulería, Carnicería o Farmacia.'
            },
            {
                numero: 2,
                titulo: 'Tildar artículos mientras comprás en el local',
                descripcion: 'En el supermercado abrí la app desde tu celular y tocá el checkbox de cada producto a medida que lo cargás al carrito. La barra superior calculará al instante el total acumulado de lo comprado frente a lo pendiente.'
            },
            {
                numero: 3,
                titulo: 'Pasar los artículos comprados a Gastos del Mes',
                descripcion: 'Al finalizar la compra, tocá "Pasar a Gastos del Mes". La app consolidará automáticamente los artículos tildados en un nuevo gasto único dentro del mes activo, con el concepto y total correspondientes.'
            },
            {
                numero: 4,
                titulo: 'Limpiar o conservar pendientes',
                descripcion: 'Si algún artículo no estaba en góndola o decidiste no llevarlo, podés mantenerlo en la lista como pendiente para la próxima compra o usar "Limpiar Comprados" para dejar la lista lista para el próximo súper.'
            }
        ],
        tipDestacado: 'Al pasar la compra a gastos podés editar el concepto sugerido (ej: "Día Supermercado - Coto") para identificar con claridad el comprobante en tu lista mensual de gastos.'
    },
    {
        id: 'cuotas-planes',
        categoria: 'tarjetas',
        categoriaNombre: 'Cuotas y Pasivos',
        titulo: 'Compras en Cuotas y Edición de Planes',
        subtitulo: 'Distribución inteligente en meses futuros, cuotas variables y edición segura.',
        icono: 'fa-solid fa-credit-card',
        colorBadge: 'bg-purple-100 text-purple-800 border-purple-200',
        tabDestino: 'gastos',
        botonTexto: 'Ir a Gastos / Cuotas',
        keywords: ['tarjetas', 'cuotas', 'plan', 'credito', 'edicion plan', 'intereses', 'variables'],
        resumen: 'Gestioná planes de tarjeta de crédito sin cálculos manuales: la app distribuye cada cuota en su respectivo mes futuro y te permite editar planes completos sin romper cuotas históricas ya pagadas.',
        pasos: [
            {
                numero: 1,
                titulo: 'Cargar una nueva compra con tarjeta',
                descripcion: 'En la pestaña "Gastos", abrí el panel "Cargar Tarjeta / Cuotas". Indicá el comercio o concepto base, la cantidad de cuotas totales y el mes de inicio del primer vencimiento.'
            },
            {
                numero: 2,
                titulo: 'Elegir modo de carga: Cuotas Fijas o Variables',
                descripcion: 'Para cuotas iguales, ingresá el monto de una cuota o el total financiado. Si el plan incluye recargos escalonados o montos variables, seleccioná "Cuotas Variables" para definir el importe exacto de cada mes.'
            },
            {
                numero: 3,
                titulo: 'Visualización calendarizada en cada mes',
                descripcion: 'La app generará las cuotas en cada mes correspondiente (ej: "TV Smart [1/6]", "TV Smart [2/6]"). Navegá los meses siguientes en la cuadrícula para ver cómo impactan en tus saldos futuros.'
            },
            {
                numero: 4,
                titulo: 'Edición integral de un plan mediante el menú ⋮',
                descripcion: 'Si la tarjeta refinanció el plan o necesitás ajustar el concepto o total, tocá el menú contextual (tres puntos) de cualquier cuota y elegí "Editar Plan Completo". Modificá el total de cuotas o montos futuros con total tranquilidad: las cuotas de meses pasados y las ya pagadas permanecerán intactas.'
            }
        ],
        tipDestacado: 'El sistema bloquea modificaciones destructivas sobre cuotas ya pagadas de meses anteriores, preservando la exactitud de tus cierres contables pasados.'
    },
    {
        id: 'cierre-rollover',
        categoria: 'inicio',
        categoriaNombre: 'Ciclo Mensual y Básico',
        titulo: 'Cierre de Mes y Rollover (Pasar Impagos)',
        subtitulo: 'Transferencia automática de deudas impagas al mes siguiente y replicación de ingresos.',
        icono: 'fa-solid fa-forward-step',
        colorBadge: 'bg-amber-100 text-amber-800 border-amber-200',
        tabDestino: 'gastos',
        botonTexto: 'Ver Rollover en Gastos',
        keywords: ['rollover', 'impagos', 'cierre', 'pasar deudas', 'deshacer', 'replicar ingresos'],
        resumen: 'Aprende a cerrar el mes transfiriendo los gastos que quedaron pendientes al mes siguiente sin duplicaciones y cómo replicar tu estructura salarial hacia adelante.',
        pasos: [
            {
                numero: 1,
                titulo: 'Identificar gastos impagos al final del ciclo',
                descripcion: 'Al terminar el mes, revisá tu lista de gastos. Si alguna factura o compra no llegó a cancelarse y quedó sin tildar (pendiente), el sistema la identifica automáticamente.'
            },
            {
                numero: 2,
                titulo: 'Ejecutar "Pasar Impagos al Próximo Mes"',
                descripcion: 'Hacé clic en el botón "Pasar Impagos" en la cabecera de la sección de Gastos. Todos los compromisos pendientes se migrarán al primer día del mes siguiente con su etiqueta de mes origen.'
            },
            {
                numero: 3,
                titulo: 'Deshacer transferencias si hubo equivocación',
                descripcion: 'Cada gasto migrado cuenta con una opción de deshacer en su menú contextual, permitiéndote revertir la transferencia al mes de origen sin perder el registro original.'
            },
            {
                numero: 4,
                titulo: 'Replicar Ingresos a meses futuros',
                descripcion: 'En la pestaña "Ingresos", usá el botón "Replicar Ingresos" para proyectar tus sueldos a 3, 6 o 12 meses hacia adelante. El asistente te avisará si ya existen datos para evitar sobreescrituras no deseadas.'
            }
        ],
        tipDestacado: 'El botón de Rollover previene duplicados: si un gasto ya fue transferido previamente a un mes futuro, no se volverá a crear por error.'
    },
    {
        id: 'pasivos-deudas',
        categoria: 'tarjetas',
        categoriaNombre: 'Cuotas y Pasivos',
        titulo: 'Control de Pasivos y Precancelación',
        subtitulo: 'Consolidación de deudas por palabra clave y cálculo de capacidad de rescate.',
        icono: 'fa-solid fa-hand-holding-dollar',
        colorBadge: 'bg-rose-100 text-rose-800 border-rose-200',
        tabDestino: 'pasivos',
        botonTexto: 'Ir a Pasivos',
        keywords: ['pasivos', 'deudas', 'prestamos', 'precancelacion', 'keyword', 'palabra clave', 'rescate'],
        resumen: 'Agrupá todas las cuotas de un préstamo o tarjeta mediante una palabra clave para conocer tu pasivo total acumulado y evaluar si tu saldo actual alcanza para cancelarlo hoy.',
        pasos: [
            {
                numero: 1,
                titulo: 'Definir una regla de pasivo con palabra clave (keyword)',
                descripcion: 'En la pestaña "Pasivos", hacé clic en "Nuevo Pasivo Consolidado". Dale un nombre legible (ej: "Préstamo Personal Banco") y una palabra clave identificatoria (ej: "Préstamo").'
            },
            {
                numero: 2,
                titulo: 'Detección automática en todos los meses futuros',
                descripcion: 'El motor escanea todos tus gastos futuros buscando coincidencias con la palabra clave y totaliza la Deuda Total y las cuotas pendientes sin importar el plazo.'
            },
            {
                numero: 3,
                titulo: 'Semáforo inteligente de Precancelación',
                descripcion: 'El sistema compara tu Deuda Total frente al Saldo Real del mes activo: si tu saldo lo cubre, verás una etiqueta verde "Saldo suficiente para precancelar"; de lo contrario, una advertencia informativa en tono ámbar.'
            },
            {
                numero: 4,
                titulo: 'Mantenimiento y bajas de reglas',
                descripcion: 'Cuando termines de pagar todas las cuotas o saldes la deuda, podés eliminar la regla para mantener tu panel de pasivos limpio y enfocado.'
            }
        ],
        tipDestacado: 'Usá palabras clave precisas que no coincidan accidentalmente con otros gastos cotidianos. Por ejemplo, en lugar de "Banco", usá "Crédito Auto" o "Préstamo UVA".'
    },
    {
        id: 'deseos-metas',
        categoria: 'avanzado',
        categoriaNombre: 'Proyecciones y Nube',
        titulo: 'Metas Financieras y Simulación de Ahorro',
        subtitulo: 'Proyección temporal de compras anheladas, recorte de gastos y conversión a dólares.',
        icono: 'fa-solid fa-bullseye',
        colorBadge: 'bg-cyan-100 text-cyan-800 border-cyan-200',
        tabDestino: 'deseos',
        botonTexto: 'Ir a Deseos y Metas',
        keywords: ['deseos', 'metas', 'ahorro', 'proyeccion', 'recorte', 'simulacion', 'dolares'],
        resumen: 'Planificá adquisiciones importantes (viajes, tecnología, remodelaciones): proyectá en qué mes alcanzarás cada meta según tu capacidad de ahorro y simulá recortes de gastos.',
        pasos: [
            {
                numero: 1,
                titulo: 'Cargar tus metas en la pestaña "Deseos"',
                descripcion: 'Ingresá el nombre de tu meta (ej: "Notebook Nueva", "Vacaciones") y su costo estimado en Pesos ($ ARS) o Dólares (US$ USD).'
            },
            {
                numero: 2,
                titulo: 'Conversión automática con cotización del dólar',
                descripcion: 'Si definís la meta en US$ USD, la app utiliza el valor del Dólar Oficial cargado en la barra superior para calcular su costo equivalente en pesos de forma transparente.'
            },
            {
                numero: 3,
                titulo: 'Simular recorte de gastos (10%, 20%, 30%)',
                descripcion: 'En el panel superior podés simular qué pasaría si reducís un porcentaje de tus gastos variables: verás el dinero extra liberado por mes y la nueva capacidad de ahorro optimizada.'
            },
            {
                numero: 4,
                titulo: 'Leer la fecha estimada en el gráfico de cruce',
                descripcion: 'El gráfico de proyección dibuja la curva de acumulación mensual de fondos frente a la línea de costo de tus metas, informándote exactamente en qué mes calendario llegarás al objetivo.'
            }
        ],
        tipDestacado: 'Podés ordenar tus metas según prioridad de adquisición: el simulador asignará los fondos acumulados secuencialmente a cada una.'
    },
    {
        id: 'respaldo-nube',
        categoria: 'avanzado',
        categoriaNombre: 'Proyecciones y Nube',
        titulo: 'Respaldo, Sincronización y Modo Offline',
        subtitulo: 'Persistencia en Firestore, descarga de respaldo JSON y uso offline PWA.',
        icono: 'fa-solid fa-cloud-arrow-up',
        colorBadge: 'bg-blue-100 text-blue-800 border-blue-200',
        tabDestino: 'resumen',
        botonTexto: 'Ir a Centro de Control',
        keywords: ['nube', 'firebase', 'firestore', 'backup', 'json', 'offline', 'pwa', 'seguridad'],
        resumen: 'Tus finanzas siempre respaldadas: sincronización en tiempo real con Google Firebase, exportación local de archivos JSON, funcionamiento sin internet y cierre por inactividad.',
        pasos: [
            {
                numero: 1,
                titulo: 'Sincronización en la Nube con tu cuenta Google',
                descripcion: 'Al iniciar sesión con Google tus datos se guardan de forma instantánea en Firebase Firestore, manteniéndose actualizados en todos tus dispositivos y navegadores.'
            },
            {
                numero: 2,
                titulo: 'Descarga manual de Respaldo JSON en tu equipo',
                descripcion: 'En la pestaña "Resumen" (Centro de Operaciones), tocá "Descargar JSON" para guardar una copia de seguridad física en tu computadora o teléfono. Se recomienda hacerlo periódicamente.'
            },
            {
                numero: 3,
                titulo: 'Importar respaldo ante cambio de dispositivo',
                descripcion: 'Si abrís la app en un navegador nuevo o querés restaurar datos previos, hacé clic en "Importar JSON". La app validará la estructura, migrará esquemas antiguos automáticamente y subirá todo a la nube.'
            },
            {
                numero: 4,
                titulo: 'Modo Offline PWA y Seguridad por Inactividad',
                descripcion: 'La app puede instalarse en el celular o PC como aplicación progresiva (PWA). Si perdés la conexión a internet, podés seguir operando gracias al almacenamiento local. Para proteger tus datos, la app guarda y cierra sesión tras 15 minutos sin uso.'
            }
        ],
        tipDestacado: 'El botón "Guardar" del Centro de Operaciones fuerza la escritura inmediata a la nube y genera automáticamente una copia de respaldo JSON con fecha y hora.'
    }
];

/**
 * Normaliza un texto para búsqueda (minúsculas, sin acentos ni diacríticos).
 *
 * @param {string} texto
 * @returns {string}
 */
export function normalizarTextoBusqueda(texto) {
    if (!texto) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Busca y filtra instructivos según texto de consulta y categoría seleccionada.
 *
 * @param {Array<Object>} [guias=INSTRUCTIVOS_DATA]
 * @param {Object} [filtros]
 * @param {string} [filtros.texto='']
 * @param {string} [filtros.categoria='todas']
 * @returns {Array<Object>}
 */
export function buscarInstructivos(guias = INSTRUCTIVOS_DATA, { texto = '', categoria = 'todas' } = {}) {
    if (!Array.isArray(guias)) return [];

    const categoriaLimpia = String(categoria || 'todas').toLowerCase().trim();
    const queryLimpia = normalizarTextoBusqueda(texto);

    return guias.filter(guia => {
        if (!guia) return false;

        // 1. Filtro por categoría
        if (categoriaLimpia !== 'todas' && guia.categoria !== categoriaLimpia) {
            return false;
        }

        // 2. Si no hay texto de búsqueda, pasa
        if (!queryLimpia) return true;

        // 3. Búsqueda en título, subtítulo, resumen y categoría
        const tituloNorm = normalizarTextoBusqueda(guia.titulo);
        const subtituloNorm = normalizarTextoBusqueda(guia.subtitulo);
        const resumenNorm = normalizarTextoBusqueda(guia.resumen);
        const catNorm = normalizarTextoBusqueda(guia.categoriaNombre);
        const tipNorm = normalizarTextoBusqueda(guia.tipDestacado);

        if (
            tituloNorm.includes(queryLimpia) ||
            subtituloNorm.includes(queryLimpia) ||
            resumenNorm.includes(queryLimpia) ||
            catNorm.includes(queryLimpia) ||
            tipNorm.includes(queryLimpia)
        ) {
            return true;
        }

        // 4. Búsqueda en keywords
        if (Array.isArray(guia.keywords)) {
            const matchKeyword = guia.keywords.some(kw =>
                normalizarTextoBusqueda(kw).includes(queryLimpia)
            );
            if (matchKeyword) return true;
        }

        // 5. Búsqueda dentro de los pasos (título y descripción)
        if (Array.isArray(guia.pasos)) {
            const matchPaso = guia.pasos.some(p => {
                const pTit = normalizarTextoBusqueda(p.titulo);
                const pDesc = normalizarTextoBusqueda(p.descripcion);
                return pTit.includes(queryLimpia) || pDesc.includes(queryLimpia);
            });
            if (matchPaso) return true;
        }

        return false;
    });
}

/**
 * Obtiene la lista de categorías disponibles con conteo de guías.
 *
 * @param {Array<Object>} [guias=INSTRUCTIVOS_DATA]
 * @returns {Array<Object>}
 */
export function obtenerCategorias(guias = INSTRUCTIVOS_DATA) {
    const conteos = { todas: Array.isArray(guias) ? guias.length : 0 };

    if (Array.isArray(guias)) {
        for (const g of guias) {
            if (g && g.categoria) {
                conteos[g.categoria] = (conteos[g.categoria] || 0) + 1;
            }
        }
    }

    return CATEGORIAS_INSTRUCTIVOS.map(cat => ({
        ...cat,
        cantidad: conteos[cat.id] || 0
    }));
}

/**
 * Obtiene una guía por su ID único.
 *
 * @param {Array<Object>} [guias=INSTRUCTIVOS_DATA]
 * @param {string} id
 * @returns {Object|null}
 */
export function obtenerGuiaPorId(guias = INSTRUCTIVOS_DATA, id) {
    if (!Array.isArray(guias) || !id) return null;
    return guias.find(g => g && String(g.id) === String(id)) || null;
}
