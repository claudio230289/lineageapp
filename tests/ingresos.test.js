import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as acorn from 'acorn';
import { JSDOM } from 'jsdom';
import { calcularNetoDesde, aNumero, normalizarTexto, valorCalculadoIngreso } from '../js/calculos/nucleo.js';
import { formatARS } from '../js/utils/formato.js';
import { coincideId } from '../js/utils/id.js';

function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* =========================================================
   TESTS DE FASE 3: EDICIÓN DE INGRESOS
   ========================================================= */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUENTE_APP = path.join(RAIZ, 'js', 'app.js');
const FUENTE_HTML = path.join(RAIZ, 'index.html');

const CODIGO_APP = readFileSync(FUENTE_APP, 'utf8');
const CODIGO_HTML = readFileSync(FUENTE_HTML, 'utf8');

function extraerFuncion(nombre, tipo = 'exportada') {
    const ast = acorn.parse(CODIGO_APP, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
    });

    let encontrada = null;
    const visitar = (nodo) => {
        if (!nodo || typeof nodo !== 'object') return;

        const esDeclarada = nodo.type === 'FunctionDeclaration' && nodo.id?.name === nombre;
        const esExportada = nodo.type === 'ExportNamedDeclaration'
            && nodo.declaration?.type === 'FunctionDeclaration'
            && nodo.declaration.id?.name === nombre;

        if (esDeclarada && tipo === 'declarada' && !encontrada) encontrada = nodo;
        if (esExportada && tipo === 'exportada' && !encontrada) encontrada = nodo.declaration;

        for (const clave of Object.keys(nodo)) {
            const valor = nodo[clave];
            if (Array.isArray(valor)) valor.forEach(visitar);
            else if (valor && typeof valor === 'object' && valor.type) visitar(valor);
        }
    };

    visitar(ast);
    if (!encontrada) throw new Error(`No se encontró "${nombre}" (${tipo}) en js/app.js`);
    return CODIGO_APP.slice(encontrada.start, encontrada.end);
}

describe('Fase 3: Edición de Ingresos en index.html', () => {
    let dom;
    let document;

    beforeEach(() => {
        dom = new JSDOM(CODIGO_HTML, { url: 'http://localhost' });
        document = dom.window.document;
    });

    it('debe existir el modal de edición de ingresos en index.html', () => {
        const modal = document.getElementById('modal-editar-ingreso');
        expect(modal).not.toBeNull();
        expect(modal.classList.contains('hidden')).toBe(true);
        expect(modal.getAttribute('role')).toBe('dialog');
    });

    it('debe contener el formulario con los campos concepto, monto, categoría y un id oculto', () => {
        const form = document.getElementById('form-editar-ingreso');
        expect(form).not.toBeNull();

        const inputId = document.getElementById('edit-ing-id');
        expect(inputId).not.toBeNull();
        expect(inputId.getAttribute('type')).toBe('hidden');

        const inputConcepto = document.getElementById('edit-ing-concepto');
        expect(inputConcepto).not.toBeNull();
        expect(inputConcepto.getAttribute('type')).toBe('text');

        const inputMonto = document.getElementById('edit-ing-monto');
        expect(inputMonto).not.toBeNull();
        expect(inputMonto.getAttribute('type')).toBe('number');

        const selectCategoria = document.getElementById('edit-ing-categoria');
        expect(selectCategoria).not.toBeNull();
        const opciones = Array.from(selectCategoria.options).map(opt => opt.value);
        expect(opciones).toContain('Sueldo');
        expect(opciones).toContain('Honorarios');
        expect(opciones).toContain('Inversiones');
        expect(opciones).toContain('Ventas');
        expect(opciones).toContain('Otros');
    });

    it('debe tener botones de cancelar y guardar cambios con sus handlers respectivos', () => {
        const form = document.getElementById('form-editar-ingreso');
        expect(form.getAttribute('onsubmit')).toContain('window.guardarEdicionIngreso');

        const btnCancelar = document.querySelector('#modal-editar-ingreso button[onclick*="cerrarModalEditarIngreso"]');
        expect(btnCancelar).not.toBeNull();
    });
});

