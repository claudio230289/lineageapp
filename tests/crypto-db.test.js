// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    prepararDocParaNube,
    procesarDocDeNube,
    solicitarDesbloqueoCifrado,
    migrarBaseACeroConocimiento
} from '../js/crypto/persistencia.js';
import {
    cifrarObjeto,
    descifrarObjeto,
    esDocumentoCifrado,
    derivarClave,
    generarSalt
} from '../js/crypto/nucleo.js';
import {
    establecerClaveActiva,
    obtenerClaveActiva,
    estaSesionDesbloqueada,
    bloquearSesionCripto,
    reiniciarIntentosFallidos
} from '../js/crypto/biometria.js';
import {
    desbloquearConPin
} from '../js/crypto/ui.js';
import { crearBaseVacia } from '../js/nucleo/base.js';

describe('Adaptador de Persistencia Criptográfica y Firestore (Fase 3)', () => {
    const USUARIO_ID = 'test_usuario_123';
    let baseEjemplo;

    beforeEach(() => {
        bloquearSesionCripto();
        reiniciarIntentosFallidos();
        if (typeof localStorage !== 'undefined') {
            localStorage.clear();
        }

        // Crear base de prueba con datos reales de finanzas
        baseEjemplo = crearBaseVacia('2026-10');
        baseEjemplo.dolar = 1350;
        baseEjemplo.ingresos = {
            '2026-10': {
                'ing_1': { id: 'ing_1', nombre: 'Sueldo Principal', valor: 2500000, tipo: 'fijo' }
            }
        };
        baseEjemplo.gastos = {
            '2026-10': [
                { id: 'gst_1', nombre: 'Alquiler', valor: 600000, categoria: 'Vivienda', pagado: true },
                { id: 'gst_2', nombre: 'Supermercado', valor: 280000, categoria: 'Comida', pagado: false }
            ]
        };
        baseEjemplo.deseos = [
            { id: 'des_1', nombre: 'Monitor 4K', valorUsd: 450, ahorradoUsd: 150 }
        ];
        baseEjemplo.pasivos = [
            { id: 'pas_1', nombre: 'Tarjeta de Crédito', montoTotal: 500000 }
        ];

        // Montar DOM mínimo para modales de desbloqueo
        document.body.innerHTML = `
            <div id="modal-desbloquear-cifrado" class="hidden">
                <div id="contenedor-btn-biometria" class="hidden">
                    <button id="btn-desbloquear-biometria"></button>
                </div>
                <form id="form-desbloquear-cifrado">
                    <input type="password" id="input-desbloquear-pin" />
                    <button id="btn-toggle-desbloquear-pin">
                        <i id="icon-toggle-desbloquear-pin" class="fa-solid fa-eye"></i>
                    </button>
                    <div id="feedback-desbloquear-cifrado" class="hidden"></div>
                    <button type="submit" id="btn-confirmar-desbloqueo">Desbloquear</button>
                    <button type="button" id="btn-cancelar-desbloqueo">Cancelar</button>
                </form>
            </div>
        `;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        bloquearSesionCripto();
    });

    describe('1. Detección y Enrutamiento en Preparación de Documento para Firestore', () => {
        it('debe guardar en texto plano sanitizado si no hay sesión criptográfica activa (retrocompatibilidad)', async () => {
            expect(estaSesionDesbloqueada()).toBe(false);

            const docSalida = await prepararDocParaNube(baseEjemplo, USUARIO_ID);

            expect(esDocumentoCifrado(docSalida)).toBe(false);
            expect(docSalida.esCifrado).toBeUndefined();
            expect(docSalida.ingresos).toEqual(baseEjemplo.ingresos);
            expect(docSalida.gastos).toEqual(baseEjemplo.gastos);
            expect(docSalida.dolar).toBe(1350);
        });

        it('debe empaquetar y generar sobre cifrado si la sesión criptográfica está desbloqueada', async () => {
            const pin = '482910';
            const salt = generarSalt(16);
            const clave = await derivarClave(pin, salt);

            establecerClaveActiva(clave, pin, salt);
            expect(estaSesionDesbloqueada()).toBe(true);

            const docSalida = await prepararDocParaNube(baseEjemplo, USUARIO_ID);

            expect(esDocumentoCifrado(docSalida)).toBe(true);
            expect(docSalida.esCifrado).toBe(true);
            expect(docSalida.versionCifrado).toBe(1);
            expect(typeof docSalida.salt).toBe('string');
            expect(typeof docSalida.iv).toBe('string');
            expect(typeof docSalida.datos).toBe('string');
            expect(typeof docSalida.timestamp).toBe('number');

            // En Firestore los campos en texto plano NO deben estar expuestos
            expect(docSalida.ingresos).toBeUndefined();
            expect(docSalida.gastos).toBeUndefined();
            expect(docSalida.deseos).toBeUndefined();
            expect(docSalida.dolar).toBeUndefined();
        });

        it('los datos en el sobre cifrado deben ser descifrables con la clave activa y coincidir exactamente con el original', async () => {
            const pin = '123456';
            const salt = generarSalt(16);
            const clave = await derivarClave(pin, salt);
            establecerClaveActiva(clave, pin, salt);

            const sobre = await prepararDocParaNube(baseEjemplo, USUARIO_ID);
            const descifrado = await descifrarObjeto(sobre, obtenerClaveActiva());

            expect(descifrado.ingresos).toEqual(baseEjemplo.ingresos);
            expect(descifrado.gastos).toEqual(baseEjemplo.gastos);
            expect(descifrado.dolar).toBe(1350);
        });

        it('debe abortar y retornar null si el usuario tiene cifrado configurado pero la sesión está bloqueada (prevención de fugas)', async () => {
            expect(estaSesionDesbloqueada()).toBe(false);
            localStorage.setItem(`cero_conocimiento_salt_${USUARIO_ID}`, 'salt_preexistente_seguro');

            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const docSalida = await prepararDocParaNube(baseEjemplo, USUARIO_ID);

            expect(docSalida).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('[Seguridad] Escritura remota abortada: la sesión criptográfica está bloqueada para este usuario.')
            );
        });
    });

    describe('2. Carga y Procesamiento de Documentos desde la Nube (procesarDocDeNube)', () => {
        it('debe devolver directamente el objeto si el documento remoto está en texto plano (usuario legado)', async () => {
            const docPlano = { ...baseEjemplo };
            const resultado = await procesarDocDeNube(docPlano, USUARIO_ID);

            expect(resultado).toEqual(docPlano);
            expect(resultado.gastos['2026-10']).toHaveLength(2);
        });

        it('debe descifrar inmediatamente si el documento es cifrado y la sesión ya está desbloqueada en memoria', async () => {
            const pin = '999888';
            const salt = generarSalt(16);
            const clave = await derivarClave(pin, salt);
            establecerClaveActiva(clave, pin, salt);

            const sobre = await cifrarObjeto(baseEjemplo, clave, salt);
            expect(esDocumentoCifrado(sobre)).toBe(true);

            const resultado = await procesarDocDeNube(sobre, USUARIO_ID);

            expect(resultado.dolar).toBe(1350);
            expect(resultado.gastos['2026-10'][0].nombre).toBe('Alquiler');
            expect(resultado.ingresos['2026-10']['ing_1'].nombre).toBe('Sueldo Principal');
        });

        it('debe delegar en solicitarDesbloqueo si el documento es cifrado y la sesión está bloqueada (fresco login)', async () => {
            bloquearSesionCripto();
            expect(estaSesionDesbloqueada()).toBe(false);

            const pin = '555111';
            const salt = generarSalt(16);
            const clave = await derivarClave(pin, salt);
            const sobre = await cifrarObjeto(baseEjemplo, clave, salt);

            // Simular función de desbloqueo UI
            const mockSolicitador = vi.fn(async (docData, usuario) => {
                const c = await derivarClave(pin, docData.salt);
                establecerClaveActiva(c, pin, docData.salt);
                return await descifrarObjeto(docData, c);
            });

            const resultado = await procesarDocDeNube(sobre, USUARIO_ID, {
                solicitarDesbloqueo: mockSolicitador
            });

            expect(mockSolicitador).toHaveBeenCalledTimes(1);
            expect(resultado.gastos['2026-10'][0].nombre).toBe('Alquiler');
            expect(estaSesionDesbloqueada()).toBe(true);
        });
    });

    describe('3. Flujo Interactivo de Desbloqueo mediante Modal (solicitarDesbloqueoCifrado)', () => {
        it('debe abrir modal, verificar PIN ingresado y resolver con la base descifrada', async () => {
            const pinCorrecto = '741852';
            const salt = generarSalt(16);
            const clave = await derivarClave(pinCorrecto, salt);
            const sobre = await cifrarObjeto(baseEjemplo, clave, salt);

            bloquearSesionCripto();

            // Iniciar solicitud de desbloqueo
            const promesaDesbloqueo = solicitarDesbloqueoCifrado(sobre, USUARIO_ID);

            // Verificar que el modal se abrió en el DOM
            const modal = document.getElementById('modal-desbloquear-cifrado');
            expect(modal.classList.contains('hidden')).toBe(false);

            // Simular que el usuario ingresa su PIN en el input
            const inputPin = document.getElementById('input-desbloquear-pin');
            inputPin.value = pinCorrecto;

            // Enviar formulario de desbloqueo
            const form = document.getElementById('form-desbloquear-cifrado');
            const submitEvent = new Event('submit', { cancelable: true });
            await desbloquearConPin(submitEvent);

            const datosDescifrados = await promesaDesbloqueo;

            expect(datosDescifrados.dolar).toBe(1350);
            expect(datosDescifrados.gastos['2026-10']).toHaveLength(2);
            expect(estaSesionDesbloqueada()).toBe(true);
            expect(localStorage.getItem(`cero_conocimiento_salt_${USUARIO_ID}`)).toBe(salt);
        });

        it('debe rechazar con DESBLOQUEO_CANCELADO si el usuario cancela en el modal', async () => {
            const pin = '112233';
            const salt = generarSalt(16);
            const clave = await derivarClave(pin, salt);
            const sobre = await cifrarObjeto(baseEjemplo, clave, salt);

            bloquearSesionCripto();

            let opcionesCapturadas;
            const promesaDesbloqueo = solicitarDesbloqueoCifrado(sobre, USUARIO_ID, {
                abrirModal: (opts) => {
                    opcionesCapturadas = opts;
                }
            });

            expect(opcionesCapturadas).toBeDefined();
            // Disparar cancelación
            opcionesCapturadas.alCancelar();

            await expect(promesaDesbloqueo).rejects.toThrow('DESBLOQUEO_CANCELADO');
        });

        it('la verificación de clave en el modal debe fallar ante un PIN erróneo', async () => {
            const pinCorrecto = '123456';
            const pinErroneo = '999999';
            const salt = generarSalt(16);
            const clave = await derivarClave(pinCorrecto, salt);
            const sobre = await cifrarObjeto(baseEjemplo, clave, salt);

            let opcionesCapturadas;
            solicitarDesbloqueoCifrado(sobre, USUARIO_ID, {
                abrirModal: (opts) => {
                    opcionesCapturadas = opts;
                }
            });

            const claveErronea = await derivarClave(pinErroneo, salt);
            const esValida = await opcionesCapturadas.verificarClave(claveErronea);

            expect(esValida).toBe(false);

            const claveCorrecta = await derivarClave(pinCorrecto, salt);
            const esValidaCorrecta = await opcionesCapturadas.verificarClave(claveCorrecta);

            expect(esValidaCorrecta).toBe(true);
        });
    });

    describe('4. Flujo de Migración Transparente (Texto Plano -> Cero Conocimiento)', () => {
        it('debe cifrar íntegramente una base existente sin pérdida de información histórica', async () => {
            // Usuario con datos existentes en texto plano
            const basePrevia = {
                version: 14,
                mesActivo: '2026-09',
                dolar: 1300,
                ingresos: {
                    '2026-09': { 'i1': { nombre: 'Honorarios', valor: 900000 } }
                },
                gastos: {
                    '2026-09': [
                        { id: 'g1', nombre: 'Servicios', valor: 45000, pagado: true },
                        { id: 'g2', nombre: 'Internet', valor: 35000, pagado: true }
                    ]
                },
                deseos: [
                    { id: 'd1', nombre: 'Notebook', valorUsd: 1200 }
                ],
                pasivos: [
                    { id: 'p1', nombre: 'Préstamo personal', montoTotal: 1500000 }
                ]
            };

            const nuevoPin = '654321';
            const resultadoMigracion = await migrarBaseACeroConocimiento(basePrevia, nuevoPin, USUARIO_ID);

            expect(resultadoMigracion.sobre).toBeDefined();
            expect(resultadoMigracion.sobre.esCifrado).toBe(true);
            expect(resultadoMigracion.salt).toBeDefined();
            expect(resultadoMigracion.clave).toBeDefined();

            // La sesión debe quedar inmediatamente desbloqueada
            expect(estaSesionDesbloqueada()).toBe(true);
            expect(obtenerClaveActiva()).toBe(resultadoMigracion.clave);

            // Al descifrar el sobre resultante, todos los datos históricos se conservan intactos
            const restaurada = await descifrarObjeto(resultadoMigracion.sobre, resultadoMigracion.clave);

            expect(restaurada.version).toBe(14);
            expect(restaurada.mesActivo).toBe('2026-09');
            expect(restaurada.dolar).toBe(1300);
            expect(restaurada.ingresos).toEqual(basePrevia.ingresos);
            expect(restaurada.gastos).toEqual(basePrevia.gastos);
            expect(restaurada.deseos).toEqual(basePrevia.deseos);
            expect(restaurada.pasivos).toEqual(basePrevia.pasivos);
        });
    });

    describe('5. Simulación de Adaptador Firestore Completo', () => {
        it('debe simular ciclo completo: escritura cifrada -> persistencia -> recuperación y descifrado', async () => {
            // 1. Simulación de almacén Firestore en memoria
            const firestoreStorage = new Map();
            const mockEscribirEnNube = async (uid, datos) => {
                const docParaFirestore = await prepararDocParaNube(datos, uid);
                firestoreStorage.set(uid, JSON.parse(JSON.stringify(docParaFirestore)));
            };
            const mockCargarDeNube = async (uid) => {
                const rawDoc = firestoreStorage.get(uid);
                if (!rawDoc) return null;
                return await procesarDocDeNube(rawDoc, uid);
            };

            // 2. Usuario activa cifrado
            const pin = '882244';
            const salt = generarSalt(16);
            const clave = await derivarClave(pin, salt);
            establecerClaveActiva(clave, pin, salt);

            // 3. Escribir datos cifrados
            await mockEscribirEnNube(USUARIO_ID, baseEjemplo);

            // 4. Verificar que en el almacenamiento remoto solo se guardó el sobre cifrado
            const docRemotoGuardado = firestoreStorage.get(USUARIO_ID);
            expect(docRemotoGuardado.esCifrado).toBe(true);
            expect(docRemotoGuardado.ingresos).toBeUndefined();
            expect(docRemotoGuardado.gastos).toBeUndefined();

            // 5. Simular recarga de página: se pierde la clave en memoria (bloqueo)
            bloquearSesionCripto();
            expect(estaSesionDesbloqueada()).toBe(false);

            // 6. Cargar base de la nube con desbloqueo interactivo
            const mockSolicitador = vi.fn(async (docData, usuario) => {
                const claveRestaurada = await derivarClave(pin, docData.salt);
                establecerClaveActiva(claveRestaurada, pin, docData.salt);
                return await descifrarObjeto(docData, claveRestaurada);
            });

            const docProcesado = await procesarDocDeNube(docRemotoGuardado, USUARIO_ID, {
                solicitarDesbloqueo: mockSolicitador
            });

            expect(mockSolicitador).toHaveBeenCalled();
            expect(docProcesado.dolar).toBe(1350);
            expect(docProcesado.gastos['2026-10']).toHaveLength(2);
            expect(docProcesado.gastos['2026-10'][0].nombre).toBe('Alquiler');
            expect(estaSesionDesbloqueada()).toBe(true);
        });

        it('si un usuario con salt registrado tiene la sesión bloqueada, escribirEnNube no sobreescribe en texto plano', async () => {
            const firestoreStorage = new Map();
            const sobrePrevio = {
                esCifrado: true,
                versionCifrado: 1,
                salt: 'salt_registrado_123',
                iv: 'iv_aleatorio_456',
                datos: 'ciphertext_existente_seguro',
                timestamp: Date.now() - 5000
            };
            firestoreStorage.set(USUARIO_ID, sobrePrevio);

            // Usuario tiene salt registrado en localStorage (cero conocimiento configurado)
            localStorage.setItem(`cero_conocimiento_salt_${USUARIO_ID}`, 'salt_registrado_123');

            // Sesión bloqueada
            bloquearSesionCripto();
            expect(estaSesionDesbloqueada()).toBe(false);
            expect(obtenerClaveActiva()).toBeNull();

            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            // Función adaptadora escribirEnNube con guarda de seguridad
            const escribirEnNube = async (uid, datos) => {
                let tieneCifradoConfigurado = false;
                if (uid && typeof localStorage !== 'undefined') {
                    try {
                        tieneCifradoConfigurado = Boolean(
                            localStorage.getItem(`cero_conocimiento_salt_${uid}`) ||
                            localStorage.getItem(`cero_conocimiento_activo_${uid}`)
                        );
                    } catch (_) {}
                }

                const sesionDesbloqueada = estaSesionDesbloqueada() && obtenerClaveActiva();

                if (tieneCifradoConfigurado && !sesionDesbloqueada) {
                    console.warn('[Seguridad] Escritura remota abortada: la sesión criptográfica está bloqueada para este usuario.');
                    return;
                }

                const docParaGuardar = await prepararDocParaNube(datos, uid);
                if (!docParaGuardar) {
                    return;
                }
                firestoreStorage.set(uid, docParaGuardar);
            };

            // Intentar escribir base en memoria
            await escribirEnNube(USUARIO_ID, baseEjemplo);

            // Verificar que se abortó y la nube NO fue sobreescrita en texto plano
            const docEnFirestore = firestoreStorage.get(USUARIO_ID);
            expect(docEnFirestore).toEqual(sobrePrevio);
            expect(docEnFirestore.esCifrado).toBe(true);
            expect(docEnFirestore.ingresos).toBeUndefined();
            expect(docEnFirestore.gastos).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('[Seguridad] Escritura remota abortada: la sesión criptográfica está bloqueada para este usuario.')
            );
        });
    });
});
