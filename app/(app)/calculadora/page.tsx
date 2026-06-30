'use client'

import { useEffect, useState, useRef, Suspense, Fragment } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { pdf } from '@react-pdf/renderer'
import { DiagnosticoPDF } from '@/app/utils/DiagnosticoPDF'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F05B21'
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

// ── Design System ──────────────────────────────────────────────────
const DS = {
  txt: { xs: '10px', sm: '11px', base: '12px', md: '13px', lg: '14px', xl: '16px', h: '18px' },
  col: { azul: '#1B3A6B', verde: '#2E8B57', naranja: '#F05B21', gris: '#6B7280', borde: '#D1D5DB', bg: '#F9FAFB', bgAlt: '#F4F6FB' },
  sp: { xs: '4px', sm: '6px', md: '10px', lg: '14px', xl: '20px' },
  card: { background: 'white', border: '1px solid #E5E7EB', padding: '16px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as React.CSSProperties,
  cardHighlight: { background: 'white', border: '2px solid #1B3A6B', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(27,58,107,0.08)' } as React.CSSProperties,
  tHead: { background: '#1B3A6B', color: 'white', padding: '9px 12px', fontSize: '11px', fontWeight: '700' as const, textAlign: 'left' as const, whiteSpace: 'nowrap' as const },
  tHeadR: { background: '#1B3A6B', color: 'white', padding: '9px 12px', fontSize: '11px', fontWeight: '700' as const, textAlign: 'right' as const, whiteSpace: 'nowrap' as const },
  tCell: { padding: '8px 12px', fontSize: '12px', color: '#374151', borderBottom: '1px solid #F3F4F6' } as React.CSSProperties,
  tCellR: { padding: '8px 12px', fontSize: '12px', color: '#374151', borderBottom: '1px solid #F3F4F6', textAlign: 'right' as const } as React.CSSProperties,
  tCellBold: { padding: '8px 12px', fontSize: '13px', color: '#1B3A6B', fontWeight: '800' as const, borderBottom: '1px solid #F3F4F6', textAlign: 'right' as const } as React.CSSProperties,
  tRowAlt: (i: number) => ({ background: i % 2 === 0 ? 'white' : '#F8FAFC' }) as React.CSSProperties,
  secTitle: { fontSize: '13px', fontWeight: '700' as const, color: '#111827', margin: '0 0 14px', paddingBottom: '10px', borderBottom: '2px solid #E5E7EB' } as React.CSSProperties,
  kpiBlock: { background: '#1B3A6B', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } as React.CSSProperties,
  kpiGreen: { background: '#065F46', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } as React.CSSProperties,
  label: { fontSize: '10px', fontWeight: '600' as const, color: '#9CA3AF', marginBottom: '4px', display: 'block' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  input: { width: '100%', border: '1px solid #9CA3AF', padding: '7px 10px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: 'white', color: '#374151', outline: 'none' } as React.CSSProperties,
  inputReadonly: { width: '100%', border: '1px solid #E5E7EB', padding: '7px 10px', fontSize: '13px', background: '#F9FAFB', color: '#6B7280', fontFamily: 'inherit', boxSizing: 'border-box' as const } as React.CSSProperties,
  select: { width: '100%', border: '1px solid #9CA3AF', padding: '7px 10px', fontSize: '13px', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' as const } as React.CSSProperties,
  criticalNum: { fontSize: '28px', fontWeight: '900' as const, letterSpacing: '-1px', lineHeight: 1 } as React.CSSProperties,
  bigNum: { fontSize: '22px', fontWeight: '800' as const, letterSpacing: '-0.5px' } as React.CSSProperties,
}
// ──────────────────────────────────────────────────────────────────

const FACTOR_CESANTIA: Record<number, number> = { 60: 0.75, 61: 0.80, 62: 0.85, 63: 0.90, 64: 0.95 }

interface SysVars {
  UMA_DIARIA: number
  SALARIO_MIN: number
  PMG_L73: number
  PMG_L97: number
  RENDIMIENTO_DEFAULT: number
  mod40_pct?: number
  pct_afore_mod40?: number
  pct_banco_regulado?: number   // FINANCIAMIENTO!C10
  tasa_banco_anual?: number     // FINANCIAMIENTO!G32
}

interface Cliente { id: string; nombre: string; etapa_kanban?: string; telefono?: string; tipo_servicio?: string }
interface Financiera { id: string; nombre: string; tasa_anual: number; plazo_min: number; plazo_max: number; monto_min: number; monto_max: number; comision_apertura: number; seguro_mensual: number; contacto_nombre: string | null; contacto_email: string | null; contacto_telefono: string | null }

interface PeriodoSalarial {
  id: string
  fecha_inicio: string
  fecha_fin: string
  sdi: number
  semanas: number
  peso: number
}

interface DatosGenerales {
  nombre: string
  nombre_trabajador: string
  fecha_calculo: string
  fecha_nacimiento: string
  edad_actual: number
  semanas_totales: number
  semanas_descontadas: number
  sigue_cotizando: boolean
  tiene_conyuge: boolean
  num_hijos: number
  num_padres: number
  tiene_ayuda_asistencial: boolean   // Art. 165 LSS — aplica solo sin cónyuge, hijos ni padres
  edad_min_pension: number           // DATOS GEN.!E6 — configurable por asesor (60-65)
  ley: '73' | '97' | ''
  nss: string
}

interface Escenario {
  id: string
  label: string
  descripcion: string
  // Modalidad 40
  mod40_meses: number
  mod40_umas: number
  // Pensión base (sin Mod40) — antes llamado sdi_base (nombre confuso)
  pension_base: number               // Datos-proyecto!C6 — pensión mensual actual SIN Mod40
  // Pensión mejorada (con Mod40)
  pension_mensual: number            // Datos-proyecto!C7
  costo_total: number                // Datos-proyecto!C12 — costo bruto antes de AFORE
  costo_mensual_mod40: number        // Costo Escenario!H8-H12 promedio
  incremento_vs_base: number         // Datos-proyecto!C38
  roi_meses: number                  // Datos-proyecto!C21
  recomendado: boolean
  pmg_aplica?: boolean
  // Campos adicionales del Excel (Datos-proyecto)
  fecha_ingreso_mod40: string        // Datos-proyecto!C13
  fecha_baja_mod40: string           // Datos-proyecto!C15
  edad_retiro: number                // Datos-proyecto!C16
  semanas_finales: number            // Datos-proyecto!C17
  nuevo_sdi_250: number              // Datos-proyecto!C18
  recuperacion_afore: number         // Datos-proyecto!C19 (~20% del costo total)
  inversion_neta: number             // Datos-proyecto!C20 = costo_total - recuperacion_afore
  ganancia_a80: number               // Datos-proyecto!C22
  tasa_rendimiento: number           // Datos-proyecto!C23
  aguinaldo_anual: number            // Datos-proyecto!C24
  // Retroactivo
  costo_retroactivo: number          // Datos-proyecto!C25
  recuperacion_afore_retro: number   // Datos-proyecto!C26
  inversion_neta_retro: number       // Datos-proyecto!C27
  roi_retro: number                  // Datos-proyecto!C28
  ganancia_a80_retro: number         // Datos-proyecto!C29
  tasa_rendimiento_retro: number     // Datos-proyecto!C30
  // Financiamiento
  aportacion_banco: number           // Datos-proyecto!C33
  aportacion_segundo_fondeo: number  // Datos-proyecto!C34
  cantidad_minima_afore: number      // Datos-proyecto!C35 (SEGUNDO FONDEADOR!C9)
  descuento_mensual: number          // Datos-proyecto!C39
  pension_inmediata: number          // Datos-proyecto!C40
  pension_al_liquidar: number        // Datos-proyecto!C41
  roi_financiado: number             // Datos-proyecto!C42
  ganancia_a80_financiado: number    // Datos-proyecto!C43
  tasa_rendimiento_financiado: number // Datos-proyecto!C44
  semanas_mod40: number              // DATOS GEN. MOD 40!C7
  sdi_mod40: number                  // SDI en UMAs proyectado al año de inicio
  // Retroactivo desglosado
  actualizaciones: number            // PAGO RETROACTIVO!E9
  recargos: number                   // PAGO RETROACTIVO!E10
  // Financiamiento desglosado
  duracion_tramite_meses: number     // FINANCIAMIENTO!B15
  plazo_segundo_fondeo: number       // SEGUNDO FONDEADOR!C4
  costo_financiamiento_banco: number // intereses del crédito bancario
  costo_financiamiento_segundo: number // SEGUNDO FONDEADOR!C5
  monto_maximo_pago: number          // SEGUNDO FONDEADOR!C6
}

interface AnalisisSeccion {
  titulo: string
  contenido: string
}

// Tabla oficial Art. 167 LSS — % de cuantía básica e incremento anual según el salario
// proporcional en veces-UMA (SDI promedio ÷ UMA diaria). Fuente: hoja '1' del Excel de referencia.
// ── PAGO RETROACTIVO (recargos + actualizaciones) — tasas extraídas del Excel de referencia validado ──
// Actualización (INPC) mensual por año en que cayó el mes adeudado
const TASA_ACTUALIZACION_MENSUAL_POR_ANIO: Record<number, number> = {
  2019: 0.0030333, 2020: 0.002625, 2021: 0.005, 2022: 0.0065166, 2023: 0.0038833, 2024: 0.0043,
}
const TASA_ACTUALIZACION_MENSUAL_DEFAULT = 0.0036 // años > 2024
// Recargos mensuales: 1.47% antes de 2026, 2.07% desde 2026 (tasas vigentes en el Excel de referencia)
function tasaRecargoMensual(anio: number) { return anio < 2026 ? 0.0147 : 0.0207 }
function tasaActualizacionMensual(anio: number) { return TASA_ACTUALIZACION_MENSUAL_POR_ANIO[anio] ?? TASA_ACTUALIZACION_MENSUAL_DEFAULT }

// Calcula el costo retroactivo de Modalidad 40: para cada mes adeudado, el monto se actualiza por
// inflación y se le suman recargos en proporción a cuántos meses lleva vencido (interés simple),
// usando la tasa de cada año calendario en que cayó ese mes — replica la metodología del Excel.
function calcPagoRetroactivo(mesesAdeudados: number, fechaBaja: Date, mod40Umas: number, sys: SysVars, getMod40PctFn: (anio: number) => number) {
  let totalActualizacion = 0
  let totalRecargos = 0
  let costoBase = 0
  for (let i = 1; i <= mesesAdeudados; i++) {
    const fechaMes = new Date(fechaBaja)
    fechaMes.setMonth(fechaMes.getMonth() - i)
    const anioMes = fechaMes.getFullYear()
    const umaDelAnio = proyectarValor(sys.UMA_DIARIA, new Date().getFullYear(), anioMes)
    const costoMensual = calcCostoMod40(mod40Umas, getMod40PctFn(anioMes), { ...sys, UMA_DIARIA: umaDelAnio })
    costoBase += costoMensual
    totalActualizacion += costoMensual * i * tasaActualizacionMensual(anioMes)
    totalRecargos += costoMensual * i * tasaRecargoMensual(anioMes)
  }
  const costoTotal = costoBase + totalActualizacion + totalRecargos
  const pctIncremento = costoBase > 0 ? (totalActualizacion + totalRecargos) / costoBase : 0
  const recuperaAfore = costoTotal * 0.20
  const costoNeto = costoTotal - recuperaAfore
  return { costoBase, totalActualizacion, totalRecargos, costoTotal, pctIncremento, recuperaAfore, costoNeto }
}

const TABLA_CUANTIA_UMA: { min: number; max: number; basica: number; incremento: number }[] = [
  { min: 0,    max: 1.00, basica: 0.80,   incremento: 0.00563 },
  { min: 1.01, max: 1.25, basica: 0.7711, incremento: 0.00814 },
  { min: 1.26, max: 1.50, basica: 0.5818, incremento: 0.01178 },
  { min: 1.51, max: 1.75, basica: 0.4923, incremento: 0.0143 },
  { min: 1.76, max: 2.00, basica: 0.4267, incremento: 0.01615 },
  { min: 2.01, max: 2.25, basica: 0.3765, incremento: 0.01756 },
  { min: 2.26, max: 2.50, basica: 0.3368, incremento: 0.01868 },
  { min: 2.51, max: 2.75, basica: 0.3048, incremento: 0.01958 },
  { min: 2.76, max: 3.00, basica: 0.2783, incremento: 0.02033 },
  { min: 3.01, max: 3.25, basica: 0.256,  incremento: 0.02096 },
  { min: 3.26, max: 3.50, basica: 0.237,  incremento: 0.02149 },
  { min: 3.51, max: 3.75, basica: 0.2207, incremento: 0.02195 },
  { min: 3.76, max: 4.00, basica: 0.2065, incremento: 0.02235 },
  { min: 4.01, max: 4.25, basica: 0.1939, incremento: 0.02271 },
  { min: 4.26, max: 4.50, basica: 0.1829, incremento: 0.02302 },
  { min: 4.51, max: 4.75, basica: 0.173,  incremento: 0.0233 },
  { min: 4.76, max: 5.00, basica: 0.1641, incremento: 0.02355 },
  { min: 5.01, max: 5.25, basica: 0.1561, incremento: 0.02377 },
  { min: 5.26, max: 5.50, basica: 0.1488, incremento: 0.02398 },
  { min: 5.51, max: 5.75, basica: 0.1422, incremento: 0.02416 },
  { min: 5.76, max: 6.00, basica: 0.1362, incremento: 0.02433 },
  { min: 6.01, max: Infinity, basica: 0.13, incremento: 0.0245 },
]
function buscarCuantiaPorUMA(vecesUMA: number) {
  const fila = TABLA_CUANTIA_UMA.find(f => vecesUMA <= f.max) ?? TABLA_CUANTIA_UMA[TABLA_CUANTIA_UMA.length - 1]
  return fila
}
// Factor 1.11 (111%): se aplica de forma consistente en todo el Excel de referencia a la
// cuantía básica, incrementos, asignaciones y pensión mínima garantizada. No hay nota que
// explique su origen exacto en el archivo, pero se replica tal cual por ser la metodología validada.
const FACTOR_111 = 1.11
// Días de aguinaldo (Art. 171 LSS 1973)
const DIAS_AGUINALDO = 15

// ── FÓRMULAS OFICIALES (Art. 167-171 LSS) — replica fiel del Excel de referencia ──────────
function calcPensionLey73(semanas: number, sdi: number, edadRetiro: number, sys: SysVars, tieneConyuge: boolean, numHijos: number, numPadres: number, anioRetiro?: number, tieneAyudaAsistencial = false): { monto: number; pmg_aplica: boolean; pensionMensual: number; pensionAnual: number; cuantiaBasicaAnual: number; incrementosAnual: number; asignacionesAnual: number; ayudaAsistencialAnual: number; aguinaldoAnual: number; factorEdad: number; vecesUMA: number; pctBasica: number; pctIncremento: number; numIncrementos: number } {
  if (semanas < 500) return { monto: 0, pmg_aplica: false, pensionMensual: 0, pensionAnual: 0, cuantiaBasicaAnual: 0, incrementosAnual: 0, asignacionesAnual: 0, ayudaAsistencialAnual: 0, aguinaldoAnual: 0, factorEdad: 0, vecesUMA: 0, pctBasica: 0, pctIncremento: 0, numIncrementos: 0 }

  const vecesUMA = sdi / sys.UMA_DIARIA
  const { basica: pctBasica, incremento: pctIncremento } = buscarCuantiaPorUMA(vecesUMA)

  const cuantiaBasicaAnual = sdi * pctBasica * 365

  // Número de incrementos anuales (Art. 167 LSS, redondeo oficial)
  const numIncrementosCrudo = (semanas - 500) / 52
  const numIncrementos = Math.floor(numIncrementosCrudo) +
    (numIncrementosCrudo % 1 >= 27 / 52 ? 1 : numIncrementosCrudo % 1 >= 13 / 52 ? 0.5 : 0)
  const incrementoAnual = sdi * pctIncremento * 365
  const incrementosTotalAnual = incrementoAnual * numIncrementos

  const cuantiaTotalRaw = cuantiaBasicaAnual + incrementosTotalAnual // sin ×1.11 ni %edad — base para asignaciones
  const factorEdad = FACTOR_EDAD_RETIRO[edadRetiro] ?? 1.0

  const baseConFactorYEdad = (cuantiaBasicaAnual + incrementosTotalAnual) * FACTOR_111 * factorEdad

  // Asignaciones familiares (15% cónyuge + 10% por hijo + 10% por padre dependiente, sobre la cuantía total cruda)
  const hayBeneficiarios = tieneConyuge || numHijos > 0
  const asignConyuge = tieneConyuge ? cuantiaTotalRaw * 0.15 : 0
  const asignHijos = numHijos > 0 ? cuantiaTotalRaw * 0.10 * numHijos : 0
  const asignPadres = (!hayBeneficiarios && numPadres > 0) ? cuantiaTotalRaw * 0.10 * numPadres : 0
  const asignaciones = (asignConyuge + asignHijos + asignPadres) * FACTOR_111 * factorEdad

  // Ayuda asistencial (Art. 165 LSS — solo si no hay cónyuge, hijos, ni padres, Y el campo fue marcado por el asesor)
  const sinBeneficiarios = !tieneConyuge && numHijos === 0 && numPadres === 0
  const soloUnPadre = !tieneConyuge && numHijos === 0 && numPadres === 1
  const pctAyuda = tieneAyudaAsistencial && sinBeneficiarios ? 0.15 : tieneAyudaAsistencial && soloUnPadre ? 0.10 : 0
  const ayudaAsistencial = pctAyuda > 0
    ? Math.max(0, Math.min(
        cuantiaTotalRaw * pctAyuda * FACTOR_111 * factorEdad,
        Math.max(0, sys.UMA_DIARIA * 25 * 365 - (baseConFactorYEdad + asignaciones)),
        sdi * 365 * FACTOR_111 - (baseConFactorYEdad + asignaciones)
      ))
    : 0

  const totalAnual = baseConFactorYEdad + asignaciones + ayudaAsistencial
  const pensionMensual = totalAnual / 12

  // PMG — proyectada al año de retiro. Importante: la PMG NO se reduce por el factor de edad/cesantía
  // (es la misma a los 60 que a los 65), a diferencia de la pensión calculada.
  const pmgBase = anioRetiro ? proyectarValor(sys.PMG_L73, new Date().getFullYear(), anioRetiro) : sys.PMG_L73
  const pmg_aplica = pmgBase > pensionMensual
  const montoFinal = Math.max(pmgBase, pensionMensual)

  const cuantiaBasicaAnualFinal = cuantiaBasicaAnual * FACTOR_111 * factorEdad
  const incrementosAnualFinal = incrementosTotalAnual * FACTOR_111 * factorEdad
  const aguinaldoAnual = montoFinal * DIAS_AGUINALDO / 30

  return {
    monto: montoFinal,
    pmg_aplica,
    pensionMensual: montoFinal,
    pensionAnual: montoFinal * 12,
    cuantiaBasicaAnual: cuantiaBasicaAnualFinal,
    incrementosAnual: incrementosAnualFinal,
    asignacionesAnual: asignaciones,
    ayudaAsistencialAnual: ayudaAsistencial,
    aguinaldoAnual,
    factorEdad,
    vecesUMA: sdi / sys.UMA_DIARIA,
    pctBasica,
    pctIncremento,
    numIncrementos
  }
}

// Edad exacta desglosada en años, meses, días, horas, minutos y segundos a partir de la fecha de nacimiento
function edadDetallada(fechaNac: string, ahora: number): { anios: number; meses: number; dias: number; horas: number; minutos: number; segundos: number } | null {
  if (!fechaNac) return null
  const nac = new Date(fechaNac + 'T00:00:00')
  const now = new Date(ahora)
  if (isNaN(nac.getTime())) return null

  let anios = now.getFullYear() - nac.getFullYear()
  let meses = now.getMonth() - nac.getMonth()
  let dias = now.getDate() - nac.getDate()
  let horas = now.getHours() - nac.getHours()
  let minutos = now.getMinutes() - nac.getMinutes()
  let segundos = now.getSeconds() - nac.getSeconds()

  if (segundos < 0) { segundos += 60; minutos-- }
  if (minutos < 0) { minutos += 60; horas-- }
  if (horas < 0) { horas += 24; dias-- }
  if (dias < 0) {
    const diasMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
    dias += diasMesAnterior
    meses--
  }
  if (meses < 0) { meses += 12; anios-- }

  return { anios, meses, dias, horas, minutos, segundos }
}

function calcPromedioSalarial250(periodos: PeriodoSalarial[]): number {
  if (!periodos.length) return 0
  const totalSem = periodos.reduce((s, p) => s + p.semanas, 0)
  if (totalSem === 0) return 0
  return periodos.reduce((s, p) => s + p.sdi * p.semanas, 0) / totalSem
}

function calcCostoMod40(umasSalario: number, pctMod40: number, sys: SysVars): number {
  const sdIMod40 = umasSalario * sys.UMA_DIARIA * 30.4
  return sdIMod40 * (pctMod40 / 100)
}

function calcCorrida(capital: number, tasaAnual: number, plazo: number) {
  const tm = tasaAnual / 100 / 12
  const cuota = tm > 0 ? capital * (tm * Math.pow(1+tm,plazo)) / (Math.pow(1+tm,plazo)-1) : capital/plazo
  const rows: {mes:number;cuota:number;capital:number;interes:number;saldo:number}[] = []
  let saldo = capital
  for (let i = 1; i <= plazo; i++) {
    const interes = saldo * tm
    const cap = cuota - interes
    saldo = Math.max(0, saldo - cap)
    rows.push({ mes: i, cuota, capital: cap, interes, saldo })
  }
  return { cuota, totalPagado: cuota * plazo, rows }
}

function calcConservacion(semanas: number, mesesDesdeUltimaCot: number): { vigente: boolean; indefinida: boolean; venceEn: number | null; semanasConservacion: number } {
  // Art. 183 LSS 1973: La conservación de derechos equivale a 1/4 del total de semanas cotizadas
  // contado a partir de la última baja. No hay mínimo de semanas para la fórmula, pero sí para pensión (500 sem).
  // Fórmula: semanas_conservacion = semanas_cotizadas / 4
  // Las semanas se convierten a meses para comparar con mesesDesdeUltimaCot
  const semanasConservacion = Math.floor(semanas / 4)
  const mesesConservacion = Math.round(semanasConservacion / 4.33)
  const mesesRestantes = mesesConservacion - mesesDesdeUltimaCot
  const vigente = mesesRestantes > 0
  return {
    vigente,
    indefinida: false, // La Ley 73 no establece conservación indefinida
    venceEn: vigente ? Math.max(0, mesesRestantes) : 0,
    semanasConservacion,
  }
}

// ── PROYECCIÓN DE VARIABLES ─────────────────────────────────────────
function proyectarValor(base: number, anioBase: number, anioTarget: number, inpc = 0.04): number {
  if (anioTarget <= anioBase) return base
  let v = base
  for (let a = anioBase + 1; a <= anioTarget; a++) v *= (1 + inpc)
  return v
}

// Tabla de cuantía de pensión por edad (Ley 73)
const TABLA_CUANTIA = [
  { semanas: 500, pct: 35, descripcion: 'Mínimo para pensionarse' },
  { semanas: 552, pct: 36.25, descripcion: '+1 año (52 sem.)' },
  { semanas: 604, pct: 37.5, descripcion: '+2 años' },
  { semanas: 656, pct: 38.75, descripcion: '+3 años' },
  { semanas: 708, pct: 40, descripcion: '+4 años' },
  { semanas: 760, pct: 41.25, descripcion: '+5 años' },
  { semanas: 812, pct: 42.5, descripcion: '+6 años' },
  { semanas: 864, pct: 43.75, descripcion: '+7 años' },
  { semanas: 916, pct: 45, descripcion: '+8 años' },
  { semanas: 968, pct: 46.25, descripcion: '+9 años' },
  { semanas: 1020, pct: 47.5, descripcion: '+10 años (1020 sem.)' },
]

const FACTOR_EDAD_RETIRO: Record<number, number> = {
  60: 0.75, 61: 0.80, 62: 0.85, 63: 0.90, 64: 0.95, 65: 1.0,
  66: 1.0, 67: 1.0, 68: 1.0, 69: 1.0, 70: 1.0,
}

// ── DEFAULTS ────────────────────────────────────────────────────────
const DEFAULT_DATOS: DatosGenerales = {
  nombre: '',
  nombre_trabajador: '', fecha_calculo: new Date().toISOString().split('T')[0],
  fecha_nacimiento: '', edad_actual: 0, semanas_totales: 0,
  semanas_descontadas: 0, sigue_cotizando: true, tiene_conyuge: false,
  num_hijos: 0, num_padres: 0, tiene_ayuda_asistencial: false,
  edad_min_pension: 60, ley: '', nss: ''
}

const SYS_DEFAULT: SysVars = {
  UMA_DIARIA: 117.31, SALARIO_MIN: 315.04,
  PMG_L73: 10636.54, PMG_L97: 4345.72,
  RENDIMIENTO_DEFAULT: 6, mod40_pct: 14.438, pct_afore_mod40: 20
}

function CalculadoraInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)
  const [userId, setUserId] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [financieras, setFinancieras] = useState<Financiera[]>([])
  const [sys, setSys] = useState<SysVars>(SYS_DEFAULT)
  const [mod40PctPorAnio, setMod40PctPorAnio] = useState<Record<number, number>>({ 2026: 14.438, 2027: 15.528, 2028: 16.619, 2029: 17.709, 2030: 18.800 })
  // Tasa Mod 40 real para un año dado: usa la tabla configurada en Configuración (refleja el ajuste de enero/UMA cada año);
  // si el año pedido es posterior al último configurado, extrapola +1%/año desde el último valor conocido (mismo criterio que antes).
  function getMod40Pct(anio: number): number {
    if (mod40PctPorAnio[anio] != null) return mod40PctPorAnio[anio]
    const anios = Object.keys(mod40PctPorAnio).map(Number).sort((a, b) => a - b)
    const ultimoAnio = anios[anios.length - 1]
    const ultimoPct = mod40PctPorAnio[ultimoAnio] ?? (sys.mod40_pct ?? 14.438)
    if (anio > ultimoAnio) return Math.min(18.8, ultimoPct + (anio - ultimoAnio) * 1)
    const primerAnio = anios[0]
    return mod40PctPorAnio[primerAnio] ?? (sys.mod40_pct ?? 14.438)
  }
  const [clienteId, setClienteId] = useState('')

  // Tab state
  const [tab, setTab] = useState(0)
  // ── Glosario de términos ─────────────────────────────────────
  const GLOSARIO: Record<string, { titulo: string; desc: string; ejemplo?: string }> = {
    sdi: { titulo: 'SDI — Salario Diario Integrado', desc: 'El salario real que considera IMSS para el cálculo de la pensión. Incluye sueldo base, partes proporcionales de aguinaldo, vacaciones y prima vacacional.', ejemplo: 'Si ganas $15,000/mes tu SDI diario es aprox. $547/día.' },
    sdi250: { titulo: 'SDI Promedio 250 Semanas', desc: 'El IMSS calcula la pensión sobre el promedio del SDI de las últimas 250 semanas cotizadas (~5 años), no sobre el salario actual. Si en esos 5 años tu salario fue menor, tu pensión será menor.', ejemplo: 'Art. 167 LSS 1973.' },
    mod40: { titulo: 'Modalidad 40', desc: 'Permite cotizar voluntariamente ante el IMSS con un salario mayor al actual para incrementar el promedio de las 250 semanas. Es el instrumento clave para mejorar la pensión.', ejemplo: 'Se puede cotizar entre 1 y 25 UMAs diarias.' },
    uma: { titulo: 'UMA — Unidad de Medida y Actualización', desc: 'Es la referencia económica en pesos que actualiza el IMSS anualmente. En 2024 es $108.57/día. En Modalidad 40, cotizas en múltiplos de UMA.', ejemplo: 'Cotizar a 10 UMAs = $1,085.70/día de SDI registrado.' },
    pmg: { titulo: 'PMG — Pensión Mínima Garantizada', desc: 'El Estado garantiza que ningún pensionado bajo Ley 73 reciba menos de cierta cantidad mensual, aunque el cálculo dé un monto menor.', ejemplo: `En 2024: $${(4345.72).toLocaleString('es-MX')}/mes aprox.` },
    cuantia: { titulo: 'Cuantía Básica de Pensión', desc: 'Porcentaje del SDI promedio que corresponde por las primeras 500 semanas cotizadas. La base del cálculo de la pensión.', ejemplo: '500 sem. = 35% del SDI. Cada 52 sem. adicionales suman 1.25%.' },
    incrementos: { titulo: 'Incrementos Anuales', desc: 'Por cada 52 semanas de cotización adicionales a las primeras 500, la pensión se incrementa en 1.25% del SDI promedio.', ejemplo: '600 semanas = 35% + (100/52 × 1.25%) = 37.4%' },
    asignaciones: { titulo: 'Asignaciones Familiares', desc: 'Incremento a la pensión por dependientes económicos: cónyuge/concubino (15%), hijos < 16 años (10% c/u), padres (10% c/u, si no hay cónyuge).', ejemplo: 'Con cónyuge e 1 hijo: +25% sobre pensión.' },
    ayuda165: { titulo: 'Ayuda Asistencial (Art. 165 LSS)', desc: 'Cuando el pensionado no tiene cónyuge ni hijos ni padres dependientes, tiene derecho a un incremento adicional del 15% sobre la pensión.', ejemplo: 'Pensión de $5,000 → recibe $5,750 con Art. 165.' },
    conservacion: { titulo: 'Conservación de Derechos', desc: 'Derecho a pensionarse que se mantiene aunque el trabajador deje de cotizar. Requiere haber cotizado mínimo 250 semanas. El derecho se conserva por un tiempo equivalente a la mitad del período cotizado.', ejemplo: 'Con 500 sem., derechos vigentes por 250 semanas adicionales.' },
    retroactivo: { titulo: 'Pago Retroactivo (Mod. 40)', desc: 'Permite pagar cuotas de períodos anteriores (hasta 5 años) para aumentar las semanas cotizadas. Incluye cuotas + actualizaciones INPC + recargos por mora.', ejemplo: 'Actualizaciones: ~7.27% anual. Recargos: ~41.80% acumulado.' },
    roi: { titulo: 'ROI — Recuperación de Inversión', desc: 'Número de meses que tarda el pensionado en recuperar la inversión realizada en Modalidad 40 con la diferencia de pensión mensual adicional.', ejemplo: 'Inversión $300K ÷ Incremento $5K/mes = 60 meses de ROI.' },
    factorEdad: { titulo: 'Factor por Edad de Retiro', desc: 'La pensión de cesantía en edad avanzada tiene un factor según la edad: 60 años=75%, 61=80%, 62=85%, 63=90%, 64=95%, 65+= 100% (pensión de vejez).', ejemplo: 'Retirarse a 62 en vez de 65 = 15% menos de pensión.' },
  }

  // ── Componente Tooltip ───────────────────────────────────────
  const Tip = ({ id, children }: { id: string; children?: React.ReactNode }) => {
    const g = GLOSARIO[id]
    if (!g) return null
    return (
      <span style={{ position: 'relative' as const, display: 'inline-block' }}>
        <button
          onClick={() => setActiveTooltip(activeTooltip === id ? null : id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3B82F6', fontSize: '12px', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit', verticalAlign: 'middle' }}
          title={g.titulo}
        >ⓘ</button>
        {activeTooltip === id && (
          <div style={{ position: 'absolute' as const, left: '50%', bottom: '120%', transform: 'translateX(-50%)', background: '#1e293b', color: 'white', padding: '10px 14px', fontSize: '11.5px', lineHeight: 1.6, width: '260px', zIndex: 999, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: '700' as const, margin: '0 0 6px', color: '#93C5FD', fontSize: '12px' }}>{g.titulo}</p>
            <p style={{ margin: '0 0 4px', color: '#E2E8F0' }}>{g.desc}</p>
            {g.ejemplo && <p style={{ margin: 0, color: '#94A3B8', fontStyle: 'italic' }}>Ejemplo: {g.ejemplo}</p>}
            <div style={{ position: 'absolute' as const, bottom: '-6px', left: '50%', transform: 'translateX(-50%)', width: '12px', height: '12px', background: '#1e293b', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
          </div>
        )}
      </span>
    )
  }

  const TABS = [
    'Datos Generales',        // 0
    'Cuantías Anuales',       // 1
    'Salario Prom. Mod 40',   // 2
    'Costo Mod 40',           // 3
    'Info. del Pensionado',   // 4
    'Importe de Pensión',     // 5
    'Inversión',              // 6
    'Datos del Proyecto',     // 7
    'Escenarios',             // 8
    'Escenario 1',            // 9
    'Financiamiento',         // 10
    'Resumen',                // 11
    'Modalidad 10',           // 12
  ]
  // Carátula: se muestra solo cuando no hay datos cargados y no hay cliente pre-seleccionado
  const [mostrarCaratula, setMostrarCaratula] = useState(false)
  const [appInicializado, setAppInicializado] = useState(false)
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)
  const [showGuia, setShowGuia] = useState(false)

  // Tab 1 state
  const [datos, setDatos] = useState<DatosGenerales>(DEFAULT_DATOS)
  const [extracting, setExtracting] = useState(false)

  // Tab 2 state
  const [periodos, setPeriodos] = useState<PeriodoSalarial[]>([])
  const [periodosCompletos, setPeriodosCompletos] = useState<any[]>([])
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const [showDetalle250, setShowDetalle250] = useState(false)
  const [showHistorialCompleto, setShowHistorialCompleto] = useState(false)
  const [sdiPromedio, setSdiPromedio] = useState(0)

  // Tab 3 - conservacion (calculated from datos)
  const [fechaUltimaCot, setFechaUltimaCot] = useState('')

  // Tab 4 state - Mod40
  const [mod40Activo, setMod40Activo] = useState(true)
  const [mod40Umas, setMod40Umas] = useState(25)
  const [mod40Meses, setMod40Meses] = useState(36)

  // Tab 5 - Escenarios
  const [escenarios, setEscenarios] = useState<Escenario[]>([])
  const [escSelIdx, setEscSelIdx] = useState(2)

  // Tab 6 - Financiamiento
  const [finSelId, setFinSelId] = useState('')
  const [finPlazo, setFinPlazo] = useState(36)

  // Tab 7 - Analisis
  const [analisis, setAnalisis] = useState<AnalisisSeccion[]>([])
  const [generandoAnalisis, setGenerandoAnalisis] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [asesorPerfil, setAsesorPerfil] = useState<{razon_social?: string; nombre?: string; logo_url?: string; encabezado_color?: string; encabezado_titulo?: string; encabezado_logo_size?: number; encabezado_font_size?: number} | null>(null)

  const [showAllMonths, setShowAllMonths] = useState(false)
  const [showClienteModal, setShowClienteModal] = useState(false)
  const [showSugerirEtapa, setShowSugerirEtapa] = useState(false)
  const [etapaSugerida, setEtapaSugerida] = useState('')
  const [showConfirmCambio, setShowConfirmCambio] = useState(false)
  const [pendingClienteId, setPendingClienteId] = useState('')
  const [buscarCliente, setBuscarCliente] = useState('')

  // Edad de retiro y año de trámite
  const [edadRetiro, setEdadRetiro] = useState(65)
  const [anioInicioTramite, setAnioInicioTramite] = useState(new Date().getFullYear())
  const [edadInicioMod40Anios, setEdadInicioMod40Anios] = useState<number | ''>('')
  const [edadInicioMod40Meses, setEdadInicioMod40Meses] = useState<number | ''>('')
  const [tieneAtraso, setTieneAtraso] = useState(false)
  const [fechaAtrasoMod40, setFechaAtrasoMod40] = useState('')
  const [showDetallesMod40, setShowDetallesMod40] = useState(false)
  // Año de inicio del trámite Mod 40, calculado automáticamente a partir de "¿a qué edad quieres iniciar?" (años y meses)
  useEffect(() => {
    if (edadInicioMod40Anios === '' && edadInicioMod40Meses === '') return
    const anios = typeof edadInicioMod40Anios === 'number' ? edadInicioMod40Anios : 0
    const meses = typeof edadInicioMod40Meses === 'number' ? edadInicioMod40Meses : 0
    const metaMeses = anios * 12 + meses

    const ed = edadDetallada(datos.fecha_nacimiento, Date.now())
    const edadActualMeses = ed ? ed.anios * 12 + ed.meses : (datos.edad_actual || 0) * 12

    const mesesFaltantes = metaMeses - edadActualMeses
    const hoy = new Date()
    const fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth() + mesesFaltantes, 1)
    setAnioInicioTramite(fechaInicio.getFullYear())
  }, [edadInicioMod40Anios, edadInicioMod40Meses, datos.fecha_nacimiento, datos.edad_actual])
  const [showTooltipCuantia, setShowTooltipCuantia] = useState(false)
  const [showGuiaEdadMod40, setShowGuiaEdadMod40] = useState(false)
  const [showGlosario, setShowGlosario] = useState(false)

  // Flujo diagnóstico
  const [ingresoObjetivo, setIngresoObjetivo] = useState(0)
  const [escElegidoIdx, setEscElegidoIdx] = useState(-1)
  const [simulacionLibre, setSimulacionLibre] = useState(false)
  const [simUmas, setSimUmas] = useState(25)
  const [simMeses, setSimMeses] = useState(36)
  const [diagGuardadoId, setDiagGuardadoId] = useState<string | null>(null)
  const [estatus, setEstatus] = useState<'borrador' | 'autorizado'>('borrador')

  // ── Load inicial
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      loadClientes(session.user.id)
      loadFinancieras()
      loadSysVars(session.user.id)
      loadAsesorPerfil(session.user.id)

      // Restore borrador from URL params
      const clienteParam = searchParams.get('cliente')
      const diagParam = searchParams.get('diag')

      if (clienteParam) {
        setClienteId(clienteParam)
        setShowClienteModal(false)
      }
      // Siempre mostrar modal: requiere constancia aunque venga con cliente pre-seleccionado
      setMostrarCaratula(true)
      setAppInicializado(true)

      if (diagParam) {
        const { data: diag } = await supabase.from('diagnosticos')
          .select('*').eq('id', diagParam).single()
        if (diag) {
          setDiagGuardadoId(diag.id)
          setEstatus(diag.estatus ?? 'borrador')
          // Restore from params_json if available
          const p = diag.params_json
          if (p) {
            if (p.datos) setDatos(p.datos)
            if (p.periodos) { setPeriodos(p.periodos); setSdiPromedio(p.sdiPromedio ?? 0) }
            if (p.mod40Umas) setMod40Umas(p.mod40Umas)
            if (p.mod40Meses) setMod40Meses(p.mod40Meses)
            if (p.ingresoObjetivo) setIngresoObjetivo(p.ingresoObjetivo)
            if (p.simulacionLibre) setSimulacionLibre(p.simulacionLibre)
            if (p.simUmas) setSimUmas(p.simUmas)
            if (p.simMeses) setSimMeses(p.simMeses)
            if (typeof p.escElegidoIdx === 'number') setEscElegidoIdx(p.escElegidoIdx)
            if (p.fechaUltimaCot) setFechaUltimaCot(p.fechaUltimaCot)
            if (p.edadRetiro) setEdadRetiro(p.edadRetiro)
            if (p.anioInicioTramite) setAnioInicioTramite(p.anioInicioTramite)
            else if (p.datos?.fecha_calculo) setFechaUltimaCot(p.datos.fecha_calculo)
          } else {
            // Fallback: restore basic data from columns
            setDatos(prev => ({
              ...prev,
              ley: diag.ley ?? prev.ley,
              semanas_totales: diag.semanas ?? prev.semanas_totales,
            }))
            if (diag.mod40_umas) setMod40Umas(diag.mod40_umas)
            if (diag.mod40_meses) setMod40Meses(diag.mod40_meses)
            if (diag.ingreso_objetivo) setIngresoObjetivo(diag.ingreso_objetivo)
          }
          // Restore analisis
          if (diag.analisis_narrativo) {
            try {
              const parsed = JSON.parse(diag.analisis_narrativo)
              if (Array.isArray(parsed)) setAnalisis(parsed)
            } catch(e) {}
          }
          setTab(6) // Go to Resumen to show saved state
          setShowClienteModal(false)
        }
      }
    })
  }, [])

  async function loadClientes(uid: string) {
    const { data } = await supabase.from('clientes')
      .select('id, nombre, etapa_kanban, telefono, tipo_servicio')
      .eq('asesor_id', uid)
      .in('etapa_kanban', ['prospecto', 'diagnostico'])
      .eq('activo', true)
      .order('created_at', { ascending: false })
    setClientes(data ?? [])
  }

  async function loadFinancieras() {
    const { data } = await supabase.from('financieras').select('*').eq('activa', true).order('orden')
    if (data?.length) { setFinancieras(data); setFinSelId(data[0].id) }
  }

  async function loadAsesorPerfil(uid: string) {
    const { data } = await supabase.from('perfiles_usuario').select('nombre, razon_social, logo_url, encabezado_color, encabezado_titulo, encabezado_logo_size, encabezado_font_size').eq('id', uid).single()
    if (data) setAsesorPerfil(data)
  }

  async function loadSysVars(uid: string) {
    // Las fórmulas/parámetros del sistema son GLOBALES — los configura el admin
    // y deben aplicar a todos los asesores. Por eso se lee de la fila del admin
    // (is_admin = true), NO de la fila del usuario que inició sesión.
    // LIMITACIÓN CONOCIDA: si llegara a haber más de un usuario con is_admin=true,
    // esta consulta puede traer cualquiera de ellos (sin orden garantizado). Para
    // el modelo actual (un solo admin = dueño del negocio) esto no es un problema.
    // Si se agregan más admins en el futuro, migrar a una tabla dedicada de
    // configuración global (singleton), separada de perfiles_usuario.
    const { data } = await supabase.from('perfiles_usuario').select('*').eq('is_admin', true).limit(1).maybeSingle()
    if (data) {
      setMod40PctPorAnio({
        2026: data.mod40_2026 ?? 14.438, 2027: data.mod40_2027 ?? 15.528,
        2028: data.mod40_2028 ?? 16.619, 2029: data.mod40_2029 ?? 17.709,
        2030: data.mod40_2030 ?? 18.800,
      })
      setSys({
        UMA_DIARIA: data.uma_diaria ?? 117.31,
        SALARIO_MIN: data.salario_minimo ?? 315.04,
        PMG_L73: data.pmg_mensual ?? 10636.54,
        PMG_L97: data.pmg_l97 ?? 4345.72,
        RENDIMIENTO_DEFAULT: data.rendimiento_afore_default ?? 6,
        mod40_pct: data.mod40_2026 ?? 14.438,
        pct_afore_mod40: data.pct_afore_mod40 ?? 20,
        pct_banco_regulado: data.pct_banco_regulado ?? 35.65,
        tasa_banco_anual: data.tasa_banco_anual ?? 32.2,
      })
    }
  }

  // ── Extraer PDF
  async function extraerPDF(file: File) {
    setExtracting(true)
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res((reader.result as string).split(',')[1])
        reader.onerror = () => rej(new Error('Error leyendo PDF'))
        reader.readAsDataURL(file)
      })
      const response = await fetch('/api/extract-nss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf: base64 })
      })
      const result = await response.json()
      if (result.nombre) {
        const edadCalc = result.fecha_nac
          ? Math.floor((Date.now() - new Date(result.fecha_nac).getTime()) / (365.25 * 86400000))
          : undefined
        // Sugerir "sigue cotizando" si la última cotización fue dentro de los últimos 60 días
        let sigueCotizandoSugerido: boolean | undefined
        if (result.ultima_cotizacion) {
          const diasDesdeUltima = (Date.now() - new Date(result.ultima_cotizacion).getTime()) / 86400000
          sigueCotizandoSugerido = diasDesdeUltima <= 60
        }
        // Régimen (Ley 73 vs 97): se calcula de forma determinística a partir de la fecha de primer empleo
        // (corte legal: 1° de julio de 1997). Si la IA no logró extraer la fecha exacta, se usa su estimación como respaldo.
        let leyDetectada: '73' | '97' | undefined
        if (result.primer_empleo) {
          leyDetectada = new Date(result.primer_empleo) < new Date('1997-07-01') ? '73' : '97'
        } else if (typeof result.cotizo_antes_97 === 'boolean') {
          leyDetectada = result.cotizo_antes_97 ? '73' : '97'
        }
        setDatos(prev => ({
          ...prev,
          nombre: result.nombre || prev.nombre,
          nombre_trabajador: result.nombre || prev.nombre_trabajador,
          semanas_totales: result.semanas || prev.semanas_totales,
          nss: result.nss || prev.nss,
          fecha_nacimiento: result.fecha_nac || prev.fecha_nacimiento,
          edad_actual: edadCalc ?? prev.edad_actual,
          fecha_calculo: result.ultima_cotizacion || prev.fecha_calculo,
          sigue_cotizando: sigueCotizandoSugerido ?? prev.sigue_cotizando,
          ley: leyDetectada ?? prev.ley,
        }))
        if (result.ultima_cotizacion) setFechaUltimaCot(result.ultima_cotizacion)
        // Build periodos from PDF data — recalcula "semanas" de forma determinística a partir de
        // fecha_inicio/fecha_fin en vez de confiar en el número que calculó la IA (las IA son
        // imprecisas haciendo aritmética de fechas en texto libre; esto elimina esa imprecisión).
        if (result.periodos && Array.isArray(result.periodos)) {
          const periodosRecalculados = result.periodos.map((p: any) => {
            if (p.fecha_inicio && p.fecha_fin) {
              const dias = (new Date(p.fecha_fin).getTime() - new Date(p.fecha_inicio).getTime()) / 86400000
              const semanasExactas = Math.max(0, Math.round((dias / 7) * 100) / 100)
              return { ...p, semanas: semanasExactas }
            }
            return p
          })
          setPeriodosCompletos(periodosRecalculados)
          buildPeriodos250(periodosRecalculados, result.semanas || 0)
        }
      }
    } catch (e) { console.error(e) }
    setExtracting(false)
  }

  function buildPeriodos250(rawPeriodos: any[], totalSemanas: number) {
    // Take last periods summing to 250 weeks
    let acum = 0
    const result: PeriodoSalarial[] = []
    const reversed = [...rawPeriodos].reverse()
    for (const p of reversed) {
      if (acum >= 250) break
      const semDisponibles = p.semanas || 0
      const sem = Math.min(semDisponibles, 250 - acum)
      acum += sem
      // Si solo se toma una parte de las semanas del período (el más antiguo incluido),
      // se recorta la fecha de inicio para reflejar las semanas REALMENTE contadas (las más recientes de ese período),
      // no la fecha de inicio original del período completo.
      const truncado = sem < semDisponibles
      let fechaInicioAjustada = p.fecha_inicio || ''
      if (truncado && p.fecha_fin) {
        const fin = new Date(p.fecha_fin)
        fin.setDate(fin.getDate() - sem * 7)
        fechaInicioAjustada = fin.toISOString().slice(0, 10)
      }
      result.unshift({
        id: Math.random().toString(36).slice(2),
        fecha_inicio: fechaInicioAjustada,
        fecha_fin: p.fecha_fin || '',
        sdi: p.sdi || 0,
        semanas: sem,
        peso: 0
      })
    }
    // Calculate weights
    const total = result.reduce((s, p) => s + p.semanas, 0)
    const withPeso = result.map(p => ({ ...p, peso: total > 0 ? (p.semanas / total) * 100 : 0 }))
    setPeriodos(withPeso)
    setSdiPromedio(calcPromedioSalarial250(withPeso))
  }

  // Recalculate escenarios when sdiPromedio or mod40 changes
  useEffect(() => { if (sdiPromedio > 0 || datos.semanas_totales > 0) recalcEscenarios() }, [sdiPromedio, datos, mod40Umas, mod40Meses, sys, simulacionLibre, simUmas, simMeses, edadRetiro, anioInicioTramite])

  const ETAPA_LABELS: Record<string, string> = {
    prospecto: 'Prospecto',
    diagnostico: 'Diagnóstico / Asesoría',
    recopilacion: 'Recopilación',
    tramite: 'Trámite',
    cierre: 'Cierre (Exitoso)',
    cancelado: 'Cancelado',
  }

  async function moverEtapa(clienteId: string, nuevaEtapa: string) {
    await supabase.from('clientes').update({ etapa_kanban: nuevaEtapa }).eq('id', clienteId)
    setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, etapa_kanban: nuevaEtapa } : c))
    setShowSugerirEtapa(false)
    setMensaje(`✅ Cliente movido a ${ETAPA_LABELS[nuevaEtapa]}`)
    setTimeout(() => setMensaje(''), 4000)
  }

  function calcEscenarioMod40(sem: number, sdiBase: number, umas: number, meses: number, pensionBase: number, edadRet?: number, anioInicio?: number) {
    const anioBase = new Date().getFullYear()
    const edadR = edadRet ?? edadRetiro
    const anioI = anioInicio ?? anioInicioTramite
    const anioR = anioBase + (edadR - datos.edad_actual)
    // UMA y SDI proyectados — SAL. PROM MOD 40!E17
    const umaProyectada = proyectarValor(sys.UMA_DIARIA, anioBase, anioI)
    const sdiMod40 = umas * umaProyectada

    // Costo mensual usando días REALES de cada mes (igual que Excel COSTO MOD.40)
    // El Excel calcula: SDI × tasa_año × (días_mes / 365) para cada mes individualmente
    let costo_total = 0
    const fechaInicioMod40 = new Date(anioI, 0, 1)
    for (let m = 0; m < meses; m++) {
      const fechaMes = new Date(fechaInicioMod40)
      fechaMes.setMonth(fechaMes.getMonth() + m)
      const anioMes = fechaMes.getFullYear()
      const mesMes = fechaMes.getMonth()
      const diasMes = new Date(anioMes, mesMes + 1, 0).getDate()
      const diasAnioMes = anioMes % 4 === 0 && (anioMes % 100 !== 0 || anioMes % 400 === 0) ? 366 : 365
      const umaMes = proyectarValor(sys.UMA_DIARIA, anioBase, anioMes)
      const sdiMes = umas * umaMes
      const tasaMes = getMod40Pct(anioMes) / 100
      costo_total += sdiMes * tasaMes * diasMes / diasAnioMes * 30.4167
    }
    const costoMensual = meses > 0 ? costo_total / meses : 0
    const tasaProyectada = getMod40Pct(anioI) / 100

    // Semanas cotizadas en Mod40 — DATOS GEN. MOD 40!C7
    const semMod40 = meses * (52 / 12) // semanas exactas según meses
    // Semanas antes de Mod40 incluye las naturales cotizadas hasta el inicio — DATOS GEN. MOD 40!C6
    const semAntesM40 = sem // ya incluye las proyectadas en recalcEscenarios
    const semTotal = semAntesM40 + semMod40

    // SDI ponderado 250 semanas — SAL. PROM MOD 40
    const semMod40en250 = Math.min(semMod40, 250)
    const semHistEn250 = Math.min(semAntesM40, 250 - semMod40en250)
    const sdiNuevo = semHistEn250 + semMod40en250 > 0
      ? (sdiBase * semHistEn250 + sdiMod40 * semMod40en250) / (semHistEn250 + semMod40en250)
      : sdiBase

    const { monto: pension, pmg_aplica } = calcPensionLey73(semTotal, sdiNuevo, edadR, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, anioR, datos.tiene_ayuda_asistencial)
    const incr = pension - pensionBase

    // Inversión neta y ROI — Datos-proyecto!C20, C21
    const pctAfore = (sys.pct_afore_mod40 ?? 20) / 100
    const recuperacion_afore = costo_total * pctAfore
    const inversion_neta = costo_total - recuperacion_afore
    const roi = incr > 0 ? Math.ceil(inversion_neta / incr) : 0

    // Ganancia a los 80 años y tasa de rendimiento — INVERSION!D46/F46
    const mesesHasta80 = Math.max(0, (80 - edadR) * 12)
    const mesesHasta80base = Math.max(0, (80 - Math.max(edadRetiro, datos.edad_actual || 60)) * 12)
    const flujosCon = pension * mesesHasta80
    const flujosSin = pensionBase * mesesHasta80base
    const ganancia_a80 = flujosCon - flujosSin - inversion_neta
    const tasa_rendimiento = inversion_neta > 0 ? (ganancia_a80 / inversion_neta) * 100 : 0
    const aguinaldo_anual = (pension * 15) / 30

    // Fechas de ingreso/baja — SAL. PROM MOD 40!E13, E14
    const fechaIngreso = new Date(anioI, 0, 1)
    const fechaBaja = new Date(fechaIngreso)
    fechaBaja.setMonth(fechaBaja.getMonth() + meses)
    const fecha_ingreso_mod40 = fechaIngreso.toISOString().slice(0, 10)
    const fecha_baja_mod40 = fechaBaja.toISOString().slice(0, 10)

    // Retroactivo con desglose completo — PAGO RETROACTIVO!E8-E12
    // Tasas validadas contra Excel: actualización INPC ~7.27%, recargos ~41.80%
    const pctActualizacion = 0.0727
    const pctRecargos = 0.4180
    const costo_retroactivo_base = costo_total // base antes de recargos
    const actualizaciones = costo_retroactivo_base * pctActualizacion
    const recargos = costo_retroactivo_base * pctRecargos
    const costo_retroactivo = costo_retroactivo_base + actualizaciones + recargos
    const recuperacion_afore_retro = costo_retroactivo * pctAfore
    const inversion_neta_retro = costo_retroactivo - recuperacion_afore_retro
    const roi_retro = incr > 0 ? Math.ceil(inversion_neta_retro / incr) : 0
    const ganancia_a80_retro = flujosCon - flujosSin - inversion_neta_retro
    const tasa_rendimiento_retro = inversion_neta_retro > 0 ? (ganancia_a80_retro / inversion_neta_retro) * 100 : 0

    // Financiamiento — FINANCIAMIENTO!C6-C11, SEGUNDO FONDEADOR!C3-C9
    const pctBanco = (sys.pct_banco_regulado ?? 35.65) / 100  // configurable desde Admin
    const aportacion_banco = costo_retroactivo * pctBanco
    const aportacion_segundo_fondeo = costo_retroactivo - recuperacion_afore_retro - aportacion_banco
    const cantidad_minima_afore = costo_retroactivo - aportacion_banco // SEGUNDO FONDEADOR!C9

    // Costo financiamiento banco regulado — FINANCIAMIENTO!C13-C22
    const duracion_tramite_meses = 60 // FINANCIAMIENTO!B15 — estándar IMSS
    const tasa_banco_anual_val = (sys.tasa_banco_anual ?? 32.2) / 100  // configurable desde Admin
    const tasa_banco_mensual = tasa_banco_anual_val / 12
    const cuota_banco = tasa_banco_mensual > 0
      ? aportacion_banco * (tasa_banco_mensual * Math.pow(1 + tasa_banco_mensual, duracion_tramite_meses))
        / (Math.pow(1 + tasa_banco_mensual, duracion_tramite_meses) - 1)
      : aportacion_banco / duracion_tramite_meses
    const costo_financiamiento_banco = cuota_banco * duracion_tramite_meses - aportacion_banco

    // Costo segundo fondeador — SEGUNDO FONDEADOR!C4-C6
    const plazo_segundo_fondeo = 12
    const costo_financiamiento_segundo = aportacion_segundo_fondeo * 0.7912 // estimado SEGUNDO FONDEADOR!C5
    const monto_maximo_pago = aportacion_segundo_fondeo + costo_financiamiento_segundo // SEGUNDO FONDEADOR!C6

    const descuento_mensual = cuota_banco
    const pension_inmediata = pension - descuento_mensual
    const pension_al_liquidar = pension

    // ROI y análisis financiado
    const flujos_financiados = pension_inmediata * Math.min(duracion_tramite_meses, mesesHasta80) +
      pension * Math.max(0, mesesHasta80 - duracion_tramite_meses)
    const ganancia_a80_financiado = flujos_financiados - flujosSin - inversion_neta_retro
    const roi_financiado = incr > 0 ? Math.ceil(inversion_neta_retro / incr) : 0
    const tasa_rendimiento_financiado = inversion_neta_retro > 0 ? (ganancia_a80_financiado / inversion_neta_retro) * 100 : 0

    return {
      costoMensual, costo_total, sdiNuevo, semTotal, semMod40, pension, pmg_aplica, incr, roi,
      umaProyectada, tasaProyectada, sdiMod40,
      recuperacion_afore, inversion_neta, ganancia_a80, tasa_rendimiento, aguinaldo_anual,
      fecha_ingreso_mod40, fecha_baja_mod40,
      actualizaciones, recargos,
      costo_retroactivo, recuperacion_afore_retro, inversion_neta_retro,
      roi_retro, ganancia_a80_retro, tasa_rendimiento_retro,
      aportacion_banco, aportacion_segundo_fondeo, cantidad_minima_afore,
      descuento_mensual, pension_inmediata, pension_al_liquidar,
      roi_financiado, ganancia_a80_financiado, tasa_rendimiento_financiado,
      duracion_tramite_meses, plazo_segundo_fondeo,
      costo_financiamiento_banco, costo_financiamiento_segundo, monto_maximo_pago
    }
  }

  function recalcEscenarios() {
    const semBase = datos.semanas_totales - datos.semanas_descontadas
    const anioActual = new Date().getFullYear()
    const mesesHastaInicioMod40 = datos.sigue_cotizando ? Math.max(0, (anioInicioTramite - anioActual) * 12) : 0
    const sem = semBase + mesesHastaInicioMod40 * 4.33
    if (datos.semanas_totales === 0 || sdiPromedio <= 0) return
    const sdiBase = sdiPromedio > 0 ? sdiPromedio : sys.SALARIO_MIN
    const anioBase = new Date().getFullYear()
    const anioR = anioBase + (edadRetiro - (datos.edad_actual || 60))

    const { monto: pensionBase, pmg_aplica: pmgAplicaBase } = calcPensionLey73(sem, sdiBase, datos.edad_min_pension || edadRetiro, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, anioR, datos.tiene_ayuda_asistencial)

    // Helper para construir un escenario completo con todos los campos del interface
    const makeEsc = (
      id: string, label: string, descripcion: string,
      mod40_meses: number, mod40_umas: number,
      r: ReturnType<typeof calcEscenarioMod40>,
      recomendado = false
    ): Escenario => ({
      id, label, descripcion,
      mod40_meses, mod40_umas,
      pension_base: pensionBase,
      pension_mensual: r.pension,
      costo_total: r.costo_total,
      costo_mensual_mod40: r.costoMensual,
      incremento_vs_base: r.incr,
      roi_meses: r.roi,
      recomendado,
      pmg_aplica: r.pmg_aplica,
      fecha_ingreso_mod40: r.fecha_ingreso_mod40,
      fecha_baja_mod40: r.fecha_baja_mod40,
      edad_retiro: edadRetiro,
      semanas_finales: r.semTotal,
      nuevo_sdi_250: r.sdiNuevo,
      recuperacion_afore: r.recuperacion_afore,
      inversion_neta: r.inversion_neta,
      ganancia_a80: r.ganancia_a80,
      tasa_rendimiento: r.tasa_rendimiento,
      aguinaldo_anual: r.aguinaldo_anual,
      costo_retroactivo: r.costo_retroactivo,
      recuperacion_afore_retro: r.recuperacion_afore_retro,
      inversion_neta_retro: r.inversion_neta_retro,
      roi_retro: r.roi_retro,
      ganancia_a80_retro: r.ganancia_a80_retro,
      tasa_rendimiento_retro: r.tasa_rendimiento_retro,
      aportacion_banco: r.aportacion_banco,
      aportacion_segundo_fondeo: r.aportacion_segundo_fondeo,
      cantidad_minima_afore: r.cantidad_minima_afore,
      descuento_mensual: r.descuento_mensual,
      pension_inmediata: r.pension_inmediata,
      pension_al_liquidar: r.pension_al_liquidar,
      roi_financiado: r.roi_financiado,
      ganancia_a80_financiado: r.ganancia_a80_financiado,
      tasa_rendimiento_financiado: r.tasa_rendimiento_financiado,
      semanas_mod40: r.semMod40,
      sdi_mod40: r.sdiMod40,
      actualizaciones: r.actualizaciones,
      recargos: r.recargos,
      duracion_tramite_meses: r.duracion_tramite_meses,
      plazo_segundo_fondeo: r.plazo_segundo_fondeo,
      costo_financiamiento_banco: r.costo_financiamiento_banco,
      costo_financiamiento_segundo: r.costo_financiamiento_segundo,
      monto_maximo_pago: r.monto_maximo_pago,
    })

    // E0: Sin modalidad — escenario base con campos vacíos/cero para los de Mod40
    const escs: Escenario[] = [{
      id: 'e0', label: 'Sin modalidad', descripcion: 'Pensión base con semanas y SDI actuales',
      mod40_meses: 0, mod40_umas: 0, pension_base: pensionBase,
      pension_mensual: pensionBase, costo_total: 0, costo_mensual_mod40: 0,
      incremento_vs_base: 0, roi_meses: 0, recomendado: false, pmg_aplica: pmgAplicaBase,
      fecha_ingreso_mod40: '', fecha_baja_mod40: '', edad_retiro: edadRetiro,
      semanas_finales: sem, nuevo_sdi_250: sdiBase, recuperacion_afore: 0, inversion_neta: 0,
      ganancia_a80: 0, tasa_rendimiento: 0, aguinaldo_anual: (pensionBase * 15) / 30,
      costo_retroactivo: 0, recuperacion_afore_retro: 0, inversion_neta_retro: 0,
      roi_retro: 0, ganancia_a80_retro: 0, tasa_rendimiento_retro: 0,
      aportacion_banco: 0, aportacion_segundo_fondeo: 0, cantidad_minima_afore: 0,
      descuento_mensual: 0, pension_inmediata: pensionBase, pension_al_liquidar: pensionBase,
      roi_financiado: 0, ganancia_a80_financiado: 0, tasa_rendimiento_financiado: 0,
      semanas_mod40: 0, sdi_mod40: 0, actualizaciones: 0, recargos: 0,
      duracion_tramite_meses: 60, plazo_segundo_fondeo: 12,
      costo_financiamiento_banco: 0, costo_financiamiento_segundo: 0, monto_maximo_pago: 0,
    }]

    // E1: Modalidad 10 · 12 meses
    const TASA_M10 = 0.22
    const sdiM10 = mod40Umas * sys.UMA_DIARIA
    const semM10 = Math.min(12 * 4.33, 250)
    const semEfM10 = Math.min(sem, 250 - semM10)
    const sdiNuevoM10 = (sdiBase * semEfM10 + sdiM10 * semM10) / (semEfM10 + semM10)
    const { monto: pensionM10, pmg_aplica: pmgAplicaM10 } = calcPensionLey73(sem + 12 * 4.33, sdiNuevoM10, 65, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, undefined, datos.tiene_ayuda_asistencial)
    const costoM10 = sdiM10 * 30.4 * TASA_M10
    const r0: ReturnType<typeof calcEscenarioMod40> = {
      costoMensual: costoM10, costo_total: costoM10 * 12, sdiNuevo: sdiNuevoM10,
      semTotal: sem + 12 * 4.33, semMod40: 12 * (52 / 12), sdiMod40: sdiM10, pension: pensionM10, pmg_aplica: pmgAplicaM10,
      incr: pensionM10 - pensionBase, roi: 0, umaProyectada: sys.UMA_DIARIA,
      tasaProyectada: TASA_M10,
      recuperacion_afore: costoM10 * 12 * (sys.pct_afore_mod40 ?? 20) / 100,
      inversion_neta: costoM10 * 12 * (1 - (sys.pct_afore_mod40 ?? 20) / 100),
      ganancia_a80: 0, tasa_rendimiento: 0, aguinaldo_anual: (pensionM10 * 15) / 30,
      fecha_ingreso_mod40: '', fecha_baja_mod40: '',
      actualizaciones: 0, recargos: 0,
      costo_retroactivo: 0, recuperacion_afore_retro: 0, inversion_neta_retro: 0,
      roi_retro: 0, ganancia_a80_retro: 0, tasa_rendimiento_retro: 0,
      aportacion_banco: 0, aportacion_segundo_fondeo: 0, cantidad_minima_afore: 0,
      descuento_mensual: 0, pension_inmediata: pensionM10, pension_al_liquidar: pensionM10,
      roi_financiado: 0, ganancia_a80_financiado: 0, tasa_rendimiento_financiado: 0,
      duracion_tramite_meses: 60, plazo_segundo_fondeo: 12,
      costo_financiamiento_banco: 0, costo_financiamiento_segundo: 0, monto_maximo_pago: 0,
    }
    escs.push(makeEsc('e_m10', 'Modalidad 10 · 12 meses', 'Cobertura integral + semanas (independiente)', 12, mod40Umas, r0))

    // E2–E4: Modalidad 40 a distintos plazos
    const mesesDisp = Math.max(12, (edadRetiro - (datos.edad_actual || 60)) * 12)
    for (const [meses, umas, label, desc, esOpt] of [
      [Math.min(24, mesesDisp), mod40Umas * 0.6, `Mod 40 · ${Math.min(24, mesesDisp)} meses · ${Math.round(mod40Umas * 0.6)} UMAs`, 'Inversión conservadora', false],
      [Math.min(36, mesesDisp), mod40Umas * 0.8, `Mod 40 · ${Math.min(36, mesesDisp)} meses · ${Math.round(mod40Umas * 0.8)} UMAs`, 'Estrategia media', false],
      [Math.min(mod40Meses, mesesDisp), mod40Umas, `Mod 40 · ${Math.min(mod40Meses, mesesDisp)} meses · ${mod40Umas} UMAs`, 'Estrategia configurada', true],
    ] as [number, number, string, string, boolean][]) {
      const r = calcEscenarioMod40(sem, sdiBase, umas, meses, pensionBase, edadRetiro, anioInicioTramite)
      escs.push(makeEsc(`e_m40_${meses}`, label, desc, meses, umas, r, esOpt))
    }

    // E5: Simulación libre
    if (simulacionLibre) {
      const r = calcEscenarioMod40(sem, sdiBase, simUmas, simMeses, pensionBase, edadRetiro, anioInicioTramite)
      escs.push(makeEsc('e_sim', `Mi simulación · ${simMeses} meses · ${simUmas} UMAs`, '🔧 Parámetros personalizados', simMeses, simUmas, r))
    }

    setEscenarios(escs)
    if (escElegidoIdx < 0) setEscElegidoIdx(escs.findIndex(e => e.recomendado))
  }

  const escSel = escenarios[escElegidoIdx >= 0 ? escElegidoIdx : escSelIdx] ?? escenarios[0]
  const finSel = financieras.find(f => f.id === finSelId)
  const corridaFin = finSel && escSel ? calcCorrida(escSel.costo_retroactivo || escSel.costo_total, finSel.tasa_anual, finPlazo) : null
  const conservacion = calcConservacion(datos.semanas_totales, fechaUltimaCot ? Math.floor((Date.now() - new Date(fechaUltimaCot).getTime()) / (30 * 86400000)) : 0)

  // ── Generar PDF completo
  async function exportarPDF() {
    if (!diagGuardadoId) return
    const esBorrador = estatus === 'borrador'
    const idxToUse = escElegidoIdx >= 0 ? escElegidoIdx : escSelIdx
    const escToUse = escenarios[idxToUse] ?? escenarios.find((e: any) => e.recomendado) ?? escenarios[0]
    if (!escToUse) { setMensaje('⚠️ Selecciona un escenario antes de generar el PDF'); setTimeout(() => setMensaje(''), 4000); return }
    try {
      setMensaje('⏳ Generando PDF...')
      const elemento = (
        <DiagnosticoPDF
          datos={datos}
          periodos={periodos}
          sdiPromedio={sdiPromedio}
          escenarios={escenarios}
          escSelIdx={idxToUse}
          analisis={analisis}
          ingresoObjetivo={ingresoObjetivo || undefined}
          logoUrl={asesorPerfil?.logo_url ?? undefined}
          razonSocial={asesorPerfil?.razon_social ?? undefined}
          asesorNombre={asesorPerfil?.nombre ?? undefined}
          encabezadoColor={asesorPerfil?.encabezado_color ?? undefined}
          encabezadoTitulo={asesorPerfil?.encabezado_titulo ?? undefined}
          esBorrador={esBorrador}
        />
      )
      const blob = await pdf(elemento).toBlob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const nombre = (datos.nombre_trabajador || datos.nombre)?.replace(/\s+/g, '_') || 'cliente'
      const sufijo = esBorrador ? '_BORRADOR' : '_OFICIAL'
      a.href = url
      a.download = `Proyecto_Pension_${nombre}_${new Date().toISOString().slice(0,10)}${sufijo}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setMensaje(esBorrador ? '📄 PDF borrador generado' : '📄 PDF oficial generado')
      setTimeout(() => setMensaje(''), 4000)
    } catch (err) {
      console.error('Error generando PDF:', err)
      setMensaje('❌ Error al generar el PDF. Revisa la consola.')
      setTimeout(() => setMensaje(''), 5000)
    }
  }

  // ── Generar análisis IA
  async function generarAnalisisIA() {
    if (!escSel) return
    setGenerandoAnalisis(true)
    try {
      const clienteObj = clientes.find(c => c.id === clienteId)
      const esc0 = escenarios[0]
      const escM10 = escenarios.find(e => e.id === 'e_m10')
      const escM40 = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 2]
      const res = await fetch('/api/analisis-pensional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: clienteObj?.nombre || datos.nombre,
          nombre_trabajador: datos.nombre_trabajador || datos.nombre,
          ley: datos.ley,
          semanas: datos.semanas_totales,
          salarioDiario: sdiPromedio,
          salarioMensual: sdiPromedio * 30.4,
          edadActual: datos.edad_actual,
          edadRetiro: edadRetiro,
          tipoPension: edadRetiro >= 65 ? 'Vejez' : 'Cesantia en edad avanzada',
          factorEdad: (FACTOR_EDAD_RETIRO[edadRetiro] ?? 1) * 100,
          anioInicioTramite: anioInicioTramite,
          aniosRetiro: Math.max(0, edadRetiro - datos.edad_actual),
          ingresoDes: ingresoObjetivo || 0,
          inflacion: 4,
          sys,
          e1: { pension_real: esc0?.pension_mensual ?? 0 },
          e2: { pension_real: escM10?.pension_mensual ?? esc0?.pension_mensual ?? 0 },
          e3: { pension_real: escM40?.pension_mensual ?? esc0?.pension_mensual ?? 0 },
          e4: { pension_real: escSel.pension_mensual },
          escRecomendado: escSel.label,
          mod10Activo: !!escM10,
          mod40Activo: escSel.mod40_meses > 0,
          mod40UMAs: escSel.mod40_umas,
          mod40Anios: escSel.mod40_meses / 12,
          mod40Costo: escSel.costo_mensual_mod40,
          tieneISSSTe: false,
          aniosISSSTe: 0,
          aforeSaldo: 0,
          rendimiento: 6.5,
        })
      })
      const data = await res.json()
      if (data.ok && data.analisis) {
        const a = data.analisis
        setAnalisis([
          { titulo: 'Contexto', contenido: a.contexto ?? '' },
          { titulo: 'Diagnóstico actual', contenido: a.diagnostico_actual ?? '' },
          { titulo: 'Opciones disponibles', contenido: a.opciones_disponibles ?? '' },
          { titulo: 'Recomendación', contenido: a.recomendacion ?? '' },
          { titulo: 'Próximos pasos', contenido: a.proximos_pasos ?? '' },
        ].filter(s => s.contenido))
      } else {
        console.error('Analisis error:', data.error)
        setMensaje('Error al generar el análisis. Intenta de nuevo.')
        setTimeout(() => setMensaje(''), 4000)
      }
    } catch (e) { console.error(e) }
    setGenerandoAnalisis(false)
  }

  // ── Validación de datos lógicos ────────────────────────────────
  const [showValidacion, setShowValidacion] = useState(false)
  const [estatusPendiente, setEstatusPendiente] = useState<'borrador' | 'autorizado'>('borrador')

  function validarDatos(): { campo: string; mensaje: string; nivel: 'error' | 'aviso' }[] {
    const problemas: { campo: string; mensaje: string; nivel: 'error' | 'aviso' }[] = []
    const sem = datos.semanas_totales - datos.semanas_descontadas

    if (datos.edad_actual !== undefined && datos.edad_actual !== null) {
      if (datos.edad_actual < 0 || datos.edad_actual > 110) {
        problemas.push({ campo: 'Edad actual', mensaje: `${datos.edad_actual.toFixed(1)} años está fuera de un rango razonable (0-110)`, nivel: 'error' })
      } else if (datos.edad_actual > 90) {
        problemas.push({ campo: 'Edad actual', mensaje: `${datos.edad_actual.toFixed(1)} años es inusual — verifica la fecha de nacimiento de la constancia`, nivel: 'aviso' })
      }
    }
    if (datos.semanas_totales < 0) {
      problemas.push({ campo: 'Semanas cotizadas', mensaje: 'No puede ser un número negativo', nivel: 'error' })
    }
    if (datos.semanas_totales > 0 && datos.semanas_totales > 3000) {
      problemas.push({ campo: 'Semanas cotizadas', mensaje: `${datos.semanas_totales} semanas (~${(datos.semanas_totales/52).toFixed(0)} años) es un valor muy alto — verifica la constancia`, nivel: 'aviso' })
    }
    if (datos.semanas_descontadas > datos.semanas_totales) {
      problemas.push({ campo: 'Semanas descontadas', mensaje: 'No pueden ser más que las semanas totales cotizadas', nivel: 'error' })
    }
    if (sem > 0 && sem < 250) {
      problemas.push({ campo: 'Semanas netas', mensaje: `Solo ${sem.toFixed(0)} semanas — se requieren mínimo 250 para tener derecho a pensión (Art. 162 LSS)`, nivel: 'aviso' })
    }
    if (sdiPromedio > 0 && sdiPromedio < 50) {
      problemas.push({ campo: 'SDI promedio', mensaje: `${fmtMXN2(sdiPromedio)}/día es muy bajo — verifica la extracción de la constancia`, nivel: 'aviso' })
    }
    if (sdiPromedio > 5000) {
      problemas.push({ campo: 'SDI promedio', mensaje: `${fmtMXN2(sdiPromedio)}/día es inusualmente alto — verifica la extracción de la constancia`, nivel: 'aviso' })
    }
    if (datos.edad_min_pension && (datos.edad_min_pension < 60 || datos.edad_min_pension > 65)) {
      problemas.push({ campo: 'Edad de pensión', mensaje: 'Bajo Ley 73, la edad de retiro debe estar entre 60 y 65 años', nivel: 'error' })
    }
    if (datos.num_hijos < 0 || datos.num_hijos > 10) {
      problemas.push({ campo: 'Número de hijos', mensaje: 'Verifica este valor, parece fuera de rango', nivel: 'aviso' })
    }
    if (mod40Meses > 0 && mod40Meses > 60) {
      problemas.push({ campo: 'Duración Mod. 40', mensaje: `${mod40Meses} meses (${(mod40Meses/12).toFixed(1)} años) es un periodo muy largo — verifica el dato`, nivel: 'aviso' })
    }
    return problemas
  }

  // ── Guardar diagnóstico
  async function guardarDiagnostico(nuevoEstatus: 'borrador' | 'autorizado', forzar = false) {
    if (!clienteId || !userId || analisis.length === 0) return
    if (!forzar) {
      const problemas = validarDatos()
      if (problemas.length > 0) { setEstatusPendiente(nuevoEstatus); setShowValidacion(true); return }
    }
    setGuardando(true)
    const escElegido = escenarios[escElegidoIdx] ?? escenarios.find(e => e.recomendado) ?? escenarios[0]
    const payload = {
      cliente_id: clienteId, asesor_id: userId,
      ley: datos.ley,
      semanas: datos.semanas_totales,
      salario_diario: sdiPromedio,
      edad_retiro: edadRetiro,
      pension_sin_mod40: escenarios[0]?.pension_mensual,
      pension_con_mod40: escElegido?.pension_mensual,
      inversion_mod40: escElegido?.costo_total,
      analisis_narrativo: JSON.stringify(analisis),
      notas: JSON.stringify({ datos, periodos, escenarios }),
      estatus: nuevoEstatus,
      escenario_elegido: escElegido?.id ?? null,
      ingreso_objetivo: ingresoObjetivo || null,
      mod40_umas: mod40Umas,
      mod40_meses: mod40Meses,
      fecha_autorizacion: nuevoEstatus === 'autorizado' ? new Date().toISOString() : null,
      params_json: {
        datos, periodos, sdiPromedio,
        escenarios, escElegidoIdx,
        ingresoObjetivo, simulacionLibre, simUmas, simMeses,
        mod40Umas, mod40Meses,
        fechaUltimaCot,
        // ── Foto de los parámetros del sistema usados en este cálculo ──
        // Esto permite saber exactamente con qué UMA/PMG/tasas se generó
        // este diagnóstico, aunque después se actualicen los valores en Admin.
        sys_snapshot: { ...sys, _fecha_calculo: new Date().toISOString() },
      },
    }
    if (diagGuardadoId && nuevoEstatus === 'autorizado') {
      // Authorize existing record
      await supabase.from('diagnosticos').update({ estatus: 'autorizado', fecha_autorizacion: new Date().toISOString() }).eq('id', diagGuardadoId)
      setEstatus('autorizado')
      setMensaje('✅ Diagnóstico autorizado — el PDF oficial ya está disponible')
    } else {
      // Create new record (always insert — immutable history)
      const { data, error } = await supabase.from('diagnosticos').insert(payload).select('id').single()
      if (error) {
        console.error('Error al guardar diagnóstico:', error)
        setMensaje('❌ Error al guardar: ' + error.message)
        setTimeout(() => setMensaje(''), 6000)
      } else if (data) {
        setDiagGuardadoId(data.id)
        setEstatus(nuevoEstatus)
        setMensaje(nuevoEstatus === 'borrador' ? '💾 Borrador guardado en el expediente del cliente' : '✅ Diagnóstico autorizado')
        // Suggest etapa change
        const clienteActual = clientes.find(c => c.id === clienteId)
        const etapa = clienteActual?.etapa_kanban
        const tipo = clienteActual?.tipo_servicio
        if (etapa === 'prospecto') {
          setEtapaSugerida('diagnostico')
          setShowSugerirEtapa(true)
        } else if (etapa === 'diagnostico' && nuevoEstatus === 'autorizado') {
          const siguiente = tipo === 'asesoria' ? 'cierre' : 'recopilacion'
          setEtapaSugerida(siguiente)
          setShowSugerirEtapa(true)
        }
      }
    }
    setTimeout(() => setMensaje(''), 5000)
    setGuardando(false)
  }

  // ── Styles
  const tabSt = (i: number): React.CSSProperties => ({
    padding: '8px 14px', fontSize: '12px', fontWeight: tab === i ? '600' : '400',
    color: tab === i ? NARANJA : '#64748b', cursor: 'pointer',
    whiteSpace: 'nowrap', background: 'none', border: 'none',
    borderBottom: `2px solid ${tab === i ? NARANJA : 'transparent'}`,
    marginBottom: '-1px',
  })

  const inputSt: React.CSSProperties = {
    display: 'block', width: '100%', padding: '8px 10px',
    border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px',
    boxSizing: 'border-box', fontFamily: 'inherit', background: 'white',
    color: '#1e293b', outline: 'none',
  }

  const numInputSt: React.CSSProperties = { ...inputSt, textAlign: 'right' as const }
  const autoInputSt: React.CSSProperties = { ...inputSt, background: '#EFF6FF', borderColor: '#bfdbfe' }
  const autoNumInputSt: React.CSSProperties = { ...numInputSt, background: '#EFF6FF', borderColor: '#bfdbfe' }
  const manualInputSt: React.CSSProperties = { ...inputSt, background: '#FFFBEB', borderColor: '#f59e0b', borderWidth: '2px' }
  const manualNumInputSt: React.CSSProperties = { ...numInputSt, background: '#FFFBEB', borderColor: '#f59e0b', borderWidth: '2px' }
  const sysInputSt: React.CSSProperties = { ...inputSt, background: '#F5F3FF', borderColor: '#ddd6fe' }
  const sysNumInputSt: React.CSSProperties = { ...numInputSt, background: '#F5F3FF', borderColor: '#ddd6fe' }

  const clienteSeleccionado = clientes.find(c => c.id === clienteId)


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden', position: 'relative' as const }} onClick={() => setActiveTooltip(null)}>

      {/* ── Modal de validación de datos ── */}
      {showValidacion && (() => {
        const problemas = validarDatos()
        const hayErrores = problemas.some(p => p.nivel === 'error')
        return (
          <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'white', width: '100%', maxWidth: '480px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
              <div style={{ background: hayErrores ? '#DC2626' : '#F59E0B', padding: '16px 20px' }}>
                <p style={{ fontSize: '15px', fontWeight: '800' as const, color: 'white', margin: 0 }}>
                  {hayErrores ? '⛔ Se encontraron errores en los datos' : '⚠️ Revisa estos datos antes de continuar'}
                </p>
              </div>
              <div style={{ padding: '16px 20px', maxHeight: '320px', overflowY: 'auto' as const }}>
                {problemas.map((p, i) => (
                  <div key={i} style={{ padding: '10px 12px', marginBottom: '8px', background: p.nivel === 'error' ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${p.nivel === 'error' ? '#FCA5A5' : '#FCD34D'}`, borderLeft: `3px solid ${p.nivel === 'error' ? '#DC2626' : '#F59E0B'}` }}>
                    <p style={{ fontSize: '12px', fontWeight: '700' as const, color: p.nivel === 'error' ? '#991B1B' : '#92400E', margin: '0 0 3px' }}>
                      {p.nivel === 'error' ? '⛔' : '⚠️'} {p.campo}
                    </p>
                    <p style={{ fontSize: '11.5px', color: '#374151', margin: 0, lineHeight: 1.5 }}>{p.mensaje}</p>
                  </div>
                ))}
              </div>
              <div style={{ padding: '14px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowValidacion(false)}
                  style={{ padding: '9px 16px', background: '#F8FAFC', color: '#374151', border: '1px solid #E5E7EB', fontSize: '12.5px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✕ Corregir datos
                </button>
                {!hayErrores && (
                  <button onClick={() => { setShowValidacion(false); guardarDiagnostico(estatusPendiente, true) }}
                    style={{ padding: '9px 16px', background: '#F59E0B', color: 'white', border: 'none', fontSize: '12.5px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Continuar de todos modos →
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal sugerencia de avance de etapa ── */}
      {showSugerirEtapa && (() => {
        const clienteActual = clientes.find(c => c.id === clienteId)
        const esAutorizacion = estatus === 'autorizado'
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
              <div style={{ fontSize: '28px', textAlign: 'center' as const, marginBottom: '8px' }}>🎯</div>
              <h3 style={{ fontSize: '16px', fontWeight: '700' as const, color: '#1B3A6B', margin: '0 0 10px', textAlign: 'center' as const }}>
                {esAutorizacion ? '¡Diagnóstico autorizado!' : '¡Diagnóstico guardado!'}
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px', lineHeight: 1.6, textAlign: 'center' as const }}>
                <strong>{clienteActual?.nombre}</strong> está en <strong>{ETAPA_LABELS[clienteActual?.etapa_kanban ?? '']}</strong>.
                ¿Deseas moverlo a <strong style={{ color: '#2E8B57' }}>{ETAPA_LABELS[etapaSugerida]}</strong>?
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowSugerirEtapa(false)}
                  style={{ flex: 1, padding: '9px', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#F4F6FB', color: '#64748b', fontSize: '13px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Ahora no
                </button>
                <button onClick={() => moverEtapa(clienteId, etapaSugerida)}
                  style={{ flex: 2, padding: '9px', border: 'none', borderRadius: '8px', background: '#2E8B57', color: 'white', fontSize: '13px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Sí, mover a {ETAPA_LABELS[etapaSugerida]}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Glosario de términos técnicos ── */}
      {showGlosario && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowGlosario(false) }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700' as const, color: AZUL, margin: 0 }}>📖 Glosario de términos</p>
              <button onClick={() => setShowGlosario(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { t: 'SDI — Salario Diario Integrado', d: 'El salario que se usa para calcular cuotas y pensión. No es solo el sueldo: incluye aguinaldo, prima vacacional y otras prestaciones, expresado como un monto diario.' },
                { t: 'SBC — Salario Base de Cotización', d: 'El mismo concepto que el SDI, visto desde el lado del IMSS: es el monto sobre el cual el patrón (o el propio trabajador en Mod 40) paga las cuotas mensuales.' },
                { t: 'UMA — Unidad de Medida y Actualización', d: 'Una referencia en pesos que el gobierno actualiza cada 1° de enero (similar a como antes se usaba el salario mínimo). Se usa para calcular topes, costos de Modalidad 40 y pensiones mínimas garantizadas.' },
                { t: 'Modalidad 40', d: 'Un esquema voluntario del IMSS que permite seguir cotizando aunque ya no se trabaje, pagando uno mismo la cuota, para subir el salario promedio y con ello la pensión final.' },
                { t: 'Modalidad 10', d: 'Otro esquema voluntario, pensado para trabajadores independientes: permite seguir cotizando con cobertura médica completa (a diferencia de Mod 40, que no incluye servicio médico).' },
                { t: 'Conservación de derechos', d: 'El tiempo que una persona conserva el derecho a pensionarse después de dejar de cotizar, antes de que ese derecho "venza" y tenga que volver a cotizar semanas para recuperarlo.' },
                { t: 'Ley 73 vs Ley 97', d: 'Dos regímenes de pensión distintos según cuándo empezó a cotizar la persona. Ley 73 (antes de jul 1997) suele dar pensiones más altas y permite estrategias como Modalidad 40; Ley 97 (después) se basa en el saldo acumulado en la AFORE.' },
                { t: 'Semanas de cotización', d: 'El total de semanas trabajadas y registradas ante el IMSS. Se necesita un mínimo (500 en Ley 73) para tener derecho a pensión.' },
                { t: 'Subcuenta Retiro 97 (AFORE)', d: 'Una parte del dinero que pagas en Modalidad 40 no se "gasta" — se deposita en tu cuenta individual de AFORE y se te regresa completa, en una sola exhibición, el día que te pensiones. Por eso el costo real de Mod 40 es menor al costo bruto que pagas mes a mes.' },
                { t: 'Actualización (INPC)', d: 'Cuando un pago al IMSS se hace tarde (retroactivo), el monto original se "actualiza" multiplicándolo por la inflación acumulada de esos meses, para que valga lo mismo en pesos de hoy que cuando se debió pagar.' },
                { t: 'Recargos', d: 'Un cargo adicional que cobra el IMSS por cada mes de atraso en un pago, similar a un interés moratorio. Se suma encima de la actualización por inflación.' },
                { t: 'Pensión Mínima Garantizada (PMG)', d: 'Un piso que nunca se cruza hacia abajo: si la pensión calculada con la fórmula normal sale menor a este monto (equivalente a un salario mínimo), el IMSS paga la PMG en su lugar.' },
              ].map((item, i) => (
                <div key={i} style={{ paddingBottom: '10px', borderBottom: i < 7 ? '1px solid #f1f5f9' : 'none' }}>
                  <p style={{ fontSize: '12.5px', fontWeight: '700' as const, color: '#1e293b', margin: '0 0 3px' }}>{item.t}</p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.6 }}>{item.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Guía: por qué importan los años Y meses al elegir cuándo iniciar Mod 40 ── */}
      {showGuiaEdadMod40 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowGuiaEdadMod40(false) }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '560px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700' as const, color: AZUL, margin: 0 }}>¿Por qué pedimos años Y meses, no solo años?</p>
              <button onClick={() => setShowGuiaEdadMod40(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
              <p>La UMA (Unidad de Medida y Actualización) se actualiza <strong>cada 1° de enero</strong>. El costo mensual de Modalidad 40 y la pensión que resulta dependen de la UMA vigente en el <strong>año calendario</strong> en que el cliente da de alta su Modalidad 40.</p>
              <p>Si solo usáramos años completos, dos clientes con la misma "edad de inicio: 61 años" podrían en realidad estar arrancando en años calendario distintos:</p>
              <ul style={{ paddingLeft: '18px', margin: '6px 0' }}>
                <li>Un cliente que cumple 61 años en <strong>enero</strong> de 2027 inicia con la UMA de 2027.</li>
                <li>Un cliente que cumple 61 años en <strong>noviembre</strong> de 2027, si decide esperar a "cumplir 61" antes de iniciar, también arranca en 2027 — pero si su cumpleaños cae en <strong>diciembre</strong>, fácilmente termina iniciando ya en <strong>enero del año siguiente</strong>, con una UMA distinta.</li>
              </ul>
              <p>Por eso el campo pide <strong>años y meses exactos</strong> desde tu fecha de nacimiento: con esa precisión calculamos el mes y año calendario real en que cumplirías esa edad, y usamos la UMA proyectada de <strong>ese</strong> año — no la de un año aproximado.</p>
              <p style={{ margin: '10px 0 0', padding: '8px 10px', background: '#EFF6FF', borderRadius: '6px', color: AZUL, fontWeight: '600' as const }}>
                En corto: un mes de diferencia en la fecha de inicio puede mover el "Año de inicio del trámite" un año completo, y eso cambia el costo y la pensión proyectada.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Tooltip tabla cuantía de pensión ── */}
      {showTooltipCuantia && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowTooltipCuantia(false) }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '520px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '700' as const, color: AZUL, margin: 0 }}>Tabla de cuantía de pensión — Ley 73</p>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>Art. 167 LSS 1973 · La cuantía aumenta 1.25% por cada 52 semanas adicionales sobre 500</p>
              </div>
              <button onClick={() => setShowTooltipCuantia(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: AZUL }}>
                    {['Semanas cotizadas', 'Años cotizados', '% del SDI', 'Sobre pensión base'].map((h, i) => (
                      <th key={i} style={{ padding: '7px 10px', color: 'white', textAlign: i > 0 ? 'right' : 'left', fontSize: '10px', fontWeight: '700' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TABLA_CUANTIA.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 10px', fontWeight: '600' as const, color: AZUL }}>{row.semanas}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' as const, color: '#374151' }}>{Math.floor((row.semanas - 500) / 52) + 9.6} aprox.</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' as const, fontWeight: '700' as const, color: NARANJA }}>{row.pct}%</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' as const, color: '#94a3b8', fontSize: '11px' }}>{row.descripcion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '12px' }}>
              <div style={{ background: '#FFF7ED', borderRadius: '8px', padding: '10px 12px', border: '1px solid #fed7aa' }}>
                <p style={{ fontSize: '10px', color: '#92400e', margin: '0 0 3px', fontWeight: '700' as const }}>CESANTÍA (60-64 años)</p>
                <p style={{ fontSize: '11px', color: '#92400e', margin: 0, lineHeight: 1.5 }}>Se aplica un factor reductor: 75% a los 60, 80% a los 61, 85% a los 62, 90% a los 63, 95% a los 64 años. Se requiere acreditar haber dejado de trabajar.</p>
              </div>
              <div style={{ background: '#F0FDF4', borderRadius: '8px', padding: '10px 12px', border: '1px solid #bbf7d0' }}>
                <p style={{ fontSize: '10px', color: '#15803d', margin: '0 0 3px', fontWeight: '700' as const }}>VEJEZ (65+ años)</p>
                <p style={{ fontSize: '11px', color: '#15803d', margin: 0, lineHeight: 1.5 }}>Factor del 100%. No requiere acreditar cesantía. Es la modalidad más conveniente si el cliente puede esperar hasta los 65 años.</p>
              </div>
            </div>
            <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              Fuente: Ley del Seguro Social 1973, Arts. 167-168. La cuantía también se incrementa en 2% por cada 52 semanas adicionales sobre las 500 mínimas, con un tope del 100% del SDI promedio.
            </p>
          </div>
        </div>
      )}

      {/* ── Modal confirmación cambio de cliente ── */}
      {showConfirmCambio && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' as const, color: '#1B3A6B', margin: '0 0 10px' }}>⚠️ ¿Cambiar de cliente?</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.6 }}>
              {diagGuardadoId
                ? 'El diagnóstico ya fue guardado. Puedes cambiar de cliente sin perder nada.'
                : 'El análisis generado y los datos actuales se perderán si no has guardado el diagnóstico.'}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowConfirmCambio(false); setPendingClienteId('') }}
                style={{ flex: 1, padding: '9px', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#F4F6FB', color: '#64748b', fontSize: '13px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={() => {
                setClienteId(pendingClienteId)
                setDiagGuardadoId(null)
                setEstatus('borrador')
                setAnalisis([])
                setPendingClienteId('')
                setShowConfirmCambio(false)
              }}
                style={{ flex: 2, padding: '9px', border: 'none', borderRadius: '8px', background: '#1B3A6B', color: 'white', fontSize: '13px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                Sí, cambiar de cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Desglose completo 250 semanas ── */}
      {showDetalle250 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setShowDetalle250(false)}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '640px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700' as const, color: AZUL, margin: 0 }}>Desglose completo — 250 semanas cotizadas</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>SDI promedio ponderado: <strong style={{ color: NARANJA }}>{fmtMXN2(sdiPromedio)}</strong></p>
              </div>
              <button onClick={() => setShowDetalle250(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F4F6FB' }}>
                  {['#', 'Fecha inicio', 'Fecha fin', 'Semanas', 'SDI diario', 'SDI mensual', 'Peso'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', textAlign: i > 0 ? 'right' : 'center', fontSize: '10px', fontWeight: '700' as const, color: '#64748b', textTransform: 'uppercase' as const, borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodos.map((p, i) => (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', textAlign: 'center' as const, color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#374151' }}>{p.fecha_inicio?.slice(0, 10)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#374151' }}>{p.fecha_fin?.slice(0, 10)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, fontWeight: '600' as const, color: '#374151' }}>{p.semanas}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, fontWeight: '700' as const, color: NARANJA }}>{fmtMXN2(p.sdi)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#374151' }}>{fmtMXN(p.sdi * 30.4)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#64748b' }}>{p.peso.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={3} style={{ padding: '8px 10px', fontWeight: '700' as const, color: AZUL }}>Promedio ponderado</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' as const, fontWeight: '700' as const, color: AZUL }}>{periodos.reduce((s, p) => s + p.semanas, 0)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' as const, fontWeight: '800' as const, color: NARANJA, fontSize: '14px' }}>{fmtMXN2(sdiPromedio)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' as const, fontWeight: '700' as const, color: AZUL }}>{fmtMXN(sdiPromedio * 30.4)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' as const, fontWeight: '700' as const, color: AZUL }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Historial laboral completo ── */}
      {showHistorialCompleto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setShowHistorialCompleto(false)}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '760px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700' as const, color: AZUL, margin: 0 }}>Historial laboral completo</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>{periodosCompletos.length} períodos · {Math.round(periodosCompletos.reduce((s: number, p: any) => s + (p.semanas || 0), 0))} semanas totales · ordenado del más antiguo al más reciente</p>
              </div>
              <button onClick={() => setShowHistorialCompleto(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F4F6FB' }}>
                  {['#', 'Fecha inicio', 'Fecha fin', 'Semanas', 'SDI diario', 'Patrón'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', textAlign: i > 0 ? 'right' : 'center', fontSize: '10px', fontWeight: '700' as const, color: '#64748b', textTransform: 'uppercase' as const, borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...periodosCompletos].sort((a: any, b: any) => {
                  if (!a.fecha_inicio) return 1
                  if (!b.fecha_inicio) return -1
                  return new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime()
                }).map((p: any, i: number) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', textAlign: 'center' as const, color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#374151' }}>{p.fecha_inicio?.slice(0, 10) || '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#374151' }}>{p.fecha_fin?.slice(0, 10) || 'Vigente'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, fontWeight: '600' as const, color: '#374151' }}>{(p.semanas || 0).toFixed(2)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, fontWeight: '700' as const, color: NARANJA }}>{fmtMXN2(p.sdi || 0)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#64748b', fontSize: '11px' }}>{p.patron || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ CARÁTULA DE BIENVENIDA ══ */}
      {/* ══ MODAL 1: Bienvenida — ambos campos obligatorios ══ */}
      {appInicializado && mostrarCaratula && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '400px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

            {/* Header azul */}
            <div style={{ background: AZUL, padding: '26px 28px 20px', textAlign: 'center' as const }}>
              <div style={{ fontSize: '32px', fontWeight: '900' as const, color: 'white', letterSpacing: '-1px', fontFamily: 'Arial Black, sans-serif', marginBottom: '6px' }}>
                KSE<sup style={{ fontSize: '12px', verticalAlign: 'super' }}>®</sup>
              </div>
              <h2 style={{ fontSize: '15px', fontWeight: '700' as const, color: 'white', margin: '0 0 4px' }}>Calculadora de Pensión</h2>
              <p style={{ fontSize: '11px', color: '#93C5FD', margin: 0 }}>Completa los dos pasos para continuar</p>
            </div>

            <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* Paso 1: Cliente */}
              <div style={{ border: `2px solid ${clienteId ? VERDE : '#E5E7EB'}`, padding: '14px 16px', background: clienteId ? '#F0FDF4' : 'white', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: clienteId ? '0' : '10px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: clienteId ? VERDE : '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px', fontWeight: '700' as const, color: 'white' }}>
                    {clienteId ? '✓' : '1'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: '700' as const, color: clienteId ? VERDE : '#374151' }}>
                      {clienteId ? `Cliente: ${clientes.find(c => c.id === clienteId)?.nombre ?? ''}` : 'Seleccionar cliente'}
                    </p>
                    {!clienteId && <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#9CA3AF' }}>Requerido</p>}
                  </div>
                  {clienteId && (
                    <button onClick={() => setClienteId('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#9CA3AF', padding: '0 2px' }}>✕</button>
                  )}
                </div>
                {!clienteId && (
                  <button onClick={() => setShowClienteModal(true)}
                    style={{ width: '100%', padding: '9px', background: 'white', color: AZUL, border: `1.5px solid ${AZUL}`, cursor: 'pointer', fontSize: '13px', fontWeight: '600' as const, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    👤 Seleccionar cliente existente
                  </button>
                )}
              </div>

              {/* Paso 2: Constancia */}
              <div style={{ border: `2px solid ${datos.semanas_totales > 0 ? VERDE : '#E5E7EB'}`, padding: '14px 16px', background: datos.semanas_totales > 0 ? '#F0FDF4' : 'white', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: datos.semanas_totales > 0 ? '0' : '10px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: datos.semanas_totales > 0 ? VERDE : '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px', fontWeight: '700' as const, color: 'white' }}>
                    {datos.semanas_totales > 0 ? '✓' : '2'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: '700' as const, color: datos.semanas_totales > 0 ? VERDE : '#374151' }}>
                      {datos.semanas_totales > 0 ? `Constancia cargada — ${datos.semanas_totales} semanas` : 'Cargar constancia IMSS'}
                    </p>
                    {datos.semanas_totales === 0 && <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#9CA3AF' }}>Requerido — PDF de semanas cotizadas</p>}
                  </div>
                </div>
                {datos.semanas_totales === 0 && (
                  <label style={{ width: '100%', padding: '9px', background: AZUL, color: 'white', cursor: extracting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxSizing: 'border-box' as const, opacity: extracting ? 0.7 : 1 }}>
                    {extracting ? '⏳ Extrayendo...' : '📎 Cargar Constancia Semanas Cotizadas'}
                    <input type="file" accept=".pdf" style={{ display: 'none' }} disabled={extracting} onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) extraerPDF(f)
                    }} />
                  </label>
                )}
              </div>

              {/* Botón continuar */}
              <button
                onClick={() => setMostrarCaratula(false)}
                disabled={!clienteId || datos.semanas_totales === 0}
                style={{ width: '100%', padding: '13px', background: clienteId && datos.semanas_totales > 0 ? AZUL : '#E5E7EB', color: clienteId && datos.semanas_totales > 0 ? 'white' : '#9CA3AF', border: 'none', cursor: clienteId && datos.semanas_totales > 0 ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: '700' as const, fontFamily: 'inherit', transition: 'all 0.2s' }}>
                {clienteId && datos.semanas_totales > 0 ? '→ Continuar a la calculadora' : 'Completa los dos pasos para continuar'}
              </button>

              {/* Salir */}
              <a href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px', color: '#9CA3AF', border: '1px solid #E5E7EB', fontSize: '12px', textDecoration: 'none' }}>
                ← Salir — ir a mi día
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL 2: Lista de clientes — abre sobre el modal 1 ══ */}
      {showClienteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: '700' as const, color: AZUL }}>Seleccionar cliente</p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#9CA3AF' }}>Selecciona un Prospecto o cliente en Diagnóstico</p>
              </div>
              <button onClick={() => { setShowClienteModal(false); setBuscarCliente('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#9CA3AF', lineHeight: 1, padding: '0 4px' }}>✕</button>
            </div>

            {/* Buscador */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>🔍</span>
                <input
                  value={buscarCliente}
                  onChange={e => setBuscarCliente(e.target.value)}
                  placeholder="Buscar cliente..."
                  autoFocus
                  style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid #D1D5DB', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
            </div>

            {/* Lista */}
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {clientes.filter(c => c.nombre.toLowerCase().includes(buscarCliente.toLowerCase())).map(c => (
                <button key={c.id}
                  onClick={() => { setClienteId(c.id); setBuscarCliente(''); setShowClienteModal(false) }}
                  style={{ width: '100%', padding: '11px 16px', background: 'white', border: 'none', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '34px', height: '34px', background: '#EEF2F8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700' as const, color: AZUL }}>
                    {c.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600' as const, color: '#1e293b' }}>{c.nombre}</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{c.telefono ?? ''}</div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: '700' as const, padding: '3px 10px', background: c.etapa_kanban === 'diagnostico' ? '#DCFCE7' : '#EEF2F8', color: c.etapa_kanban === 'diagnostico' ? '#15803D' : AZUL, flexShrink: 0 }}>
                    {c.etapa_kanban === 'diagnostico' ? 'Diagnóstico' : 'Prospecto'}
                  </span>
                </button>
              ))}
              {clientes.filter(c => c.nombre.toLowerCase().includes(buscarCliente.toLowerCase())).length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center' as const, color: '#9CA3AF', fontSize: '13px' }}>Sin resultados</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ LAYOUT PRINCIPAL: 2 columnas ══ */}
      {(!mostrarCaratula || clienteId) && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── Panel izquierdo fijo ── */}
          <div style={{ width: '585px', flexShrink: 0, background: '#FAFBFC', borderRight: '2px solid #E5E7EB', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ background: AZUL, padding: '14px 18px', flexShrink: 0 }}>
              <h2 style={{ fontSize: '14px', fontWeight: '800' as const, color: 'white', margin: '0 0 2px', letterSpacing: '0.3px' }}>CALCULADORA DE PENSIÓN</h2>
              <p style={{ fontSize: '11px', color: '#93C5FD', margin: 0 }}>Ley del Seguro Social 1973</p>
            </div>

            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>

              {/* ── Identificación */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '3px', height: '14px', background: AZUL, flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', fontWeight: '700' as const, color: AZUL, textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>Identificación</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>
                    <span style={{ fontSize: '9.5px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>Cliente / Asesorado</span>
                    <div style={{ padding: '7px 10px', background: clienteId ? '#EEF2F8' : '#F9FAFB', border: '1px solid ' + (clienteId ? '#BFDBFE' : '#E5E7EB'), fontSize: '13px', fontWeight: clienteId ? '600' : '400', color: clienteId ? AZUL : '#9CA3AF', fontStyle: clienteId ? 'normal' : 'italic' }}>
                      {clientes.find(c => c.id === clienteId)?.nombre || 'Sin cliente seleccionado'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '9.5px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>Nombre del trabajador</span>
                    <div style={{ padding: '7px 10px', background: datos.nombre_trabajador ? 'white' : '#F9FAFB', border: '1px solid ' + (datos.nombre_trabajador ? '#D1D5DB' : '#E5E7EB'), fontSize: '13px', fontWeight: datos.nombre_trabajador ? '500' : '400', color: datos.nombre_trabajador ? '#111827' : '#9CA3AF', fontStyle: datos.nombre_trabajador ? 'normal' : 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {datos.nombre_trabajador ? (<><span style={{ fontSize: '9px', background: '#D1FAE5', color: '#065F46', padding: '1px 5px', fontWeight: '700' as const, fontStyle: 'normal' }}>IMSS</span>{datos.nombre_trabajador}</>) : 'Se extrae de la constancia IMSS'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {[
                      { label: 'NSS', value: datos.nss },
                      { label: 'Régimen', value: datos.ley ? 'Ley ' + datos.ley : '' },
                      { label: 'Fecha de nacimiento', value: datos.fecha_nacimiento },
                      { label: 'Edad actual', value: datos.edad_actual ? datos.edad_actual.toFixed(1) + ' años' : '' },
                    ].map(({ label, value }, i) => (
                      <div key={i}>
                        <span style={{ fontSize: '9.5px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.3px' }}>{label}</span>
                        <div style={{ padding: '6px 8px', background: value ? 'white' : '#F9FAFB', border: '1px solid ' + (value ? '#D1D5DB' : '#E5E7EB'), fontSize: '12px', color: value ? '#111827' : '#CBD5E1', fontStyle: value ? 'normal' : 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {value ? (<><span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981', flexShrink: 0, display: 'inline-block' as const }} />{value}</>) : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #E5E7EB' }} />

              {/* ── Cotización */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '3px', height: '14px', background: NARANJA, flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', fontWeight: '700' as const, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>Cotización</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                  <div>
                    <span style={{ fontSize: '9px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const }}>Total semanas</span>
                    <div style={{ padding: '8px', background: datos.semanas_totales ? '#FFFBEB' : '#F9FAFB', border: '1px solid ' + (datos.semanas_totales ? '#FCD34D' : '#E5E7EB'), fontSize: '18px', fontWeight: '900' as const, color: datos.semanas_totales ? '#92400E' : '#CBD5E1', textAlign: 'center' as const }}>
                      {datos.semanas_totales || '—'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const }}>Descontadas</span>
                    <div style={{ padding: '8px', background: 'white', border: '1px solid #E5E7EB', fontSize: '18px', fontWeight: '900' as const, color: datos.semanas_descontadas > 0 ? '#DC2626' : '#CBD5E1', textAlign: 'center' as const }}>
                      {datos.semanas_descontadas > 0 ? datos.semanas_descontadas : '—'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const }}>Netas</span>
                    <div style={{ padding: '8px', background: datos.semanas_totales ? '#EEF2F8' : '#F9FAFB', border: '1px solid ' + (datos.semanas_totales ? AZUL : '#E5E7EB'), fontSize: '18px', fontWeight: '900' as const, color: datos.semanas_totales ? AZUL : '#CBD5E1', textAlign: 'center' as const }}>
                      {datos.semanas_totales ? (datos.semanas_totales - datos.semanas_descontadas) : '—'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  <div>
                    <span style={{ fontSize: '9px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const }}>Vigencia</span>
                    <div style={{ padding: '6px 8px', background: conservacion.vigente ? '#F0FDF4' : datos.semanas_totales ? '#FEF2F2' : '#F9FAFB', border: '1px solid ' + (conservacion.vigente ? '#86EFAC' : datos.semanas_totales ? '#FCA5A5' : '#E5E7EB'), fontSize: '11.5px', fontWeight: '700' as const, color: conservacion.vigente ? '#15803D' : datos.semanas_totales ? '#DC2626' : '#CBD5E1', textAlign: 'center' as const }}>
                      {datos.semanas_totales ? (conservacion.vigente ? '✓ Vigente' : '✕ Vencida') : '—'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const }}>Cotizando</span>
                    <div style={{ padding: '6px 8px', background: 'white', border: '1px solid #E5E7EB', fontSize: '11.5px', fontWeight: '600' as const, color: '#374151', textAlign: 'center' as const }}>
                      {datos.sigue_cotizando ? '✓ Sí' : '✕ No'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const }}>Art. 165</span>
                    <div style={{ padding: '6px 8px', background: 'white', border: '1px solid #E5E7EB', fontSize: '11.5px', fontWeight: '600' as const, color: '#374151', textAlign: 'center' as const }}>
                      {datos.tiene_ayuda_asistencial ? '✓ Aplica' : 'No'}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #E5E7EB' }} />

              {/* ── Familia */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ width: '3px', height: '14px', background: VERDE, flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', fontWeight: '700' as const, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>Familia y beneficiarios</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  {[
                    { label: 'Cónyuge', value: datos.tiene_conyuge ? 'Sí' : 'No', ok: datos.tiene_conyuge },
                    { label: 'Hijos < 16', value: String(datos.num_hijos), ok: datos.num_hijos > 0 },
                    { label: 'Padres dep.', value: String(datos.num_padres), ok: datos.num_padres > 0 },
                  ].map(({ label, value, ok }, i) => (
                    <div key={i} style={{ textAlign: 'center' as const, padding: '10px 6px', background: 'white', border: '1px solid #E5E7EB' }}>
                      <div style={{ fontSize: '20px', fontWeight: '800' as const, color: ok ? VERDE : '#9CA3AF' }}>{value}</div>
                      <div style={{ fontSize: '9.5px', color: '#9CA3AF', marginTop: '2px', textTransform: 'uppercase' as const, letterSpacing: '0.3px' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #E5E7EB' }} />

              {/* ── Tabla factores edad */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ width: '3px', height: '14px', background: '#7C3AED', flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', fontWeight: '700' as const, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>% pensión por edad de retiro (Ley 73)</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: AZUL }}>
                      {['Edad', '% Cuantía', 'Tipo de pensión'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 10px', color: 'white', fontSize: '10.5px', fontWeight: '700' as const, textAlign: i === 0 ? 'center' as const : i === 1 ? 'center' as const : 'left' as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[[60,'75%','Cesantía en Edad Avanzada'],[61,'80%','Cesantía en Edad Avanzada'],[62,'85%','Cesantía en Edad Avanzada'],[63,'90%','Cesantía en Edad Avanzada'],[64,'95%','Cesantía en Edad Avanzada']].map(([edad, pct, tipo], i) => {
                      const isActive = datos.edad_actual && Math.floor(datos.edad_actual) === Number(edad)
                      return (
                        <tr key={i} style={{ background: isActive ? '#EEF2F8' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '12px', fontWeight: isActive ? '800' : '500', color: isActive ? AZUL : '#374151' }}>{edad} años</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '14px', fontWeight: '800' as const, color: isActive ? AZUL : '#374151' }}>{pct}</td>
                          <td style={{ padding: '7px 10px', fontSize: '11px', color: '#6B7280' }}>{tipo as string}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ background: VERDE }}>
                      <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '12px', fontWeight: '800' as const, color: 'white' }}>65+ años</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '14px', fontWeight: '900' as const, color: 'white' }}>100%</td>
                      <td style={{ padding: '7px 10px', fontSize: '11px', color: 'white', fontWeight: '600' as const }}>Vejez (IDEL)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          </div>

          {/* ── Panel derecho dinámico ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Barra de KPIs + acciones superior */}
            {/* Nav bar */}
            <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #F3F4F6', background: 'white', flexShrink: 0 }}>
              {!clienteId && (
                <div style={{ padding: '8px 16px', background: '#FFF7ED', borderBottom: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: '#92400e', fontWeight: '600' as const }}>⚠️ Selecciona un cliente para iniciar el diagnóstico</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', gap: '10px', overflowX: 'auto' }}>
                <p style={{ fontSize: '14px', fontWeight: '700' as const, color: '#1e293b', margin: 0, whiteSpace: 'nowrap' }}>
                  {TABS[tab]}
                  {clienteSeleccionado && <span style={{ color: AZUL, fontWeight: '600' as const, fontSize: '12px' }}> · {clienteSeleccionado.nombre}</span>}
                  {diagGuardadoId && <span style={{ color: estatus === 'autorizado' ? VERDE : '#f59e0b', fontWeight: '600' as const, fontSize: '12.5px' }}> · {estatus === 'autorizado' ? '✅ Autorizado' : '📝 Borrador'}</span>}
                </p>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  <button
                    onClick={() => setShowGuia(!showGuia)}
                    style={{ padding: '5px 10px', background: showGuia ? '#EEF2F8' : 'white', border: '1px solid #E5E7EB', cursor: 'pointer', fontSize: '11px', fontWeight: '600' as const, color: '#1B3A6B', fontFamily: 'inherit' }}
                    title="Glosario de términos"
                  >
                    📖 Glosario
                  </button>
                </div>
              </div>
            </div>

            {/* ── Panel glosario deslizable ── */}
            {showGuia && (
              <div style={{ position: 'absolute' as const, top: 0, right: 0, width: '300px', height: '100%', background: 'white', borderLeft: '2px solid #E5E7EB', zIndex: 50, overflowY: 'auto' as const, boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' }}>
                <div style={{ background: '#1B3A6B', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700' as const, color: 'white', margin: 0 }}>📖 Glosario de Términos</p>
                  <button onClick={() => setShowGuia(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ padding: '12px' }}>
                  {Object.entries(GLOSARIO).map(([id, g]) => (
                    <div key={id} style={{ padding: '10px 12px', marginBottom: '6px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderLeft: '3px solid #1B3A6B' }}>
                      <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#1B3A6B', margin: '0 0 4px' }}>{g.titulo}</p>
                      <p style={{ fontSize: '11.5px', color: '#374151', margin: '0 0 4px', lineHeight: 1.5 }}>{g.desc}</p>
                      {g.ejemplo && <p style={{ fontSize: '10.5px', color: '#9CA3AF', margin: 0, fontStyle: 'italic' }}>Ej: {g.ejemplo}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── KPI bar — indicadores clave ── */}
            <div style={{ display: 'flex', background: 'white', borderBottom: '2px solid #E5E7EB', flexShrink: 0, overflowX: 'auto' }}>
              {[
                { label: 'Semanas cotizadas', value: datos.semanas_totales > 0 ? (datos.semanas_totales - datos.semanas_descontadas).toLocaleString() : '—', color: (datos.semanas_totales - datos.semanas_descontadas) >= 500 ? VERDE : AZUL },
                { label: 'Régimen', value: datos.ley ? 'Ley ' + datos.ley : '—', color: AZUL },
                { label: 'Edad pensión', value: (datos.edad_min_pension || 60) + ' años', color: AZUL },
                { label: 'SDI 250 sem.', value: sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—', color: NARANJA },
                { label: 'Sem. faltantes', value: datos.semanas_totales > 0 ? String(Math.max(0, 500 - (datos.semanas_totales - datos.semanas_descontadas))) : '—', color: Math.max(0, 500 - (datos.semanas_totales - datos.semanas_descontadas)) === 0 ? VERDE : '#DC2626' },
                { label: 'Total sem. cot.', value: escenarios.find(e => e.recomendado)?.semanas_finales ? String(Math.round(escenarios.find(e => e.recomendado)!.semanas_finales)) : '—', color: AZUL },
                { label: 'Fecha del trámite', value: datos.fecha_nacimiento ? (() => { const d = new Date(datos.fecha_nacimiento); d.setFullYear(d.getFullYear() + (datos.edad_min_pension || 60)); return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) })() : '—', color: '#7C3AED' },
              ].map((k, i) => (
                <div key={i} style={{ flex: '1 1 0', padding: '10px 12px', borderRight: '1px solid #F3F4F6', borderBottom: '3px solid ' + k.color, background: 'white', minWidth: '100px', maxWidth: '160px' }}>
                  <div style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', whiteSpace: 'nowrap', marginBottom: '4px', fontWeight: '600' as const }}>{k.label}</div>
                  <div style={{ fontSize: '14px', fontWeight: '800' as const, color: k.color, whiteSpace: 'nowrap', letterSpacing: '-0.3px' }}>{k.value}</div>
                </div>
              ))}
            </div>
{/* Contenido de la pestaña actual */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#F4F6FB', fontSize: '13px', minWidth: 0, position: 'relative' as const }}>

              {/* ── Marca de agua KSE ── */}
              <div style={{ position: 'fixed' as const, inset: 0, pointerEvents: 'none' as const, zIndex: 1, overflow: 'hidden' }}>
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute' as const, top: 0, left: 0 }}>
                  <defs>
                    <pattern id="kse-wm" x="0" y="0" width="260" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
                      <text x="10" y="60" fontFamily="Arial Black, sans-serif" fontSize="22" fontWeight="900" fill="#1B3A6B" fillOpacity="0.045" letterSpacing="4">KSE®</text>
                      <text x="30" y="110" fontFamily="Arial, sans-serif" fontSize="9" fill="#1B3A6B" fillOpacity="0.04" letterSpacing="2">PENSIONES</text>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#kse-wm)" />
                </svg>
              </div>

        {/* ══ TAB 0: DATOS GENERALES ══════════════════════════════════ */}
        {tab === 0 && (() => {
          const sem = datos.semanas_totales - datos.semanas_descontadas
          const semFaltantes = Math.max(0, 500 - sem)
          const fechaTramite = datos.fecha_nacimiento ? (() => {
            const d = new Date(datos.fecha_nacimiento)
            d.setFullYear(d.getFullYear() + (datos.edad_min_pension || 60))
            return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
          })() : '—'
          const totalSemCot = escenarios.find(e => e.recomendado)?.semanas_finales?.toFixed(0) ?? sem.toFixed(0)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Indicadores rápidos — estado del expediente */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Semanas netas', value: sem > 0 ? sem.toLocaleString() : '—', sub: 'cotizadas', color: sem >= 500 ? '#065F46' : '#1B3A6B', bg: sem >= 500 ? '#F0FDF4' : '#EEF2F8', border: sem >= 500 ? '#86EFAC' : '#1B3A6B' },
                  { label: 'Semanas faltantes', value: semFaltantes === 0 ? '✓ 0' : semFaltantes.toLocaleString(), sub: 'para 500 sem.', color: semFaltantes === 0 ? '#065F46' : semFaltantes < 100 ? '#92400E' : '#DC2626', bg: semFaltantes === 0 ? '#F0FDF4' : '#FEF2F2', border: semFaltantes === 0 ? '#86EFAC' : '#FCA5A5' },
                  { label: 'SDI promedio', value: sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—', sub: '250 semanas', color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
                  { label: 'Fecha del trámite', value: fechaTramite, sub: 'estimada', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
                ].map((k, i) => (
                  <div key={i} style={{ background: k.bg, border: '2px solid ' + k.border, padding: '12px 14px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, marginBottom: '5px' }}>{k.label}</div>
                    <div style={{ fontSize: '18px', fontWeight: '800' as const, color: k.color, letterSpacing: '-0.5px', marginBottom: '2px' }}>{k.value}</div>
                    <div style={{ fontSize: '10px', color: '#9CA3AF' }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Ficha técnica — layout 2 columnas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

                {/* Columna 1: Datos de cotización */}
                <div style={DS.card}>
                  <p style={DS.secTitle}>📋 Parámetros de Retiro</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={DS.label}>Fecha de cálculo del proyecto</label>
                      <input type="date" value={datos.fecha_calculo} onChange={e => setDatos(p => ({ ...p, fecha_calculo: e.target.value }))} style={DS.input} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={DS.label}>¿Seguirás cotizando?</label>
                        <select value={datos.sigue_cotizando ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, sigue_cotizando: e.target.value === 'si' }))} style={DS.select}>
                          <option value="si">✓ Sí</option>
                          <option value="no">✕ No</option>
                        </select>
                      </div>
                      <div>
                        <label style={DS.label}>Edad de pensión</label>
                        <select value={datos.edad_min_pension || 60} onChange={e => { const v = parseInt(e.target.value); setDatos(p => ({ ...p, edad_min_pension: v })); setEdadRetiro(v) }} style={DS.select}>
                          {[60,61,62,63,64,65].map(a => <option key={a} value={a}>{a} años — {75+(a-60)*5}%{a===65?' (Vejez)':''}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={DS.label}>Cónyuge / concubino</label>
                        <select value={datos.tiene_conyuge ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, tiene_conyuge: e.target.value === 'si' }))} style={DS.select}>
                          <option value="no">✕ No</option>
                          <option value="si">✓ Sí</option>
                        </select>
                      </div>
                      <div>
                        <label style={DS.label}>Hijos menores 16 años</label>
                        <select value={datos.num_hijos} onChange={e => setDatos(p => ({ ...p, num_hijos: parseInt(e.target.value) }))} style={DS.select}>
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n} {n === 0 ? '(ninguno)' : n === 1 ? 'hijo' : 'hijos'}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={DS.label}>Padres dependientes</label>
                        <select value={datos.num_padres} onChange={e => setDatos(p => ({ ...p, num_padres: parseInt(e.target.value) }))} style={DS.select}>
                          {[0,1,2].map(n => <option key={n} value={n}>{n} {n === 0 ? '(ninguno)' : n === 1 ? 'padre' : 'padres'}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={DS.label}>Ayuda asistencial (Art. 165)</label>
                        <select value={datos.tiene_ayuda_asistencial ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, tiene_ayuda_asistencial: e.target.value === 'si' }))} style={DS.select}>
                          <option value="no">✕ No aplica</option>
                          <option value="si">✓ Aplica</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Columna 2: Datos calculados automáticamente */}
                <div style={DS.card}>
                  <p style={DS.secTitle}>⚙️ Datos Calculados Automáticamente</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { label: 'Semanas restantes por cotizar', value: semFaltantes === 0 ? '✓ Completo (≥ 500)' : semFaltantes + ' semanas', highlight: semFaltantes === 0 },
                      { label: 'Fecha estimada del trámite', value: fechaTramite, highlight: false },
                      { label: 'Total semanas para el cálculo', value: totalSemCot + ' semanas', highlight: false },
                    ].map(({ label, value, highlight }, i) => (
                      <div key={i} style={{ padding: '10px 12px', background: highlight ? '#F0FDF4' : '#F9FAFB', border: '1px solid ' + (highlight ? '#86EFAC' : '#E5E7EB'), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>{label}</span>
                        <span style={{ fontSize: '13px', fontWeight: '700' as const, color: highlight ? '#065F46' : '#374151' }}>{value}</span>
                      </div>
                    ))}
                    {/* Vigencia visual */}
                    <div style={{ padding: '12px', background: conservacion.vigente ? '#F0FDF4' : '#FEF2F2', border: '2px solid ' + (conservacion.vigente ? '#86EFAC' : '#FCA5A5'), textAlign: 'center' as const }}>
                      <div style={{ fontSize: '22px', fontWeight: '900' as const, color: conservacion.vigente ? '#065F46' : '#DC2626', marginBottom: '2px' }}>
                        {datos.semanas_totales > 0 ? (conservacion.vigente ? '✓ Derechos Vigentes' : '✕ Derechos Vencidos') : '—'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                        {datos.semanas_totales > 0 ? (conservacion.vigente ? 'Puede tramitar su pensión' : 'Requiere verificación con IMSS') : 'Carga la constancia IMSS'}
                      </div>
                    </div>
                    {/* SDI destacado */}
                    {sdiPromedio > 0 && (
                      <div style={{ padding: '12px', background: '#FFFBEB', border: '2px solid #FCD34D', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, marginBottom: '4px' }}>SDI Promedio — Base oficial de la pensión <Tip id="sdi250" /></div>
                        <div style={{ fontSize: '26px', fontWeight: '900' as const, color: '#92400E', letterSpacing: '-1px' }}>{fmtMXN2(sdiPromedio)}</div>
                        <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>Equivalente mensual: {fmtMXN(sdiPromedio * 30.4167)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabla 250 semanas */}
              <div style={DS.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#111827', margin: '0 0 3px' }}>📊 Salario Promedio de las Últimas 250 Semanas Cotizadas</p>
                    <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>Art. 167 LSS 1973 — Base real del cálculo de pensión, no el salario actual</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => setShowDetalle250(true)} style={{ padding: '5px 10px', background: '#EEF2F8', color: '#1B3A6B', border: '1px solid #BFDBFE', fontSize: '11px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Ver 250 sem.
                    </button>
                    <button onClick={() => setShowHistorialCompleto(true)} style={{ padding: '5px 10px', background: '#F0FDF4', color: '#065F46', border: '1px solid #86EFAC', fontSize: '11px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Historial ({periodosCompletos.length})
                    </button>
                  </div>
                </div>
                {periodos.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center' as const, color: '#9CA3AF', background: '#F9FAFB', border: '1px dashed #E5E7EB' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                    <p style={{ fontSize: '13px', margin: 0 }}>Carga la constancia IMSS para ver el cálculo del SDI</p>
                  </div>
                ) : (
                  <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '12px' }}>
                      <thead>
                        <tr style={{ background: '#1B3A6B' }}>
                          {['PERÍODO', 'SEMANAS', 'SDI DIARIO', 'SDI MENSUAL', 'PESO'].map((h, i) => (
                            <th key={i} style={{ ...DS.tHead, textAlign: i === 0 ? 'left' : 'right' as const, padding: '9px 12px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {periodos.map((p, i) => {
                          const isRecent = i === 0
                          return (
                            <tr key={i} style={{ background: isRecent ? '#FFFBEB' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '8px 12px', color: '#374151', fontWeight: isRecent ? '600' : '400' }}>{p.fecha_inicio?.slice(0,7)} → {p.fecha_fin?.slice(0,7)}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' as const, fontWeight: '600' as const }}>{p.semanas}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' as const, fontWeight: '800' as const, color: '#D95B00', fontSize: '13px' }}>{fmtMXN2(p.sdi)}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' as const, color: '#374151' }}>{fmtMXN(p.sdi * 30.4167)}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' as const }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                  <div style={{ width: '40px', height: '6px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: p.peso + '%', background: '#1B3A6B', borderRadius: '3px' }} />
                                  </div>
                                  <span style={{ fontSize: '11px', color: '#9CA3AF', minWidth: '32px' }}>{p.peso.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        <tr style={{ background: '#1B3A6B' }}>
                          <td style={{ padding: '10px 12px', color: 'white', fontWeight: '700' as const }}>Promedio ponderado</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' as const, color: 'white', fontWeight: '700' as const }}>{periodos.reduce((s, p) => s + p.semanas, 0)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' as const, color: '#FCD34D', fontWeight: '900' as const, fontSize: '16px' }}>{fmtMXN2(sdiPromedio)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' as const, color: 'white', fontWeight: '700' as const }}>{fmtMXN(sdiPromedio * 30.4167)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' as const, color: 'white', fontWeight: '700' as const }}>100%</td>
                        </tr>
                      </tbody>
                    </table>
                    {/* 3 KPIs resumen */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      <div style={{ padding: '12px', background: '#F9FAFB', border: '1px solid #E5E7EB', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '9.5px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, marginBottom: '4px' }}>Período cubierto</div>
                        <div style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151' }}>
                          {periodos.length > 0 ? periodos[0]?.fecha_inicio?.slice(0,7) + ' → ' + periodos[periodos.length-1]?.fecha_fin?.slice(0,7) : '—'}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#9CA3AF', marginTop: '2px' }}>250 semanas hacia atrás</div>
                      </div>
                      <div style={{ padding: '12px', background: '#FFFBEB', border: '2px solid #FCD34D', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '9.5px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, marginBottom: '4px' }}>SDI Promedio 250 sem.<Tip id="sdi250" /></div>
                        <div style={{ fontSize: '22px', fontWeight: '900' as const, color: '#92400E', letterSpacing: '-1px' }}>{fmtMXN2(sdiPromedio)}</div>
                        <div style={{ fontSize: '10.5px', color: '#9CA3AF', marginTop: '2px' }}>Base oficial de la pensión</div>
                      </div>
                      <div style={{ padding: '12px', background: '#EEF2F8', border: '1px solid #BFDBFE', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '9.5px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, marginBottom: '4px' }}>SDI Mensual equivalente</div>
                        <div style={{ fontSize: '20px', fontWeight: '900' as const, color: '#1B3A6B', letterSpacing: '-0.5px' }}>{fmtMXN(sdiPromedio * 30.4167)}</div>
                        <div style={{ fontSize: '10.5px', color: '#9CA3AF', marginTop: '2px' }}>× 30.4 días</div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Siguiente */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                <button onClick={() => setTab(1)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>
                  Cuantías Anuales →
                </button>
              </div>
            </div>
          )
        })()}


        {/* Análisis de IA — visible en tab 0 */}
        {tab === 1 && (() => {
          const sem = datos.semanas_totales - datos.semanas_descontadas
          if (sdiPromedio <= 0) return (
            <div style={{ textAlign: 'center' as const, padding: '60px 20px', color: '#9CA3AF' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
              <p style={{ fontSize: '14px' }}>Carga la constancia IMSS para ver la pensión actual</p>
            </div>
          )
          const res = calcPensionLey73(sem, sdiPromedio, datos.edad_min_pension || 60, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, undefined, datos.tiene_ayuda_asistencial)
          // Chart data
          const totalAnual = res.pensionAnual
          const componentes = [
            { label: 'Cuantía básica', val: res.cuantiaBasicaAnual, color: '#1B3A6B' },
            { label: 'Incrementos anuales', val: res.incrementosAnual, color: '#2E8B57' },
            { label: 'Asignaciones familiares', val: res.asignacionesAnual, color: '#F05B21' },
            { label: 'Ayuda asistencial', val: res.ayudaAsistencialAnual, color: '#7C3AED' },
          ].filter(c => c.val > 0)
          const maxVal = Math.max(...componentes.map(c => c.val))
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* 3 KPIs principales — destacados al frente */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Pensión Mensual', value: fmtMXN2(res.pensionMensual), sub: 'Por mes de 30 días', color: '#1B3A6B', bg: '#EEF2F8', border: '#1B3A6B', critical: true },
                  { label: 'Pensión Anual', value: fmtMXN2(res.pensionAnual), sub: 'Total año', color: '#065F46', bg: '#F0FDF4', border: '#2E8B57', critical: false },
                  { label: 'Aguinaldo', value: fmtMXN2(res.aguinaldoAnual), sub: 'Pago anual equivalente', color: '#92400E', bg: '#FFFBEB', border: '#F59E0B', critical: false },
                ].map((k, i) => (
                  <div key={i} style={{ background: k.bg, border: '2px solid ' + k.border, padding: '16px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '8px', fontWeight: '600' as const }}>{k.label}</div>
                    <div style={{ fontSize: k.critical ? '28px' : '22px', fontWeight: '900' as const, color: k.color, letterSpacing: '-1px', marginBottom: '4px' }}>{k.value}</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Cuantías desglosadas */}
                <div style={DS.card}>
                  <p style={DS.secTitle}>Desglose de Cuantías Anuales</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {[
                      { label: 'Cuantía Básica de Pensión', value: fmtMXN2(res.cuantiaBasicaAnual), color: '#1B3A6B', pct: (res.cuantiaBasicaAnual / totalAnual * 100).toFixed(1) },
                      { label: 'Incrementos Anuales', value: fmtMXN2(res.incrementosAnual), color: '#2E8B57', pct: (res.incrementosAnual / totalAnual * 100).toFixed(1) },
                      { label: 'Asignaciones Familiares', value: fmtMXN2(res.asignacionesAnual), color: '#F05B21', pct: (res.asignacionesAnual / totalAnual * 100).toFixed(1) },
                      { label: 'Ayuda Asistencial', value: fmtMXN2(res.ayudaAsistencialAnual), color: '#7C3AED', pct: (res.ayudaAsistencialAnual / totalAnual * 100).toFixed(1) },
                    ].map(({ label, value, color, pct }, i) => (
                      <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '12px', color: '#374151' }}>{label}</span>
                          <span style={{ fontSize: '13px', fontWeight: '700' as const, color }}>{value}</span>
                        </div>
                        <div style={{ height: '6px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: color, width: pct + '%', borderRadius: '3px', transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '2px', textAlign: 'right' as const }}>{pct}% del total</div>
                      </div>
                    ))}
                    <div style={{ padding: '10px 0', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1B3A6B', marginTop: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700' as const, color: '#111827' }}>TOTAL PENSIÓN ANUAL</span>
                      <span style={{ fontSize: '16px', fontWeight: '900' as const, color: '#1B3A6B' }}>{fmtMXN2(res.pensionAnual)}</span>
                    </div>
                  </div>
                </div>

                {/* Datos de cálculo + indicadores */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={DS.card}>
                    <p style={DS.secTitle}>Factores del Cálculo</p>
                    {[
                      { label: 'Total Pensión por Vejez (100%)', value: fmtMXN2(res.pensionAnual / (res.factorEdad || 0.75)), important: false },
                      { label: 'Porcentaje por edad de retiro', value: ((res.factorEdad || 0.75) * 100).toFixed(0) + '%', important: true },
                      { label: 'Total de Pensión', value: fmtMXN2(res.pensionAnual), important: true },
                      { label: 'Pensión Mínima Garantizada / año', value: fmtMXN2(sys.PMG_L73 * 12), important: false },
                    ].map(({ label, value, important }, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>{label}</span>
                        <span style={{ fontSize: important ? '14px' : '12px', fontWeight: important ? '800' : '600', color: important ? '#1B3A6B' : '#374151' }}>{value}</span>
                      </div>
                    ))}
                    {/* PMG badge */}
                    <div style={{ marginTop: '10px', padding: '10px 12px', background: res.pmg_aplica ? '#F0FDF4' : '#FEF2F2', border: '1px solid ' + (res.pmg_aplica ? '#86EFAC' : '#FCA5A5'), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#374151', fontWeight: '600' as const }}>¿Aplica Pensión Mínima Garantizada (PMG)? <Tip id="pmg" /></span>
                      <span style={{ fontSize: '13px', fontWeight: '800' as const, color: res.pmg_aplica ? '#15803D' : '#DC2626', padding: '3px 10px', background: res.pmg_aplica ? '#DCFCE7' : '#FEE2E2' }}>
                        {res.pmg_aplica ? '✓ SÍ' : '✕ NO'}
                      </span>
                    </div>
                  </div>

                  {/* INPC */}
                  <div style={DS.card}>
                    <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#374151', margin: '0 0 8px' }}>Actualización INPC</p>
                    <div style={{ padding: '10px 14px', background: '#F9FAFB', border: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>Pensión mensual actualizada por INPC</span>
                      <span style={{ fontSize: '13px', fontWeight: '800' as const, color: '#6B7280', background: '#E5E7EB', padding: '3px 10px' }}>NO APLICA</span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '8px 0 0', lineHeight: 1.5 }}>La pensión se actualiza anualmente en febrero conforme al INPC. Si la fecha de baja corresponde a enero, el pensionado recibe la actualización ese mismo año.</p>
                  </div>
                </div>
              </div>

        {/* ── Siguiente sección ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
          <button onClick={() => setTab(2)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>
            Salario Prom. Mod 40 →
          </button>
        </div>
            </div>
          )
        })()}

        {tab === 2 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Header informativo */}
              <div style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #2563EB 100%)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '11px', color: '#93C5FD', margin: '0 0 3px', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: '600' as const }}>Modalidad 40 — Configuración</p>
                  <p style={{ fontSize: '15px', fontWeight: '800' as const, color: 'white', margin: 0 }}>Salario Promedio para Inscripción</p>
                </div>
                {escRec?.sdi_mod40 > 0 && (
                  <div style={{ textAlign: 'right' as const }}>
                    <div style={{ fontSize: '10px', color: '#93C5FD', marginBottom: '2px' }}>SDI a registrar</div>
                    <div style={{ fontSize: '24px', fontWeight: '900' as const, color: 'white', letterSpacing: '-1px' }}>{fmtMXN2(escRec.sdi_mod40)}</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Inputs */}
                <div style={DS.card}>
                  <p style={DS.secTitle}>⚙️ Parámetros de Cotización</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Edad entrada */}
                    <div>
                      <label style={DS.label}>Edad de ingreso a Mod. 40</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div style={{ textAlign: 'center' as const }}>
                          <div style={{ fontSize: '9.5px', color: '#9CA3AF', marginBottom: '3px', fontWeight: '600' as const }}>AÑOS</div>
                          <div style={{ padding: '10px', background: '#EEF2F8', border: '2px solid #1B3A6B', textAlign: 'center' as const, fontSize: '24px', fontWeight: '900' as const, color: '#1B3A6B' }}>{Math.floor(datos.edad_actual || 58)}</div>
                        </div>
                        <div style={{ textAlign: 'center' as const }}>
                          <div style={{ fontSize: '9.5px', color: '#9CA3AF', marginBottom: '3px', fontWeight: '600' as const }}>MESES</div>
                          <div style={{ padding: '10px', background: '#EEF2F8', border: '1px solid #BFDBFE', textAlign: 'center' as const, fontSize: '24px', fontWeight: '900' as const, color: '#1B3A6B' }}>{Math.round(((datos.edad_actual || 58) % 1) * 12)}</div>
                        </div>
                      </div>
                      <p style={{ fontSize: '10.5px', color: '#9CA3AF', margin: '4px 0 0' }}>Calculado automáticamente de la constancia IMSS</p>
                    </div>

                    <div>
                      <label style={DS.label}>Salario a registrar en Mod. 40 (UMAs) <Tip id="uma" /></label>
                      <div style={{ position: 'relative' }}>
                        <select value={mod40Umas} onChange={e => setMod40Umas(Number(e.target.value))} style={{ ...DS.select, paddingRight: '32px', fontWeight: '700' as const, fontSize: '14px', borderWidth: '2px', borderColor: '#F05B21' }}>
                          {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25].map(u => (
                            <option key={u} value={u}>{u} UMA{u > 1 ? 's' : ''} — {fmtMXN2(u * (sys?.UMA_DIARIA ?? 113.14))}/día</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={DS.label}>Duración de cotización en Mod. 40</label>
                      <select value={mod40Meses} onChange={e => setMod40Meses(Number(e.target.value))} style={{ ...DS.select, borderWidth: '2px', borderColor: '#1B3A6B' }}>
                        {[6,12,18,24,30,36,42,48,54,60].map(m => (
                          <option key={m} value={m}>{m} meses ({(m/12).toFixed(1)} años)</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={DS.label}>Simulación libre</label>
                        <select value={simulacionLibre ? 'si' : 'no'} onChange={e => setSimulacionLibre(e.target.value === 'si')} style={DS.select}>
                          <option value="no">✕ No</option>
                          <option value="si">✓ Sí</option>
                        </select>
                      </div>
                      {simulacionLibre && (
                        <div>
                          <label style={DS.label}>UMAs simulación</label>
                          <input type="number" value={simUmas} onChange={e => setSimUmas(Number(e.target.value))} style={DS.input} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Salida calculada */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={DS.cardHighlight}>
                    <p style={DS.secTitle}>📊 Resultado del Cálculo</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { label: 'SDI diario actual (constancia)', value: fmtMXN2(sdiPromedio), color: '#92400E', bg: '#FFFBEB', border: '#FCD34D', big: false },
                        { label: 'SDI registrado en Mod. 40', value: escRec?.sdi_mod40 > 0 ? fmtMXN2(escRec.sdi_mod40) : '—', color: '#F05B21', bg: '#FFF7F4', border: '#FED7AA', big: false },
                        { label: 'Nuevo SDI promedio 250 sem.', value: escRec?.nuevo_sdi_250 > 0 ? fmtMXN2(escRec.nuevo_sdi_250) : '—', color: '#065F46', bg: '#F0FDF4', border: '#86EFAC', big: true },
                        { label: 'Diferencia vs SDI actual', value: escRec?.nuevo_sdi_250 > 0 ? fmtMXN2(escRec.nuevo_sdi_250 - sdiPromedio) : '—', color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD', big: false },
                      ].map(({ label, value, color, bg, border, big }, i) => (
                        <div key={i} style={{ padding: '10px 14px', background: bg, border: '2px solid ' + border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: '#6B7280' }}>{label}</span>
                          <span style={{ fontSize: big ? '20px' : '14px', fontWeight: '800' as const, color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Semanas */}
                  <div style={DS.card}>
                    <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#374151', margin: '0 0 8px' }}>Semanas cotizadas</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                      {[
                        { label: 'Actuales', value: (datos.semanas_totales - datos.semanas_descontadas).toString(), color: '#1B3A6B' },
                        { label: 'Con Mod. 40', value: escRec?.semanas_mod40 ? Math.round(escRec.semanas_mod40).toString() : '—', color: '#F05B21' },
                        { label: 'Total final', value: escRec?.semanas_finales ? Math.round(escRec.semanas_finales).toString() : '—', color: '#065F46', big: true },
                      ].map(({ label, value, color }, i) => (
                        <div key={i} style={{ padding: '10px', textAlign: 'center' as const, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                          <div style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.3px', fontWeight: '600' as const, marginBottom: '4px' }}>{label}</div>
                          <div style={{ fontSize: '20px', fontWeight: '900' as const, color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Siguiente */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                <button onClick={() => setTab(3)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>Costo Mod 40 →</button>
              </div>
            </div>
          )
        })()}

        {tab === 3 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center' as const, padding: '60px', color: '#9CA3AF' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>💰</div>
              <p style={{ fontSize: '14px' }}>Configura el Salario Prom. Mod 40 para continuar</p>
            </div>
          )
          const anioInicio = parseInt(escRec.fecha_ingreso_mod40?.slice(0,4) || '2027')
          const anioFin = parseInt(escRec.fecha_baja_mod40?.slice(0,4) || '2030')
          const rows: any[] = []
          let totalCosto = 0
          for (let a = anioInicio; a <= anioFin; a++) {
            const tasa = getMod40Pct(a)
            const diasAnio = a % 4 === 0 ? 366 : 365
            const sdi = escRec.sdi_mod40 ?? 0
            const cuotaMens = sdi * (tasa / 100) * diasAnio / 12
            const cuotaAnual = cuotaMens * 12
            totalCosto += cuotaAnual
            rows.push({ a, tasa, sdi, cuotaMens, cuotaAnual })
          }
          const maxCuota = Math.max(...rows.map(r => r.cuotaAnual))
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* 3 KPIs críticos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Costo total Mod. 40', value: fmtMXN2(escRec.costo_total), sub: 'pago mes a mes', color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5' },
                  { label: 'Recuperación AFORE (20%)', value: fmtMXN2(escRec.recuperacion_afore), sub: 'se regresa al invertir', color: '#065F46', bg: '#F0FDF4', border: '#86EFAC' },
                  { label: 'Inversión real neta', value: fmtMXN2(escRec.inversion_neta), sub: 'costo menos AFORE', color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
                ].map((k, i) => (
                  <div key={i} style={{ background: k.bg, border: '2px solid ' + k.border, padding: '16px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '9.5px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, marginBottom: '6px' }}>{k.label}</div>
                    <div style={{ fontSize: '24px', fontWeight: '900' as const, color: k.color, letterSpacing: '-1px', marginBottom: '3px' }}>{k.value}</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Tabla año por año */}
              <div style={DS.card}>
                <p style={DS.secTitle}>💳 Desglose año por año</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#1B3A6B' }}>
                      {['Año', 'SDI Registrado', 'Tasa Mod. 40', 'Cuota mensual', 'Cuota anual', 'Proporción'].map((h, i) => (
                        <th key={i} style={{ ...DS.tHead, textAlign: i < 1 ? 'center' : 'right' as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.a} style={{ background: i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '9px 12px', textAlign: 'center' as const, fontWeight: '700' as const, color: '#1B3A6B', fontSize: '13px' }}>{r.a}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#374151' }}>{fmtMXN2(r.sdi)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#7C3AED', fontWeight: '700' as const }}>{r.tasa.toFixed(3)}%</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' as const, fontWeight: '700' as const, color: '#374151' }}>{fmtMXN2(r.cuotaMens)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' as const, fontWeight: '800' as const, color: '#B91C1C' }}>{fmtMXN2(r.cuotaAnual)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' as const }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            <div style={{ width: '60px', height: '8px', background: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: (maxCuota > 0 ? r.cuotaAnual / maxCuota * 100 : 0) + '%', background: '#1B3A6B', borderRadius: '4px' }} />
                            </div>
                            <span style={{ fontSize: '10.5px', color: '#9CA3AF', minWidth: '35px' }}>{(totalCosto > 0 ? r.cuotaAnual / totalCosto * 100 : 0).toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#1B3A6B' }}>
                      <td colSpan={4} style={{ padding: '10px 12px', color: 'white', fontWeight: '700' as const, textAlign: 'right' as const }}>TOTAL COSTO MOD. 40</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' as const, fontWeight: '900' as const, color: '#FCD34D', fontSize: '16px' }}>{fmtMXN2(escRec.costo_total)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' as const, color: '#93C5FD', fontWeight: '700' as const }}>100%</td>
                    </tr>
                    <tr style={{ background: '#065F46' }}>
                      <td colSpan={4} style={{ padding: '8px 12px', color: 'white', fontWeight: '700' as const, textAlign: 'right' as const }}>Recuperación AFORE (20%)</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' as const, fontWeight: '900' as const, color: '#A7F3D0', fontSize: '15px' }}>- {fmtMXN2(escRec.recuperacion_afore)}</td>
                      <td></td>
                    </tr>
                    <tr style={{ background: '#92400E' }}>
                      <td colSpan={4} style={{ padding: '10px 12px', color: 'white', fontWeight: '700' as const, textAlign: 'right' as const }}>INVERSIÓN REAL NETA</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' as const, fontWeight: '900' as const, color: '#FEF3C7', fontSize: '18px' }}>{fmtMXN2(escRec.inversion_neta)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Siguiente */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                <button onClick={() => setTab(4)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>Info. del Pensionado →</button>
              </div>
            </div>
          )
        })()}

        {tab === 4 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          const sem = datos.semanas_totales - datos.semanas_descontadas
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center' as const, padding: '60px', color: '#9CA3AF' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>👤</div>
              <p style={{ fontSize: '14px' }}>Completa las pestañas anteriores para continuar</p>
            </div>
          )
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Header */}
              <div style={{ background: '#1B3A6B', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '10px', color: '#93C5FD', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: '600' as const }}>Información General del Pensionado</p>
                  <p style={{ fontSize: '16px', fontWeight: '800' as const, color: 'white', margin: 0 }}>Proyecto de Plan de Retiro con Modalidad 40</p>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontSize: '10px', color: '#93C5FD', marginBottom: '2px' }}>Trabajador(a)</div>
                  <div style={{ fontSize: '15px', fontWeight: '800' as const, color: 'white' }}>{datos.nombre_trabajador || 'Sin nombre'}</div>
                </div>
              </div>

              {/* 3 KPIs críticos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Edad de retiro estimada', value: escRec.edad_retiro?.toFixed(2) + ' años', sub: 'al momento del trámite', color: '#1B3A6B', bg: '#EEF2F8', border: '#1B3A6B' },
                  { label: 'Semanas cotizadas finales', value: Math.round(escRec.semanas_finales || 0).toString(), sub: 'con Mod. 40', color: (escRec.semanas_finales || 0) >= 500 ? '#065F46' : '#DC2626', bg: (escRec.semanas_finales || 0) >= 500 ? '#F0FDF4' : '#FEF2F2', border: (escRec.semanas_finales || 0) >= 500 ? '#86EFAC' : '#FCA5A5' },
                  { label: 'Nuevo SDI promedio', value: fmtMXN2(escRec.nuevo_sdi_250), sub: 'base mejorada de pensión', color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
                ].map((k, i) => (
                  <div key={i} style={{ background: k.bg, border: '2px solid ' + k.border, padding: '16px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '9.5px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, marginBottom: '6px' }}>{k.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: '900' as const, color: k.color, letterSpacing: '-0.5px', marginBottom: '3px' }}>{k.value}</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* 2 columnas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={DS.card}>
                  <p style={DS.secTitle}>📋 Datos del Proyecto</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        { label: 'Edad de retiro (IMSS)', value: escRec.edad_retiro?.toFixed(3) || '—', critical: false },
                        { label: 'Semanas actuales', value: sem.toLocaleString(), critical: false },
                        { label: 'Semanas en Mod. 40', value: Math.round(escRec.semanas_mod40 || 0).toString(), critical: false },
                        { label: 'Semanas totales finales', value: Math.round(escRec.semanas_finales || 0).toString(), critical: true },
                        { label: 'SDI actual (250 sem.)', value: fmtMXN2(sdiPromedio), critical: false },
                        { label: 'SDI registrado Mod. 40', value: fmtMXN2(escRec.sdi_mod40 ?? 0), critical: false },
                        { label: 'Nuevo SDI promedio', value: fmtMXN2(escRec.nuevo_sdi_250), critical: true },
                        { label: 'Incremento en SDI', value: fmtMXN2((escRec.nuevo_sdi_250 || 0) - sdiPromedio), critical: false },
                      ].map(({ label, value, critical }, i) => (
                        <tr key={i} style={{ background: critical ? '#EEF2F8' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: '#6B7280' }}>{label}</td>
                          <td style={{ padding: '8px 12px', fontSize: critical ? '15px' : '13px', fontWeight: critical ? '900' : '700', color: critical ? '#1B3A6B' : '#374151', textAlign: 'right' as const }}>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={DS.card}>
                  <p style={DS.secTitle}>📅 Cronograma de la Modalidad 40</p>
                  {/* Timeline visual */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    {[
                      { icon: '🟡', label: 'Hoy', value: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }), desc: 'Inicio del proyecto', color: '#F59E0B' },
                      { icon: '🔵', label: 'Ingreso Mod. 40', value: escRec.fecha_ingreso_mod40 || '—', desc: 'Fecha de alta en Mod. 40', color: '#3B82F6' },
                      { icon: '🔴', label: 'Baja Mod. 40', value: escRec.fecha_baja_mod40 || '—', desc: 'Fin de cotización', color: '#EF4444' },
                      { icon: '🟢', label: 'Trámite de pensión', value: datos.fecha_nacimiento ? (() => { const d = new Date(datos.fecha_nacimiento); d.setFullYear(d.getFullYear() + (escRec.edad_retiro || 62)); return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) })() : '—', desc: 'Fecha estimada', color: '#10B981' },
                    ].map(({ icon, label, value, desc, color }, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderLeft: '4px solid ' + color }}>
                        <span style={{ fontSize: '18px' }}>{icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.3px' }}>{label}</div>
                          <div style={{ fontSize: '14px', fontWeight: '800' as const, color }}>{value}</div>
                          <div style={{ fontSize: '10.5px', color: '#9CA3AF' }}>{desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '12px', background: '#F0FDF4', border: '1px solid #86EFAC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#374151', fontWeight: '600' as const }}>Duración en Mod. 40</span>
                    <span style={{ fontSize: '18px', fontWeight: '900' as const, color: '#065F46' }}>{escRec.mod40_meses} meses ({(escRec.mod40_meses / 12).toFixed(1)} años)</span>
                  </div>
                </div>
              </div>

              {/* Siguiente */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                <button onClick={() => setTab(5)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>Importe de Pensión →</button>
              </div>
            </div>
          )
        })()}

        {tab === 5 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center' as const, padding: '60px', color: '#9CA3AF' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
              <p style={{ fontSize: '14px' }}>Completa las pestañas anteriores para continuar</p>
            </div>
          )
          const pctEdad = (escRec.edad_retiro || 62) >= 65 ? 100 : 75 + (Math.floor(escRec.edad_retiro || 62) - 60) * 5
          const pensionVejez100 = escRec.pension_mensual / (pctEdad / 100)
          const pensionActual = escenarios[0]?.pension_base ?? 0
          const incremento = escRec.pension_mensual - pensionActual
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* 2 KPIs hero */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: '#1B3A6B', padding: '24px 20px', textAlign: 'center' as const }}>
                  <div style={{ fontSize: '10px', color: '#93C5FD', textTransform: 'uppercase' as const, letterSpacing: '0.8px', fontWeight: '600' as const, marginBottom: '10px' }}>PENSIÓN ANUAL CON MOD. 40</div>
                  <div style={{ fontSize: '38px', fontWeight: '900' as const, color: 'white', letterSpacing: '-2px', marginBottom: '6px' }}>{fmtMXN2(escRec.pension_mensual * 12)}</div>
                  <div style={{ fontSize: '12px', color: '#93C5FD' }}>Ley del Seguro Social 1973</div>
                </div>
                <div style={{ background: '#065F46', padding: '24px 20px', textAlign: 'center' as const }}>
                  <div style={{ fontSize: '10px', color: '#A7F3D0', textTransform: 'uppercase' as const, letterSpacing: '0.8px', fontWeight: '600' as const, marginBottom: '10px' }}>PENSIÓN MENSUAL</div>
                  <div style={{ fontSize: '38px', fontWeight: '900' as const, color: 'white', letterSpacing: '-2px', marginBottom: '6px' }}>{fmtMXN2(escRec.pension_mensual)}</div>
                  <div style={{ fontSize: '12px', color: '#A7F3D0' }}>+{fmtMXN2(incremento)} vs sin Mod. 40</div>
                </div>
              </div>

              {/* Comparativo antes vs después */}
              <div style={DS.card}>
                <p style={DS.secTitle}>📈 Comparativo Sin vs Con Modalidad 40</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '14px', alignItems: 'center' }}>
                  <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '16px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase' as const, fontWeight: '600' as const, marginBottom: '6px' }}>SIN MODALIDAD 40</div>
                    <div style={{ fontSize: '28px', fontWeight: '900' as const, color: '#9CA3AF', letterSpacing: '-1px' }}>{fmtMXN2(pensionActual)}</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>mensual actual</div>
                  </div>
                  <div style={{ textAlign: 'center' as const }}>
                    <div style={{ fontSize: '28px' }}>→</div>
                    <div style={{ padding: '4px 10px', background: '#F0FDF4', border: '1px solid #86EFAC', fontSize: '13px', fontWeight: '800' as const, color: '#065F46' }}>+{fmtMXN2(incremento)}</div>
                  </div>
                  <div style={{ background: '#EEF2F8', border: '2px solid #1B3A6B', padding: '16px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '10px', color: '#1B3A6B', textTransform: 'uppercase' as const, fontWeight: '700' as const, marginBottom: '6px' }}>CON MODALIDAD 40</div>
                    <div style={{ fontSize: '28px', fontWeight: '900' as const, color: '#1B3A6B', letterSpacing: '-1px' }}>{fmtMXN2(escRec.pension_mensual)}</div>
                    <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>mensual mejorada</div>
                  </div>
                </div>
              </div>

              {/* Tabla factor edad */}
              <div style={DS.card}>
                <p style={DS.secTitle}>📋 Factor por Edad — ¿Cuánto recibe según la edad de retiro? <Tip id="factorEdad" /></p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#1B3A6B' }}>
                      {['Edad de Retiro', '% del Total', 'Pensión Mensual', 'Pensión Anual', 'Aguinaldo'].map((h, i) => (
                        <th key={i} style={{ padding: '9px 12px', color: 'white', fontWeight: '700' as const, textAlign: 'center' as const, fontSize: '11px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[60, 61, 62, 63, 64, 65].map((edad, i) => {
                      const pct = edad >= 65 ? 100 : 75 + (edad - 60) * 5
                      const penMens = pensionVejez100 * (pct / 100)
                      const isActive = Math.floor(escRec.edad_retiro || 62) === edad
                      return (
                        <tr key={edad} style={{ background: isActive ? '#EEF2F8' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6', outline: isActive ? '2px solid #1B3A6B' : 'none' }}>
                          <td style={{ padding: '10px 12px', textAlign: 'center' as const, fontWeight: isActive ? '800' : '500', color: isActive ? '#1B3A6B' : '#374151', fontSize: isActive ? '14px' : '12px' }}>
                            {isActive && '▶ '}{edad} años {edad >= 65 ? '(Vejez)' : '(Cesantía E.A.)'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' as const, fontWeight: '800' as const, color: isActive ? '#F05B21' : '#374151', fontSize: isActive ? '18px' : '14px' }}>{pct}%</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' as const, fontWeight: isActive ? '900' : '600', color: isActive ? '#1B3A6B' : '#374151', fontSize: isActive ? '16px' : '13px' }}>{fmtMXN2(penMens)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' as const, fontWeight: isActive ? '800' : '600', color: '#374151' }}>{fmtMXN2(penMens * 12)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' as const, color: '#6B7280' }}>{fmtMXN2(penMens)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Siguiente */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                <button onClick={() => setTab(6)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>Inversión →</button>
              </div>
            </div>
          )
        })()}

        {tab === 6 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center' as const, padding: '60px', color: '#9CA3AF' }}>
              <p>Completa las pestañas anteriores para continuar</p>
            </div>
          )
          const termRec = escRec.tasa_rendimiento >= 25 ? { label: 'Excelente Inversión', color: '#15803D', bg: '#F0FDF4' }
            : escRec.tasa_rendimiento >= 18 ? { label: 'Buena Inversión', color: '#0369A1', bg: '#F0F9FF' }
            : escRec.tasa_rendimiento >= 12 ? { label: 'Inversión Moderada', color: '#B45309', bg: '#FFFBEB' }
            : { label: 'Riesgo Moderado', color: '#B91C1C', bg: '#FEF2F2' }
          const termFin = escRec.tasa_rendimiento_financiado >= 25 ? { label: 'Excelente Inversión', color: '#15803D', bg: '#F0FDF4' }
            : escRec.tasa_rendimiento_financiado >= 18 ? { label: 'Buena Inversión', color: '#0369A1', bg: '#F0F9FF' }
            : escRec.tasa_rendimiento_financiado >= 12 ? { label: 'Inversión Moderada', color: '#B45309', bg: '#FFFBEB' }
            : { label: 'Riesgo Moderado', color: '#B91C1C', bg: '#FEF2F2' }
          const edadRetBase = Math.floor(datos.edad_actual || 60)
          const filas: any[] = []
          let ganAcum = 0
          for (let i = 1; i <= Math.max(20, 80 - Math.floor(escRec.edad_retiro || 62) + 1); i++) {
            const edad = Math.floor(escRec.edad_retiro || 62) + i
            const penSin = escRec.pension_base * Math.pow(1.045, i)
            const penCon = escRec.pension_mensual * Math.pow(1.045, i)
            const desc = i <= 5 && escRec.descuento_mensual > 0 ? -escRec.descuento_mensual : 0
            const penInm = penCon + desc
            const ganAnio = (penInm - penSin) * 12
            ganAcum += ganAnio
            filas.push({ anio: i, edad, penSin, penCon, desc, penInm, ganAnio, ganAcum })
            if (edad >= 81) break
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* KPIs críticos de inversión */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Incremento en pensión', value: fmtMXN2(escRec.incremento_vs_base), sub: 'mensual adicional', color: '#065F46', bg: '#F0FDF4', border: '#86EFAC', critical: true },
                  { label: 'Inversión neta', value: fmtMXN2(escRec.inversion_neta), sub: 'descontando AFORE', color: '#92400E', bg: '#FFFBEB', border: '#FCD34D', critical: false },
                  { label: 'Recuperación', value: escRec.roi_meses?.toFixed(1) + ' meses', sub: 'para recuperar inversión', color: '#1B3A6B', bg: '#EEF2F8', border: '#1B3A6B', critical: false },
                  { label: 'Tasa de rendimiento', value: escRec.tasa_rendimiento?.toFixed(1) + '%', sub: 'total a los 80 años', color: termRec.color, bg: termRec.bg, border: termRec.color, critical: true },
                ].map((k, i) => (
                  <div key={i} style={{ background: k.bg, border: '2px solid ' + k.border, padding: '14px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '9.5px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px', fontWeight: '600' as const }}>{k.label}</div>
                    <div style={{ fontSize: k.critical ? '24px' : '20px', fontWeight: '900' as const, color: k.color, letterSpacing: '-0.5px', marginBottom: '3px' }}>{k.value}</div>
                    <div style={{ fontSize: '10.5px', color: '#9CA3AF' }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Gráfica SVG: Flujos acumulados Sin vs Con Mod40 */}
              {filas.length > 0 && (() => {
                const W = 560, H = 160, PAD = { t: 16, r: 16, b: 32, l: 60 }
                const chartW = W - PAD.l - PAD.r, chartH = H - PAD.t - PAD.b
                const maxAcum = Math.max(...filas.map(f => Math.max(f.ganAcum, 0)), escRec.inversion_neta * 2)
                const minAcum = Math.min(...filas.map(f => f.ganAcum), 0)
                const range = maxAcum - minAcum
                const xScale = (i: number) => PAD.l + (i / (filas.length - 1)) * chartW
                const yScale = (v: number) => PAD.t + chartH - ((v - minAcum) / range * chartH)
                const zeroY = yScale(0)
                // Build paths
                const gainPath = filas.map((f, i) => (i === 0 ? 'M' : 'L') + xScale(i).toFixed(1) + ',' + yScale(f.ganAcum).toFixed(1)).join(' ')
                // Area under gain line (above zero)
                const gainArea = gainPath + ` L${xScale(filas.length-1)},${zeroY} L${xScale(0)},${zeroY} Z`
                // Investment line (horizontal negative)
                const invY = yScale(-escRec.inversion_neta)
                return (
                  <div style={DS.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#111827', margin: 0 }}>📈 Análisis de Flujos — Ganancia acumulada</p>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '10px', color: '#6B7280' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '3px', background: '#2E8B57', display: 'inline-block' }} />Ganancia acumulada</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '2px', background: '#EF4444', display: 'inline-block', borderTop: '2px dashed #EF4444' }} />Inversión inicial</span>
                      </div>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H + 'px' }}>
                      {/* Zero line */}
                      <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke='#E5E7EB' strokeWidth='1' />
                      {/* Investment negative zone */}
                      <rect x={PAD.l} y={zeroY} width={chartW} height={Math.max(0, yScale(-escRec.inversion_neta) - zeroY)} fill='#FEF2F2' opacity='0.5' />
                      {/* Gain area */}
                      <path d={gainArea} fill='#F0FDF4' opacity='0.7' />
                      {/* Gain line */}
                      <path d={gainPath} fill='none' stroke='#2E8B57' strokeWidth='2.5' strokeLinejoin='round' />
                      {/* Investment dashed line */}
                      <line x1={PAD.l} y1={invY} x2={W - PAD.r} y2={invY} stroke='#EF4444' strokeWidth='1.5' strokeDasharray='6,4' />
                      {/* Y axis labels */}
                      {[0, maxAcum * 0.5, maxAcum].map((v, i) => (
                        <text key={i} x={PAD.l - 4} y={yScale(v) + 4} textAnchor='end' fontSize='9' fill='#9CA3AF'>
                          {v >= 1000000 ? '$' + (v/1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v/1000).toFixed(0) + 'K' : '$0'}
                        </text>
                      ))}
                      {/* X axis labels */}
                      {filas.filter((_, i) => i % Math.ceil(filas.length / 5) === 0 || i === filas.length - 1).map((f, i) => (
                        <text key={i} x={xScale(filas.indexOf(f))} y={H - 4} textAnchor='middle' fontSize='9' fill='#9CA3AF'>{f.edad}</text>
                      ))}
                      {/* Punto de break-even */}
                      {filas.findIndex(f => f.ganAcum >= 0) > 0 && (() => {
                        const beIdx = filas.findIndex(f => f.ganAcum >= 0)
                        return <circle cx={xScale(beIdx)} cy={yScale(0)} r='4' fill='#F05B21' />
                      })()}
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#9CA3AF', marginTop: '4px' }}>
                      <span>Edad {filas[0]?.edad} años</span>
                      <span>Eje X: edad · Eje Y: ganancia acumulada (MXN)</span>
                      <span>Edad {filas[filas.length - 1]?.edad} años</span>
                    </div>
                  </div>
                )
              })()}

              <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: 0 }}>Detalle de la inversión:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {/* Col 1: Mejora de pensión */}
                <div style={{ border: '1px solid #E5E7EB', background: 'white' }}>
                  <div style={{ background: '#1B3A6B', color: 'white', padding: '6px 12px', fontSize: '12.5px', fontWeight: '700' as const, textAlign: 'center' as const }}>MEJORA DE PENSIÓN</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ background: '#F0F0F0' }}>
                        <th style={{ padding: '5px 8px', border: '1px solid #E5E7EB', fontWeight: '700' as const, fontSize: '11.5px' }}></th>
                        <th style={{ padding: '5px 8px', border: '1px solid #E5E7EB', fontWeight: '700' as const, fontSize: '11.5px', textAlign: 'center' as const }}>SIN MODALIDAD 40</th>
                        <th style={{ padding: '5px 8px', border: '1px solid #E5E7EB', fontWeight: '700' as const, fontSize: '11.5px', textAlign: 'center' as const }}>CON MODALIDAD 40</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '5px 8px', fontSize: '11.5px', color: '#6B7280', border: '1px solid #E5E7EB' }}>EDAD DE RETIRO</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' as const, border: '1px solid #E5E7EB', fontWeight: '700' as const }}>{edadRetBase}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' as const, border: '1px solid #E5E7EB', fontWeight: '700' as const, color: '#1B3A6B' }}>{Math.floor(escRec.edad_retiro || 62)}</td>
                      </tr>
                      <tr style={{ background: '#F9FAFB' }}>
                        <td style={{ padding: '5px 8px', fontSize: '11.5px', color: '#6B7280', border: '1px solid #E5E7EB' }}>MONTO DE MEJORA DE PENSIÓN</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' as const, border: '1px solid #E5E7EB', color: '#9CA3AF' }}>—</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' as const, border: '1px solid #E5E7EB', fontWeight: '800' as const, color: '#15803D', fontSize: '13px' }}>{fmtMXN(escRec.incremento_vs_base)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {/* Análisis de la inversión */}
                  <div style={{ padding: '8px 10px', borderTop: '2px solid #d1d5db' }}>
                    <p style={{ fontSize: '11.5px', fontWeight: '700' as const, color: '#374151', margin: '0 0 6px', textTransform: 'uppercase' as const }}>ANÁLISIS DE LA INVERSIÓN</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280', maxWidth: '65%', lineHeight: 1.3 }}>PERÍODOS DE RECUPERACIÓN DE LA INVERSIÓN (MESES)</span>
                      <span style={{ fontSize: '14px', fontWeight: '800' as const, color: '#1B3A6B' }}>—</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', padding: '3px 0' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280' }}>SIN MODALIDAD 40</span>
                      <span style={{ fontSize: '12.5px', fontWeight: '700' as const }}>—</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280' }}>CON MODALIDAD 40</span>
                      <span style={{ fontSize: '12.5px', fontWeight: '700' as const, color: '#1B3A6B' }}>{escRec.roi_meses.toFixed(2)}</span>
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', borderTop: '1px solid #d1d5db' }}>
                    <p style={{ fontSize: '11.5px', fontWeight: '700' as const, color: '#374151', margin: '0 0 4px', textTransform: 'uppercase' as const }}>ANÁLISIS DE FLUJOS DE PENSIÓN RECIBIDOS</p>
                    {[
                      ['PENSIÓN MENSUAL POR MES DE 30 DÍAS', fmtMXN(escRec.pension_base), fmtMXN(escRec.pension_mensual)],
                      ['FLUJOS DE PENSIÓN COBRADOS HASTA LOS 80 AÑOS', fmtMXN(escRec.pension_base * Math.max(0, (80 - edadRetBase) * 12)), fmtMXN(escRec.pension_mensual * Math.max(0, (80 - Math.floor(escRec.edad_retiro || 62)) * 12))],
                    ].map(([l, v1, v2], i) => (
                      <Fragment key={i}>
                        <p style={{ fontSize: '12.5px', color: '#6B7280', margin: '4px 0 2px' }}>{l}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', paddingBottom: '3px' }}>
                          <span style={{ fontSize: '12px', color: '#374151' }}>{v1}</span>
                          <span style={{ fontSize: '12px', fontWeight: '700' as const, color: '#15803D' }}>{v2}</span>
                        </div>
                      </Fragment>
                    ))}
                    <div style={{ borderTop: '2px solid #d1d5db', marginTop: '6px', paddingTop: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: '700' as const, color: '#374151', textTransform: 'uppercase' as const }}>GANANCIA TOTAL GRACIAS A MODALIDAD 40</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11.5px', color: '#6B7280' }}>(MXN)</span>
                        <span style={{ fontSize: '14px', fontWeight: '800' as const, color: '#15803D' }}>{fmtMXN(escRec.ganancia_a80)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11.5px', color: '#6B7280' }}>Tasa de Rendimiento Total</span>
                        <span style={{ fontSize: '12px', fontWeight: '700' as const, color: '#1B3A6B' }}>{escRec.tasa_rendimiento.toFixed(2)}%</span>
                      </div>
                    </div>
                    <div style={{ background: termRec.bg, border: `1px solid ${termRec.color}`, padding: '6px 10px', marginTop: '8px', textAlign: 'center' as const }}>
                      <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 2px', textTransform: 'uppercase' as const }}>NUESTRO TERMÓMETRO DE INVERSIÓN</p>
                      <p style={{ fontSize: '13px', fontWeight: '800' as const, color: termRec.color, margin: 0 }}>{termRec.label}</p>
                    </div>
                  </div>
                </div>

                {/* Col 2: Financiamiento */}
                <div style={{ border: '1px solid #E5E7EB', background: 'white' }}>
                  <div style={{ background: '#374151', color: 'white', padding: '6px 12px', fontSize: '12.5px', fontWeight: '700' as const, textAlign: 'center' as const }}>FINANCIAMIENTO — PAGO RETROACTIVO</div>
                  <div style={{ padding: '8px 10px', borderBottom: '2px solid #1B3A6B' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: '700' as const, color: '#374151' }}>INVERSIÓN TOTAL</span>
                      <span style={{ fontSize: '16px', fontWeight: '900' as const, color: '#1B3A6B' }}>{fmtMXN(escRec.costo_retroactivo)}</span>
                    </div>
                  </div>
                  <div style={{ padding: '6px 10px' }}>
                    <p style={{ fontSize: '11.5px', fontWeight: '700' as const, color: '#374151', margin: '0 0 4px', textTransform: 'uppercase' as const }}>PARTICIPACIONES</p>
                    {[
                      ['BANCO', fmtMXN(escRec.aportacion_banco)],
                      ['CUENTA PROPIA O SEGUNDO FONDEADOR', fmtMXN(escRec.aportacion_segundo_fondeo)],
                    ].map(([l, v], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', padding: '3px 0', fontSize: '12.5px' }}>
                        <span style={{ color: '#374151' }}>{l}</span>
                        <span style={{ fontWeight: '700' as const, color: '#374151' }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ background: '#F5F5F5', border: '1px solid #E5E7EB', padding: '6px 8px', margin: '6px 0' }}>
                      <p style={{ fontSize: '12.5px', fontWeight: '700' as const, color: '#374151', margin: '0 0 3px', textTransform: 'uppercase' as const }}>PORCENTAJES DE PARTICIPACIÓN</p>
                      {[
                        ['BANCO REGULADO', `${((escRec.aportacion_banco / escRec.costo_retroactivo) * 100).toFixed(2)}%`],
                        ['CUENTA PROPIA O SEGUNDO FONDEADOR', `${((escRec.aportacion_segundo_fondeo / escRec.costo_retroactivo) * 100).toFixed(2)}%`],
                      ].map(([l, v], i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid #F3F4F6', padding: '2px 0' }}>
                          <span style={{ color: '#374151' }}>{l}</span>
                          <span style={{ fontWeight: '700' as const, color: '#1B3A6B' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: '11.5px', fontWeight: '700' as const, color: '#374151', margin: '4px 0 3px', textTransform: 'uppercase' as const }}>COSTO DEL FINANCIAMIENTO (BANCO REGULADO)</p>
                    {[
                      ['MONTO DEL CRÉDITO', fmtMXN(escRec.aportacion_banco)],
                      ['DURACIÓN DEL TRÁMITE (MESES)', String(escRec.duracion_tramite_meses || 12)],
                      ['COSTO DE FINANCIAMIENTO DURANTE EL TRÁMITE', fmtMXN(escRec.costo_financiamiento_banco)],
                      ['MONTO MÁXIMO A PAGAR', fmtMXN(escRec.monto_maximo_pago)],
                    ].map(([l, v], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', padding: '3px 0', fontSize: '12px' }}>
                        <span style={{ color: '#6B7280', maxWidth: '60%', lineHeight: 1.3 }}>{l}</span>
                        <span style={{ fontWeight: '700' as const, color: '#374151' }}>{v}</span>
                      </div>
                    ))}
                    <p style={{ fontSize: '11.5px', fontWeight: '700' as const, color: '#374151', margin: '6px 0 3px', textTransform: 'uppercase' as const }}>¿CÓMO VOY A PAGAR EL FINANCIAMIENTO DEL BANCO?</p>
                    {[
                      ['MONTO DEL CRÉDITO', fmtMXN(escRec.aportacion_banco)],
                      ['PLAZO (MESES)', '60'],
                      ['DESCUENTO MENSUAL A LA PENSIÓN MEJORADA', fmtMXN(escRec.descuento_mensual)],
                    ].map(([l, v], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', padding: '3px 0', fontSize: '12px' }}>
                        <span style={{ color: '#6B7280' }}>{l}</span>
                        <span style={{ fontWeight: '700' as const, color: '#374151' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Col 3: Análisis */}
                <div style={{ border: '1px solid #E5E7EB', background: 'white', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ background: '#15803D', color: 'white', padding: '6px 12px', fontSize: '12.5px', fontWeight: '700' as const, textAlign: 'center' as const }}>ANÁLISIS DE LA INVERSIÓN</div>
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid #d1d5db', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11.5px', color: '#6B7280', maxWidth: '70%', lineHeight: 1.3 }}>PERÍODOS DE RECUPERACIÓN DE LA INVERSIÓN (MESES)</span>
                    <span style={{ fontSize: '16px', fontWeight: '900' as const, color: '#1B3A6B' }}>{escRec.roi_financiado.toFixed(2)}</span>
                  </div>
                  {/* Tabla año×año compacta */}
                  <div style={{ flex: 1, overflowY: 'auto', maxHeight: '200px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead style={{ position: 'sticky' as const, top: 0, background: '#F0F0F0' }}>
                        <tr>
                          {['Año\nCobr.','Edad','Esc.\nActual','Pen.\nMejorada','Desc.\nFin.','Pensión\nInmediata','Gan.\nAnual','Gan.\nAcum.'].map((h,i) => (
                            <th key={i} style={{ padding: '3px 4px', textAlign: 'right' as const, fontWeight: '700' as const, fontSize: '8.5px', border: '1px solid #E5E7EB', lineHeight: 1.2, whiteSpace: 'pre' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((f, i) => (
                          <tr key={i} style={{ background: f.edad === 80 ? '#F0FDF4' : i % 2 === 0 ? 'white' : '#F9FAFB' }}>
                            <td style={{ padding: '2px 4px', textAlign: 'right' as const, color: '#9CA3AF', border: '1px solid #E5E7EB' }}>{f.anio}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right' as const, fontWeight: f.edad === 80 ? '800' : '600', color: f.edad === 80 ? '#15803D' : '#374151', border: '1px solid #E5E7EB' }}>{f.edad}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right' as const, color: '#9CA3AF', border: '1px solid #E5E7EB' }}>{fmtMXN(f.penSin)}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right' as const, color: '#1B3A6B', border: '1px solid #E5E7EB' }}>{fmtMXN(f.penCon)}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right' as const, color: f.desc < 0 ? '#B91C1C' : '#9CA3AF', border: '1px solid #E5E7EB' }}>{f.desc < 0 ? fmtMXN(f.desc) : '—'}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right' as const, fontWeight: '600' as const, color: '#15803D', border: '1px solid #E5E7EB' }}>{fmtMXN(f.penInm)}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right' as const, color: f.ganAnio > 0 ? '#15803D' : '#B91C1C', border: '1px solid #E5E7EB' }}>{fmtMXN(f.ganAnio)}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right' as const, fontWeight: '600' as const, color: f.ganAcum > 0 ? '#15803D' : '#B91C1C', border: '1px solid #E5E7EB' }}>{fmtMXN(f.ganAcum)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '8px 10px', borderTop: '2px solid #d1d5db' }}>
                    {[
                      { l: 'PENSIÓN MENSUAL INMEDIATA (DURANTE 60 MESES)', v: fmtMXN(escRec.pension_inmediata), c: '#D95B00' },
                      { l: 'PENSIÓN MENSUAL AL LIQUIDAR FINANCIAMIENTO (60 MESES)', v: fmtMXN(escRec.pension_al_liquidar), c: '#15803D' },
                      { l: 'FLUJOS DE PENSIÓN COBRADOS HASTA LOS 80 AÑOS', v: fmtMXN(escRec.ganancia_a80_financiado + escRec.inversion_neta_retro), c: '#1B3A6B' },
                    ].map((k, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F3F4F6', padding: '4px 0' }}>
                        <span style={{ fontSize: '12.5px', color: '#6B7280', maxWidth: '55%', lineHeight: 1.3 }}>{k.l}</span>
                        <span style={{ fontSize: '13px', fontWeight: '800' as const, color: k.c }}>{k.v}</span>
                      </div>
                    ))}
                    <div style={{ background: termFin.bg, border: `1px solid ${termFin.color}`, padding: '6px 10px', marginTop: '8px', textAlign: 'center' as const }}>
                      <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 2px', textTransform: 'uppercase' as const }}>NUESTRO TERMÓMETRO DE INVERSIÓN</p>
                      <p style={{ fontSize: '13px', fontWeight: '800' as const, color: termFin.color, margin: 0 }}>{termFin.label}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Siguiente sección ── */}
        {tab === 6 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
            <button onClick={() => setTab(7)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>
              Datos del Proyecto →
            </button>
          </div>
        )}

        {/* ══ TAB 7: DATOS DEL PROYECTO ════════════════════════════════ */}
        {tab === 7 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          const sem = datos.semanas_totales - datos.semanas_descontadas
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Header */}
              <div style={{ background: '#1B3A6B', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '10px', color: '#93C5FD', margin: '0 0 3px', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: '600' as const }}>Resumen completo</p>
                  <p style={{ fontSize: '15px', fontWeight: '800' as const, color: 'white', margin: 0 }}>Datos del Proyecto de Pensión</p>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontSize: '10px', color: '#93C5FD', marginBottom: '2px' }}>NSS</div>
                  <div style={{ fontSize: '14px', fontWeight: '700' as const, color: 'white' }}>{datos.nss || '—'}</div>
                </div>
              </div>

              {/* 4 grupos de datos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

                {/* Pensión */}
                <div style={DS.card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '2px solid #EEF2F8' }}>
                    <div style={{ width: '4px', height: '16px', background: '#1B3A6B' }} />
                    <span style={{ fontSize: '12px', fontWeight: '700' as const, color: '#111827', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Pensión</span>
                  </div>
                  {[
                    { label: 'Pensión mensual actual (sin Mod. 40)', value: fmtMXN2(escenarios[0]?.pension_base ?? 0) },
                    { label: 'Pensión mejorada con Mod. 40', value: fmtMXN2(escRec?.pension_mensual ?? 0), critical: true },
                    { label: 'Incremento mensual', value: fmtMXN2((escRec?.pension_mensual ?? 0) - (escenarios[0]?.pension_base ?? 0)) },
                    { label: 'Aguinaldo anual', value: fmtMXN2(escRec?.aguinaldo_anual ?? 0) },
                    { label: 'Estimado pago retroactivo', value: fmtMXN2(escRec?.costo_retroactivo ?? 0) },
                  ].map(({ label, value, critical }, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6', background: critical ? 'transparent' : 'transparent' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>{label}</span>
                      <span style={{ fontSize: critical ? '16px' : '13px', fontWeight: critical ? '900' : '700', color: critical ? '#1B3A6B' : '#374151' }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Modalidad 40 */}
                <div style={DS.card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '2px solid #FFFBEB' }}>
                    <div style={{ width: '4px', height: '16px', background: '#F05B21' }} />
                    <span style={{ fontSize: '12px', fontWeight: '700' as const, color: '#111827', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Modalidad 40</span>
                  </div>
                  {[
                    { label: 'Años cotizados en Mod. 40', value: escRec?.mod40_meses ? (escRec.mod40_meses / 12).toFixed(2) + ' años' : '—' },
                    { label: 'Salario registrado (UMAs)', value: escRec?.mod40_umas?.toString() ?? '—' },
                    { label: 'Salario registrado (MXN/día)', value: fmtMXN2(escRec?.sdi_mod40 ?? 0), critical: true },
                    { label: 'Costo total Mod. 40', value: fmtMXN2(escRec?.costo_total ?? 0) },
                    { label: 'Fecha de ingreso a Mod. 40', value: escRec?.fecha_ingreso_mod40 || '—' },
                    { label: 'Fecha de baja de Mod. 40', value: escRec?.fecha_baja_mod40 || '—' },
                    { label: 'Semanas cotizadas finales', value: escRec?.semanas_finales?.toFixed(0) ?? '—', critical: true },
                    { label: 'Nuevo SDI promedio 250 sem.', value: fmtMXN2(escRec?.nuevo_sdi_250 ?? 0) },
                  ].map(({ label, value, critical }, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>{label}</span>
                      <span style={{ fontSize: critical ? '14px' : '12px', fontWeight: critical ? '800' : '700', color: critical ? '#F05B21' : '#374151' }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Inversión */}
                <div style={DS.card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '2px solid #F0FDF4' }}>
                    <div style={{ width: '4px', height: '16px', background: '#2E8B57' }} />
                    <span style={{ fontSize: '12px', fontWeight: '700' as const, color: '#111827', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Inversión</span>
                  </div>
                  {[
                    { label: 'Recuperación AFORE (20%)', value: fmtMXN2(escRec?.recuperacion_afore ?? 0) },
                    { label: 'Inversión neta', value: fmtMXN2(escRec?.inversion_neta ?? 0), critical: true },
                    { label: 'Meses para recuperar inversión', value: (escRec?.roi_meses != null ? escRec.roi_meses.toFixed(2) + ' meses' : '—') },
                    { label: 'Ganancia a los 80 años', value: fmtMXN2(escRec?.ganancia_a80 ?? 0), critical: true },
                    { label: 'Tasa de rendimiento', value: (escRec?.tasa_rendimiento != null ? escRec.tasa_rendimiento.toFixed(2) + '%' : '—') },
                  ].map(({ label, value, critical }, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>{label}</span>
                      <span style={{ fontSize: critical ? '15px' : '12px', fontWeight: critical ? '900' : '700', color: critical ? '#065F46' : '#374151' }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Retroactivo */}
                <div style={DS.card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '2px solid #F5F3FF' }}>
                    <div style={{ width: '4px', height: '16px', background: '#7C3AED' }} />
                    <span style={{ fontSize: '12px', fontWeight: '700' as const, color: '#111827', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Retroactivo</span>
                  </div>
                  {[
                    { label: 'Costo retroactivo estimado', value: fmtMXN2(escRec?.costo_retroactivo ?? 0), critical: true },
                    { label: 'Actualizaciones INPC (~7.27%)', value: fmtMXN2(escRec?.actualizaciones ?? 0) },
                    { label: 'Recargos por mora (~41.80%)', value: fmtMXN2(escRec?.recargos ?? 0) },
                    { label: 'Recuperación AFORE retroactivo', value: fmtMXN2(escRec?.recuperacion_afore_retro ?? 0) },
                    { label: 'Inversión neta retroactiva', value: fmtMXN2(escRec?.inversion_neta_retro ?? 0), critical: true },
                    { label: 'ROI retroactivo (meses)', value: (escRec?.roi_retro != null ? escRec.roi_retro.toFixed(2) + ' meses' : '—') },
                    { label: 'Ganancia retroactiva a 80 años', value: fmtMXN2(escRec?.ganancia_a80_retro ?? 0) },
                    { label: 'Tasa retroactiva', value: (escRec?.tasa_rendimiento_retro != null ? escRec.tasa_rendimiento_retro.toFixed(2) + '%' : '—') },
                  ].map(({ label, value, critical }, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>{label}</span>
                      <span style={{ fontSize: critical ? '14px' : '12px', fontWeight: critical ? '900' : '700', color: critical ? '#7C3AED' : '#374151' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Siguiente */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                <button onClick={() => setTab(8)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>Escenarios →</button>
              </div>
            </div>
          )
        })()}

        {tab === 8 && (() => {
          const escsConMod40 = escenarios.filter(e => e.mod40_meses > 0)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Visual bars comparison */}
              {escsConMod40.length > 0 && (
                <div style={DS.card}>
                  <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#111827', margin: '0 0 14px' }}>📊 Comparativo Visual — Pensión mensual por escenario</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Sin Mod 40 baseline */}
                    {(() => {
                      const base = escenarios[0]?.pension_base ?? 0
                      const maxPen = Math.max(...escsConMod40.map(e => e.pension_mensual), base)
                      const allScenarios = [
                        { label: 'Sin Mod. 40 (actual)', value: base, color: '#9CA3AF', isBase: true },
                        ...escsConMod40.slice(0, 6).map((e, i) => ({
                          label: 'Escenario ' + (i + 1) + ' — ' + e.mod40_umas + ' UMAs · ' + (e.mod40_meses / 12).toFixed(1) + ' años',
                          value: e.pension_mensual,
                          color: ['#1B3A6B', '#2E8B57', '#F05B21', '#7C3AED', '#0891B2', '#DC2626'][i],
                          isBase: false,
                          gain: e.pension_mensual - base,
                        }))
                      ]
                      return allScenarios.map((sc, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '200px', fontSize: '11px', color: sc.isBase ? '#9CA3AF' : '#374151', fontWeight: sc.isBase ? '400' : '600', flexShrink: 0, textAlign: 'right' as const, paddingRight: '8px' }}>{sc.label}</div>
                          <div style={{ flex: 1, height: '28px', background: '#F3F4F6', position: 'relative' as const, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: (sc.value / maxPen * 100) + '%', background: sc.color, display: 'flex', alignItems: 'center', paddingLeft: '8px', transition: 'width 0.5s', minWidth: '2px' }}>
                              <span style={{ fontSize: '11.5px', fontWeight: '800' as const, color: 'white', whiteSpace: 'nowrap' }}>{fmtMXN2(sc.value)}</span>
                            </div>
                          </div>
                          {!sc.isBase && (sc as any).gain > 0 && (
                            <div style={{ width: '80px', fontSize: '11px', fontWeight: '700' as const, color: '#2E8B57', textAlign: 'right' as const, flexShrink: 0 }}>+{fmtMXN2((sc as any).gain)}</div>
                          )}
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}

              <div style={DS.card}>
                <p style={DS.secTitle}>Tabla comparativa completa</p>
                {escsConMod40.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center' as const, color: '#9CA3AF' }}>
                    <p>Completa la pestaña Salario Prom. Mod 40 para ver los escenarios comparativos.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ background: '#1B3A6B' }}>
                          <th style={{ padding: '8px 10px', color: 'white', textAlign: 'left' as const, fontWeight: '700' as const, fontSize: '11px', position: 'sticky' as const, left: 0, background: '#1B3A6B' }}>Concepto</th>
                          <th style={{ padding: '8px 10px', color: '#93C5FD', textAlign: 'right' as const, fontWeight: '700' as const, fontSize: '11px', whiteSpace: 'nowrap' }}>Sin Mod. 40</th>
                          {escsConMod40.slice(0, 6).map((e, i) => (
                            <th key={i} style={{ padding: '8px 10px', color: 'white', textAlign: 'right' as const, fontWeight: '700' as const, fontSize: '11px', whiteSpace: 'nowrap' }}>
                              Esc. {i + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Pensión mensual actual', fn: (e: any) => fmtMXN2(e.pension_base ?? 0), base: true },
                          { label: 'Pensión mejorada', fn: (e: any) => fmtMXN2(e.pension_mensual), highlight: true },
                          { label: 'Años en Mod. 40', fn: (e: any) => (e.mod40_meses / 12).toFixed(2) },
                          { label: 'Salario registrado (UMAs)', fn: (e: any) => e.mod40_umas?.toString() ?? '—' },
                          { label: 'Costo total (MXN)', fn: (e: any) => fmtMXN2(e.costo_total) },
                          { label: 'Recuperación AFORE', fn: (e: any) => fmtMXN2(e.recuperacion_afore) },
                          { label: 'Inversión neta', fn: (e: any) => fmtMXN2(e.inversion_neta), highlight: true },
                          { label: 'Récup. inversión (meses)', fn: (e: any) => (e.roi_meses != null ? e.roi_meses.toFixed(2) : '—') },
                          { label: 'Ganancia a 80 años', fn: (e: any) => fmtMXN2(e.ganancia_a80), highlight: true },
                          { label: 'Tasa de rendimiento', fn: (e: any) => (e.tasa_rendimiento != null ? e.tasa_rendimiento.toFixed(2) + '%' : '—') },
                          { label: 'Aguinaldo anual', fn: (e: any) => fmtMXN2(e.aguinaldo_anual) },
                        ].map((row, ri) => (
                          <tr key={ri} style={{ background: row.highlight ? '#EEF2F8' : ri % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                            <td style={{ padding: '7px 10px', color: '#374151', fontWeight: row.highlight ? '700' : '400', position: 'sticky' as const, left: 0, background: row.highlight ? '#EEF2F8' : ri % 2 === 0 ? 'white' : '#F9FAFB' }}>{row.label}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#9CA3AF', fontStyle: 'italic' }}>{fmtMXN2(escenarios[0]?.pension_base ?? 0)}</td>
                            {escsConMod40.slice(0, 6).map((e, i) => (
                              <td key={i} style={{ padding: '7px 10px', textAlign: 'right' as const, fontWeight: row.highlight ? '800' : '600', color: row.highlight ? '#1B3A6B' : '#374151' }}>{row.fn(e)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                <button onClick={() => setTab(9)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>Escenario 1 →</button>
              </div>
            </div>
          )
        })()}

        {/* ══ TAB 9: ESCENARIO 1 ═══════════════════════════════════════ */}
        {tab === 9 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center' as const, padding: '60px', color: '#9CA3AF' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
              <p style={{ fontSize: '14px' }}>Completa las pestañas anteriores para continuar</p>
            </div>
          )
          const anioInicio = parseInt(escRec.fecha_ingreso_mod40?.slice(0,4) || '2027')
          const anioFin = parseInt(escRec.fecha_baja_mod40?.slice(0,4) || '2030')
          const pensionActual = escenarios[0]?.pension_base ?? 0
          const incremento = escRec.pension_mensual - pensionActual
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Hero header */}
              <div style={{ background: '#1B3A6B', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                <div style={{ textAlign: 'center' as const, borderRight: '1px solid rgba(255,255,255,0.15)', paddingRight: '20px' }}>
                  <div style={{ fontSize: '10px', color: '#93C5FD', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: '600' as const, marginBottom: '6px' }}>Pensión actual</div>
                  <div style={{ fontSize: '22px', fontWeight: '900' as const, color: '#9CA3AF', letterSpacing: '-1px' }}>{fmtMXN2(pensionActual)}</div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>sin Mod. 40</div>
                </div>
                <div style={{ textAlign: 'center' as const, borderRight: '1px solid rgba(255,255,255,0.15)', paddingRight: '20px' }}>
                  <div style={{ fontSize: '10px', color: '#93C5FD', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: '600' as const, marginBottom: '6px' }}>Incremento mensual</div>
                  <div style={{ fontSize: '22px', fontWeight: '900' as const, color: '#A7F3D0', letterSpacing: '-1px' }}>+{fmtMXN2(incremento)}</div>
                  <div style={{ fontSize: '11px', color: '#86EFAC', marginTop: '2px' }}>mejora por Mod. 40</div>
                </div>
                <div style={{ textAlign: 'center' as const }}>
                  <div style={{ fontSize: '10px', color: '#93C5FD', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: '600' as const, marginBottom: '6px' }}>Pensión mejorada</div>
                  <div style={{ fontSize: '30px', fontWeight: '900' as const, color: 'white', letterSpacing: '-1px' }}>{fmtMXN2(escRec.pension_mensual)}</div>
                  <div style={{ fontSize: '11px', color: '#A7F3D0', marginTop: '2px' }}>con Mod. 40</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Puntos clave */}
                <div style={DS.card}>
                  <p style={DS.secTitle}>📌 Puntos Clave del Escenario</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F4F6FB' }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left' as const, fontSize: '10px', color: '#9CA3AF', fontWeight: '700' as const, textTransform: 'uppercase' as const }}>Concepto</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '10px', color: '#9CA3AF', fontWeight: '700' as const }}>Sin Mod. 40</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '10px', color: '#1B3A6B', fontWeight: '700' as const }}>Con Mod. 40</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Edad al momento del trámite', v1: String(Math.floor(datos.edad_actual || 60)), v2: escRec.edad_retiro?.toFixed(2) || '—' },
                        { label: 'Semanas cotizadas', v1: (datos.semanas_totales - datos.semanas_descontadas).toString(), v2: escRec.semanas_finales?.toFixed(0) || '—', highlight: true },
                        { label: 'SDI promedio 250 sem.', v1: fmtMXN2(sdiPromedio), v2: fmtMXN2(escRec.nuevo_sdi_250), highlight: true },
                        { label: 'Pensión mensual', v1: fmtMXN2(pensionActual), v2: fmtMXN2(escRec.pension_mensual), highlight: true },
                        { label: 'Costo Mod. 40', v1: 'No aplica', v2: fmtMXN2(escRec.costo_total) },
                        { label: 'Recuperación AFORE', v1: 'No aplica', v2: fmtMXN2(escRec.recuperacion_afore) },
                        { label: 'Inversión real neta', v1: 'No aplica', v2: fmtMXN2(escRec.inversion_neta), highlight: true },
                        { label: 'Meses para recuperar', v1: 'No aplica', v2: escRec.roi_meses?.toFixed(1) + ' meses' || '—' },
                        { label: 'Ganancia a 80 años', v1: 'No aplica', v2: fmtMXN2(escRec.ganancia_a80), highlight: true },
                      ].map(({ label, v1, v2, highlight }, i) => (
                        <tr key={i} style={{ background: highlight ? '#EEF2F8' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '7px 10px', fontSize: '12px', color: '#374151', fontWeight: highlight ? '600' : '400' }}>{label}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '12px', color: '#9CA3AF' }}>{v1}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontWeight: highlight ? '800' : '600', color: highlight ? '#1B3A6B' : '#374151', fontSize: highlight ? '13px' : '12px' }}>{v2}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Tabla costo mes a mes */}
                <div style={DS.card}>
                  <p style={DS.secTitle}>💳 Costo Mes a Mes (Pago Recurrente)</p>
                  <div style={{ overflowY: 'auto', maxHeight: '280px', marginBottom: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ background: '#1B3A6B', position: 'sticky' as const, top: 0 }}>
                          {['Año', 'SDI', 'Tasa', 'Mensual', 'Anual'].map((h, i) => (
                            <th key={i} style={{ padding: '7px 10px', color: 'white', fontWeight: '700' as const, textAlign: 'right' as const, fontSize: '10.5px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: anioFin - anioInicio + 1 }, (_, idx) => {
                          const a = anioInicio + idx
                          const tasa = getMod40Pct(a)
                          const sdi = escRec.sdi_mod40 ?? 0
                          const diasAnio = a % 4 === 0 ? 366 : 365
                          const cuotaMens = sdi * (tasa / 100) * diasAnio / 12
                          return (
                            <tr key={a} style={{ background: idx % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '7px 10px', textAlign: 'right' as const, fontWeight: '700' as const, color: '#1B3A6B' }}>{a}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#374151' }}>{fmtMXN(sdi)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' as const, color: '#7C3AED', fontWeight: '600' as const }}>{tasa.toFixed(3)}%</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' as const, fontWeight: '700' as const }}>{fmtMXN2(cuotaMens)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' as const, fontWeight: '800' as const, color: '#B91C1C' }}>{fmtMXN2(cuotaMens * 12)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Totales */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {[
                      { label: 'Costo total mes a mes', value: fmtMXN2(escRec.costo_total), color: '#B91C1C', bg: '#FEF2F2' },
                      { label: 'Recuperación AFORE (20%)', value: '- ' + fmtMXN2(escRec.recuperacion_afore), color: '#065F46', bg: '#F0FDF4' },
                      { label: 'Inversión real neta', value: fmtMXN2(escRec.inversion_neta), color: '#F05B21', bg: '#FFFBEB', big: true },
                    ].map(({ label, value, color, bg, big }, i) => (
                      <div key={i} style={{ padding: '9px 12px', background: bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>{label}</span>
                        <span style={{ fontSize: big ? '16px' : '13px', fontWeight: '800' as const, color }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Siguiente */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                <button onClick={() => setTab(10)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>Financiamiento →</button>
              </div>
            </div>
          )
        })()}

        {tab === 10 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center' as const, padding: '60px', color: '#9CA3AF' }}>
              <p>Completa las pestañas anteriores para continuar</p>
            </div>
          )
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* KPIs críticos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Inversión total retroactiva', value: fmtMXN(escRec.costo_retroactivo), color: '#1B3A6B', bg: '#EEF2F8', border: '#1B3A6B' },
                  { label: 'Aportación banco (35.65%)', value: fmtMXN(escRec.aportacion_banco), color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
                  { label: 'Cuenta propia / fondeador', value: fmtMXN(escRec.aportacion_segundo_fondeo), color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
                  { label: 'Descuento mensual a pensión', value: fmtMXN(escRec.descuento_mensual), color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5' },
                ].map((k, i) => (
                  <div key={i} style={{ background: k.bg, border: '2px solid ' + k.border, padding: '14px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '9.5px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px', fontWeight: '600' as const }}>{k.label}</div>
                    <div style={{ fontSize: '20px', fontWeight: '900' as const, color: k.color, letterSpacing: '-0.5px' }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* Donut chart de participaciones */}
              {escRec.costo_retroactivo > 0 && (() => {
                const total = escRec.costo_retroactivo
                const slices = [
                  { label: 'Recuperación AFORE', val: escRec.recuperacion_afore_retro, color: '#2E8B57' },
                  { label: 'Banco regulado', val: escRec.aportacion_banco, color: '#1D4ED8' },
                  { label: 'Cuenta propia / segundo fondeador', val: escRec.aportacion_segundo_fondeo, color: '#F05B21' },
                ]
                const R = 60, r = 35, cx = 80, cy = 80
                let startAngle = -90
                const paths = slices.map(slice => {
                  const pct = slice.val / total
                  const angle = pct * 360
                  const start = (startAngle * Math.PI) / 180
                  const end = ((startAngle + angle) * Math.PI) / 180
                  const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start)
                  const x2 = cx + R * Math.cos(end), y2 = cy + R * Math.sin(end)
                  const xi1 = cx + r * Math.cos(start), yi1 = cy + r * Math.sin(start)
                  const xi2 = cx + r * Math.cos(end), yi2 = cy + r * Math.sin(end)
                  const large = angle > 180 ? 1 : 0
                  const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`
                  startAngle += angle
                  return { ...slice, d, pct }
                })
                return (
                  <div style={DS.card}>
                    <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#111827', margin: '0 0 12px' }}>🥧 Distribución del Pago Retroactivo</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                      <svg viewBox='0 0 160 160' width='160' height='160'>
                        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} stroke='white' strokeWidth='2' />)}
                        <text x={cx} y={cy - 6} textAnchor='middle' fontSize='11' fontWeight='700' fill='#374151'>Total</text>
                        <text x={cx} y={cy + 10} textAnchor='middle' fontSize='9' fill='#9CA3AF'>{fmtMXN(total / 1000)}K</text>
                      </svg>
                      <div style={{ flex: 1 }}>
                        {paths.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < paths.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                            <div style={{ width: '12px', height: '12px', background: p.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '12px', color: '#374151' }}>{p.label}</span>
                            <span style={{ fontSize: '13px', fontWeight: '700' as const, color: p.color }}>{(p.pct * 100).toFixed(1)}%</span>
                            <span style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', minWidth: '80px', textAlign: 'right' as const }}>{fmtMXN(p.val)}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '10px', padding: '8px 10px', background: '#EEF2F8', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700' as const, color: '#1B3A6B' }}>TOTAL RETROACTIVO</span>
                          <span style={{ fontSize: '14px', fontWeight: '900' as const, color: '#1B3A6B' }}>{fmtMXN(total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {/* Participaciones */}
                <div style={DS.card}>
                  <p style={DS.secTitle}>Pago Retroactivo — Participaciones</p>
                  {[
                    { label: 'Inversión total retroactiva', value: fmtMXN(escRec.costo_retroactivo), big: true, color: '#1B3A6B' },
                    { label: 'Actualizaciones INPC (~7.27%)', value: fmtMXN(escRec.actualizaciones ?? 0), color: '#F59E0B' },
                    { label: 'Recargos por mora (~41.80%)', value: fmtMXN(escRec.recargos ?? 0), color: '#EF4444' },
                    { label: 'Recuperación vía AFORE', value: fmtMXN(escRec.recuperacion_afore_retro), color: '#2E8B57' },
                    { label: 'Banco regulado (35.65%)', value: fmtMXN(escRec.aportacion_banco), color: '#3B82F6' },
                    { label: 'Segundo fondeador / ahorros', value: fmtMXN(escRec.aportacion_segundo_fondeo), color: '#F59E0B' },
                    { label: 'Cantidad mínima en AFORE', value: fmtMXN(escRec.cantidad_minima_afore ?? 0), big: true, color: '#EF4444' },
                  ].map(({ label, value, big, color }, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280' }}>{label}</span>
                      <span style={{ fontSize: big ? '14px' : '12px', fontWeight: big ? '800' : '700', color }}>{value}</span>
                    </div>
                  ))}
                </div>
                {/* Banco regulado */}
                <div style={DS.card}>
                  <p style={DS.secTitle}>Financiamiento Banco Regulado</p>
                  {[
                    { label: 'Monto del crédito', value: fmtMXN(escRec.aportacion_banco), big: true },
                    { label: 'Duración del trámite', value: `${escRec.duracion_tramite_meses ?? 60} meses` },
                    { label: 'Costo financiamiento', value: fmtMXN(escRec.costo_financiamiento_banco ?? 0) },
                    { label: 'Monto máximo a pagar', value: fmtMXN(escRec.monto_maximo_pago ?? 0), big: true },
                  ].map(({ label, value, big }, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280' }}>{label}</span>
                      <span style={{ fontSize: big ? '14px' : '12px', fontWeight: big ? '800' : '700', color: '#1B3A6B' }}>{value}</span>
                    </div>
                  ))}
                  <p style={{ fontSize: '11px', fontWeight: '700' as const, color: '#374151', margin: '12px 0 8px', textTransform: 'uppercase' as const }}>¿Cómo pago el banco?</p>
                  {[
                    { label: 'Plazo', value: '60 meses' },
                    { label: 'Descuento mensual a pensión', value: fmtMXN(escRec.descuento_mensual), big: true },
                    { label: 'Pensión inmediata', value: fmtMXN(escRec.pension_inmediata), big: true },
                    { label: 'Pensión al liquidar', value: fmtMXN(escRec.pension_al_liquidar), big: true },
                  ].map(({ label, value, big }, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280' }}>{label}</span>
                      <span style={{ fontSize: big ? '13px' : '12px', fontWeight: big ? '800' : '600', color: big ? '#F05B21' : '#374151' }}>{value}</span>
                    </div>
                  ))}
                </div>
                {/* Segundo fondeador */}
                <div style={DS.card}>
                  <p style={DS.secTitle}>Segundo Fondeador</p>
                  {[
                    { label: 'Monto requerido', value: fmtMXN(escRec.aportacion_segundo_fondeo), big: true },
                    { label: 'Plazo', value: `${escRec.plazo_segundo_fondeo ?? 12} meses` },
                    { label: 'Costo financiamiento', value: fmtMXN(escRec.costo_financiamiento_segundo ?? 0) },
                    { label: 'Monto máximo a pagar', value: fmtMXN(escRec.monto_maximo_pago ?? 0), big: true },
                  ].map(({ label, value, big }, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280' }}>{label}</span>
                      <span style={{ fontSize: big ? '14px' : '12px', fontWeight: big ? '800' : '700', color: '#1B3A6B' }}>{value}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '12px', padding: '12px', background: '#EEF2F8', border: '1px solid #BFDBFE' }}>
                    <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 6px', textTransform: 'uppercase' as const, fontWeight: '700' as const }}>Análisis financiado</p>
                    {[
                      { label: 'ROI (meses)', value: escRec.roi_financiado?.toFixed(2) ?? '—' },
                      { label: 'Ganancia a 80 años', value: fmtMXN(escRec.ganancia_a80_financiado ?? 0) },
                      { label: 'Tasa de rendimiento', value: (escRec.tasa_rendimiento_financiado != null ? escRec.tasa_rendimiento_financiado.toFixed(2) + '%' : '—') },
                    ].map(({ label, value }, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #DBEAFE' }}>
                        <span style={{ fontSize: '11.5px', color: '#6B7280' }}>{label}</span>
                        <span style={{ fontSize: '12px', fontWeight: '700' as const, color: '#1B3A6B' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                <button onClick={() => setTab(11)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1B3A6B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>Resumen →</button>
              </div>
            </div>
          )
        })()}

        {/* ══ TAB 11: RESUMEN ══════════════════════════════════════════ */}
        {tab === 11 && (() => {
          const escsConMod40 = escenarios.filter(e => e.mod40_meses > 0).slice(0, 3)
          const escRec = escsConMod40[0] ?? null
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Header ejecutivo */}
              <div style={{ background: '#1B3A6B', padding: '18px 20px' }}>
                <p style={{ fontSize: '14px', fontWeight: '800' as const, color: 'white', margin: '0 0 4px' }}>Resumen Ejecutivo — Proyecto de Pensión con Modalidad 40</p>
                <div style={{ display: 'flex', gap: '20px', fontSize: '11px', color: '#93C5FD' }}>
                  <span>{datos.nombre_trabajador || 'Trabajador'}</span>
                  {datos.nss && <span>NSS: {datos.nss}</span>}
                  {datos.ley && <span>Régimen: Ley {datos.ley}</span>}
                  {escRec && <span>{escsConMod40.length} escenario{escsConMod40.length > 1 ? 's' : ''} analizados</span>}
                </div>
              </div>

              {escsConMod40.length === 0 ? (
                <div style={DS.card}>
                  <div style={{ textAlign: 'center' as const, padding: '40px', color: '#9CA3AF' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                    <p style={{ fontSize: '14px' }}>Configura al menos un escenario de Modalidad 40 para ver el resumen.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* KPIs top — el mejor escenario */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Pensión sin Mod. 40', value: fmtMXN2(escenarios[0]?.pension_base ?? 0), sub: 'situación actual', color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB' },
                      { label: 'Pensión con Mod. 40', value: fmtMXN2(escRec?.pension_mensual ?? 0), sub: 'escenario recomendado', color: '#1B3A6B', bg: '#EEF2F8', border: '#1B3A6B' },
                      { label: 'Inversión neta', value: fmtMXN2(escRec?.inversion_neta ?? 0), sub: 'descontando AFORE', color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
                      { label: 'Ganancia a 80 años', value: fmtMXN2(escRec?.ganancia_a80 ?? 0), sub: 'ganancia total', color: '#065F46', bg: '#F0FDF4', border: '#86EFAC' },
                    ].map((k, i) => (
                      <div key={i} style={{ background: k.bg, border: '2px solid ' + k.border, padding: '14px', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, marginBottom: '5px' }}>{k.label}</div>
                        <div style={{ fontSize: '18px', fontWeight: '900' as const, color: k.color, letterSpacing: '-0.5px', marginBottom: '2px' }}>{k.value}</div>
                        <div style={{ fontSize: '10px', color: '#9CA3AF' }}>{k.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* 4 tablas comparativas */}
                  {[
                    { section: '1. Pensión y Monto Mensual', color: '#1B3A6B', rows: [
                      { label: 'Fecha ingreso Mod. 40', fn: (e: any) => e.fecha_ingreso_mod40 || '—' },
                      { label: 'Años cotizados en Mod. 40', fn: (e: any) => (e.mod40_meses / 12).toFixed(2) + ' años' },
                      { label: 'Semanas cotizadas finales', fn: (e: any) => Math.round(e.semanas_finales).toString(), highlight: true },
                      { label: 'Nuevo SDI promedio', fn: (e: any) => fmtMXN2(e.nuevo_sdi_250) },
                      { label: 'Pensión mensual mejorada', fn: (e: any) => fmtMXN2(e.pension_mensual), highlight: true },
                      { label: 'Aguinaldo anual', fn: (e: any) => fmtMXN2(e.aguinaldo_anual) },
                    ]},
                    { section: '2. Costo Modalidad 40', color: '#F05B21', rows: [
                      { label: 'Costo total mes a mes', fn: (e: any) => fmtMXN2(e.costo_total), highlight: true },
                      { label: 'Recuperación AFORE (20%)', fn: (e: any) => fmtMXN2(e.recuperacion_afore) },
                      { label: 'Inversión real neta', fn: (e: any) => fmtMXN2(e.inversion_neta), highlight: true },
                      { label: 'Meses para recuperar', fn: (e: any) => (e.roi_meses != null ? e.roi_meses.toFixed(1) + ' meses' : '—') },
                      { label: 'Ganancia a 80 años', fn: (e: any) => fmtMXN2(e.ganancia_a80), highlight: true },
                      { label: 'Tasa de rendimiento', fn: (e: any) => (e.tasa_rendimiento != null ? e.tasa_rendimiento.toFixed(2) + '%' : '—') },
                    ]},
                    { section: '3. Costo Retroactivo', color: '#7C3AED', rows: [
                      { label: 'Costo retroactivo estimado', fn: (e: any) => fmtMXN2(e.costo_retroactivo), highlight: true },
                      { label: 'Actualizaciones INPC', fn: (e: any) => fmtMXN2(e.actualizaciones ?? 0) },
                      { label: 'Recargos por mora', fn: (e: any) => fmtMXN2(e.recargos ?? 0) },
                      { label: 'Recuperación AFORE retroactivo', fn: (e: any) => fmtMXN2(e.recuperacion_afore_retro) },
                      { label: 'Inversión neta retroactiva', fn: (e: any) => fmtMXN2(e.inversion_neta_retro), highlight: true },
                    ]},
                    { section: '4. Financiamiento', color: '#0891B2', rows: [
                      { label: 'Aportación banco (35.65%)', fn: (e: any) => fmtMXN2(e.aportacion_banco) },
                      { label: 'Cuenta propia / fondeador', fn: (e: any) => fmtMXN2(e.aportacion_segundo_fondeo) },
                      { label: 'Pago mensual crédito (60m)', fn: (e: any) => fmtMXN2(e.descuento_mensual) },
                      { label: 'Pensión inmediata (con banco)', fn: (e: any) => fmtMXN2(e.pension_inmediata), highlight: true },
                      { label: 'Pensión al liquidar banco', fn: (e: any) => fmtMXN2(e.pension_al_liquidar) },
                    ]},
                  ].map(({ section, color, rows }, si) => (
                    <div key={si} style={DS.card}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '2px solid #F3F4F6' }}>
                        <div style={{ width: '4px', height: '18px', background: color }} />
                        <span style={{ fontSize: '12px', fontWeight: '700' as const, color: '#111827', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{section}</span>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#F4F6FB' }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left' as const, color: '#9CA3AF', fontSize: '10px', fontWeight: '700' as const, textTransform: 'uppercase' as const }}>Concepto</th>
                              <th style={{ padding: '8px 12px', textAlign: 'center' as const, color: '#9CA3AF', fontSize: '10px', fontWeight: '700' as const }}>Sin Mod. 40</th>
                              {escsConMod40.map((_, i) => (
                                <th key={i} style={{ padding: '8px 12px', textAlign: 'center' as const, color, fontSize: '10px', fontWeight: '700' as const }}>Escenario {i + 1}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, ri) => (
                              <tr key={ri} style={{ background: row.highlight ? '#F8FAFF' : ri % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                                <td style={{ padding: '8px 12px', color: '#374151', fontWeight: row.highlight ? '600' : '400', borderLeft: row.highlight ? '3px solid ' + color : 'none' }}>{row.label}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' as const, color: '#9CA3AF', fontStyle: 'italic', fontSize: '11.5px' }}>—</td>
                                {escsConMod40.map((e, i) => (
                                  <td key={i} style={{ padding: '8px 12px', textAlign: 'center' as const, fontWeight: row.highlight ? '800' : '600', color: row.highlight ? color : '#374151', fontSize: row.highlight ? '13px' : '12px' }}>{row.fn(e)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Análisis IA */}
              <div style={{ background: 'white', border: '1px solid #DDD6FE' }}>
                <div style={{ background: '#7C3AED', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '700' as const, color: 'white', margin: '0 0 2px' }}>🤖 Análisis de Sofía IA</p>
                    <p style={{ fontSize: '11px', color: '#DDD6FE', margin: 0 }}>Diagnóstico inteligente del proyecto de pensión</p>
                  </div>
                  <button onClick={generarAnalisisIA} disabled={!clienteId || sdiPromedio <= 0}
                    style={{ padding: '8px 16px', border: '1px solid white', fontSize: '12px', fontWeight: '700' as const, color: '#7C3AED', background: 'white', fontFamily: 'inherit', cursor: 'pointer', opacity: clienteId && sdiPromedio > 0 ? 1 : 0.5 }}>
                    ✨ Generar análisis
                  </button>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  {analisis.length === 0 && (
                    <div style={{ padding: '20px', color: '#9CA3AF', background: '#F5F3FF', border: '1px dashed #DDD6FE', fontSize: '12px', textAlign: 'center' as const }}>
                      Haz clic en &quot;Generar análisis&quot; para el diagnóstico completo
                    </div>
                  )}
                  {analisis.length > 0 && analisis.map((sec, i) => (
                    <div key={i} style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderLeft: '3px solid #7C3AED', padding: '12px 14px', marginBottom: '8px' }}>
                      <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#5B21B6', margin: '0 0 6px' }}>{sec.titulo}</p>
                      <p style={{ fontSize: '12px', color: '#374151', margin: 0, lineHeight: 1.7 }}>{sec.contenido}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ficha técnica — parámetros usados en este cálculo */}
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px 16px' }}>
                <p style={{ fontSize: '10.5px', fontWeight: '700' as const, color: '#6B7280', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                  🔖 Ficha técnica — Parámetros usados en este cálculo
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                  {[
                    { label: 'UMA diaria', value: fmtMXN2(sys.UMA_DIARIA) },
                    { label: 'PMG Ley 73', value: fmtMXN2(sys.PMG_L73) },
                    { label: '% Recup. AFORE', value: (sys.pct_afore_mod40 ?? 20) + '%' },
                    { label: 'Tasa banco anual', value: (sys.tasa_banco_anual ?? 32.2) + '%' },
                    { label: 'Fecha de cálculo', value: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) },
                  ].map((p, i) => (
                    <div key={i}>
                      <div style={{ fontSize: '9.5px', color: '#9CA3AF' }}>{p.label}</div>
                      <div style={{ fontSize: '12px', fontWeight: '700' as const, color: '#374151' }}>{p.value}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '8px 0 0', lineHeight: 1.5 }}>
                  Estos valores quedan congelados en este diagnóstico — si se actualizan en Admin Fórmulas después, este registro conserva los valores originales con que fue calculado.
                </p>
              </div>

            </div>
          )
        })()}

            </div>{/* fin overflowY */}

        {/* ══ TAB 12: MODALIDAD 10 ═══════════════════════════════════════ */}
        {tab === 12 && (() => {
          const escM10 = escenarios.find(e => e.id === 'e_m10')
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          const pensionActual = escenarios[0]?.pension_base ?? 0
          const TASA_M10_DISPLAY = 22
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Header */}
              <div style={{ background: '#0891B2', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '10px', color: '#BAE6FD', margin: '0 0 3px', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: '600' }}>Cotización Voluntaria</p>
                  <p style={{ fontSize: '16px', fontWeight: '800', color: 'white', margin: 0 }}>Modalidad 10 — Conservación de Derechos</p>
                </div>
                {escM10 && (
                  <div style={{ textAlign: 'right' as const }}>
                    <div style={{ fontSize: '10px', color: '#BAE6FD', marginBottom: '2px' }}>Pensión mejorada</div>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: 'white', letterSpacing: '-1px' }}>{fmtMXN2(escM10.pension_mensual)}</div>
                  </div>
                )}
              </div>

              {/* Explicación conceptual */}
              <div style={DS.card}>
                <p style={DS.secTitle}>¿Qué es la Modalidad 10?</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <p style={{ fontSize: '12px', color: '#374151', lineHeight: 1.7, margin: '0 0 10px' }}>
                      La <strong>Modalidad 10</strong> permite a trabajadores que han dejado de cotizar (desempleados, independientes) continuar su cotización ante el IMSS de forma voluntaria, pagando el <strong>100% de las cuotas</strong> obrero-patronales.
                    </p>
                    <p style={{ fontSize: '12px', color: '#374151', lineHeight: 1.7, margin: 0 }}>
                      A diferencia de la Modalidad 40, la Mod 10 <strong>incluye cobertura médica completa</strong> — el trabajador y su familia mantienen acceso a servicios de salud del IMSS mientras cotiza.
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { icon: '✅', title: 'Cobertura médica completa', desc: 'A diferencia de Mod 40, mantiene acceso a servicios médicos del IMSS' },
                      { icon: '📅', title: 'Acumula semanas', desc: 'Suma semanas hacia las 500 mínimas requeridas para pensión' },
                      { icon: '💰', title: 'Tasa ~22%', desc: 'Paga el 100% de cuotas: aprox. 22% del SBC registrado por año' },
                      { icon: '🔒', title: 'Conserva derechos', desc: 'Mantiene vigentes los derechos ante el IMSS (pensión, invalidez)' },
                    ].map(({ icon, title, desc }, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 12px', background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                        <span style={{ fontSize: '18px', flexShrink: 0 }}>{icon}</span>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#0C4A6E' }}>{title}</div>
                          <div style={{ fontSize: '11px', color: '#6B7280' }}>{desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* KPIs si hay datos */}
              {escM10 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Pensión sin Mod 10', value: fmtMXN2(pensionActual), color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB' },
                      { label: 'Pensión con Mod 10', value: fmtMXN2(escM10.pension_mensual), color: '#0891B2', bg: '#F0F9FF', border: '#0891B2' },
                      { label: 'Costo total (12 meses)', value: fmtMXN2(escM10.costo_total), color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
                      { label: 'Recuperación AFORE', value: fmtMXN2(escM10.recuperacion_afore), color: '#065F46', bg: '#F0FDF4', border: '#86EFAC' },
                    ].map((k, i) => (
                      <div key={i} style={{ background: k.bg, border: '2px solid ' + k.border, padding: '14px', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '9.5px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600', marginBottom: '6px' }}>{k.label}</div>
                        <div style={{ fontSize: '18px', fontWeight: '900', color: k.color, letterSpacing: '-0.5px' }}>{k.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Detalle del cálculo */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div style={DS.card}>
                      <p style={DS.secTitle}>📊 Cálculo Modalidad 10 (12 meses)</p>
                      {[
                        { label: 'SDI actual (promedio 250 sem.)', value: fmtMXN2(sdiPromedio) },
                        { label: 'Salario a registrar en Mod. 10', value: fmtMXN2(escM10.sdi_mod40 ?? sdiPromedio), highlight: true },
                        { label: 'Tasa Mod. 10 anual (~22%)', value: TASA_M10_DISPLAY + '%' },
                        { label: 'Cuota mensual estimada', value: fmtMXN2(escM10.costo_total / 12), highlight: true },
                        { label: 'Semanas cotizadas en Mod. 10', value: Math.round(escM10.semanas_mod40 || 52).toString() + ' sem.' },
                        { label: 'Semanas totales finales', value: Math.round(escM10.semanas_finales || 0).toString(), highlight: true },
                        { label: 'Nuevo SDI promedio 250 sem.', value: fmtMXN2(escM10.nuevo_sdi_250) },
                        { label: 'Inversión neta (costo - AFORE)', value: fmtMXN2(escM10.inversion_neta), highlight: true },
                      ].map(({ label, value, highlight }, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6', background: highlight ? 'transparent' : 'transparent' }}>
                          <span style={{ fontSize: '12px', color: '#6B7280' }}>{label}</span>
                          <span style={{ fontSize: highlight ? '14px' : '12px', fontWeight: highlight ? '800' : '600', color: highlight ? '#0891B2' : '#374151' }}>{value}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Comparativo Mod 10 vs Mod 40 */}
                      <div style={DS.card}>
                        <p style={DS.secTitle}>⚖️ Mod 10 vs Mod 40 — ¿Cuál conviene?</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                          <thead>
                            <tr style={{ background: '#F4F6FB' }}>
                              <th style={{ padding: '7px 10px', textAlign: 'left' as const, fontSize: '10px', color: '#9CA3AF', fontWeight: '700' }}>Concepto</th>
                              <th style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '10px', color: '#0891B2', fontWeight: '700' }}>Mod 10</th>
                              <th style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '10px', color: '#1B3A6B', fontWeight: '700' }}>Mod 40</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { label: 'Tasa anual aprox.', m10: '22%', m40: getMod40Pct(new Date().getFullYear()).toFixed(3) + '%' },
                              { label: 'Cobertura médica', m10: '✅ Sí', m40: '✕ No' },
                              { label: 'Mejora SDI promedio', m10: escM10.nuevo_sdi_250 > sdiPromedio ? '✅ Sí' : '—', m40: escRec?.nuevo_sdi_250 > sdiPromedio ? '✅ Sí' : '—' },
                              { label: 'Pensión mensual', m10: fmtMXN2(escM10.pension_mensual), m40: fmtMXN2(escRec?.pension_mensual ?? 0), highlight: true },
                              { label: 'Costo total', m10: fmtMXN2(escM10.costo_total), m40: fmtMXN2(escRec?.costo_total ?? 0) },
                              { label: 'Inversión neta', m10: fmtMXN2(escM10.inversion_neta), m40: fmtMXN2(escRec?.inversion_neta ?? 0), highlight: true },
                              { label: 'Recomendado para', m10: 'Desempleados / Independientes', m40: 'Empleados activos' },
                            ].map(({ label, m10, m40, highlight }, i) => (
                              <tr key={i} style={{ background: highlight ? '#F0F9FF' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                                <td style={{ padding: '7px 10px', fontSize: '11.5px', color: '#374151' }}>{label}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontWeight: highlight ? '800' : '600', color: highlight ? '#0891B2' : '#374151', fontSize: highlight ? '13px' : '11.5px' }}>{m10}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontWeight: highlight ? '800' : '600', color: highlight ? '#1B3A6B' : '#374151', fontSize: highlight ? '13px' : '11.5px' }}>{m40}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Diferencia clave */}
                      <div style={{ background: '#F0F9FF', border: '2px solid #0891B2', padding: '14px' }}>
                        <p style={{ fontSize: '12px', fontWeight: '700', color: '#0C4A6E', margin: '0 0 8px' }}>💡 Diferencia clave con Mod 40</p>
                        <p style={{ fontSize: '11.5px', color: '#374151', lineHeight: 1.7, margin: 0 }}>
                          La <strong>Modalidad 40</strong> está diseñada para trabajadores que <em>siguen empleados</em> y quieren cotizar con un salario más alto para mejorar su pensión. La <strong>Modalidad 10</strong> es para quienes <em>ya no están empleados</em> y necesitan mantener sus derechos activos, incluyendo acceso a servicios médicos del IMSS. Son complementarias, no excluyentes.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!escM10 && (
                <div style={DS.card}>
                  <div style={{ textAlign: 'center' as const, padding: '40px', color: '#9CA3AF' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                    <p style={{ fontSize: '14px', margin: '0 0 6px' }}>Carga la constancia IMSS para ver el análisis de Modalidad 10</p>
                    <p style={{ fontSize: '12px' }}>El sistema calcula automáticamente el escenario de Mod 10 con los datos de semanas cotizadas y SDI del trabajador</p>
                  </div>
                </div>
              )}

            </div>
          )
        })()}

            {/* ── Tab bar — pie de navegación ── */}
            <div style={{ display: 'flex', borderTop: '2px solid #E5E7EB', background: 'white', flexShrink: 0, overflowX: 'auto', alignItems: 'stretch' }}>
              {TABS.map((t, i) => (
                <button key={i} onClick={() => setTab(i)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '12px 14px', border: 'none', borderBottom: '3px solid ' + (tab === i ? NARANJA : 'transparent'), cursor: 'pointer', background: tab === i ? '#FFF7F4' : 'white', fontFamily: 'inherit', flex: '1 0 auto', transition: 'all 0.15s', minWidth: '90px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: i < tab ? VERDE : tab === i ? NARANJA : '#D1D5DB', transition: 'all 0.15s' }} />
                  <span style={{ fontSize: '10.5px', fontWeight: tab === i ? '700' : '500', color: tab === i ? NARANJA : i < tab ? '#374151' : '#9CA3AF', whiteSpace: 'nowrap' as const }}>
                    <span style={{ fontSize: '9px', opacity: 0.6 }}>{i+1} </span>{t}
                  </span>
                </button>
              ))}
            </div>

          </div>{/* fin panel derecho */}
        </div>
      )}{/* fin layout principal */}

    </div>
  )
}

export default function CalculadoraPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)', color: '#94a3b8' }}>Cargando calculadora...</div>}>
      <CalculadoraInner />
    </Suspense>
  )
}
