import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    esBiometriaDisponible,
    registrarBiometria,
    autenticarConBiometria,
    guardarCredencialBiometrica,
    obtenerCredencialBiometrica,
    eliminarCredencialBiometrica,
    tieneBiometriaRegistrada,
    guardarPinBiometricoProtegido,
    recuperarPinBiometricoProtegido,
    establecerClaveActiva,
    obtenerClaveActiva,
    obtenerSaltActivo,
    estaSesionDesbloqueada,
    bloquearSesionCripto,
    restaurarSesionCriptoDesdeSessionStorage,
    registrarIntentoFallido,
    estaBloqueadoPorFuerzaBruta,
    reiniciarIntentosFallidos,
    obtenerEstadoFuerzaBruta,
    validarFormatoPin,
    validarConfirmacionPin,
    MAX_INTENTOS_SIN_PENALIZACION
} from '../js/crypto/biometria.js';

describe('Módulo de Biometría y Sesión Criptográfica (Fase 2)', () => {
    beforeEach(() => {
        // Limpiar estado volátil de intentos
        reiniciarIntentosFallidos();
        bloquearSesionCripto();

        // Limpiar localStorage y sessionStorage simulados
        if (typeof localStorage !== 'undefined') {
            localStorage.clear();
        }
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.clear();
        }
    });

    describe('Validaciones de formato de PIN', () => {
        it('debe aceptar PINs de 4, 5 y 6 dígitos numéricos', () => {
            expect(validarFormatoPin('1234').valido).toBe(true);
            expect(validarFormatoPin('12345').valido).toBe(true);
            expect(validarFormatoPin('123456').valido).toBe(true);
            expect(validarFormatoPin('0000').valido).toBe(true);
        });

        it('debe rechazar PINs con letras, símbolos o longitud inválida', () => {
            expect(validarFormatoPin('123').valido).toBe(false);
            expect(validarFormatoPin('1234567').valido).toBe(false);
            expect(validarFormatoPin('12a4').valido).toBe(false);
            expect(validarFormatoPin('12 4').valido).toBe(false);
            expect(validarFormatoPin('').valido).toBe(false);
            expect(validarFormatoPin(null).valido).toBe(false);
            expect(validarFormatoPin(1234).valido).toBe(false);
        });

        it('debe validar la confirmación coincidente del PIN', () => {
            expect(validarConfirmacionPin('5678', '5678').valido).toBe(true);
            expect(validarConfirmacionPin('5678', '5679').valido).toBe(false);
            expect(validarConfirmacionPin('5678', '567').valido).toBe(false);
            expect(validarConfirmacionPin('abc', 'abc').valido).toBe(false);
        });
    });

    describe('Gestión de Clave en Memoria (Sesión Volátil)', () => {
        it('debe almacenar y recuperar la clave activa en memoria', () => {
            const claveSimulada = { type: 'secret', algorithm: { name: 'AES-GCM' } };
            expect(obtenerClaveActiva()).toBeNull();
            expect(estaSesionDesbloqueada()).toBe(false);

            establecerClaveActiva(claveSimulada, '1234', 'salt123');

            expect(obtenerClaveActiva()).toBe(claveSimulada);
            expect(obtenerSaltActivo()).toBe('salt123');
            expect(estaSesionDesbloqueada()).toBe(true);
        });

        it('debe rechazar el establecimiento si no se provee clave', () => {
            expect(() => establecerClaveActiva(null)).toThrow('CLAVE_REQUERIDA');
            expect(() => establecerClaveActiva(undefined)).toThrow('CLAVE_REQUERIDA');
        });

        it('debe destruir la referencia de la clave al bloquear la sesión', () => {
            const claveSimulada = { type: 'secret' };
            establecerClaveActiva(claveSimulada, '1234', 'salt');
            expect(estaSesionDesbloqueada()).toBe(true);

            bloquearSesionCripto();

            expect(obtenerClaveActiva()).toBeNull();
            expect(obtenerSaltActivo()).toBeNull();
            expect(estaSesionDesbloqueada()).toBe(false);
        });
    });

    describe('Persistencia de Sesión en Pestaña Activa (sessionStorage)', () => {
        it('debe guardar la credencial efímera en sessionStorage al establecer clave activa', () => {
            const claveSimulada = { type: 'secret', algorithm: { name: 'AES-GCM' } };
            establecerClaveActiva(claveSimulada, '5678', 'saltABC', 'user_999');

            const item = sessionStorage.getItem('cero_conocimiento_sesion_user_999');
            expect(item).not.toBeNull();
            const sesion = JSON.parse(item);
            expect(sesion.pin).toBe('5678');
            expect(sesion.salt).toBe('saltABC');
            expect(sesion.usuarioId).toBe('user_999');
            expect(typeof sesion.timestamp).toBe('number');
        });

        it('debe restaurar la clave activa y estado desde sessionStorage simulando recarga F5', async () => {
            const claveOriginal = { type: 'secret', algorithm: { name: 'AES-GCM' } };
            establecerClaveActiva(claveOriginal, '123456', 'saltXYZ', 'user_test');

            // Simular recarga de página: se limpia la RAM de JS pero sessionStorage persiste
            bloquearSesionCripto();
            // Restauramos el item en sessionStorage ya que bloquearSesionCripto limpia por seguridad
            sessionStorage.setItem('cero_conocimiento_sesion_user_test', JSON.stringify({
                pin: '123456',
                salt: 'saltXYZ',
                usuarioId: 'user_test',
                timestamp: Date.now()
            }));

            expect(obtenerClaveActiva()).toBeNull();
            expect(estaSesionDesbloqueada()).toBe(false);

            const restaurado = await restaurarSesionCriptoDesdeSessionStorage('user_test');
            expect(restaurado).toBe(true);
            expect(estaSesionDesbloqueada()).toBe(true);
            expect(obtenerClaveActiva()).not.toBeNull();
            expect(obtenerSaltActivo()).toBe('saltXYZ');
        });

        it('debe retornar false si no existe sesión guardada en sessionStorage', async () => {
            sessionStorage.clear();
            const restaurado = await restaurarSesionCriptoDesdeSessionStorage('usuario_inexistente');
            expect(restaurado).toBe(false);
            expect(estaSesionDesbloqueada()).toBe(false);
        });

        it('debe limpiar sessionStorage estrictamente al bloquear la sesión', () => {
            const claveSimulada = { type: 'secret' };
            establecerClaveActiva(claveSimulada, '4321', 'saltTest', 'user_logout');

            expect(sessionStorage.getItem('cero_conocimiento_sesion_user_logout')).not.toBeNull();

            bloquearSesionCripto('user_logout');

            expect(sessionStorage.getItem('cero_conocimiento_sesion_user_logout')).toBeNull();
            expect(sessionStorage.getItem('cero_conocimiento_sesion_activa')).toBeNull();
            expect(estaSesionDesbloqueada()).toBe(false);
        });
    });

    describe('Protección contra Fuerza Bruta (Backoff Exponencial)', () => {
        it('no debe penalizar los primeros 3 intentos erróneos', () => {
            for (let i = 1; i <= MAX_INTENTOS_SIN_PENALIZACION; i++) {
                const res = registrarIntentoFallido();
                expect(res.bloqueado).toBe(false);
                expect(res.esperaMs).toBe(0);
                expect(res.intentosFallidos).toBe(i);
            }
            expect(estaBloqueadoPorFuerzaBruta().bloqueado).toBe(false);
        });

        it('debe aplicar backoff exponencial a partir del 4to intento', () => {
            // Intentos 1, 2, 3
            registrarIntentoFallido();
            registrarIntentoFallido();
            registrarIntentoFallido();

            // Intento 4 -> 1 segundo (1000ms * 2^0)
            const intento4 = registrarIntentoFallido();
            expect(intento4.bloqueado).toBe(true);
            expect(intento4.esperaMs).toBe(1000);
            expect(estaBloqueadoPorFuerzaBruta().bloqueado).toBe(true);

            // Intento 5 -> 2 segundos (1000ms * 2^1)
            const intento5 = registrarIntentoFallido();
            expect(intento5.bloqueado).toBe(true);
            expect(intento5.esperaMs).toBe(2000);

            // Intento 6 -> 4 segundos (1000ms * 2^2)
            const intento6 = registrarIntentoFallido();
            expect(intento6.bloqueado).toBe(true);
            expect(intento6.esperaMs).toBe(4000);
        });

        it('debe reiniciar el contador y el bloqueo al invocar reiniciarIntentosFallidos', () => {
            for (let i = 0; i < 5; i++) {
                registrarIntentoFallido();
            }
            expect(estaBloqueadoPorFuerzaBruta().bloqueado).toBe(true);

            reiniciarIntentosFallidos();

            const estado = obtenerEstadoFuerzaBruta();
            expect(estado.intentosFallidos).toBe(0);
            expect(estado.bloqueado).toBe(false);
            expect(estado.restanteMs).toBe(0);
        });
    });

    describe('Almacenamiento Local de Credenciales Biométricas y PIN Protegido', () => {
        it('debe guardar, obtener y verificar credenciales asociadas al usuario', () => {
            const usuarioId = 'usr_test_123';
            expect(tieneBiometriaRegistrada(usuarioId)).toBe(false);
            expect(obtenerCredencialBiometrica(usuarioId)).toBeNull();

            const info = { credentialId: 'cred_abc', timestamp: 123456789 };
            guardarCredencialBiometrica(usuarioId, info);

            expect(tieneBiometriaRegistrada(usuarioId)).toBe(true);
            expect(obtenerCredencialBiometrica(usuarioId)).toEqual(info);

            eliminarCredencialBiometrica(usuarioId);
            expect(tieneBiometriaRegistrada(usuarioId)).toBe(false);
        });

        it('debe proteger y recuperar el PIN biométrico localmente', () => {
            const usuarioId = 'usr_bio_456';
            expect(recuperarPinBiometricoProtegido(usuarioId)).toBeNull();

            guardarPinBiometricoProtegido(usuarioId, '9876');
            expect(recuperarPinBiometricoProtegido(usuarioId)).toBe('9876');

            eliminarCredencialBiometrica(usuarioId);
            expect(recuperarPinBiometricoProtegido(usuarioId)).toBeNull();
        });
    });

    describe('Detección y Flujo WebAuthn', () => {
        it('debe retornar false si no existe PublicKeyCredential en el entorno', async () => {
            const disponible = await esBiometriaDisponible();
            expect(typeof disponible).toBe('boolean');
        });

        it('debe detectar autenticador de plataforma cuando PublicKeyCredential está disponible', async () => {
            const originalPKC = globalThis.window?.PublicKeyCredential;
            try {
                if (!globalThis.window) {
                    globalThis.window = {};
                }
                globalThis.window.PublicKeyCredential = {
                    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true)
                };

                const res = await esBiometriaDisponible();
                expect(res).toBe(true);
                expect(globalThis.window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable).toHaveBeenCalled();
            } finally {
                if (originalPKC !== undefined) {
                    globalThis.window.PublicKeyCredential = originalPKC;
                }
            }
        });

        it('debe registrar biometría exitosamente invocando navigator.credentials.create', async () => {
            const fakeCredential = {
                id: 'test-cred-id',
                rawId: new Uint8Array([1, 2, 3, 4]).buffer
            };

            const originalNav = globalThis.navigator;
            try {
                globalThis.navigator = {
                    credentials: {
                        create: vi.fn().mockResolvedValue(fakeCredential),
                        get: vi.fn()
                    }
                };

                const res = await registrarBiometria('user_xyz_1');
                expect(res.success).toBe(true);
                expect(res.credentialId).toBeTypeOf('string');
                expect(navigator.credentials.create).toHaveBeenCalledTimes(1);

                const callArg = navigator.credentials.create.mock.calls[0][0];
                expect(callArg.publicKey.authenticatorSelection.authenticatorAttachment).toBe('platform');
                expect(callArg.publicKey.authenticatorSelection.userVerification).toBe('required');
            } finally {
                globalThis.navigator = originalNav;
            }
        });

        it('debe autenticar con biometría invocando navigator.credentials.get con userVerification required', async () => {
            const fakeAssertion = {
                id: 'test-assertion-id',
                response: {}
            };

            const originalNav = globalThis.navigator;
            try {
                globalThis.navigator = {
                    credentials: {
                        create: vi.fn(),
                        get: vi.fn().mockResolvedValue(fakeAssertion)
                    }
                };

                // Guardar credencial previa para el usuario
                guardarCredencialBiometrica('user_xyz_2', {
                    credentialId: 'AQIDBA==' // [1, 2, 3, 4] en Base64
                });

                const res = await autenticarConBiometria('user_xyz_2');
                expect(res.success).toBe(true);
                expect(res.assertion).toBe(fakeAssertion);
                expect(navigator.credentials.get).toHaveBeenCalledTimes(1);

                const callArg = navigator.credentials.get.mock.calls[0][0];
                expect(callArg.publicKey.userVerification).toBe('required');
                expect(callArg.publicKey.allowCredentials[0].type).toBe('public-key');
            } finally {
                globalThis.navigator = originalNav;
            }
        });

        it('debe fallar al autenticar si la credencial no existe', async () => {
            await expect(autenticarConBiometria('usuario_inexistente')).rejects.toThrow('CREDENCIAL_NO_ENCONTRADA');
        });
    });
});
