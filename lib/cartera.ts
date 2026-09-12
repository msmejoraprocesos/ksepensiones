/**
 * Lógica de cartera: vigencias, estados de cobranza y cotizador.
 *
 * Separada de la interfaz para poder probarla. Las reglas de negocio de
 * cobranza son de las que más caro sale equivocarse: un error de un día en el
 * cálculo de tolerancia suspende a un cliente que sí pagó.
 */

export type EstadoCartera = 'vigente' | 'por_vencer' | 'en_tolerancia' | 'vencido' | 'sin_contrato'

export const DIAS_AVISO_PREVIO = 15

const DIA = 86_400_000

/** Diferencia en días naturales, ignorando la hora. */
export function diasEntre(desde: Date | string, hasta: Date | string): number {
  const a = new Date(desde), b = new Date(hasta)
  a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / DIA)
}

export interface EstadoCobranza {
  estado: EstadoCartera
  /** Días hasta el vencimiento. Negativo si ya venció. */
  diasRestantes: number
  /** Días de atraso pasada la tolerancia. 0 si no aplica. */
  diasVencido: number
  /** Último día de acceso considerando tolerancia. */
  limiteAcceso: string | null
}

export function evaluarCobranza(
  vigenciaHasta: string | null | undefined,
  diasTolerancia = 5,
  hoy: Date | string = new Date()
): EstadoCobranza {
  if (!vigenciaHasta) {
    return { estado: 'sin_contrato', diasRestantes: 0, diasVencido: 0, limiteAcceso: null }
  }

  const restantes = diasEntre(hoy, vigenciaHasta)
  const limite = new Date(vigenciaHasta)
  limite.setDate(limite.getDate() + diasTolerancia)
  const limiteISO = limite.toISOString().slice(0, 10)
  const trasLimite = diasEntre(limite, hoy)

  if (restantes >= 0) {
    return {
      estado: restantes <= DIAS_AVISO_PREVIO ? 'por_vencer' : 'vigente',
      diasRestantes: restantes, diasVencido: 0, limiteAcceso: limiteISO,
    }
  }
  // Venció, pero el margen de tolerancia todavía cubre el acceso.
  if (trasLimite <= 0) {
    return { estado: 'en_tolerancia', diasRestantes: restantes, diasVencido: 0, limiteAcceso: limiteISO }
  }
  return { estado: 'vencido', diasRestantes: restantes, diasVencido: trasLimite, limiteAcceso: limiteISO }
}

/**
 * Nueva vigencia tras registrar un pago.
 *
 * Se extiende desde la fecha mayor entre la vigencia actual y hoy: así un pago
 * adelantado suma al periodo que corre, y uno tardío no regala los días de
 * atraso como si nunca hubieran pasado.
 */
export function calcularNuevaVigencia(
  vigenciaActual: string | null | undefined,
  periodicidad: 'mensual' | 'anual',
  hoy: Date | string = new Date()
): string {
  const base = new Date(hoy)
  base.setHours(0, 0, 0, 0)
  if (vigenciaActual) {
    const v = new Date(vigenciaActual)
    v.setHours(0, 0, 0, 0)
    if (v > base) base.setTime(v.getTime())
  }
  if (periodicidad === 'anual') base.setFullYear(base.getFullYear() + 1)
  else base.setMonth(base.getMonth() + 1)
  return base.toISOString().slice(0, 10)
}

/* ── Cotizador ──────────────────────────────────────────────────────────── */

export interface TramoPrecio {
  /** Tope de usuarios del tramo. `null` significa "de aquí en adelante". */
  hasta: number | null
  precioUsuario: number
}

/**
 * Tramos por defecto. Se usan solo si no hay nada capturado en la base:
 * los reales se editan desde la interfaz y viven en `tramos_precio`.
 */
export const TRAMOS_DEFAULT: TramoPrecio[] = [
  { hasta: 1,    precioUsuario: 1200 },
  { hasta: 5,    precioUsuario: 1000 },
  { hasta: 15,   precioUsuario: 850 },
  { hasta: 30,   precioUsuario: 700 },
  { hasta: null, precioUsuario: 600 },
]

/** Descuento por pago anual: se cobran 10 meses en lugar de 12. */
export const MESES_COBRADOS_ANUAL = 10

/**
 * Ordena los tramos y garantiza que exista uno abierto al final.
 *
 * Sin el tramo abierto, una cotización de 500 usuarios no encontraría precio.
 * Si el administrador borra el último tramo o deja todos con tope, el mayor
 * se vuelve abierto en lugar de fallar.
 */
export function normalizarTramos(tramos: TramoPrecio[]): TramoPrecio[] {
  const limpios = tramos
    .filter(t => t.precioUsuario >= 0)
    .sort((a, b) => (a.hasta ?? Infinity) - (b.hasta ?? Infinity))
  if (limpios.length === 0) return TRAMOS_DEFAULT
  if (limpios[limpios.length - 1].hasta !== null) {
    limpios[limpios.length - 1] = { ...limpios[limpios.length - 1], hasta: null }
  }
  return limpios
}

/** Valida la coherencia de la tabla antes de guardarla. */
export function validarTramos(tramos: TramoPrecio[]): string[] {
  const errores: string[] = []
  const orden = normalizarTramos(tramos)
  orden.forEach((t, i) => {
    if (t.precioUsuario <= 0) errores.push(`El tramo ${i + 1} no tiene precio.`)
    if (t.hasta !== null && t.hasta <= 0) errores.push(`El tope del tramo ${i + 1} debe ser mayor que cero.`)
    if (i > 0) {
      const prev = orden[i - 1]
      if (t.hasta !== null && prev.hasta !== null && t.hasta === prev.hasta) {
        errores.push(`Dos tramos terminan en ${t.hasta} usuarios.`)
      }
      if (t.precioUsuario > prev.precioUsuario) {
        errores.push(`El tramo ${i + 1} cuesta más por usuario que el anterior: a mayor volumen debería bajar.`)
      }
    }
  })
  return errores
}

export interface Cotizacion {
  usuarios: number
  precioUsuario: number
  totalMensual: number
  totalAnual: number
  ahorroAnual: number
  periodicidad: 'mensual' | 'anual'
  totalPeriodo: number
}

export function cotizar(
  usuarios: number,
  periodicidad: 'mensual' | 'anual' = 'mensual',
  tramos: TramoPrecio[] = TRAMOS_DEFAULT
): Cotizacion {
  const n = Math.max(1, Math.floor(usuarios || 1))
  const orden = normalizarTramos(tramos)
  const tramo = orden.find(t => t.hasta === null || n <= t.hasta) ?? orden[orden.length - 1]
  const totalMensual = tramo.precioUsuario * n
  const totalAnual = totalMensual * MESES_COBRADOS_ANUAL
  return {
    usuarios: n,
    precioUsuario: tramo.precioUsuario,
    totalMensual,
    totalAnual,
    ahorroAnual: totalMensual * 12 - totalAnual,
    periodicidad,
    totalPeriodo: periodicidad === 'anual' ? totalAnual : totalMensual,
  }
}
