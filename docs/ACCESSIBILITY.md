# Auditoría de accesibilidad: Almacena (consola + handheld)
**Estándar:** WCAG 2.1 AA | **Fecha:** 26 nov 2026 | **Método:** contraste calculado por script, revisión de código, teclado manual en navegador, axe-core 4 en 16 páginas de consola + drawers/modales/paleta y 8 pantallas de handheld.

### Resumen
**Hallazgos:** 24 | **Críticos:** 3 | **Mayores:** 13 | **Menores:** 8 — **todos corregidos**.
Resultado final de axe-core (etiquetas wcag2a/2aa/21a/21aa): **0 violaciones** en todas las pantallas revisadas.

### Hallazgos

#### Perceptible
| # | Hallazgo | Criterio | Severidad | Corrección |
|---|---|---|---|---|
| 1 | Texto atenuado `n-500` sobre `n-50` a 4.32:1 | 1.4.3 | 🟡 Mayor | `n-500` → `#5d6779` (5.31:1; 4.95:1 sobre `n-100`) |
| 2 | Texto `n-400` (metas, ejes, títulos de menú desplegable) a 2.58:1 | 1.4.3 | 🟡 Mayor | Texto usa `n-500`; títulos del menú lateral usan `n-400` sobre fondo oscuro (7.40:1) |
| 3 | Textos de estado `.t-warn/.t-done/.t-progress` usaban el tono "dot" (3.2–4.1:1) | 1.4.3 | 🟡 Mayor | Texto usa tonos `-fg` (7.1–7.7:1); los `-dot` quedan solo para iconos (≥3:1) |
| 4 | Celdas del mapa (ocupación 60–85%, caducidad) y bloque "en andén" con texto blanco a 3.2–4.1:1 | 1.4.3 | 🟡 Mayor | `#2563eb` (5.17), `--warn-solid #b45309` (5.02), `#0369a1` (5.93) |
| 5 | Bordes de campos, botones secundarios y buscador a 1.3:1 | 1.4.11 | 🟡 Mayor | Nuevo token `--bd-control #848fa2` (3.27:1) |
| 6 | Estado de citas en la agenda distinguible solo por color | 1.4.1 | 🟡 Mayor | Icono por estado (calendario/reloj/camión/✓) + borde punteado en "programada" + nombre accesible con estado |
| 7 | Filas atenuadas/terminadas del handheld con `opacity` (3.21:1) | 1.4.3 | 🟡 Mayor | Fondo y borde distintos sin opacidad; texto `hh-muted` (7.66:1) |
| 8 | Etiqueta de lote retenido: blanco sobre `#f43f5e` (3.67:1) | 1.4.3 | 🟢 Menor | Fondo `#be123c` (6.29:1) |
| 9 | Gráfica de temperatura sin alternativa de datos | 1.1.1 | 🟡 Mayor | Descripción con rango y número de lecturas fuera de rango + tabla "Ver lecturas en tabla" |
| 10 | Gráfica de barras del tablero sin texto alternativo | 1.1.1 | 🟢 Menor | `role="img"` con resumen de los 10 valores |
| 11 | Sin reflujo a 320 px (barra lateral fija de 236 px) | 1.4.10 | 🟡 Mayor | <900 px: menú solo con iconos, tablas con scroll propio, KPIs en 2 columnas; sin scroll horizontal de página |

#### Operable
| # | Hallazgo | Criterio | Severidad | Corrección |
|---|---|---|---|---|
| 12 | Filas que abren detalle (10 tablas) solo con ratón | 2.1.1 | 🔴 Crítico | Todas las `tr.clickable` entran en Tab y abren con Enter/Espacio, con nombre ("PED-5002 · María G. · Shopify — abrir detalle") |
| 13 | Drawers y modales sin trampa de foco ni retorno del foco | 2.4.3 / 2.1.2 | 🔴 Crítico | Hook `useDialog`: foco al abrir, Tab cíclico, Esc cierra, el foco vuelve al disparador |
| 14 | Gráfica de temperatura solo con puntero | 2.1.1 | 🟡 Mayor | Enfocable; ←/→/Inicio/Fin recorren lecturas; el tooltip se anuncia (`aria-live`) |
| 15 | Sin enlace para saltar la navegación | 2.4.1 | 🟢 Menor | "Saltar al contenido" visible al recibir foco |
| 16 | Título de pestaña fijo en todas las rutas | 2.4.2 | 🟢 Menor | `Salidas · Almacena`, `Handheld · Almacena`, etc. |
| 17 | Pestañas sin patrón de teclado ARIA | 2.1.1 | 🟢 Menor | Flechas/Inicio/Fin; solo la activa en el orden de Tab |
| 18 | Menú de usuario no cerraba con Esc | 2.1.1 | 🟢 Menor | Esc cierra y regresa el foco al botón |
| 19 | Animaciones sin respeto a `prefers-reduced-motion` | 2.3.3 (AAA, buena práctica) | 🟢 Menor | Animaciones y transiciones a 1 ms |

