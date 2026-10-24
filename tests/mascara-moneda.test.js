import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import {
    formatearTextoMoneda,
    aplicarMascaraMonedaEnInput,
    conectarMascarasEnDocumento
} from '../js/utils/mascara-moneda.js';
import { aNumero } from '../js/calculos/nucleo.js';

/* =========================================================
   TESTS DE MÁSCARA DE MONEDA (tests/mascara-moneda.test.js)
   ========================================================= */

describe('formatearTextoMoneda (Lógica Pura)', () => {
    describe('Enteros y Miles', () => {
        it('debe devolver cadena vacía ante valores nulos o vacíos', () => {
            expect(formatearTextoMoneda(null)).toBe('');
            expect(formatearTextoMoneda(undefined)).toBe('');
            expect(formatearTextoMoneda('')).toBe('');
            expect(formatearTextoMoneda('   ')).toBe('');
        });

        it('debe formatear cero', () => {
            expect(formatearTextoMoneda(0)).toBe('0');
            expect(formatearTextoMoneda('0')).toBe('0');
            expect(formatearTextoMoneda('000')).toBe('0');
        });

        it('debe formatear números enteros sin miles', () => {
            expect(formatearTextoMoneda('5')).toBe('5');
            expect(formatearTextoMoneda('50')).toBe('50');
            expect(formatearTextoMoneda('500')).toBe('500');
        });

        it('debe formatear separador de miles con punto', () => {
            expect(formatearTextoMoneda('50000')).toBe('50.000');
            expect(formatearTextoMoneda(50000)).toBe('50.000');
            expect(formatearTextoMoneda('1500000')).toBe('1.500.000');
            expect(formatearTextoMoneda(1500000)).toBe('1.500.000');
            expect(formatearTextoMoneda('1000000000')).toBe('1.000.000.000');
        });

        it('debe conservar puntos de miles ya existentes', () => {
            expect(formatearTextoMoneda('50.000')).toBe('50.000');
            expect(formatearTextoMoneda('1.500.000')).toBe('1.500.000');
        });

        it('debe remover ceros a la izquierda en números enteros', () => {
            expect(formatearTextoMoneda('05')).toBe('5');
            expect(formatearTextoMoneda('001500')).toBe('1.500');
        });
    });

    describe('Decimales y Centavos', () => {
        it('debe aceptar coma como separador decimal con miles', () => {
            expect(formatearTextoMoneda('1500,75')).toBe('1.500,75');
            expect(formatearTextoMoneda('50000,50')).toBe('50.000,50');
            expect(formatearTextoMoneda('150,75')).toBe('150,75');
            expect(formatearTextoMoneda('0,5')).toBe('0,5');
        });

        it('debe tolerar punto como separador decimal', () => {
            expect(formatearTextoMoneda('1500.75')).toBe('1.500,75');
            expect(formatearTextoMoneda('50.5')).toBe('50,5');
            expect(formatearTextoMoneda('.75')).toBe('0,75');
            expect(formatearTextoMoneda(1500.75)).toBe('1.500,75');
            expect(formatearTextoMoneda(1500.5)).toBe('1.500,50');
        });

        it('debe permitir coma o punto final sin decimales para continuar tipeando', () => {
            expect(formatearTextoMoneda('1500,')).toBe('1.500,');
            expect(formatearTextoMoneda('1.500,')).toBe('1.500,');
            expect(formatearTextoMoneda('1500.')).toBe('1.500,');
            expect(formatearTextoMoneda('50,')).toBe('50,');
            expect(formatearTextoMoneda(',')).toBe('0,');
            expect(formatearTextoMoneda('.')).toBe('0,');
        });

        it('debe truncar a un máximo de 2 decimales', () => {
            expect(formatearTextoMoneda('1500,759')).toBe('1.500,75');
            expect(formatearTextoMoneda('1.500,9999')).toBe('1.500,99');
        });
    });

    describe('Signos Negativos y Caracteres Especiales', () => {
        it('debe soportar números negativos', () => {
            expect(formatearTextoMoneda('-1500')).toBe('-1.500');
            expect(formatearTextoMoneda('-1500,75')).toBe('-1.500,75');
            expect(formatearTextoMoneda(-1500.75)).toBe('-1.500,75');
        });

        it('debe limpiar caracteres alfabéticos o símbolos extraños', () => {
            expect(formatearTextoMoneda('$ 1500')).toBe('1.500');
            expect(formatearTextoMoneda('ARS 50.000,50')).toBe('50.000,50');
            expect(formatearTextoMoneda('abc1500xyz,75')).toBe('1.500,75');
        });
    });

    describe('Compatibilidad Matemática con aNumero', () => {
        it('todo texto formateado debe ser parseado exactamente por aNumero', () => {
            const casos = [
                { texto: '50000', esperado: 50000 },
                { texto: '1500000', esperado: 1500000 },
                { texto: '1500,75', esperado: 1500.75 },
                { texto: '1500.75', esperado: 1500.75 },
                { texto: '1.500,50', esperado: 1500.5 },
                { texto: '150,75', esperado: 150.75 },
                { texto: '0,50', esperado: 0.5 },
                { texto: '1.500,', esperado: 1500 },
                { texto: '-2500,25', esperado: -2500.25 }
            ];

            casos.forEach(({ texto, esperado }) => {
                const fmt = formatearTextoMoneda(texto);
                const num = aNumero(fmt);
                expect(num).toBe(esperado);
            });
        });
    });
});

