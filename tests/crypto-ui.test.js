// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    abrirModalConfigurarCifrado,
    cerrarModalConfigurarCifrado,
    toggleMostrarPin,
    guardarConfiguracionCifrado,
    abrirModalDesbloquearCifrado,
    cerrarModalDesbloquearCifrado,
    desbloquearConPin,
    desbloquearConBiometriaUI,
    cancelarDesbloqueoOCerrar,
    tecladoPinPresionar,
    tecladoPinBorrar,
    tecladoPinLimpiar
} from '../js/crypto/ui.js';
import {
    obtenerClaveActiva,
    estaSesionDesbloqueada,
    bloquearSesionCripto,
    reiniciarIntentosFallidos,
    guardarCredencialBiometrica,
    guardarPinBiometricoProtegido
} from '../js/crypto/biometria.js';
import { generarSalt, derivarClave } from '../js/crypto/nucleo.js';

describe('Interfaz y Modales Cero Conocimiento (Fase 2 - UI)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        reiniciarIntentosFallidos();
        bloquearSesionCripto();
        if (typeof localStorage !== 'undefined') {
            localStorage.clear();
        }

        // Montar DOM mínimo idéntico a index.html
        document.body.innerHTML = `
            <div id="modal-configurar-cifrado" class="hidden">
                <form id="form-configurar-cifrado">
                    <input type="password" id="input-nuevo-pin" />
                    <button id="btn-toggle-nuevo-pin">
                        <i id="icon-toggle-nuevo-pin" class="fa-solid fa-eye"></i>
                    </button>
                    <input type="password" id="input-confirmar-pin" />
                    <button id="btn-toggle-confirmar-pin">
                        <i id="icon-toggle-confirmar-pin" class="fa-solid fa-eye"></i>
                    </button>
                    <div id="contenedor-opcion-biometria" class="hidden">
                        <input type="checkbox" id="check-activar-biometria" />
                    </div>
                    <div id="feedback-config-cifrado" class="hidden"></div>
                    <button type="submit" id="btn-activar-cifrado">Activar</button>
                </form>
            </div>

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
        vi.useRealTimers();
    });

    describe('Modal de Configuración (#modal-configurar-cifrado)', () => {
        it('debe abrir y cerrar el modal alternando la clase hidden', async () => {
            const modal = document.getElementById('modal-configurar-cifrado');
            expect(modal.classList.contains('hidden')).toBe(true);

            await abrirModalConfigurarCifrado('usr_1');
            expect(modal.classList.contains('hidden')).toBe(false);

            cerrarModalConfigurarCifrado();
            expect(modal.classList.contains('hidden')).toBe(true);
        });

        it('debe conmutar la visibilidad del PIN (password <-> text)', () => {
            const input = document.getElementById('input-nuevo-pin');
            const icon = document.getElementById('icon-toggle-nuevo-pin');

            expect(input.type).toBe('password');
            expect(icon.classList.contains('fa-eye')).toBe(true);

            toggleMostrarPin('input-nuevo-pin', 'icon-toggle-nuevo-pin');
            expect(input.type).toBe('text');
            expect(icon.classList.contains('fa-eye-slash')).toBe(true);

            toggleMostrarPin('input-nuevo-pin', 'icon-toggle-nuevo-pin');
            expect(input.type).toBe('password');
            expect(icon.classList.contains('fa-eye')).toBe(true);
        });

        it('debe mostrar error si el PIN no tiene entre 4 y 6 dígitos', async () => {
            const inputNuevo = document.getElementById('input-nuevo-pin');
            const inputConfirmar = document.getElementById('input-confirmar-pin');
            const feedback = document.getElementById('feedback-config-cifrado');

            inputNuevo.value = '12'; // demasiado corto
            inputConfirmar.value = '12';

            const exito = await guardarConfiguracionCifrado(null, 'usr_1');
            expect(exito).toBe(false);
            expect(feedback.classList.contains('hidden')).toBe(false);
            expect(feedback.textContent).toContain('4 y 6 dígitos');
        });

        it('debe mostrar error si la confirmación no coincide', async () => {
            const inputNuevo = document.getElementById('input-nuevo-pin');
            const inputConfirmar = document.getElementById('input-confirmar-pin');
            const feedback = document.getElementById('feedback-config-cifrado');

            inputNuevo.value = '1234';
            inputConfirmar.value = '1235'; // no coincide

            const exito = await guardarConfiguracionCifrado(null, 'usr_1');
            expect(exito).toBe(false);
            expect(feedback.classList.contains('hidden')).toBe(false);
            expect(feedback.textContent).toContain('no coinciden');
        });

        it('debe derivar clave y activar sesión volátil ante PIN válido', async () => {
            const inputNuevo = document.getElementById('input-nuevo-pin');
            const inputConfirmar = document.getElementById('input-confirmar-pin');
            const callback = vi.fn();

            inputNuevo.value = '4321';
            inputConfirmar.value = '4321';

            expect(estaSesionDesbloqueada()).toBe(false);

            const promesa = guardarConfiguracionCifrado(null, 'usr_1', 'saltTestBase64==', callback);
            const exito = await promesa;
            await vi.runAllTimersAsync();

            expect(exito).toBe(true);
            expect(estaSesionDesbloqueada()).toBe(true);
            expect(obtenerClaveActiva()).not.toBeNull();
            expect(callback).toHaveBeenCalledTimes(1);
        });
    });

    describe('Teclado Numérico Táctil', () => {
        it('debe agregar dígitos hasta un máximo de 6', () => {
            const input = document.getElementById('input-desbloquear-pin');
            expect(input.value).toBe('');

            tecladoPinPresionar('1');
            tecladoPinPresionar('2');
            tecladoPinPresionar('3');
            expect(input.value).toBe('123');

            tecladoPinPresionar('4');
            tecladoPinPresionar('5');
            tecladoPinPresionar('6');
            expect(input.value).toBe('123456');

            // Intento de agregar un 7mo dígito
            tecladoPinPresionar('7');
            expect(input.value).toBe('123456');
        });

        it('debe borrar el último dígito con tecladoPinBorrar', () => {
            const input = document.getElementById('input-desbloquear-pin');
            input.value = '1234';

            tecladoPinBorrar();
            expect(input.value).toBe('123');

            tecladoPinBorrar();
            expect(input.value).toBe('12');
        });

        it('debe limpiar todo el valor con tecladoPinLimpiar', () => {
            const input = document.getElementById('input-desbloquear-pin');
            input.value = '9876';

            tecladoPinLimpiar();
            expect(input.value).toBe('');
        });
    });

    describe('Modal de Desbloqueo (#modal-desbloquear-cifrado) y Fuerza Bruta', () => {
        it('debe mostrar el botón de biometría si el usuario la tiene registrada', () => {
            guardarCredencialBiometrica('usr_bio', { credentialId: 'c1' });

            abrirModalDesbloquearCifrado({ usuarioId: 'usr_bio', salt: 'testSalt' });
            const contenedorBio = document.getElementById('contenedor-btn-biometria');
            expect(contenedorBio.classList.contains('hidden')).toBe(false);

            cerrarModalDesbloquearCifrado();
        });

        it('debe ocultar el botón de biometría si el usuario no la tiene registrada', () => {
            abrirModalDesbloquearCifrado({ usuarioId: 'usr_nobio', salt: 'testSalt' });
            const contenedorBio = document.getElementById('contenedor-btn-biometria');
            expect(contenedorBio.classList.contains('hidden')).toBe(true);

            cerrarModalDesbloquearCifrado();
        });

        it('debe permitir desbloquear con PIN válido', async () => {
            const salt = generarSalt();
            const callback = vi.fn();
            const input = document.getElementById('input-desbloquear-pin');

            abrirModalDesbloquearCifrado({
                usuarioId: 'usr_1',
                salt,
                alDesbloquear: callback
            });

            input.value = '1234';
            const promesa = desbloquearConPin();
            const exito = await promesa;
            await vi.runAllTimersAsync();

            expect(exito).toBe(true);
            expect(estaSesionDesbloqueada()).toBe(true);
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('debe contabilizar intentos erróneos y activar bloqueo tras 3 intentos', async () => {
            const salt = generarSalt();
            const input = document.getElementById('input-desbloquear-pin');
            const feedback = document.getElementById('feedback-desbloquear-cifrado');

            // Simulamos validador que rechaza claves incorrectas
            const verificarClave = vi.fn().mockResolvedValue(false);

            abrirModalDesbloquearCifrado({
                usuarioId: 'usr_1',
                salt,
                verificarClave
            });

            // Intento 1
            input.value = '1111';
            await desbloquearConPin();
            expect(feedback.textContent).toContain('Intento 1 de 3');

            // Intento 2
            input.value = '2222';
            await desbloquearConPin();
            expect(feedback.textContent).toContain('Intento 2 de 3');

            // Intento 3
            input.value = '3333';
            await desbloquearConPin();
            expect(feedback.textContent).toContain('Intento 3 de 3');

            // Intento 4 -> Activa bloqueo por fuerza bruta con cuenta regresiva
            input.value = '4444';
            await desbloquearConPin();
            expect(feedback.textContent).toContain('Demasiados intentos fallidos');
            expect(input.disabled).toBe(true);
        });

        it('debe desbloquear con biometría recuperando el PIN protegido', async () => {
            const salt = generarSalt();
            const callback = vi.fn();

            // Preparar credencial y PIN protegido
            guardarCredencialBiometrica('usr_bio_ok', { credentialId: 'AQIDBA==' });
            guardarPinBiometricoProtegido('usr_bio_ok', '9876');

            // Simular navigator.credentials.get
            globalThis.navigator = {
                credentials: {
                    get: vi.fn().mockResolvedValue({ id: 'ok' })
                }
            };

            abrirModalDesbloquearCifrado({
                usuarioId: 'usr_bio_ok',
                salt,
                alDesbloquear: callback
            });

            const promesa = desbloquearConBiometriaUI();
            const exito = await promesa;
            await vi.runAllTimersAsync();

            expect(exito).toBe(true);
            expect(estaSesionDesbloqueada()).toBe(true);
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('debe ejecutar callback de cancelación al pulsar cancelar', () => {
            const alCancelar = vi.fn();
            abrirModalDesbloquearCifrado({ usuarioId: 'usr_x', alCancelar });

            cancelarDesbloqueoOCerrar();
            expect(alCancelar).toHaveBeenCalledTimes(1);
        });
    });
});
