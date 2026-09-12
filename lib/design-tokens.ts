/**
 * Tokens del sistema de diseño — fuente única de verdad.
 * Referencia completa: docs/rediseno/SISTEMA-DISENO.md
 *
 * Antes cada componente de la calculadora definía su propio objeto K con los
 * mismos hexadecimales. Nueve copias del mismo navy significaban que cambiar
 * un color de marca obligaba a editar nueve archivos, y ya había divergencia:
 * unos definían `red` y `redSoft`, otros solo `red`, otros ninguno.
 */

export const K = {
  /* Marca */
  navy900: '#0D2440',   // franjas oscuras, encabezados de tabla
  navy800: '#14375F',   // riel de tabs, numeración de sección
  navy600: '#245287',   // gráficas, cuantía básica
  orange:  '#E8622C',   // acento de marca: acción primaria, tab activo
  orangeSoft: '#FDF0E9',
  gold:    '#F2B544',   // costo, conector, estado borrador

  /* Semánticos — los únicos dos con significado fijo */
  green:     '#12855C', // ganancia, completado
  greenLt:   '#1FA873', // degradado de ganancia
  greenSoft: '#E6F4EE',
  red:       '#B91C1C', // pérdida, bloqueo
  redSoft:   '#FEF2F2',

  /* Auxiliares de categoría — solo para series de datos */
  purple:     '#6D3BD4',
  purpleSoft: '#F3EEFE',
  cyan:       '#0891B2', // Modalidad 10
  amber:      '#B45309',
  amberSoft:  '#FFFBEB',

  /* Neutros */
  paper: '#F5F7FA',
  card:  '#FFFFFF',
  ink:   '#132135',
  muted: '#66738A',
  line:  '#E1E7F0',
} as const

/** Paleta para series de datos, en orden de asignación. */
export const COLORES_SERIE = [K.navy600, K.green, K.orange, K.purple, K.cyan, K.navy800] as const

/** Escala tipográfica: 13 · 15 · 17 · 20 · 26 · 34. */
export const T = {
  label:  13,
  body:   15,
  bodyLg: 17,
  h3:     20,
  h2:     26,
  stat:   34,
} as const

/** Cifra principal de una pantalla: se adapta al ancho disponible. */
export const HERO_FONT_SIZE = 'clamp(40px, 5vw, 64px)'

/* Helpers de estilo en línea, usados en toda la calculadora. */
export const nw = { whiteSpace: 'nowrap' as const }
export const num = { fontVariantNumeric: 'tabular-nums' as const }

/** Tarjeta estándar: borde de 1px, sin barra lateral de color. */
export const tarjeta = {
  background: K.card,
  border: `1px solid ${K.line}`,
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(19,33,53,0.06)',
} as const

/** Degradado de las franjas oscuras. Acepta un color final distinto. */
export const franja = (fin: string = K.navy600) =>
  `linear-gradient(118deg, ${K.navy900} 0%, ${K.navy800} 60%, ${fin} 100%)`

/** Halo naranja de la esquina superior derecha de las franjas. */
export const halo = (color: string = K.orange) => ({
  position: 'absolute' as const,
  width: 460,
  height: 460,
  right: -150,
  top: -190,
  borderRadius: 999,
  pointerEvents: 'none' as const,
  background: `radial-gradient(circle, ${color}33 0%, transparent 68%)`,
})

/** Botón de avance al siguiente paso. */
export const botonPrimario = {
  padding: '13px 24px',
  background: K.orange,
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: `${T.bodyLg}px`,
  fontWeight: 700,
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  boxShadow: '0 3px 10px rgba(232,98,44,0.34)',
} as const

/* ──────────────────────────────────────────────────────────────────────────
   Termómetro de recuperación — fuente única.

   Antes convivían dos criterios con las mismas etiquetas: uno por meses de
   recuperación (Escenarios, Costo Mod. 40) y otro por retorno como múltiplo
   (Proyección). El mismo caso podía decir "Excelente" en una pantalla y
   "Moderada" en otra, sin explicación visible para el asesor.

   Se unifica en meses de recuperación porque es la métrica que el cliente
   puede verificar dentro del primer año. El múltiplo depende de llegar a los
   80 años: es una proyección, y obliga a hablar de esperanza de vida al
   momento de cerrar.

   Umbrales anclados a años cumplidos, no a números redondos arbitrarios.
   El corte de 96 meses funciona como alarma: sobre un horizonte de cobro de
   240 meses (60 → 80 años), recuperar en más de 96 significa que el 40% de
   la vida pensionada se va en pagar la inversión.
   ────────────────────────────────────────────────────────────────────────── */

export interface TramoRecuperacion {
  max: number
  label: string
  color: string
  bg: string
  /** Frase lista para que el asesor la diga frente al cliente. */
  explica: string
}

export const TERMOMETRO_RECUPERACION: TramoRecuperacion[] = [
  { max: 12,       label: 'Excelente',        color: '#059669', bg: '#D1FAE5', explica: 'Recupera lo invertido antes de cumplir un año de pensionado.' },
  { max: 24,       label: 'Muy buena',        color: '#16A34A', bg: '#DCFCE7', explica: 'En dos años ya recuperó toda la inversión.' },
  { max: 48,       label: 'Buena',            color: '#CA8A04', bg: '#FEF9C3', explica: 'Cuatro años para recuperar, y el resto del horizonte es ganancia.' },
  { max: 96,       label: 'Aceptable',        color: '#D97706', bg: '#FEF3C7', explica: 'Ocho años para recuperar. Conviene revisar si hay un escenario más corto.' },
  { max: Infinity, label: 'Requiere análisis', color: '#B91C1C', bg: '#FEE2E2', explica: 'Más de ocho años: casi la mitad de la vida pensionada se va en pagar la inversión.' },
]

/** Horizonte de cobro usado en las líneas de tiempo: 60 → 80 años. */
export const HORIZONTE_MESES = 240

export function getTermometro(mesesRecuperacion: number): TramoRecuperacion {
  return TERMOMETRO_RECUPERACION.find(t => mesesRecuperacion <= t.max)
    ?? TERMOMETRO_RECUPERACION[TERMOMETRO_RECUPERACION.length - 1]
}