describe('Fase 3: Renderizado de la lista con botón de edición', () => {
    let dom;
    let document;
    let window;

    beforeEach(() => {
        dom = new JSDOM(CODIGO_HTML, { url: 'http://localhost' });
        document = dom.window.document;
        window = dom.window;
    });

    it('debe incluir el botón de editar ingreso con data-accion="editar-ingreso", data-id, y aria-label', () => {
        const fnFuente = extraerFuncion('renderizarListaIngresos', 'declarada');

        const dbMock = {
            ingresos: {
                '2026-10': [
                    { id: 'ing-1', concepto: 'Sueldo Octubre', valor: 850000, tipo: 'Basico', modo: 'importe' },
                    { id: 'ing-2', concepto: 'Freelance diseño', valor: 150000, tipo: 'Bolsillo', categoria: 'Honorarios', modo: 'importe' }
                ]
            }
        };

        const contexto = {
            document,
            window,
            escapeHTML,
            formatARS,
            valorCalculadoIngreso,
            normalizarTexto,
            aNumero,
            coincideId,
            ITEMS_POR_PAGINA: 20,
            paginaActualIngresos: 0,
            delegar: vi.fn(),
            eliminarIngreso: vi.fn(),
            editarIngreso: vi.fn()
        };

        const creador = new Function(
            'document', 'window', 'escapeHTML', 'formatARS', 'valorCalculadoIngreso',
            'normalizarTexto', 'aNumero', 'coincideId', 'ITEMS_POR_PAGINA', 'delegar',
            'eliminarIngreso', 'editarIngreso',
            `return (${fnFuente});`
        );

        const renderizar = creador(
            contexto.document, contexto.window, contexto.escapeHTML, contexto.formatARS,
            contexto.valorCalculadoIngreso, contexto.normalizarTexto, contexto.aNumero,
            contexto.coincideId, contexto.ITEMS_POR_PAGINA, contexto.delegar,
            contexto.eliminarIngreso, contexto.editarIngreso
        );

        renderizar(dbMock.ingresos['2026-10']);

        const contenedor = document.getElementById('lista-ingresos');
        expect(contenedor).not.toBeNull();
        expect(contenedor.children.length).toBe(2);

        // Validar primer ítem
        const fila1 = contenedor.children[0];
        const btnEdit1 = fila1.querySelector('button[data-accion="editar-ingreso"]');
        expect(btnEdit1).not.toBeNull();
        expect(btnEdit1.getAttribute('data-id')).toBe('ing-1');
        expect(btnEdit1.getAttribute('aria-label')).toBe('Editar ingreso');
        expect(btnEdit1.querySelector('.fa-pen-to-square')).not.toBeNull();

        // Validar segundo ítem con categoría personalizada
        const fila2 = contenedor.children[1];
        const btnEdit2 = fila2.querySelector('button[data-accion="editar-ingreso"]');
        expect(btnEdit2).not.toBeNull();
        expect(btnEdit2.getAttribute('data-id')).toBe('ing-2');
        expect(fila2.textContent).toContain('Honorarios');

        // Validar que delegar fue llamado con el manejador de 'editar-ingreso'
        expect(contexto.delegar).toHaveBeenCalledWith(
            contenedor,
            'click',
            expect.objectContaining({
                'eliminar-ingreso': expect.any(Function),
                'editar-ingreso': expect.any(Function)
            })
        );
    });
});

