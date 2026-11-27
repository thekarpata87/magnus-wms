# Magnus WMS DS — sistema de diseño del prototipo

Un WMS tiene **dos productos de UX** (ver investigación, "UX/UI de un WMS"). Compartimos tokens y
semántica de estados, pero cada uno tiene su densidad y patrones:

| | Consola web | Handheld (piso) |
|---|---|---|
| Usuarios | Supervisor, gerente, admin, auditor | Operario, empacador |
| Tema | Claro, denso | Oscuro, alto contraste |
| Texto base | 13–14 px | 18 px (instrucciones 24–44 px) |
| Objetivo táctil | 30–36 px | ≥ 56 px, primario 68 px |
| Entrada | Teclado, ratón, ⌘K | Escaneo (gatillo = teclado + Enter), +/−, teclado numérico propio |
| Archivos | `src/styles/console.css`, `src/ui/kit.tsx` | `src/styles/handheld.css`, `src/mobile/parts.tsx` |

Tokens: `src/styles/tokens.css`.

## Tokens

> Auditado a WCAG 2.1 AA (ver `docs/ACCESSIBILITY.md`). Reglas: el texto de estado usa los tonos `-fg`, los `-dot`
> solo marcas e iconos; los bordes de controles usan `--bd-control` (≥ 3:1); nunca bajar contraste con `opacity`.

- **Neutros** `--n-0 … --n-950` (slate).
- **Marca Magnus Manufactura** `--brand-*`: Oscuro `#1C7C63` (botones, enlaces, foco; 5.11:1 con blanco),
  Base `#2FB896` (acentos sobre fondo oscuro o con texto negro; **nunca texto blanco encima**: 2.49:1),
  Claro `#8FD9C4` (tintes y acentos en el handheld). Negro Magnus `#0F2329` en títulos, menú lateral y tooltips;
  el handheld usa superficies verde-negro derivadas (`#0b1c21`, `#13292f`, `#1a343b`). Logo: `public/magnus-logo.png`.
- **Estados** (idénticos en todo el sistema):

| Estado | Token | Uso |
|---|---|---|
| Pendiente | `--st-pending-*` (gris) | Documento/tarea sin iniciar, pedido nuevo |
| En proceso | `--st-progress-*` (azul) | Liberado, en picking, surtido, empacado |
| Bloqueado | `--st-blocked-*` (rojo) | Excepción, faltante, ubicación bloqueada, atraso |
| Completo | `--st-done-*` (verde) | Enviado, recepción cerrada, conteo ajustado |
| Advertencia | `--warn-*` (ámbar) | **No es estado**: caducidad, bajo mínimo, por aprobar |

- **Escaneo**: `--scan-ok` / `--scan-err` para el flash de pantalla completa.
- Tipografía `--font-sans` / `--font-mono` (todo código — SKU, lote, ubicación, pedido — va en mono).
- Espaciado escala 4 (`--s-1…--s-10`), radios `--r-sm…--r-xl`, elevación `--sh-1…3`, movimiento `--t-fast/med`.

## Componentes (consola)

| Componente | Variantes / props clave | Notas |
|---|---|---|
| `Button` | `primary · secondary · ghost · danger`, `sm · md`, `disabledReason` | Con `disabledReason` queda deshabilitado y muestra un tooltip con el rol requerido (**permisos visibles**). |
| `Pill` | `tone` = estado | Siempre punto + texto: el color nunca es el único portador de significado. |
| `Card` | `title`, `actions`, `pad` | |
| `Stat` | `value`, `target`, `tone`, `onClick` | KPI clicable → drill-down. |
| `Tabs` | `items[{id,label,count}]` | Conteo en cada pestaña. |
| `Drawer` | `wide` | Inspector universal; Esc cierra, foco al abrir. |
| `Modal`, `Toast`, `Progress`, `Code`, `Kbd`, `Avatar`, `Empty` | | `Code` clicable abre el inspector de esa entidad. |

## Componentes (handheld)

| Componente | Propósito |
|---|---|
| `TaskScreen` | Anatomía fija: contexto pequeño + progreso "3 de 12" → instrucción grande → escaneo → cantidad → acción primaria abajo + vía de excepción. |
| `ScanField` | Siempre con foco; acepta escáner USB/Bluetooth (keyboard wedge). En el prototipo muestra botones "Simular gatillo" (correcto/incorrecto). |
| `QtyPad` | +/− de 72 px y teclado numérico propio (sin teclado del sistema). |
| `FeedbackProvider` | Flash verde/rojo a pantalla completa + tono + vibración, distintos para éxito y error. |
| `Steps` | Pasos del flujo (ir → escanear → confirmar). |

## Patrones de navegación

