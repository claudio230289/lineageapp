import { describe, it, expect } from 'vitest';
import {
    generarSalt,
    generarIV,
    derivarClave,
    cifrarTexto,
    descifrarTexto,
    cifrarObjeto,
    descifrarObjeto,
    esDocumentoCifrado,
    uint8ArrayToBase64,
    base64ToUint8Array
} from '../js/crypto/nucleo.js';

describe('Motor Criptográfico Puro (Fase 1 - Cero Conocimiento)', () => {
    describe('Generación de Salt e IV', () => {
        it('debe generar salts únicos, criptográficamente seguros y en Base64', () => {
            const salt1 = generarSalt();
            const salt2 = generarSalt();

            expect(salt1).toBeTypeOf('string');
            expect(salt2).toBeTypeOf('string');
            expect(salt1).not.toBe(salt2);

            // 16 bytes en Base64 con padding ocupan 24 caracteres
            expect(salt1.length).toBe(24);
            const bytes = base64ToUint8Array(salt1);
            expect(bytes.byteLength).toBe(16);
        });

        it('debe permitir generar salts con longitud personalizada', () => {
            const salt32 = generarSalt(32);
            const bytes = base64ToUint8Array(salt32);
            expect(bytes.byteLength).toBe(32);
        });

        it('debe rechazar longitudes de salt inválidas', () => {
            expect(() => generarSalt(0)).toThrow(TypeError);
            expect(() => generarSalt(-5)).toThrow(TypeError);
            expect(() => generarSalt(1.5)).toThrow(TypeError);
        });

        it('debe generar IVs únicos de 12 bytes (estándar NIST AES-GCM)', () => {
            const iv1 = generarIV();
            const iv2 = generarIV();

            expect(iv1).toBeInstanceOf(Uint8Array);
            expect(iv2).toBeInstanceOf(Uint8Array);
            expect(iv1.byteLength).toBe(12);
            expect(iv2.byteLength).toBe(12);

            // Deben ser bytes distintos
            const sonIdenticos = iv1.every((val, idx) => val === iv2[idx]);
            expect(sonIdenticos).toBe(false);
        });

        it('debe rechazar longitudes de IV inválidas', () => {
            expect(() => generarIV(0)).toThrow(TypeError);
            expect(() => generarIV(-1)).toThrow(TypeError);
        });
    });

    describe('Conversión Base64 y Uint8Array', () => {
        it('debe convertir ida y vuelta sin perder información binaria', () => {
            const original = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
            const b64 = uint8ArrayToBase64(original);
            const recuperado = base64ToUint8Array(b64);

            expect(recuperado).toEqual(original);
        });

        it('debe manejar buffers grandes (100KB) sin stack overflow', () => {
            const tamano = 100 * 1024;
            const buffer = new Uint8Array(tamano);
            for (let i = 0; i < tamano; i++) {
                buffer[i] = i % 256;
            }

            const b64 = uint8ArrayToBase64(buffer);
            const recuperado = base64ToUint8Array(b64);
            expect(recuperado.byteLength).toBe(tamano);
            expect(recuperado[tamano - 1]).toBe((tamano - 1) % 256);
        });
    });

    describe('Derivación de Clave (PBKDF2 con SHA-256)', () => {
        it('debe derivar una CryptoKey AES-GCM de 256 bits con 100,000 iteraciones', async () => {
            const salt = generarSalt();
            const clave = await derivarClave('1234', salt);

            expect(clave).toBeDefined();
            expect(clave.type).toBe('secret');
            expect(clave.algorithm.name).toBe('AES-GCM');
            expect(clave.algorithm.length).toBe(256);
        });

        it('mismo PIN y mismo salt producen claves interoperables', async () => {
            const salt = generarSalt();
            const clave1 = await derivarClave('9876', salt, 1000);
            const clave2 = await derivarClave('9876', salt, 1000);

            const mensaje = 'Dato secreto de prueba';
            const { ciphertext, iv } = await cifrarTexto(mensaje, clave1);
            const descifrado = await descifrarTexto(ciphertext, clave2, iv);

            expect(descifrado).toBe(mensaje);
        });

        it('PIN numérico y PIN string equivalente producen la misma clave', async () => {
            const salt = generarSalt();
            const claveString = await derivarClave('4321', salt, 1000);
            const claveNumero = await derivarClave(4321, salt, 1000);

            const texto = 'Presupuesto familiar';
            const cifrado = await cifrarTexto(texto, claveNumero);
            const descifrado = await descifrarTexto(cifrado.ciphertext, claveString, cifrado.iv);

            expect(descifrado).toBe(texto);
        });

        it('falla si no se provee PIN o salt', async () => {
            const salt = generarSalt();
            await expect(derivarClave('', salt)).rejects.toThrow('PIN_REQUERIDO');
            await expect(derivarClave(null, salt)).rejects.toThrow('PIN_REQUERIDO');
            await expect(derivarClave('1234', null)).rejects.toThrow('SALT_REQUERIDO');
        });
    });

    describe('Cifrado y Descifrado de Texto (AES-GCM 256)', () => {
        it('debe cifrar y descifrar texto plano con soporte UTF-8 completo', async () => {
            const salt = generarSalt();
            const clave = await derivarClave('pin-seguro-2026', salt, 1000);
            const textoOriginal = '¡Control Financiero! 💰 Gastos: $1.250.000,50 — Año 2026 📈';

            const resultado = await cifrarTexto(textoOriginal, clave);
            expect(resultado).toHaveProperty('ciphertext');
            expect(resultado).toHaveProperty('iv');
            expect(resultado.ciphertext).toBeTypeOf('string');
            expect(resultado.iv).toBeTypeOf('string');

            const textoDescifrado = await descifrarTexto(resultado.ciphertext, clave, resultado.iv);
            expect(textoDescifrado).toBe(textoOriginal);
        });

        it('verificación de no-determinismo: mismo texto y misma clave producen distinto IV y ciphertext', async () => {
            const salt = generarSalt();
            const clave = await derivarClave('mi-pin', salt, 1000);
            const texto = 'Mismo texto confidencial';

            const ejecucion1 = await cifrarTexto(texto, clave);
            const ejecucion2 = await cifrarTexto(texto, clave);

            expect(ejecucion1.iv).not.toBe(ejecucion2.iv);
            expect(ejecucion1.ciphertext).not.toBe(ejecucion2.ciphertext);

            // Ambos deben poder descifrarse correctamente al original
            expect(await descifrarTexto(ejecucion1.ciphertext, clave, ejecucion1.iv)).toBe(texto);
            expect(await descifrarTexto(ejecucion2.ciphertext, clave, ejecucion2.iv)).toBe(texto);
        });

        it('falla con PIN_INCORRECTO_O_CORRUPTO al intentar descifrar con clave distinta', async () => {
            const salt = generarSalt();
            const claveCorrecta = await derivarClave('1111', salt, 1000);
            const claveIncorrecta = await derivarClave('2222', salt, 1000);

            const cifrado = await cifrarTexto('Sueldo neto: $850.000', claveCorrecta);

            await expect(
                descifrarTexto(cifrado.ciphertext, claveIncorrecta, cifrado.iv)
            ).rejects.toThrow('PIN_INCORRECTO_O_CORRUPTO');
        });

        it('falla con PIN_INCORRECTO_O_CORRUPTO ante manipulación o corrupción del ciphertext', async () => {
            const salt = generarSalt();
            const clave = await derivarClave('1234', salt, 1000);
            const cifrado = await cifrarTexto('Datos no adulterados', clave);

            // Modificamos un byte del ciphertext decodificado
            const bytes = base64ToUint8Array(cifrado.ciphertext);
            bytes[0] ^= 0xFF; // Invertir bits
            const ciphertextCorrupto = uint8ArrayToBase64(bytes);

            await expect(
                descifrarTexto(ciphertextCorrupto, clave, cifrado.iv)
            ).rejects.toThrow('PIN_INCORRECTO_O_CORRUPTO');
        });

        it('falla con PIN_INCORRECTO_O_CORRUPTO ante alteración del IV', async () => {
            const salt = generarSalt();
            const clave = await derivarClave('1234', salt, 1000);
            const cifrado = await cifrarTexto('Mensaje secreto', clave);

            const ivBytes = base64ToUint8Array(cifrado.iv);
            ivBytes[0] ^= 0x01;
            const ivAlterado = uint8ArrayToBase64(ivBytes);

            await expect(
                descifrarTexto(cifrado.ciphertext, clave, ivAlterado)
            ).rejects.toThrow('PIN_INCORRECTO_O_CORRUPTO');
        });
    });

    describe('Cifrado y Descifrado de Objeto Financiero Complejo', () => {
        const payloadFinanciero = {
            idUsuario: 'usr-48921',
            configuracion: {
                moneda: 'ARS',
                alertaPresupuesto: 0.85
            },
            meses: {
                '2026-10': {
                    nombre: 'Octubre 2026',
                    balanceInicial: 150000,
                    ingresos: [
                        { id: 'ing-1', detalle: 'Sueldo principal', monto: 1200000, categoria: 'Laboral' },
                        { id: 'ing-2', detalle: 'Rendimientos FCI', monto: 35000, categoria: 'Inversiones' }
                    ],
                    gastos: [
                        { id: 'gst-1', detalle: 'Alquiler departamento', monto: 420000, pagado: true },
                        { id: 'gst-2', detalle: 'Supermercado quincenal', monto: 185400, pagado: false }
                    ],
                    pasivos: [
                        { id: 'pas-1', acreedor: 'Banco Nación', cuotaActual: 5, cuotasTotales: 12, valorCuota: 65000 }
                    ],
                    comprasEnCuotas: [
                        { id: 'cmp-1', comercio: 'Fravega', articulo: 'Heladera No Frost', planCuotas: 6, montoTotal: 780000 }
                    ]
                }
            },
            deseos: [
                { id: 'des-1', descripcion: 'Viaje a Bariloche', estimado: 900000, prioridad: 'Media' }
            ]
        };

        it('cifra y descifra fielmente el objeto financiero completo', async () => {
            const salt = generarSalt();
            const clave = await derivarClave('pin-financiero-seguro', salt, 1000);

            const sobre = await cifrarObjeto(payloadFinanciero, clave, salt);

            // Validar estructura del sobre estándar de cero conocimiento
            expect(sobre.esCifrado).toBe(true);
            expect(sobre.versionCifrado).toBe(1);
            expect(sobre.salt).toBe(salt);
            expect(sobre.iv).toBeTypeOf('string');
            expect(sobre.datos).toBeTypeOf('string');
            expect(sobre.timestamp).toBeTypeOf('number');
            expect(sobre.timestamp).toBeGreaterThan(0);

            // Descifrar y verificar integridad total
            const objetoDescifrado = await descifrarObjeto(sobre, clave);
            expect(objetoDescifrado).toEqual(payloadFinanciero);
            expect(objetoDescifrado.meses['2026-10'].gastos[0].detalle).toBe('Alquiler departamento');
            expect(objetoDescifrado.meses['2026-10'].balanceInicial).toBe(150000);
        });

        it('genera un salt automáticamente si no se provee explícitamente a cifrarObjeto', async () => {
            const salt = generarSalt();
            const clave = await derivarClave('9999', salt, 1000);
            const sobre = await cifrarObjeto({ prueba: 123 }, clave);

            expect(sobre.salt).toBeTypeOf('string');
            expect(sobre.salt.length).toBeGreaterThan(0);
        });

        it('falla con PIN_INCORRECTO_O_CORRUPTO al descifrar el sobre con un PIN erróneo', async () => {
            const salt = generarSalt();
            const claveCorrecta = await derivarClave('clave-real', salt, 1000);
            const claveIncorrecta = await derivarClave('clave-equivocada', salt, 1000);

            const sobre = await cifrarObjeto(payloadFinanciero, claveCorrecta, salt);

            await expect(descifrarObjeto(sobre, claveIncorrecta)).rejects.toThrow('PIN_INCORRECTO_O_CORRUPTO');
        });

        it('falla con DOCUMENTO_NO_CIFRADO si se intenta descifrar un objeto que no es un sobre', async () => {
            const salt = generarSalt();
            const clave = await derivarClave('1234', salt, 1000);

            await expect(descifrarObjeto(null, clave)).rejects.toThrow('DOCUMENTO_NO_CIFRADO');
            await expect(descifrarObjeto({}, clave)).rejects.toThrow('DOCUMENTO_NO_CIFRADO');
            await expect(descifrarObjeto({ meses: {} }, clave)).rejects.toThrow('DOCUMENTO_NO_CIFRADO');
        });
    });

    describe('Validación de Sobre Cifrado (esDocumentoCifrado)', () => {
        it('identifica correctamente sobres cifrados válidos', () => {
            const sobreValido = {
                esCifrado: true,
                versionCifrado: 1,
                salt: 'abc',
                iv: 'def123456789',
                datos: 'ZXhhbXBsZQ=='
            };

            expect(esDocumentoCifrado(sobreValido)).toBe(true);
        });

        it('descarta objetos inválidos, primitivos o documentos sin cifrar', () => {
            expect(esDocumentoCifrado(null)).toBe(false);
            expect(esDocumentoCifrado(undefined)).toBe(false);
            expect(esDocumentoCifrado('string')).toBe(false);
            expect(esDocumentoCifrado(12345)).toBe(false);
            expect(esDocumentoCifrado([])).toBe(false);
            expect(esDocumentoCifrado({})).toBe(false);
            expect(esDocumentoCifrado({ esCifrado: false, datos: 'abc', iv: 'def' })).toBe(false);
            expect(esDocumentoCifrado({ esCifrado: true, datos: '' })).toBe(false);
            expect(esDocumentoCifrado({ esCifrado: true, iv: '' })).toBe(false);
            expect(esDocumentoCifrado({ esCifrado: true, datos: 'abc' })).toBe(false); // falta iv
            expect(esDocumentoCifrado({ esCifrado: true, iv: 'def' })).toBe(false); // falta datos
        });
    });
});
