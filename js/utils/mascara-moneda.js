/* =========================================================
   MÁSCARA DE MONEDA EN VIVO (js/utils/mascara-moneda.js)
   =========================================================
   Formateo de importes con punto para miles y coma para
   decimales (máximo 2 centavos) en tiempo real mientras
   el usuario escribe, preservando la posición del cursor.
   ========================================================= */

/**
 * Formatea un valor numérico o texto a formato de moneda argentina:
 * miles con punto (.) y decimales con coma (,).
 *
 * Ejemplos:
 *   50000 -> "50.000"
 *   1500000 -> "1.500.000"
 *   "1500,75" -> "1.500,75"
 *   "1500.75" -> "1.500,75"
 *   "1.500," -> "1.500,"
 *   ",5" -> "0,5"
 *
 * @param {string|number|null|undefined} valorTexto
 * @returns {string} Texto formateado con miles y decimales
 */
export function formatearTextoMoneda(valorTexto) {
    if (valorTexto === null || valorTexto === undefined) return '';

    if (typeof valorTexto === 'number') {
        if (!Number.isFinite(valorTexto)) return '';
        if (valorTexto === 0) return '0';
        const esNegativo = valorTexto < 0;
        const abs = Math.abs(valorTexto);
        let formateado = '';
        if (Number.isInteger(abs)) {
            formateado = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        } else {
            const fijo = abs.toFixed(2);
            const [entero, decimal] = fijo.split('.');
            formateado = `${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimal}`;
        }
        return esNegativo ? `-${formateado}` : formateado;
    }

    let s = String(valorTexto).trim();
    if (s === '') return '';

    const esNegativo = s.startsWith('-');
    if (esNegativo) s = s.slice(1);

    let enteroRaw = '';
    let decimalRaw = '';
    let tieneSeparadorDecimal = false;

    if (s.includes(',')) {
        // En formato argentino, la coma es el único separador decimal explícito
        const idx = s.indexOf(',');
        enteroRaw = s.slice(0, idx);
        decimalRaw = s.slice(idx + 1);
        tieneSeparadorDecimal = true;
    } else if (s.endsWith('.')) {
        // El usuario tipeó punto al final para comenzar a ingresar decimales
        enteroRaw = s.slice(0, -1);
        decimalRaw = '';
        tieneSeparadorDecimal = true;
    } else if (/^\.\d+$/.test(s)) {
        // Formato decimal inicial con punto sin entero previo (ej: ".75")
        enteroRaw = '0';
        decimalRaw = s.slice(1);
        tieneSeparadorDecimal = true;
    } else {
        // Puntos tratados exclusivamente como separadores de miles (o remanentes tras borrado).
        // Evita convertir erróneamente puntos de miles en comas al presionar Backspace
        // (por ejemplo, "50.000" -> Backspace -> "50.00" -> debe ser "5.000", no "50,00").
        enteroRaw = s;
        decimalRaw = '';
        tieneSeparadorDecimal = false;
    }

    // Limpiar parte entera
    let digitosEntero = enteroRaw.replace(/\D/g, '');
    if (digitosEntero.length > 1) {
        digitosEntero = digitosEntero.replace(/^0+/, '') || '0';
    }
    if (tieneSeparadorDecimal && digitosEntero === '') {
        digitosEntero = '0';
    }

    const enteroFmt = digitosEntero === '' ? '' : digitosEntero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const digitosDecimal = decimalRaw.replace(/\D/g, '').slice(0, 2);

    if (enteroFmt === '' && !tieneSeparadorDecimal) {
        return '';
    }

    let res = enteroFmt;
    if (tieneSeparadorDecimal) {
        res += `,${digitosDecimal}`;
    }

    if (esNegativo && res !== '' && res !== '0' && res !== '0,') {
        res = `-${res}`;
    }

    return res;
}

function fijarSeleccion(el, start, end = start) {
    try {
        if (typeof el.setSelectionRange === 'function') {
            el.setSelectionRange(start, end);
        }
    } catch {
        // Entornos de prueba o tipos de campo que no admitan selección
    }
}

/**
 * Conecta la máscara de moneda a un elemento <input>.
 * Maneja el evento 'input' con recálculo exacto de la posición del cursor,
 * e intercepta teclas para borrado natural sobre separadores de miles y coma.
 *
 * @param {HTMLInputElement} inputElement
 */