**Consola** — barra lateral agrupada por los bloques de la investigación (Operación · Inventario ·
Control · Configuración) con contadores de trabajo pendiente/alertas; migas; búsqueda universal
**⌘K o /** que acepta cualquier código (EAN, SKU, lote, ubicación, pedido, OC); **Inspector**
lateral con drill-down encadenado KPI → pedido → línea → movimiento → usuario, sin perder la página.

**Handheld** — "Tu siguiente tarea" dirigida por el sistema (prioridad, luego antigüedad) + 6
módulos (Recibir, Ubicar, Surtir, Empacar, Contar, Consultar). Una tarea por pantalla; el escaneo
avanza; las excepciones (Faltante, Dañado, Saltar, Ubicación llena, Etiqueta ilegible) tienen
botón propio y flujo corto sin salir de la tarea.

## Mano dominante y tamaño de letra (handheld)

Preferencias por operario en el dispositivo (`src/mobile/prefs.tsx`), aplicadas como clases en `.hh-root`:

| Elemento | Diestro (`hand-right`) | Zurdo (`hand-left`) | Por qué |
|---|---|---|---|
| Acción primaria | Ancho completo abajo | Igual | Alcanzable con cualquier pulgar |
| Excepción (Faltante, Dañado…) | Izquierda | Derecha | Lejos del pulgar: evita toques accidentales |
| “+” de cantidad | Derecha | Izquierda | La acción frecuente, del lado del pulgar |
| Borrar (⌫) / C | ⌫ derecha, C izquierda | ⌫ izquierda, C derecha | Corregir rápido sin cruzar la pantalla |
| Teclado 1-2-3 | Normal | **No se invierte** | Convención numérica |
| Encabezado y "Volver" | Arriba a la izquierda | Igual | Convención; fuera de la zona del pulgar en ambos |
| Flechas de avance | Apuntan → | Apuntan → (alineadas a la izquierda) | Invertir la flecha se lee como "volver" |

Texto: `text-grande` y `text-extra` redefinen la escala `--fs-*` dentro del handheld; `extra` también sube
`--touch-min` a 64 px y `--touch-primary` a 76 px, y pasa el menú a 2 columnas. El color a pantalla completa
del escaneo no se puede desactivar: es la confirmación que no depende del oído ni del tacto.

## Patrones de andenes y devoluciones

- **Agenda tipo Gantt** por puerta (12 h alrededor de "ahora", línea roja = hora actual). Los estados de cita
  reutilizan la semántica: programada (gris), en patio (ámbar = espera, alerta a los 30 min), en andén (azul), completada (verde).
- **Prevención antes que corrección**: el modal de cita muestra traslapes en vivo y deshabilita "Programar".
- **Handheld Cargar**: escanear guía o pedido; una caja de otro transportista se bloquea con el andén correcto.
- **Handheld Devolver**: inspección con 3 condiciones grandes (borde de color + texto) → disposición sugerida
  (buena→reubicar, defectuosa→cuarentena, dañada→desechar) que el operario puede cambiar.

## Patrones de cumplimiento

- **Recall = acción de alto riesgo**: botón `danger`, permiso propio (Gerente o Auditor), modal con
  **análisis de impacto antes de aplicar** (en racks, en empaque, surtidos que se cancelan, clientes).
- En piso, la tarea de retiro llega como **siguiente tarea urgente** en rojo, con banda "RETENIDO" fija y
  validación de lote por GS1: un lote distinto se rechaza con instrucción ("déjalo en el rack").
- **Re-surtido de pedido retenido**: panel dentro del drawer del pedido (donde ya está el contexto), con
  tabla "se conserva / a cuarentena / reponer desde" y los pasos en lenguaje llano antes del botón. Mientras el
  lote no se retire físicamente, el panel cambia a "Esperando retiro" y el handheld muestra el pedido bloqueado
  (⛔) en Empacar con la razón.
- **Decisión de calidad**: radio con las 3 salidas posibles; la que no aplica queda deshabilitada **con la
  razón en su propia descripción** (p. ej. "Lote en recall RCL-231: no puede volver a stock") y se preselecciona
  la siguiente válida. La nota de inspección es obligatoria y el efecto se explica antes de confirmar.
- **Modo de surtido**: control segmentado (por pedido / lote / zona) con descripción de una línea y una tabla
  comparativa (tareas, paradas, recorrido con % vs. por pedido) para decidir con datos antes de liberar.
- **Carro de contenedores (handheld)**: pantalla "Prepara el carro" con insignias amarillas numeradas por
  contenedor; tras cada línea, paso "Contenedor" en ámbar con el código grande; si la siguiente línea está en
  el mismo bin se omite el escaneo de ubicación y se avisa "Sigues en…".
- **Barra min/max**: relleno verde en rango, ámbar bajo mínimo; una marca vertical oscura señala el mínimo y el
  texto debajo repite los números (la barra es `role="img"` con su lectura completa). Estados de la ubicación:
  urgente (surtidos sin cubrir) › bajo mínimo › en curso › en rango.
- **Gráfica de temperatura** (método dataviz): una serie por sensor en múltiplos pequeños, sin leyenda
  (el título la nombra); línea 2 px; banda neutra del rango permitido con límites punteados; puntos fuera
  de rango en rojo de estado con anillo de superficie y etiqueta "Fuera de rango" en el tooltip (nunca solo
  color); crosshair que salta a la lectura más cercana; la tabla de excursiones es la vista tabular.

## Principios aplicados

1. Escanear en vez de teclear; lo tecleado queda registrado igual que lo escaneado.
2. Color de estado consistente + texto, nunca color solo.
3. Vista previa antes de aplicar (oleadas, reglas).
4. Lo que un rol no puede hacer aparece deshabilitado **con la razón**.
5. Tolerancia a mala conexión: cola offline visible ("3 en cola") que se sincroniza al reconectar.

## Pendientes del sistema

- Fotos reales de producto (hoy son emoji como marcador).
- Prueba con lectores de pantalla reales y con operarios en piso (ver `docs/ACCESSIBILITY.md`).
