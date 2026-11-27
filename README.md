# WMS by Magnus Manufactura — prototipo funcional

Prototipo construido a partir de `Investigacion_WMS.pdf` (componentes, flujos, UX/UI y KPIs de un WMS).
Cubre la **Fase 1 (MVP: inventario confiable)** y parte de la **Fase 2 (eficiencia de piso)**.

```bash
npm install
npm run dev        # http://localhost:5173
```

Abre el inicio y elige **Vista dividida** para ver consola y handheld lado a lado: lo que escaneas en el
piso aparece en el tablero al instante. El handheld también funciona en tu celular en la misma red
(`http://<tu-ip>:5173/#/handheld`), aunque cada dispositivo guarda sus propios datos.

Para generar trabajo nuevo en la demo usa **Oleadas → Simular pedidos entrantes** (6 pedidos con SKUs de varias
zonas, como si llegaran de Shopify, Amazon, Mercado Libre o B2B).

## Qué hay

**Consola web** (`#/consola`) — Tablero con KPIs y alertas · Entradas (OC/ASN, cita de andén) · Salidas
(etapas, excepciones, confirmar carga) · Oleadas (agrupación, vista previa, faltantes, asignación y **modo de surtido por pedido, por lote con carro de
contenedores o por zona**, comparando tareas, paradas y recorrido estimado) ·
Tareas (tablero, reasignación) · **Andenes y patio** (agenda por puerta, traslapes, llegada con placas,
asignación de puerta, carga y despacho) · **Devoluciones** (RMA, cuarentena, nota de crédito) · Existencias · Productos · Mapa de ubicaciones (ocupación/ABC/caducidad,
bloqueo) · **Reabasto min/max** (ubicación de picking vs. reserva con tareas FEFO manuales o automáticas al surtir y
liberar oleadas; compras sugeridas por punto de reorden con posición = disponible + en tránsito, redondeo a caja y
creación de OC por proveedor) · Conteos cíclicos con aprobación de ajustes · **Cuarentena y calidad** (decisión documentada por partida:
liberar a stock con tarea de ubicación, devolver al proveedor o dar de baja; retención y liberación de lotes en sitio) · Kardex exportable · Trazabilidad de lote ·
Reportes y KPIs vs. metas · Bitácora · **Cumplimiento** (recall de lote con análisis de impacto previo,
retención automática, **re-surtido de pedidos retenidos** (desempaque, anulación de guía, retiro del lote a
cuarentena y reposición FEFO con vista previa), notificación a clientes con RMA y cierre con disposición; monitoreo de temperatura con
excursiones y evaluación; validador y generador de etiquetas GS1-128/SSCC; bloqueo de lotes vencidos) · Motor de reglas con vista previa · Usuarios y matriz de permisos.

**Handheld** (`#/handheld`) — Inicio de sesión por turno · Siguiente tarea dirigida · Recibir (OC → artículo →
cantidad/lote/caducidad → etiqueta) · Ubicar (putaway sugerido) · Surtir (ruta en serpentina, FEFO,
excepciones; en lote/zona: preparar carro, una sola ruta, sin re-escanear la ubicación compartida y validación del
contenedor de cada pedido) · Empacar (por pedido o escaneando cualquier contenedor del carro; en surtido por zona indica qué contenedores
reunir; validar, caja, báscula, guía) · Contar (a ciegas) · **Reabastecer** picking desde reserva · **Cargar** en andén (valida transportista por caja) · **Devolver** (RMA → inspección →
disposición: reubicar, cuarentena o merma) · **Retirar** lote en recall a cuarentena · Recepción con etiqueta **GS1-128** (lote, caducidad y cantidad
en un escaneo) · Consultar cualquier código (incluye GS1) ·
Modo sin señal con cola · **Preferencias por operario** (mano dominante con layout espejo, tamaño de letra
normal/grande/extra, sonido y vibración), guardadas en el dispositivo y aplicadas al iniciar sesión.

## Arquitectura

```
src/core/types.ts    Modelo de datos (SKU, ubicación, lote, movimiento, documento, tarea, regla)
src/core/engine.ts   Saldos derivados de movimientos, motor de reglas, reducer (único escritor), KPIs
src/core/store.tsx   Estado + persistencia localStorage + sincronización entre pestañas + permisos
src/core/gs1.ts      Parser y generador GS1-128 (AI 00, 01, 10, 17, 21, 37) y dígito verificador
src/data/seed.ts     Datos demo generados pasando acciones reales por el reducer
src/console/         Consola (layout, inspector, páginas)
src/mobile/          App de piso (piezas scan-first y pantallas)
docs/DESIGN_SYSTEM.md
```

Los saldos **nunca se editan**: se calculan de los movimientos inmutables, igual que en la investigación.

## Limitaciones del prototipo

Sin backend ni autenticación real; datos ficticios por navegador (restablécelos desde el menú de usuario).
Integraciones (ERP, e-commerce, paqueterías), RFID, cross-docking y sensores reales (las lecturas de temperatura son simuladas) quedan para fases siguientes.
