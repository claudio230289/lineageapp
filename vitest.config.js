import { defineConfig } from 'vitest/config';
import { webcrypto } from 'node:crypto';

// Asegurar WebCrypto completo en entorno JSDOM
if (typeof globalThis !== 'undefined' && (!globalThis.crypto || !globalThis.crypto.subtle) && webcrypto) {
    Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        writable: true,
        configurable: true
    });
}

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html']
        }
    }
});