describe('aplicarMascaraMonedaEnInput (DOM y Eventos)', () => {
    let document;
    let input;

    beforeEach(() => {
        const dom = new JSDOM(`<!DOCTYPE html><html><body><input id="test-monto" type="text"></body></html>`);
        document = dom.window.document;
        input = document.getElementById('test-monto');
        aplicarMascaraMonedaEnInput(input);
    });

    it('debe configurar type="text" e inputmode="decimal"', () => {
        expect(input.type).toBe('text');
        expect(input.inputMode).toBe('decimal');
    });

    it('debe formatear en vivo al disparar evento input', () => {
        input.value = '50000';
        input.dispatchEvent(new domGlobal.Event('input', { bubbles: true }));
        expect(input.value).toBe('50.000');
    });

    it('debe manejar tipeo de decimal con coma', () => {
        input.value = '1500,';
        input.dispatchEvent(new domGlobal.Event('input', { bubbles: true }));
        expect(input.value).toBe('1.500,');

        input.value = '1.500,7';
        input.dispatchEvent(new domGlobal.Event('input', { bubbles: true }));
        expect(input.value).toBe('1.500,7');

        input.value = '1.500,75';
        input.dispatchEvent(new domGlobal.Event('input', { bubbles: true }));
        expect(input.value).toBe('1.500,75');
    });

    it('debe convertir punto en coma decimal', () => {
        input.value = '1500.';
        input.dispatchEvent(new domGlobal.Event('input', { bubbles: true }));
        expect(input.value).toBe('1.500,');

        input.value = '1500.75';
        input.dispatchEvent(new domGlobal.Event('input', { bubbles: true }));
        expect(input.value).toBe('1.500,75');
    });

    it('debe preservar la posición del cursor al editar dígitos en el medio', () => {
        input.value = '1.500.000';
        // Simulamos cursor entre 5 y 0: "1.5|00.000" (índice 3)
        // El usuario tipea '4':
        input.value = '1.5400.000';
        input.selectionStart = 4;
        input.selectionEnd = 4;

        input.dispatchEvent(new domGlobal.Event('input', { bubbles: true }));
        expect(input.value).toBe('15.400.000');
        // El cursor debe estar justo después del 4 en el nuevo texto
        expect(input.selectionStart).toBe(4);
    });

    it('no debe duplicar la coma si se tipea coma teniendo ya una coma', () => {
        input.value = '1.500,75';
        input.selectionStart = 2;
        input.selectionEnd = 2;

        const event = new domGlobal.KeyboardEvent('keydown', { key: ',', cancelable: true });
        input.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        // Debe saltar a la posición posterior a la coma existente
        expect(input.selectionStart).toBe(6);
    });

    it('debe prevenir caracteres alfabéticos no permitidos en keydown', () => {
        input.value = '1.500';
        const event = new domGlobal.KeyboardEvent('keydown', { key: 'a', cancelable: true });
        input.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });
});

describe('conectarMascarasEnDocumento', () => {
    it('debe autoconectar todos los inputs con data-mascara="moneda"', () => {
        const dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
                <body>
                    <input id="m1" data-mascara="moneda" value="50000">
                    <input id="m2" data-mascara="moneda" value="1500.75">
                    <input id="m3" type="text" value="sin-mascara">
                </body>
            </html>
        `);
        const doc = dom.window.document;

        conectarMascarasEnDocumento(doc);

        const m1 = doc.getElementById('m1');
        const m2 = doc.getElementById('m2');
        const m3 = doc.getElementById('m3');

        expect(m1._mascaraMonedaConectada).toBe(true);
        expect(m1.value).toBe('50.000');

        expect(m2._mascaraMonedaConectada).toBe(true);
        expect(m2.value).toBe('1.500,75');

        expect(m3._mascaraMonedaConectada).toBeUndefined();
        expect(m3.value).toBe('sin-mascara');
    });
});

const domGlobal = new JSDOM().window;
