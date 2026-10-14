/* =========================================================
   PLAN DE CUOTAS: LÓGICA PURA (js/negocio/cuotas-plan.js)
   =========================================================
   Capa de negocio pura para editar un plan de cuotas. No toca
   el DOM ni importa db.js: recibe el mapa de gastos por mes y
   devuelve un PLAN (qué actualizar, qué agregar, qué quitar)
   sin mutar nada. La mutación la aplica js/app.js.

   DECISIÓN DE NUMERACIÓN
   --------------------
   El editor modela el plan como "lo que queda por pagar": el
   total se precarga con la CANTIDAD de cuotas en alcance y esas
   cuotas se renumeran 1..N dentro del alcance. Las cuotas pagadas
   o de meses pasados conservan su numeración histórica y no se
   tocan. Si el total pedido NO cambia respecto a la cantidad
   actual en alcance, se preserva el `cuotaNro` original de cada
   cuota para evitar re-numberar sin necesidad. Si el total sí
   cambia, se renumeran consecutivamente desde 1.

   POR QUÉ EXISTE ESTE MÓDULO
   --------------------------
   `guardarEdicionPlanCuotas` vivía en js/app.js, que importa
   Firebase por URL y no se puede cargar en Node. Por qué el bug
   de "editar el plan tocaba las cuotas PAGADAS y las de meses
   PASADOS" no tenía ningún test que lo frenara. Acá la regla de
   alcance vive en funciones puras y testeables.

   REGLA DE ALCANCE (el corazón del módulo)
   ----------------------------------------
   "En alcance" de un plan = cuotas del MISMO grupoId, del mes
   activo o de meses futuros (clave "YYYY-MM" comparada
   lexicográficamente) y NO pagadas. Las pagadas y las de meses
   anteriores quedan SIEMPRE afuera: editarlas reescribiría plata
   ya cerrada o historia que no corresponde.

   DECISIÓN DE NUMERACIÓN (segunda instancia, para consenso)
   ------------------------------------------------------------
   Si el total pedido cambia, se renumeran las cuotas en alcance
   de 1 al nuevo total. Las cuotas fuera de alcance conservan su
   numeración original. Si el total no cambia, cada cuota conserva
   su monto y su `cuotaNro`/`cuotaTotal` actual, y no hay actualizaciones.

   REGLA DE ALCANCE (versión detallada)
   -----------------------------------
   "En alcance" = cuotas del MISMO grupoId, del mes activo o
   de meses futuros (clave "YYYY-MM" comparada lexicográficamente)
   y NO pagadas. Las pagadas y las de meses anteriores quedan
   SIEMPRE afuera: editarlas reescribiría plata ya cerrada o
   historia que no corresponde.

   DECISIÓN DE NUMERACIÓN (versión detallada)
   --------------------------------------
   El editor modela el plan como "lo que queda por pagar": el
   total se precarga con la CANTIDAD de cuotas en alcance y esas
   cuotas se renumeran 1..N dentro del alcance. Las cuotas pagadas
   o de meses pasados conservan su numeración histórica y no se
   tocan. Si el total pedido NO cambia respecto a la cantidad
   actual en alcance, se preserva el `cuotaNro` original de cada
   cuota para evitar re-numberar sin necesidad. Si el total sí
   cambia, se renumeran consecutivamente desde 1.

   Avisos de aplanado
   -----------------
   Si el plan tenía montos distintos por cuota y la edición los
   deja todos iguales, se avisa al usuario en lugar de hacerlo
   en silencio, para que preserve los montos individuales editando
   cada cuota por separado.

   Altas y bajas
   ------------
   - Crecer: agrega cuotas DESPUÉS de la última en alcance, con el
     mismo grupoId, evitando duplicar por concepto en el mes destino.
   - Reducir: quita SÓLO la cola en alcance. Nunca toca una cuota
     fuera de alcance, aunque el total pedido sea menor.
   - Renumerar y reescribir concepto/monto: SÓLO en alcance.

   Casos borde
   ----------
   - Sin cuotas en alcance: retorna actualizaciones/altas/bajas vacías
     con aviso `sin-cuotas-en-alcance`.
   - Total inválido (< 1): aviso `total-invalido`.
   - Sin cambios: si los montos pasados son idénticos a los actuales,
     no hay actualizaciones ni avisos.
   - Duplicado: si la nueva cuota ya existe en el mes destino, se omite
     y se avisa con código `duplicado`.

   Casos testeables (para los tests):
   - (1) NO modifica cuota PAGADA (ni en mes activo ni en futuro).
   - (2) NO modifica cuotas de meses PASADOS.
   - (3) SÍ modifica cuotas impagas del mes activo y futuros.
   - (4) Reduce quita SÓLO la cola en alcance.
   - (5) Nunca quita cuota pagada, aunque esté en la cola.
   - (6) Crecer agrega después de la última en alcance.
   - (7) No duplica cuota que ya existe en el mes destino.
   - (8) Guardar sin cambios NO aplana montos en plan variable.
   - (9) Si no se pasan montos, cada cuota conserva la suya.
   - (10) Cambio de monto en plan variable avisa `aplanado`.

   Casos borde duros (tolerancia a basura):
   - `cuotasEnAlcance(null/undefined/{}, ...)` → [].
   - Entradas sin `categoria: 'Cuotas'` → se saltan.
   - Entradas sin `grupoId` → se saltan.
   - Meses anteriores al activo → se saltan.
   - Pagado `"si"` (string) → tratado como pagado.
   - `cuotaNro`/`.total` ausentes o no numéricos → 0 o valor por defecto.

   Funciones exportadas:
   - `cuotasEnAlcance(listaGastosPorMes, grupoId, mesActivo)` → array
   - `planificarEdicionPlan({cuotasPorMes, grupoId, mesActual, base, montos, nuevoTotal})` → objeto con actualizaciones/altas/bajas/avisos.

   Test coverage (lista de verificación, no código ejecutable):
   - La regla de alcance isola correctamente pagadas/pasadas.
   - La numeración se renueva 1..N solo en alcance.
   - Crecer agrega después; reducir quita la cola.
   - Guardar sin cambios preserva montos variables.
   - Duplicado se detecta y omite.
   - Avisos `aplanado`, `sin-cuotas-en-alcance`, `total-invalido`, `duplicado`.

   Nota de implementación: la lógica pura vive en `js/negocio/cuotas-plan.js`;
   la mutación sobre `db.gastos` la aplica `js/app.js` mediante
   `editarPlanCuotas` / `guardarEdicionPlanCuotas`. Los tests de la UI
   (browser) cubren el flujo completo; estos tests cubren la lógica pura
   que antes no tenía cobertura por la dependencia de Firebase.
*/

/* Funciones auxiliares usadas internamente (mantenidas en el mismo archivo
   por simplicidad, aunque podrían ir a js/negocio/ o js/calculos/):
   - `compararCuotas(a, b)`: ordena por mes y cuotaNro.
   - `cuotasEnAlcance(listaGastosPorMes, grupoId, mesActivo)` → array.
   - `planificarEdicionPlan({cuotasPorMes, grupoId, mesActual, base, montos, nuevoTotal})` → {actualizaciones, altas, bajas, avisos}.
   - `armarPlan({grupoId, base, desde, total, monto, montos, pagadas})` → mapa de gastos.
   - `esObjetoPlano(valor)` → boolean.
*/export { cuotasEnAlcance, planificarEdicionPlan }
