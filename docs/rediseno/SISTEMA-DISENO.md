# Sistema de diseño — Calculadora KSE

Base acordada en la sesión de rediseño. Referencia para migrar las 10 pantallas.

## Paleta

| Token | Hex | Uso |
|---|---|---|
| navy900 | `#0D2440` | Encabezado, franjas de datos duros |
| navy800 | `#14375F` | Riel de tabs, numeración de secciones |
| navy600 | `#245287` | Gráficas, cuantía básica |
| orange | `#E8622C` | Acento de marca, tab activo, acción primaria |
| orangeSoft | `#FDF0E9` | Fondo de selección, notas legales |
| gold | `#F2B544` | Conector, costo, estado borrador |
| green | `#12855C` | Ganancia, mejora, completado |
| greenLt | `#1FA873` | Degradado de ganancia |
| paper | `#F5F7FA` | Fondo de aplicación |
| line | `#E1E7F0` | Bordes 1px |
| ink | `#132135` | Texto principal |
| muted | `#66738A` | Texto secundario |

## Tipografía

- **Display** — Sora (700/800): cifras grandes, títulos de sección
- **UI** — Inter (400/500/600/700): todo lo demás
- Escala: 13 · 15 · 17 · 20 · 26 · 34 · hero con `clamp(52px, 6.6vw, 92px)`
- Cifras siempre con `font-variant-numeric: tabular-nums`
- Nunca partir cifras: `white-space: nowrap`

## Reglas

1. **Un solo acento.** El naranja es acción; verde es ganancia; oro es costo. Nada más tiene color propio.
2. **La procedencia del dato** (IMSS / captura / estratégica / calculada) va como punto de 6px con etiqueta, nunca como marco de tarjeta.
3. **Jerarquía por escala y espacio**, no por color.
4. **Una cifra manda por pantalla.** Las demás la acompañan.
5. **Una sola animación por vista**, en la cifra principal. Respetar `prefers-reduced-motion`.
6. **Sin marca de agua en la interfaz.** Solo en el PDF exportado.
7. **Tablas largas llevan su gráfica.** La tabla va debajo o colapsada.

## Navegación

Dos niveles. Riel de tabs en navy con chevrones encadenados y palomita verde en completados; debajo, subtabs del tab activo en blanco con indicador naranja. Barra de acciones fija abajo con la posición global ("Pantalla 4 de 10") y el destino nombrado.

## Etiquetas corregidas

| Antes | Ahora | Motivo |
|---|---|---|
| Tasa de rendimiento · 2474.5% | Retorno sobre lo invertido · 24.7 veces | El Excel lo guarda como múltiplo; el % se confunde con tasa anual |
| Ganancia a 80 años | Ganancia acumulada a los 80 años | Sin horizonte explícito la magnitud no se explica |
| Inversión total | Costo total de Mod. 40 | |
| Recuperación AFORE $X | − $X | Se leía como costo adicional |
| Recuperación · 11 meses | 11 meses para recuperar · 229 meses de ganancia neta | El horizonte hace tangible el retorno |
| PENSIÓN ACTUAL $10,637 | PMG (referencia) | No es la pensión del cliente, es la mínima garantizada |

## Pendientes de paridad

Ver `docs/rediseno/` — ninguna pantalla se migra hasta cubrir todos los campos actuales. Elementos globales que el piloto perdió y hay que reponer: Glosario, selector Mod. 10 / Ley 97, chat flotante Sofía, leyenda de procedencia, columnas anual y aguinaldo en la tabla por edad.