describe('Fase 3: Flujo de edición y persistencia (editarIngreso, guardarEdicionIngreso, cerrarModal)', () => {
    let dom;
    let document;
    let window;
    let db;
    let notificaciones;
    let fnEditarIngreso;
    let fnCerrarModal;
    let fnGuardarEdicion;
    let guardarYRenderizarMock;

    beforeEach(() => {
        dom = new JSDOM(CODIGO_HTML, { url: 'http://localhost' });
        document = dom.window.document;
        window = dom.window;

        db = {
            ingresos: {
                '2026-10': [
                    { id: 'ing-1', concepto: 'Básico', valor: 600000, tipo: 'Basico', modo: 'importe' },
                    { id: 'ing-2', concepto: 'Clases particulares', valor: 80000, tipo: 'Bolsillo', categoria: 'Honorarios', modo: 'importe' }
                ]
            }
        };

        notificaciones = {
            mostrar: vi.fn(),
            exito: vi.fn()
        };

        guardarYRenderizarMock = vi.fn().mockResolvedValue({ ok: true });

        const codEditar = extraerFuncion('editarIngreso', 'exportada');
        const codCerrar = extraerFuncion('cerrarModalEditarIngreso', 'exportada');
        const codGuardar = extraerFuncion('guardarEdicionIngreso', 'exportada');

        const sandbox = {
            document,
            window,
            db,
            obtenerMesActual: () => '2026-10',
            coincideId,
            aNumero,
            mostrarNotificacion: notificaciones.mostrar,
            notificarExito: notificaciones.exito,
            guardarYRenderizar: guardarYRenderizarMock,
            setTimeout: (fn) => fn()
        };

        const creadorEditar = new Function(
            'document', 'window', 'db', 'obtenerMesActual', 'coincideId', 'mostrarNotificacion',
            `return (${codEditar});`
        );
        fnEditarIngreso = creadorEditar(
            sandbox.document, sandbox.window, sandbox.db, sandbox.obtenerMesActual,
            sandbox.coincideId, sandbox.mostrarNotificacion
        );

        const creadorCerrar = new Function('document', `return (${codCerrar});`);
        fnCerrarModal = creadorCerrar(sandbox.document);

        const creadorGuardar = new Function(
            'document', 'window', 'db', 'obtenerMesActual', 'coincideId', 'aNumero',
            'mostrarNotificacion', 'notificarExito', 'guardarYRenderizar', 'cerrarModalEditarIngreso',
            `return (${codGuardar});`
        );
        fnGuardarEdicion = creadorGuardar(
            sandbox.document, sandbox.window, sandbox.db, sandbox.obtenerMesActual,
            sandbox.coincideId, sandbox.aNumero, sandbox.mostrarNotificacion,
            sandbox.notificarExito, sandbox.guardarYRenderizar, fnCerrarModal
        );
    });

    it('editarIngreso debe precargar los datos en el modal y quitar la clase hidden', () => {
        const modal = document.getElementById('modal-editar-ingreso');
        expect(modal.classList.contains('hidden')).toBe(true);

        const ingreso = fnEditarIngreso('ing-2');
        expect(ingreso).toBeDefined();
        expect(modal.classList.contains('hidden')).toBe(false);

        expect(document.getElementById('edit-ing-id').value).toBe('ing-2');
        expect(document.getElementById('edit-ing-concepto').value).toBe('Clases particulares');
        expect(document.getElementById('edit-ing-monto').value).toBe('80000');
        expect(document.getElementById('edit-ing-categoria').value).toBe('Honorarios');
    });

    it('cerrarModalEditarIngreso debe ocultar el modal y resetear el formulario', () => {
        const modal = document.getElementById('modal-editar-ingreso');
        modal.classList.remove('hidden');

        document.getElementById('edit-ing-concepto').value = 'Test';
        fnCerrarModal();

        expect(modal.classList.contains('hidden')).toBe(true);
        expect(document.getElementById('edit-ing-concepto').value).toBe('');
    });

    it('guardarEdicionIngreso debe actualizar el ingreso en db.ingresos y llamar a guardarYRenderizar', async () => {
        // Abrir y cargar
        fnEditarIngreso('ing-1');

        // Modificar valores
        document.getElementById('edit-ing-concepto').value = 'Sueldo Actualizado';
        document.getElementById('edit-ing-monto').value = '950000';
        document.getElementById('edit-ing-categoria').value = 'Sueldo';

        const mockEvent = { preventDefault: vi.fn() };
        const ok = await fnGuardarEdicion(mockEvent);

        expect(ok).toBe(true);
        expect(mockEvent.preventDefault).toHaveBeenCalled();

        // Verificar persistencia en el objeto db
        const item = db.ingresos['2026-10'].find(i => i.id === 'ing-1');
        expect(item.concepto).toBe('Sueldo Actualizado');
        expect(item.valor).toBe(950000);
        expect(item.categoria).toBe('Sueldo');

        // Verificar invocación de guardado y notificación
        expect(guardarYRenderizarMock).toHaveBeenCalledWith('edicion-ingreso');
        expect(notificaciones.exito).toHaveBeenCalledWith('Ingreso actualizado');

        // Modal debe quedar oculto
        const modal = document.getElementById('modal-editar-ingreso');
        expect(modal.classList.contains('hidden')).toBe(true);
    });

    it('debe rechazar concepto vacío con aviso warning y sin alterar datos', async () => {
        fnEditarIngreso('ing-1');
        document.getElementById('edit-ing-concepto').value = '   ';
        document.getElementById('edit-ing-monto').value = '900000';

        const ok = await fnGuardarEdicion();
        expect(ok).toBe(false);
        expect(notificaciones.mostrar).toHaveBeenCalledWith('El concepto no puede quedar vacío.', 'warning');
        expect(db.ingresos['2026-10'][0].valor).toBe(600000); // sin cambios
    });

    it('debe rechazar montos menores o iguales a cero', async () => {
        fnEditarIngreso('ing-1');
        document.getElementById('edit-ing-monto').value = '0';

        let ok = await fnGuardarEdicion();
        expect(ok).toBe(false);
        expect(notificaciones.mostrar).toHaveBeenCalledWith('El monto debe ser mayor a 0.', 'warning');

        document.getElementById('edit-ing-monto').value = '-500';
        ok = await fnGuardarEdicion();
        expect(ok).toBe(false);
    });

    it('debe reflejarse en el recálculo del balance (calcularNetoDesde)', async () => {
        // Balance inicial
        const netoInicial = calcularNetoDesde(db.ingresos['2026-10']).neto;
        expect(netoInicial).toBe(680000); // 600000 + 80000

        // Editar ing-1 de 600.000 a 800.000
        fnEditarIngreso('ing-1');
        document.getElementById('edit-ing-monto').value = '800000';
        await fnGuardarEdicion();

        // Nuevo balance recalculado
        const netoFinal = calcularNetoDesde(db.ingresos['2026-10']).neto;
        expect(netoFinal).toBe(880000); // 800000 + 80000
    });
});
