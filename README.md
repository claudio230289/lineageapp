# Finanzas Lineage - Control Financiero Personal

Aplicación PWA (Progressive Web App) para gestión de finanzas personales con sincronización en la nube mediante Firebase.

## Características

- ✅ **Control de ingresos** — Registro de sueldo básico, remunerativo, no remunerativo y deducciones
- ✅ **Control de gastos** — Categorización en fijos, únicos y cuotas
- ✅ **Compras en cuotas** — Programación automática de cuotas mensuales
- ✅ **Control de pasivos** — Seguimiento de deudas con proyección de cancelación
- ✅ **Metas financieras** — Simulador de ahorro con proyección de cumplimiento
- ✅ **Sincronización en la nube** — Backup automático con Firebase Firestore
- ✅ **Modo offline** — Service Worker para funcionamiento sin conexión
- ✅ **Exportar/Importar** — Respaldo en formato JSON
- ✅ **Reporte por WhatsApp** — Envío de comprobante de gastos

## Tecnologías

| Tecnología | Uso |
|------------|-----|
| **HTML5 + CSS3** | Estructura y estilos |
| **JavaScript (ES6+)** | Lógica de la aplicación |
| **Tailwind CSS** | Framework CSS utility-first |
| **Chart.js** | Gráficos financieros |
| **Firebase 10.8.0** | Autenticación y base de datos |
| **Service Worker** | Funcionalidad offline |

## Instalación

### Requisitos

- Node.js 16+ (para tests)
- Navegador moderno (Chrome, Firefox, Edge, Safari)
- Cuenta de Firebase

### Pasos

1. **Clonar el repositorio**
   ```bash
   git clone <url-del-repositorio>
   cd control_financiero_app
   ```

2. **Instalar dependencias (para tests)**
   ```bash
   npm install
   ```

3. **Configurar Firebase**
   - Crear un proyecto en [Firebase Console](https://console.firebase.google.com/)
   - Habilitar Authentication con proveedor Google
   - Crear base de datos Firestore
   - Copiar la configuración en `js/db.js`

4. **Configurar reglas de Firestore**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /finanzas_usuarios/{userId} {
         allow read: if request.auth != null && request.auth.uid == userId;
         allow write: if request.auth != null && request.auth.uid == userId;
       }
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```

5. **Desplegar**
   - Subir archivos a Firebase Hosting o cualquier servidor estático

## Uso

### Inicio de sesión
1. Abrir la aplicación
2. Hacer clic en "Continuar con Google"
3. Seleccionar cuenta de Google

### Funcionalidades principales

| Función | Descripción |
|---------|-------------|
| **Resumen** | Vista general del mes con saldo, ingresos y egresos |
| **Ingresos** | Cargar conceptos de sueldo y calcular neto |
| **Gastos** | Registrar gastos fijos, únicos y cuotas |
| **Pasivos** | Controlar deudas y ver capacidad de cancelación |
| **Deseos** | Simular metas financieras con proyección |
| **Anual** | Ver evolución mensual del saldo |

### Atajos

- **Cambiar mes**: Usar flechas ← → en el selector de mes
- **Replicar ingresos**: Botón en la tarjeta de resumen de sueldo
- **Pasar impagos**: Botón "Pasar Impagos" en gastos
- **Enviar comprobante**: Botón de WhatsApp en gastos

## Tests

```bash
# Ejecutar tests en modo watch
npm test

# Ejecutar tests una vez
npm run test:run

# Ver cobertura de código
npm run test:coverage

# Interfaz visual de tests
npm run test:ui
```

## Estructura del Proyecto

```
control_financiero_app/
├── index.html              # UI principal
├── manifest.json           # Configuración PWA
├── sw.js                   # Service Worker
├── package.json            # Dependencias y scripts
├── vitest.config.js        # Configuración de tests
├── js/
│   ├── app.js              # Lógica principal
│   ├── db.js               # Firebase y persistencia
│   ├── calculos.js         # Cálculos financieros
│   ├── deseos.js           # Simulador de metas
│   ├── notificaciones.js   # Sistema de notificaciones
│   └── utils/
│       ├── fechas.js       # Utilidades de fechas
│       └── id.js           # Generador de IDs únicos
├── tests/
│   ├── calculos.test.js    # Tests de cálculos
│   └── fechas.test.js      # Tests de utilidades
└── docs/                   # Documentación adicional
```

## Seguridad

- ✅ Autenticación con Google OAuth
- ✅ Reglas de Firestore por usuario
- ✅ Sanitización XSS en renderizado
- ✅ Validación de datos de entrada

## Licencia

Uso personal - Claudio
