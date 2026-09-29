/* =========================================================
   MONITOREO DE ERRORES (js/monitoreo.js)
   Sistema de logging y tracking de errores
   ========================================================= */

// Configuración de Sentry (opcional - agregar DSN si se desea usar)
const SENTRY_DSN = null; // 'https://xxx@yyy.ingest.sentry.io/zzz'

// Inicializar Sentry si está configurado
if (SENTRY_DSN) {
    // Cargar Sentry dinámicamente
    const script = document.createElement('script');
    script.src = 'https://browser.sentry-cdn.com/7.100.0/bundle.tracing.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
        Sentry.init({
            dsn: SENTRY_DSN,
            environment: 'production',
            tracesSampleRate: 0.1,
            beforeSend(event) {
                // No enviar datos sensibles
                if (event.request) {
                    delete event.request.cookies;
                    delete event.request.headers;
                }
                return event;
            }
        });
    };
    document.head.appendChild(script);
}

// Sistema de logging local
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

let currentLogLevel = LOG_LEVELS.DEBUG;

export function setLogLevel(level) {
    currentLogLevel = level;
}

export function log(level, message, data = null) {
    if (LOG_LEVELS[level] < currentLogLevel) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, data };
    
    // Log en consola
    const consoleMethod = level === 'ERROR' ? 'error' : 
                          level === 'WARN' ? 'warn' : 'log';
    console[consoleMethod](`[${level}] ${message}`, data || '');
    
    // Enviar a Sentry si está configurado
    if (SENTRY_DSN && typeof Sentry !== 'undefined') {
        if (level === 'ERROR') {
            Sentry.captureException(data || new Error(message));
        } else {
            Sentry.captureMessage(message, level.toLowerCase());
        }
    }
    
    // Guardar en localStorage para debugging
    saveLog(logEntry);
}

function saveLog(logEntry) {
    try {
        const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
        logs.push(logEntry);
        // Mantener solo los últimos 100 logs
        if (logs.length > 100) logs.shift();
        localStorage.setItem('app_logs', JSON.stringify(logs));
    } catch (e) {
        // Ignorar errores de localStorage
    }
}

// Funciones de conveniencia
export function logDebug(message, data) { log('DEBUG', message, data); }
export function logInfo(message, data) { log('INFO', message, data); }
export function logWarn(message, data) { log('WARN', message, data); }
export function logError(message, data) { log('ERROR', message, data); }

// Obtener logs guardados
export function getLogs() {
    try {
        return JSON.parse(localStorage.getItem('app_logs') || '[]');
    } catch (e) {
        return [];
    }
}

// Limpiar logs
export function clearLogs() {
    localStorage.removeItem('app_logs');
}

// Exportar logs como JSON
export function exportLogs() {
    const logs = getLogs();
    const dataStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