#### Comprensible
| # | Hallazgo | Criterio | Severidad | Corrección |
|---|---|---|---|---|
| 20 | 4 búsquedas con solo placeholder y 2 selectores sin etiqueta | 3.3.2 | 🟡 Mayor | `aria-label` descriptivo en cada uno |
| 21 | Resultado de escaneo solo en un flash de 0.6–1.5 s | 3.3.1 | 🟡 Mayor | Línea persistente "✓/✕ último escaneo" bajo el campo; flash con `role=alert` (error) / `status` (éxito) |

#### Robusto
| # | Hallazgo | Criterio | Severidad | Corrección |
|---|---|---|---|---|
| 22 | Drawer del inspector sin nombre accesible (título JSX) | 4.1.2 | 🔴 Crítico | `aria-labelledby` + `aria-describedby` al subtítulo |
| 23 | Paleta ⌘K sin semántica de combobox; menú colapsado sin nombres; barras de progreso sin nombre | 4.1.2 | 🟡 Mayor | `role=combobox` + `aria-activedescendant` + conteo anunciado; `aria-label` en enlaces con contador; `aria-label`/`aria-valuetext` en progreso |
| 24 | Botón de usuario: nombre accesible distinto del texto visible; pasos sin estado actual | 2.5.3 / 4.1.2 | 🟢 Menor | Avatar decorativo `aria-hidden` + texto oculto "Cambiar de rol"; `aria-current="step"` en pasos |

### Verificación de contraste (selección)
| Elemento | Primer plano | Fondo | Ratio | Requerido | ¿Pasa? |
|---|---|---|---|---|---|
| Texto base consola | `#1f2533` | `#f5f7fa` | 14.28 | 4.5 | ✅ |
| Texto atenuado | `#5d6779` | `#f5f7fa` | 5.31 | 4.5 | ✅ |
| Pills de estado (5) | `-fg` | `-bg` | 6.37–6.98 | 4.5 | ✅ |
| Botón primario | `#ffffff` | `#4f46e5` | 6.29 | 4.5 | ✅ |
| Borde de control | `#848fa2` | `#ffffff` | 3.27 | 3.0 | ✅ |
| Handheld texto | `#f3f5f9` | `#0b1019` | 17.45 | 4.5 | ✅ |
| Handheld atenuado en tarjeta | `#9aa5b8` | `#1f2838` | 5.95 | 4.5 | ✅ |
| Botón Confirmar handheld | `#022c22` | `#10b981` | 5.97 | 4.5 | ✅ |
| Flash de error | `#ffffff` | rojo 95 % | 5.10 | 4.5 | ✅ |
| Borde del campo de escaneo | `#6366f1` | `#1f2838` | 3.31 | 3.0 | ✅ |

### Teclado (verificado en navegador)
| Elemento | Tab | Enter/Espacio | Esc | Flechas |
|---|---|---|---|---|
| Fila de tabla | Entra en orden | Abre inspector | — | — |
| Inspector / modales | Cíclico dentro | Activa control | Cierra y devuelve foco a la fila | — |
| Paleta ⌘K o `/` | Foco en búsqueda | Abre resultado | Cierra | ↑/↓ resultado activo |
| Pestañas | Solo la activa | — | — | ←/→/Inicio/Fin |
| Gráfica de temperatura | Enfocable | — | — | ←/→ recorre lecturas |
| Handheld | El campo de escaneo recupera el foco | Enter = gatillo | — | — |

### Pendiente (fuera de lo que una auditoría automática y de código puede cubrir)
1. **Prueba con lectores de pantalla reales** (VoiceOver en iOS/macOS, TalkBack en el handheld Android), sobre todo el anuncio del flash y del campo de escaneo con foco permanente.
2. **Prueba con usuarios en piso**: guantes, pantallas sucias, luz de almacén; modo zurdo (botones reubicables) aún no existe.
3. Las filas operables se marcan con JavaScript; en un producto real conviene un componente de tabla con fila-enlace nativa.
