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

/**
 * Precio por usuario según volumen. Los tramos y montos son provisionales:
 * falta definir la tabla comercial real.
 */
export const TRAMOS_PRECIO = [
  { hasta: 1,        precioUsuario: 1200 },
  { hasta: 5,        precioUsuario: 1000 },
  { hasta: 15,       precioUsuario: 850 },
  { hasta: 30,       precioUsuario: 700 },
  { hasta: Infinity, precioUsuario: 600 },
] as const

/** Descuento por pago anual: se cobran 10 meses en lugar de 12. */
export const MESES_COBRADOS_ANUAL = 10

export interface Cotizacion {
  usuarios: number
  precioUsuario: number
  totalMensual: number
  totalAnual: number
  ahorroAnual: number
  periodicidad: 'mensual' | 'anual'
  totalPeriodo: number
}

export function cotizar(usuarios: number, periodicidad: 'mensual' | 'anual' = 'mensual'): Cotizacion {
  const n = Math.max(1, Math.floor(usuarios || 1))
  const tramo = TRAMOS_PRECIO.find(t => n <= t.hasta) ?? TRAMOS_PRECIO[TRAMOS_PRECIO.length - 1]
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