export function aplicarMascaraMonedaEnInput(inputElement) {
    if (!inputElement || inputElement._mascaraMonedaConectada) return;
    inputElement._mascaraMonedaConectada = true;

    inputElement.type = 'text';
    inputElement.inputMode = 'decimal';
    inputElement.setAttribute('autocomplete', 'off');

    inputElement.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

        // Permitir teclas de navegación y control
        const teclasPermitidas = [
            'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End', 'Tab', 'Enter', 'Escape'
        ];
        if (teclasPermitidas.includes(e.key)) {
            // Manejar borrado especial sobre separadores de miles y coma
            const start = inputElement.selectionStart;
            const end = inputElement.selectionEnd;
            const val = inputElement.value;

            if (start !== null && start === end) {
                if (e.key === 'Backspace' && start > 1 && val[start - 1] === '.') {
                    e.preventDefault();
                    // Borrar el dígito previo al punto
                    const nuevo = val.slice(0, start - 2) + val.slice(start);
                    inputElement.value = formatearTextoMoneda(nuevo);
                    const pos = Math.max(0, start - 2);
                    fijarSeleccion(inputElement, pos, pos);
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    return;
                }
                if (e.key === 'Delete' && start < val.length - 1 && val[start] === '.') {
                    e.preventDefault();
                    // Borrar el dígito posterior al punto
                    const nuevo = val.slice(0, start) + val.slice(start + 2);
                    inputElement.value = formatearTextoMoneda(nuevo);
                    fijarSeleccion(inputElement, start, start);
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    return;
                }
            }
            return;
        }

        // Interceptar coma o punto para separador decimal
        if (e.key === ',' || e.key === '.') {
            e.preventDefault();
            const val = inputElement.value;
            const idxComa = val.indexOf(',');
            if (idxComa !== -1) {
                // Si ya existe coma decimal, saltar el cursor justo después de la coma existente
                fijarSeleccion(inputElement, idxComa + 1, idxComa + 1);
                return;
            }
            // Si no existe coma, insertar coma en la posición del cursor
            const start = inputElement.selectionStart ?? val.length;
            const end = inputElement.selectionEnd ?? val.length;
            const nuevo = val.slice(0, start) + ',' + val.slice(end);
            inputElement.value = formatearTextoMoneda(nuevo);
            const posComa = inputElement.value.indexOf(',');
            const nuevaPos = posComa !== -1 ? posComa + 1 : inputElement.value.length;
            fijarSeleccion(inputElement, nuevaPos, nuevaPos);
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        // Bloquear cualquier caracter no numérico (excepto - al inicio)
        if (e.key.length === 1 && !/[\d]/.test(e.key)) {
            if (e.key === '-' && inputElement.selectionStart === 0 && !inputElement.value.includes('-')) {
                return;
            }
            e.preventDefault();
        }
    });

    inputElement.addEventListener('input', () => {
        const raw = inputElement.value;
        const cursorOriginal = inputElement.selectionStart ?? raw.length;

        // Analizar qué había antes del cursor
        const subAntes = raw.slice(0, cursorOriginal);
        const digitosAntes = (subAntes.match(/\d/g) || []).length;
        const tieneSepAntes = subAntes.includes(',') || subAntes.includes('.');

        const formateado = formatearTextoMoneda(raw);
        inputElement.value = formateado;

        // Reubicar cursor
        let nuevoCursor = 0;
        let digitosContados = 0;
        let sepEncontrado = false;

        for (let i = 0; i < formateado.length; i++) {
            const ch = formateado[i];
            if (/\d/.test(ch)) {
                digitosContados++;
            } else if (ch === ',') {
                sepEncontrado = true;
            }

            if (digitosContados === digitosAntes) {
                if (tieneSepAntes && !sepEncontrado && formateado.indexOf(',') !== -1) {
                    continue;
                }
                nuevoCursor = i + 1;
                break;
            }
        }

        if (digitosAntes === 0) {
            nuevoCursor = tieneSepAntes && formateado.includes(',')
                ? formateado.indexOf(',') + 1
                : (formateado.startsWith('-') ? 1 : 0);
        } else if (digitosContados < digitosAntes) {
            nuevoCursor = formateado.length;
        }

        nuevoCursor = Math.max(0, Math.min(nuevoCursor, formateado.length));
        fijarSeleccion(inputElement, nuevoCursor, nuevoCursor);
    });
}

/**
 * Conecta automáticamente la máscara de moneda a todos los inputs
 * con el atributo `data-mascara="moneda"` dentro del nodo raíz.
 *
 * @param {Document|HTMLElement} [raiz=document]
 */
export function conectarMascarasEnDocumento(raiz = document) {
    if (!raiz || typeof raiz.querySelectorAll !== 'function') return;
    const inputs = raiz.querySelectorAll('input[data-mascara="moneda"]');
    inputs.forEach(input => {
        aplicarMascaraMonedaEnInput(input);
        if (input.value) {
            input.value = formatearTextoMoneda(input.value);
        }
    });
}
