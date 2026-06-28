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
  // Typography scale
  txt: { xs: '10px', sm: '11px', base: '12px', md: '13px', lg: '14px', xl: '16px', h: '18px' },
  // Colors
  col: { azul: '#1B3A6B', verde: '#2E8B57', naranja: '#F05B21', gris: '#6B7280', borde: '#D1D5DB', bg: '#F9FAFB', bgAlt: '#F4F6FB' },
  // Spacing
  sp: { xs: '4px', sm: '6px', md: '10px', lg: '14px', xl: '20px' },
  // Shared styles as objects
  card: { background: 'white', border: '1px solid #D1D5DB', padding: '16px', marginBottom: '12px' } as React.CSSProperties,
  tHead: { background: '#1B3A6B', color: 'white', padding: '8px 10px', fontSize: '11px', fontWeight: '700' as const, textAlign: 'left' as const, whiteSpace: 'nowrap' as const },
  tHeadR: { background: '#1B3A6B', color: 'white', padding: '8px 10px', fontSize: '11px', fontWeight: '700' as const, textAlign: 'right' as const, whiteSpace: 'nowrap' as const },
  tCell: { padding: '7px 10px', fontSize: '12px', color: '#374151', borderBottom: '1px solid #E5E7EB' } as React.CSSProperties,
  tCellR: { padding: '7px 10px', fontSize: '12px', color: '#374151', borderBottom: '1px solid #E5E7EB', textAlign: 'right' as const } as React.CSSProperties,
  tCellBold: { padding: '7px 10px', fontSize: '12px', color: '#1B3A6B', fontWeight: '700' as const, borderBottom: '1px solid #E5E7EB', textAlign: 'right' as const } as React.CSSProperties,
  tRowAlt: (i: number) => ({ background: i % 2 === 0 ? 'white' : '#F9FAFB' }) as React.CSSProperties,
  secTitle: { fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: '0 0 12px', paddingBottom: '8px', borderBottom: '2px solid #E5E7EB' } as React.CSSProperties,
  kpiBlock: { background: '#1B3A6B', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } as React.CSSProperties,
  label: { fontSize: '10.5px', fontWeight: '600' as const, color: '#6B7280', marginBottom: '3px', display: 'block' as const, textDecoration: 'underline', textDecorationColor: '#D1D5DB' },
  input: { width: '100%', border: '1px solid #9CA3AF', padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: 'white', color: '#374151' } as React.CSSProperties,
  inputReadonly: { width: '100%', border: '1px solid #D1D5DB', padding: '6px 8px', fontSize: '12px', background: '#F5F5F5', color: '#6B7280', fontFamily: 'inherit', boxSizing: 'border-box' as const } as React.CSSProperties,
  select: { width: '100%', border: '1px solid #9CA3AF', padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' as const } as React.CSSProperties,
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
  const TABS = [
    'Datos generales',
    'Pensión Actual',
    'Salario Prom Mod 40',
    'Costo Mod 40',
    'Generales Mod 40',
    'Pensión Mod 40',
    'Inversión',
  ]
  // Carátula: se muestra solo cuando no hay datos cargados y no hay cliente pre-seleccionado
  const [mostrarCaratula, setMostrarCaratula] = useState(true)

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
        setMostrarCaratula(false)
      }

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
    const { data } = await supabase.from('perfiles_usuario').select('*').eq('id', uid).single()
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

  // ── Guardar diagnóstico
  async function guardarDiagnostico(nuevoEstatus: 'borrador' | 'autorizado') {
    if (!clienteId || !userId || analisis.length === 0) return
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
    border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px',
    boxSizing: 'border-box', fontFamily: 'inherit', background: 'white',
    color: '#1e293b', outline: 'none',
  }

  const numInputSt: React.CSSProperties = { ...inputSt, textAlign: 'right' }
  const autoInputSt: React.CSSProperties = { ...inputSt, background: '#EFF6FF', borderColor: '#bfdbfe' }
  const autoNumInputSt: React.CSSProperties = { ...numInputSt, background: '#EFF6FF', borderColor: '#bfdbfe' }
  const manualInputSt: React.CSSProperties = { ...inputSt, background: '#FFFBEB', borderColor: '#f59e0b', borderWidth: '2px' }
  const manualNumInputSt: React.CSSProperties = { ...numInputSt, background: '#FFFBEB', borderColor: '#f59e0b', borderWidth: '2px' }
  const sysInputSt: React.CSSProperties = { ...inputSt, background: '#F5F3FF', borderColor: '#ddd6fe' }
  const sysNumInputSt: React.CSSProperties = { ...numInputSt, background: '#F5F3FF', borderColor: '#ddd6fe' }

  const clienteSeleccionado = clientes.find(c => c.id === clienteId)


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>

      {/* ── Modal sugerencia de avance de etapa ── */}
      {showSugerirEtapa && (() => {
        const clienteActual = clientes.find(c => c.id === clienteId)
        const esAutorizacion = estatus === 'autorizado'
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
              <div style={{ fontSize: '28px', textAlign: 'center', marginBottom: '8px' }}>🎯</div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1B3A6B', margin: '0 0 10px', textAlign: 'center' }}>
                {esAutorizacion ? '¡Diagnóstico autorizado!' : '¡Diagnóstico guardado!'}
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px', lineHeight: 1.6, textAlign: 'center' }}>
                <strong>{clienteActual?.nombre}</strong> está en <strong>{ETAPA_LABELS[clienteActual?.etapa_kanban ?? '']}</strong>.
                ¿Deseas moverlo a <strong style={{ color: '#2E8B57' }}>{ETAPA_LABELS[etapaSugerida]}</strong>?
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowSugerirEtapa(false)}
                  style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#F4F6FB', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Ahora no
                </button>
                <button onClick={() => moverEtapa(clienteId, etapaSugerida)}
                  style={{ flex: 2, padding: '9px', border: 'none', borderRadius: '8px', background: '#2E8B57', color: 'white', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
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
              <p style={{ fontSize: '14px', fontWeight: '700', color: AZUL, margin: 0 }}>📖 Glosario de términos</p>
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
                  <p style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', margin: '0 0 3px' }}>{item.t}</p>
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
              <p style={{ fontSize: '14px', fontWeight: '700', color: AZUL, margin: 0 }}>¿Por qué pedimos años Y meses, no solo años?</p>
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
              <p style={{ margin: '10px 0 0', padding: '8px 10px', background: '#EFF6FF', borderRadius: '6px', color: AZUL, fontWeight: '600' }}>
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
                <p style={{ fontSize: '14px', fontWeight: '700', color: AZUL, margin: 0 }}>Tabla de cuantía de pensión — Ley 73</p>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>Art. 167 LSS 1973 · La cuantía aumenta 1.25% por cada 52 semanas adicionales sobre 500</p>
              </div>
              <button onClick={() => setShowTooltipCuantia(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: AZUL }}>
                    {['Semanas cotizadas', 'Años cotizados', '% del SDI', 'Sobre pensión base'].map((h, i) => (
                      <th key={i} style={{ padding: '7px 10px', color: 'white', textAlign: i > 0 ? 'right' : 'left', fontSize: '10px', fontWeight: '700' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TABLA_CUANTIA.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 10px', fontWeight: '600', color: AZUL }}>{row.semanas}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{Math.floor((row.semanas - 500) / 52) + 9.6} aprox.</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', color: NARANJA }}>{row.pct}%</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8', fontSize: '11px' }}>{row.descripcion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '12px' }}>
              <div style={{ background: '#FFF7ED', borderRadius: '8px', padding: '10px 12px', border: '1px solid #fed7aa' }}>
                <p style={{ fontSize: '10px', color: '#92400e', margin: '0 0 3px', fontWeight: '700' }}>CESANTÍA (60-64 años)</p>
                <p style={{ fontSize: '11px', color: '#92400e', margin: 0, lineHeight: 1.5 }}>Se aplica un factor reductor: 75% a los 60, 80% a los 61, 85% a los 62, 90% a los 63, 95% a los 64 años. Se requiere acreditar haber dejado de trabajar.</p>
              </div>
              <div style={{ background: '#F0FDF4', borderRadius: '8px', padding: '10px 12px', border: '1px solid #bbf7d0' }}>
                <p style={{ fontSize: '10px', color: '#15803d', margin: '0 0 3px', fontWeight: '700' }}>VEJEZ (65+ años)</p>
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
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1B3A6B', margin: '0 0 10px' }}>⚠️ ¿Cambiar de cliente?</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.6 }}>
              {diagGuardadoId
                ? 'El diagnóstico ya fue guardado. Puedes cambiar de cliente sin perder nada.'
                : 'El análisis generado y los datos actuales se perderán si no has guardado el diagnóstico.'}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowConfirmCambio(false); setPendingClienteId('') }}
                style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#F4F6FB', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                style={{ flex: 2, padding: '9px', border: 'none', borderRadius: '8px', background: '#1B3A6B', color: 'white', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: AZUL, margin: 0 }}>Desglose completo — 250 semanas cotizadas</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>SDI promedio ponderado: <strong style={{ color: NARANJA }}>{fmtMXN2(sdiPromedio)}</strong></p>
              </div>
              <button onClick={() => setShowDetalle250(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F4F6FB' }}>
                  {['#', 'Fecha inicio', 'Fecha fin', 'Semanas', 'SDI diario', 'SDI mensual', 'Peso'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', textAlign: i > 0 ? 'right' : 'center', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodos.map((p, i) => (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_inicio?.slice(0, 10)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_fin?.slice(0, 10)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>{p.semanas}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: NARANJA }}>{fmtMXN2(p.sdi)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{fmtMXN(p.sdi * 30.4)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>{p.peso.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={3} style={{ padding: '8px 10px', fontWeight: '700', color: AZUL }}>Promedio ponderado</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{periodos.reduce((s, p) => s + p.semanas, 0)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', color: NARANJA, fontSize: '14px' }}>{fmtMXN2(sdiPromedio)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{fmtMXN(sdiPromedio * 30.4)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>100%</td>
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
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: AZUL, margin: 0 }}>Historial laboral completo</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>{periodosCompletos.length} períodos · {Math.round(periodosCompletos.reduce((s: number, p: any) => s + (p.semanas || 0), 0))} semanas totales · ordenado del más antiguo al más reciente</p>
              </div>
              <button onClick={() => setShowHistorialCompleto(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F4F6FB' }}>
                  {['#', 'Fecha inicio', 'Fecha fin', 'Semanas', 'SDI diario', 'Patrón'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', textAlign: i > 0 ? 'right' : 'center', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
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
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_inicio?.slice(0, 10) || '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_fin?.slice(0, 10) || 'Vigente'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>{(p.semanas || 0).toFixed(2)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: NARANJA }}>{fmtMXN2(p.sdi || 0)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b', fontSize: '11px' }}>{p.patron || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ CARÁTULA DE BIENVENIDA ══ */}
      {/* ══ MODAL 1: Bienvenida — botones estáticos, abre instantáneo ══ */}
      {mostrarCaratula && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '400px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Header azul */}
            <div style={{ background: AZUL, padding: '28px 28px 22px', textAlign: 'center' as const }}>
              <div style={{ fontSize: '34px', fontWeight: '900', color: 'white', letterSpacing: '-1px', fontFamily: 'Arial Black, sans-serif', marginBottom: '8px' }}>
                KSE<sup style={{ fontSize: '13px', verticalAlign: 'super' }}>®</sup>
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'white', margin: '0 0 6px' }}>Calculadora de Pensión</h2>
              <p style={{ fontSize: '12px', color: '#93C5FD', margin: 0, lineHeight: 1.5 }}>
                Bienvenido, para iniciar adjunta la constancia de semanas cotizadas o selecciona un cliente.
              </p>
            </div>

            {/* Botones */}
            <div style={{ padding: '24px' }}>
              {/* Seleccionar cliente */}
              <button onClick={() => setShowClienteModal(true)}
                style={{ width: '100%', padding: '13px', background: 'white', color: AZUL, border: `2px solid ${AZUL}`, cursor: 'pointer', fontSize: '14px', fontWeight: '700', fontFamily: 'inherit', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                👤 Seleccionar cliente existente
              </button>

              {/* Separador */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ flex: 1, borderTop: '1px solid #E5E7EB' }} />
                <span style={{ fontSize: '11px', color: '#9CA3AF' }}>o</span>
                <div style={{ flex: 1, borderTop: '1px solid #E5E7EB' }} />
              </div>

              {/* Cargar constancia */}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', background: AZUL, color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '700', marginBottom: '12px', width: '100%', boxSizing: 'border-box' as const }}>
                📎 Constancia Semanas Cotizadas
                <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) { setMostrarCaratula(false); extraerPDF(f) }
                }} />
              </label>

              {/* Registrar nuevo */}
              <a href="/clientes?nuevo=1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '11px', background: '#F8FAFC', color: '#374151', border: '1px solid #E5E7EB', fontSize: '13px', fontWeight: '600', textDecoration: 'none', marginBottom: '8px' }}>
                ＋ Registrar nuevo cliente
              </a>
              <a href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', color: '#9CA3AF', fontSize: '12px', textDecoration: 'none' }}>
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
                <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: AZUL }}>Seleccionar cliente</p>
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
                  onClick={() => { setClienteId(c.id); setBuscarCliente(''); setShowClienteModal(false); setMostrarCaratula(false) }}
                  style={{ width: '100%', padding: '11px 16px', background: 'white', border: 'none', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '34px', height: '34px', background: '#EEF2F8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: AZUL }}>
                    {c.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{c.nombre}</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{c.telefono ?? ''}</div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 10px', background: c.etapa_kanban === 'diagnostico' ? '#DCFCE7' : '#EEF2F8', color: c.etapa_kanban === 'diagnostico' ? '#15803D' : AZUL, flexShrink: 0 }}>
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
          <div style={{ width: '435px', flexShrink: 0, background: 'white', borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '800', color: AZUL, margin: 0, paddingBottom: '10px', borderBottom: `2px solid ${AZUL}` }}>Calculadora de Pensión</h2>
            <div>
              <p style={{ fontSize: '11.5px', fontWeight: '800', color: AZUL, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Generales del trabajador:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '1px', textDecoration: 'underline' }}>Nombre del cliente / asesorado:</div>
                <div style={{ fontSize: '12.5px', color: clienteId ? '#374151' : '#cbd5e1', fontStyle: clienteId ? 'normal' : 'italic', padding: '4px 7px', background: '#F8FAFC', border: '1px solid #e2e8f0' }}>{clientes.find(c => c.id === clienteId)?.nombre || 'Campo prellenado al seleccionar el cliente'}</div>
                <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '1px', textDecoration: 'underline' }}>Nombre del trabajador (constancia IMSS)</div>
                <div style={{ fontSize: '12.5px', color: datos.nombre_trabajador ? '#374151' : '#cbd5e1', fontStyle: datos.nombre_trabajador ? 'normal' : 'italic', padding: '4px 7px', background: '#F8FAFC', border: '1px solid #e2e8f0' }}>{datos.nombre_trabajador || 'Se llena con la constancia'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  {[
                    ['NSS:', datos.nss || 'Se llena con la constancia'],
                    ['Régimen:', datos.ley ? `Ley ${datos.ley}` : 'Se llena con la constancia'],
                    ['Fecha de Nacimiento:', datos.fecha_nacimiento || 'Se llena con la constancia'],
                    ['CURP:', '—'],
                  ].map(([l, v], i) => (
                    <div key={i}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '1px', textDecoration: 'underline' }}>{l}</div>
                      <div style={{ fontSize: '12px', color: String(v).includes('Se llena') ? '#cbd5e1' : '#374151', padding: '3px 5px', background: '#F8FAFC', border: '1px solid #e2e8f0', fontStyle: String(v).includes('Se llena') ? 'italic' : 'normal' }}>{v}</div>
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '1px', textDecoration: 'underline' }}>Edad Actual:</div>
                    <div style={{ fontSize: '12px', color: datos.edad_actual ? '#374151' : '#cbd5e1', padding: '3px 5px', background: '#F8FAFC', border: '1px solid #e2e8f0', fontStyle: datos.edad_actual ? 'normal' : 'italic' }}>{datos.edad_actual ? `${datos.edad_actual.toFixed(2)} años` : 'Se calcula automáticamente'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '1px', textDecoration: 'underline' }}>Semanas cotizadas:</div>
                    <div style={{ fontSize: '12px', color: datos.semanas_totales ? '#374151' : '#cbd5e1', padding: '3px 5px', background: '#F8FAFC', border: '1px solid #e2e8f0', fontStyle: datos.semanas_totales ? 'normal' : 'italic' }}>{datos.semanas_totales || 'Se calcula con constancia'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '1px', textDecoration: 'underline' }}>Vigencia de derechos:</div>
                    <div style={{ fontSize: '12px', padding: '3px 5px', background: '#F8FAFC', border: '1px solid #e2e8f0', color: conservacion.vigente ? VERDE : datos.semanas_totales ? '#ef4444' : '#cbd5e1', fontStyle: datos.semanas_totales ? 'normal' : 'italic' }}>{datos.semanas_totales ? (conservacion.vigente ? 'Vigente' : 'Vencido') : 'Calculado automáticamente'}</div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px dashed #e2e8f0' }} />
            <div>
              <p style={{ fontSize: '11.5px', fontWeight: '800', color: AZUL, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Generales del trabajador:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {[
                  ['Sigue cotizando al IMSS:', datos.sigue_cotizando ? 'Sí' : 'No'],
                  ['Semanas descontadas:', datos.semanas_descontadas > 0 ? String(datos.semanas_descontadas) : 'Se llena con la constancia'],
                  ['Ayuda asistencial (art 165 LSS):', datos.tiene_ayuda_asistencial ? 'Sí' : 'No'],
                  ['Edad mínima de Pensión sin:', `${datos.edad_min_pension || 60} años (predefinido)`],
                ].map(([l, v], i) => (
                  <div key={i}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '1px', textDecoration: 'underline' }}>{l}</div>
                    <div style={{ fontSize: '12px', color: String(v).includes('Se llena') ? '#cbd5e1' : '#374151', padding: '3px 5px', background: '#F8FAFC', border: '1px solid #e2e8f0', fontStyle: String(v).includes('Se llena') ? 'italic' : 'normal' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: '1px dashed #e2e8f0' }} />
            <div>
              <p style={{ fontSize: '12px', fontWeight: '800', color: '#374151', textTransform: 'uppercase', textAlign: 'center' as const, margin: '0 0 4px', letterSpacing: '0.3px' }}>PENSIONES LSS 1973: PORCENTAJE SEGÚN EDAD DE RETIRO</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                <thead>
                  <tr style={{ background: AZUL }}>
                    <th style={{ padding: '3px 5px', color: 'white', textAlign: 'center' as const, fontWeight: '700', fontSize: '12px' }}>Edad</th>
                    <th style={{ padding: '3px 5px', color: 'white', textAlign: 'center' as const, fontWeight: '700', fontSize: '12px' }}>% Cuantía</th>
                    <th style={{ padding: '3px 5px', color: 'white', textAlign: 'center' as const, fontWeight: '700', fontSize: '12px' }}>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {[[60,'75%','Cesantía E.A.'],[61,'80%','Cesantía E.A.'],[62,'85%','Cesantía E.A.'],[63,'90%','Cesantía E.A.'],[64,'95%','Cesantía E.A.']].map(([edad, pct, tipo], i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC' }}>
                      <td style={{ padding: '2px 5px', textAlign: 'center' as const }}>{edad} Años</td>
                      <td style={{ padding: '2px 5px', textAlign: 'center' as const, fontWeight: '700' }}>{pct}</td>
                      <td style={{ padding: '2px 5px', fontSize: '12px', color: '#64748b' }}>{tipo}</td>
                    </tr>
                  ))}
                  <tr style={{ background: VERDE }}>
                    <td style={{ padding: '3px 5px', textAlign: 'center' as const, fontWeight: '800', color: 'white' }}>65+ Años</td>
                    <td style={{ padding: '3px 5px', textAlign: 'center' as const, fontWeight: '800', color: 'white' }}>100%</td>
                    <td style={{ padding: '3px 5px', color: 'white', fontSize: '12px', fontWeight: '700' }}>VEJEZ (IDEL)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Panel derecho dinámico ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Barra de KPIs + acciones superior */}
            {/* Nav bar */}
            <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
              {!clienteId && (
                <div style={{ padding: '8px 16px', background: '#FFF7ED', borderBottom: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: '#92400e', fontWeight: '600' }}>⚠️ Selecciona un cliente para iniciar el diagnóstico</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', gap: '10px', overflowX: 'auto' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: 0, whiteSpace: 'nowrap' }}>
                  {TABS[tab]}
                  {clienteSeleccionado && <span style={{ color: AZUL, fontWeight: '600', fontSize: '12px' }}> · {clienteSeleccionado.nombre}</span>}
                  {diagGuardadoId && <span style={{ color: estatus === 'autorizado' ? VERDE : '#f59e0b', fontWeight: '600', fontSize: '12.5px' }}> · {estatus === 'autorizado' ? '✅ Autorizado' : '📝 Borrador'}</span>}
                </p>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  <select value={clienteId} onChange={e => { if (analisis.length > 0 || diagGuardadoId) { setPendingClienteId(e.target.value); setShowConfirmCambio(true) } else { setClienteId(e.target.value); setDiagGuardadoId(null); setEstatus('borrador') } }} style={{ ...inputSt, minWidth: '150px', fontSize: '12px', padding: '6px 10px', height: '32px', borderColor: !clienteId ? '#f97316' : '#e2e8f0' }}>
                    <option value="">— Seleccionar cliente —</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 12px', height: '32px', border: '1px solid #e2e8f0', cursor: extracting ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', color: AZUL, background: '#EEF2F8', whiteSpace: 'nowrap', boxSizing: 'border-box' as const }}>
                    {extracting ? '⏳ Extrayendo...' : '📄 Cargar constancia'}
                    <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} disabled={extracting} onChange={e => { const f = e.target.files?.[0]; if (f) extraerPDF(f) }} />
                  </label>
                  {sdiPromedio > 0 && (
                    <button onClick={generarAnalisisIA} disabled={!clienteId} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 12px', height: '32px', border: '1px solid #8b5cf6', cursor: clienteId ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: '600', color: 'white', background: '#7c3aed', whiteSpace: 'nowrap', opacity: clienteId ? 1 : 0.5, fontFamily: 'inherit' }}>
                      ✨ Análisis IA
                    </button>
                  )}
                </div>
              </div>
            </div>
                        {/* KPI bar */}
            <div style={{ display: 'flex', gap: '0', background: 'white', borderBottom: '2px solid #E5E7EB', flexShrink: 0, overflowX: 'auto' }}>
              {[
                { label: 'Semanas cotizadas', value: datos.semanas_totales > 0 ? (datos.semanas_totales - datos.semanas_descontadas).toLocaleString() : '—', color: (datos.semanas_totales - datos.semanas_descontadas) >= 500 ? VERDE : AZUL },
                { label: 'Régimen', value: datos.ley ? 'Ley ' + datos.ley : '—', color: AZUL },
                { label: 'Edad pensión', value: (datos.edad_min_pension || 60) + ' años', color: AZUL },
                { label: 'SDI 250 sem.', value: sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—', color: NARANJA },
                { label: 'Sem. faltantes', value: datos.semanas_totales > 0 ? String(Math.max(0, 500 - (datos.semanas_totales - datos.semanas_descontadas))) : '—', color: Math.max(0, 500 - (datos.semanas_totales - datos.semanas_descontadas)) === 0 ? VERDE : '#DC2626' },
                { label: 'Total sem. cot.', value: escenarios.find(e => e.recomendado)?.semanas_finales ? String(Math.round(escenarios.find(e => e.recomendado)!.semanas_finales)) : '—', color: AZUL },
                { label: 'Fecha del trámite', value: datos.fecha_nacimiento ? (() => { const d = new Date(datos.fecha_nacimiento); d.setFullYear(d.getFullYear() + (datos.edad_min_pension || 60)); return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) })() : '—', color: '#7C3AED' },
              ].map((k, i) => (
                <div key={i} style={{ flex: '1 0 auto', padding: '8px 14px', borderLeft: i > 0 ? '1px solid #E5E7EB' : 'none', borderRight: 'none' }}>
                  <div style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', marginBottom: '2px', fontWeight: '600' }}>{k.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: k.color, whiteSpace: 'nowrap' }}>{k.value}</div>
                </div>
              ))}
            </div>
{/* Contenido de la pestaña actual */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#F4F6FB', fontSize: '13px', minWidth: 0 }}>

        {/* ══ TAB 0: DATOS GENERALES — Slide 2 ══════════════════════ */}
        {tab === 0 && (() => {
          const sem = datos.semanas_totales - datos.semanas_descontadas
          const fechaTramite = datos.fecha_nacimiento ? (() => {
            const d = new Date(datos.fecha_nacimiento)
            d.setFullYear(d.getFullYear() + (datos.edad_min_pension || 60))
            return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
          })() : 'Fecha automática'
          const totalSemCot = escenarios.find(e => e.recomendado)?.semanas_finales?.toFixed(0) ?? sem.toFixed(0)
          const lbl = (text: string) => (
            <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#374151', marginBottom: '3px', textDecoration: 'underline', textDecorationColor: '#94a3b8' }}>{text}</div>
          )
          const field = (val: string | number, readOnly = false) => (
            <div style={{ border: '1px solid #9ca3af', padding: '5px 8px', background: readOnly ? '#F5F5F5' : 'white', fontSize: '12px', color: '#374151', minHeight: '28px', display: 'flex', alignItems: 'center' }}>{val}</div>
          )
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Ficha técnica de retiro */}
              <div style={DS.card}>
                <p style={DS.secTitle}>Ficha técnica de retiro:</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 20px' }}>
                  <div>
                    {lbl('Fecha de cálculo del proyecto:')}
                    <input type="date" value={datos.fecha_calculo} onChange={e => setDatos(p => ({ ...p, fecha_calculo: e.target.value }))} style={{ width: '100%', border: '1px solid #9ca3af', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: 'white' }} />
                  </div>
                  <div>
                    {lbl('¿Seguirás cotizando ante el IMSS?')}
                    <select value={datos.sigue_cotizando ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, sigue_cotizando: e.target.value === 'si' }))} style={{ width: '100%', border: '1px solid #9ca3af', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' as const }}>
                      <option value="si">Combo Box, Sí / No — Sí</option><option value="no">Combo Box, Sí / No — No</option>
                    </select>
                  </div>
                  <div>
                    {lbl('¿A que edad te quieres pensionar?')}
                    <select value={datos.edad_min_pension || 60} onChange={e => { const v = parseInt(e.target.value); setDatos(p => ({ ...p, edad_min_pension: v })); setEdadRetiro(v) }} style={{ width: '100%', border: '1px solid #9ca3af', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' as const }}>
                      {[60,61,62,63,64,65].map(a => <option key={a} value={a}>{a} años ({75+(a-60)*5}%)</option>)}
                    </select>
                  </div>
                  <div>
                    {lbl('Esposa (o) ó concubina (o)')}
                    <select value={datos.tiene_conyuge ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, tiene_conyuge: e.target.value === 'si' }))} style={{ width: '100%', border: '1px solid #9ca3af', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' as const }}>
                      <option value="no">Combo Box, Sí / No — No</option><option value="si">Combo Box, Sí / No — Sí</option>
                    </select>
                  </div>
                  <div>
                    {lbl('# de Hijos < de 16 años:')}
                    <select value={datos.num_hijos} onChange={e => setDatos(p => ({ ...p, num_hijos: parseInt(e.target.value) }))} style={{ width: '100%', border: '1px solid #9ca3af', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' as const }}>
                      {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n} — Número</option>)}
                    </select>
                  </div>
                  <div>
                    {lbl('Semanas restantes por cotizar:')}
                    {field(Math.max(0, 500 - sem).toFixed(0) + ' semanas', true)}
                  </div>
                  <div>
                    {lbl('# de padres econ.')}
                    <select value={datos.num_padres} onChange={e => setDatos(p => ({ ...p, num_padres: parseInt(e.target.value) }))} style={{ width: '100%', border: '1px solid #9ca3af', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' as const }}>
                      {[0,1,2].map(n => <option key={n} value={n}>{n} — Número</option>)}
                    </select>
                  </div>
                  <div>
                    {lbl('Fecha del trámite de pensión:')}
                    {field(fechaTramite + ' — Fecha automática', true)}
                  </div>
                  <div>
                    {lbl('Total de semanas cotización:')}
                    {field(totalSemCot + ' — Número calculado', true)}
                  </div>
                </div>
              </div>

              {/* Cálculo SDI 250 semanas */}
              <div style={DS.card}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#374151', margin: '0 0 6px' }}>Cálculo del Salario Promedio de las Últimas 250 Semanas Cotizadas:</p>
                <p style={{ fontSize: '11.5px', color: '#374151', margin: '0 0 12px', lineHeight: 1.6 }}>
                  ¿Por qué calculamos esto?. La Ley del IMSS 1973 (Art. 167) establece que la pensión se calcula sobre el promedio del Salario Diario Integrado (SDI) de las últimas 250 semanas cotizadas (aproximadamente 5 años), no sobre el salario actual. Este promedio es la base real de tu pensión; si usaras el SDI actual, el cálculo podría estar sobreestimado o subestimado, dándote una falsa expectativa.<br/>
                  <strong>Resumen del cálculo:</strong>
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '10px' }}>
                  <thead>
                    <tr>
                      {['PERÍODO','SEMANAS','SDI DIARIO','SDI MENSUAL','PESO'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 10px', background: '#F0F0F0', textAlign: i === 0 ? 'left' : 'right', fontWeight: '700', fontSize: '12.5px', color: '#374151', border: '1px solid #d1d5db' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periodos.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '6px 10px', border: '1px solid #d1d5db' }}>{p.fecha_inicio?.slice(0,7)} → {p.fecha_fin?.slice(0,7)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>{p.semanas}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#D95B00', fontWeight: '700', border: '1px solid #d1d5db' }}>{fmtMXN2(p.sdi)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>{fmtMXN(p.sdi * 30.4167)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#6B7280', border: '1px solid #d1d5db' }}>{p.peso.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: '700', background: '#FFFBE6' }}>
                      <td style={{ padding: '7px 10px', border: '1px solid #d1d5db' }}>Promedio ponderado</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>{periodos.reduce((s, p) => s + p.semanas, 0)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#D95B00', fontSize: '14px', border: '1px solid #d1d5db' }}>{fmtMXN2(sdiPromedio)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>{fmtMXN(sdiPromedio * 30.4167)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>100%</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <button onClick={() => setShowDetalle250(true)} style={{ fontSize: '12.5px', color: '#1D4ED8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: '2px 0', fontFamily: 'inherit' }}>
                    📊 Ver desglose completo de las 250 semanas
                  </button>
                  <button onClick={() => setShowHistorialCompleto(true)} style={{ fontSize: '12.5px', color: '#047857', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: '2px 0', fontFamily: 'inherit' }}>
                    🗂️ Ver historial laboral completo ({periodosCompletos.length} períodos)
                  </button>
                </div>
                {/* 3 KPIs bottom */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', background: '#F9FAFB', border: '1px solid #d1d5db', padding: '10px' }}>
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: '4px' }}>PERÍODO CUBIERTO</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>
                      {periodos.length > 0 ? `${periodos[0]?.fecha_inicio?.slice(0,7)} → ${periodos[periodos.length-1]?.fecha_fin?.slice(0,7)}` : '—'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#9CA3AF' }}>250 semanas hacia atrás</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: '4px' }}>SDI PROMEDIO 250 SEM.</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#D95B00' }}>{fmtMXN2(sdiPromedio)}</div>
                    <div style={{ fontSize: '11.5px', color: '#9CA3AF' }}>Base oficial de pensión</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: '4px' }}>SDI MENSUAL EQUIVALENTE</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#1B3A6B' }}>{fmtMXN(sdiPromedio * 30.4167)}</div>
                    <div style={{ fontSize: '11.5px', color: '#9CA3AF' }}>× 30.4 días</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Análisis de IA — visible en tab 0 */}
        {tab === 0 && (
          <div style={{ background: 'white', border: '1px solid #d1d5db', padding: '14px', margin: '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#374151', margin: '0 0 2px' }}>🤖 Análisis de Sofía IA</p>
                <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>Diagnóstico inteligente basado en los datos del cliente</p>
              </div>
              <button onClick={generarAnalisisIA} disabled={!clienteId || sdiPromedio <= 0}
                style={{ padding: '7px 14px', border: '1px solid #7c3aed', fontSize: '12px', fontWeight: '600', color: 'white', background: '#7c3aed', fontFamily: 'inherit', cursor: 'pointer', opacity: clienteId && sdiPromedio > 0 ? 1 : 0.5 }}>
                ✨ Generar análisis
              </button>
            </div>
            {analisis.length === 0 && (
              <div style={{ padding: '16px', color: '#9CA3AF', background: '#F9FAFB', border: '1px dashed #d1d5db', fontSize: '12px', textAlign: 'center' }}>
                Carga la constancia y haz clic en Generar análisis
              </div>
            )}
            {analisis.length > 0 && analisis.map((sec, i) => (
              <div key={i} style={{ background: '#F5F3FF', border: '1px solid #ddd6fe', padding: '12px 14px', marginBottom: '8px' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#5b21b6', margin: '0 0 6px' }}>{sec.titulo}</p>
                <p style={{ fontSize: '12px', color: '#374151', margin: 0, lineHeight: 1.7 }}>{sec.contenido}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 1 && (() => {
          const sem = datos.semanas_totales - datos.semanas_descontadas
          if (sdiPromedio <= 0) return (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
              <p>Carga la constancia IMSS para ver la pensión actual</p>
            </div>
          )
          const res = calcPensionLey73(sem, sdiPromedio, datos.edad_min_pension || 60, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, undefined, datos.tiene_ayuda_asistencial)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={DS.card}>
                <p style={DS.secTitle}>Cuantías anuales de Pensión:</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: '1px solid #d1d5db' }}>
                  {[
                    ['Cuantía Básica de Pensión', fmtMXN2(res.cuantiaBasicaAnual), 'Total de Pensión por Vejez', fmtMXN2(res.pensionAnual / (res.factorEdad || 0.75))],
                    ['Incrementos Anuales', fmtMXN2(res.incrementosAnual), 'Porcentaje por Edad', `${((res.factorEdad || 0.75) * 100).toFixed(0)}%`],
                    ['Asignaciones Familiares', fmtMXN2(res.asignacionesAnual), 'Total de Pensión', fmtMXN2(res.pensionAnual)],
                    ['Ayuda Asistencial', fmtMXN2(res.ayudaAsistencialAnual), '¿Aplica Pensión Mínima?', res.pmg_aplica ? 'SÍ' : 'NO'],
                    ['Pensión Mínima del Año', fmtMXN2(sys.PMG_L73 * 12), '', ''],
                  ].map(([l1, v1, l2, v2], i) => (
                    <Fragment key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #d1d5db', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                        <span style={{ fontSize: '11.5px', color: '#374151' }}>{l1}</span>
                        <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151' }}>{v1}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                        <span style={{ fontSize: '11.5px', color: '#374151' }}>{l2}</span>
                        <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151' }}>{v2}</span>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
              {/* 3 bloques KPI azul marino */}
              {[
                { label: 'Importe de Pensión Anual', sub: 'Monto Anual de Pensión calculado con base a lo estipulado en la Ley de 1973 de Seguro Social.', value: fmtMXN2(res.pensionAnual) },
                { label: 'Importe de Pensión Mensual', sub: 'Monto Mensual de Pensión calculado con base a lo estipulado en la Ley de 1973 de Seguro Social.', value: fmtMXN2(res.pensionMensual) },
                { label: 'Aguinaldo', sub: 'El pago del aguinaldo se hace una vez al año y es equivalente a una mensualidad de la pensión del beneficiario, sin contar el importe por asignaciones familiares ni ayudas asistenciales.', value: fmtMXN2(res.aguinaldoAnual) },
              ].map((k, i) => (
                <div key={i} style={{ background: '#1B3A6B', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: 'white', margin: '0 0 4px' }}>{k.label}</p>
                    <p style={{ fontSize: '12px', color: '#93C5FD', margin: 0, lineHeight: 1.5 }}>{k.sub}</p>
                  </div>
                  <span style={{ fontSize: '26px', fontWeight: '900', color: 'white', whiteSpace: 'nowrap' }}>{k.value}</span>
                </div>
              ))}
              {/* INPC */}
              <div style={DS.card}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#374151', margin: '0 0 8px' }}>Pensión Actualizada en el mismo año conforme al INPC</p>
                <div style={{ background: '#1B3A6B', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: 'white', margin: 0 }}>Importe de Pensión Mensual Actualizada por INPC</p>
                  <span style={{ fontSize: '20px', fontWeight: '900', color: 'white', background: '#15803D', padding: '4px 14px' }}>NO APLICA</span>
                </div>
                <p style={{ fontSize: '12.5px', color: '#6B7280', margin: 0, lineHeight: 1.6 }}>
                  El importe de una pensión otorgada se actualiza cada año durante el mes de febrero, conforme al Índice Nacional de Precios al Consumidor (INPC). Si la fecha de baja utilizada para el cálculo de la pensión corresponde al mes de enero, el pensionado recibirá la actualización por inflación dentro del mismo año, reflejándose automáticamente en su pago mensual a partir de febrero.
                </p>
              </div>
            </div>
          )
        })()}

        {tab === 2 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          const lbl = (text: string) => <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#374151', padding: '6px 10px', background: '#F0F0F0', border: '1px solid #d1d5db', borderBottom: 'none' }}>{text}</div>
          const val = (text: string | number, orange = false) => <div style={{ padding: '6px 10px', border: '1px solid #d1d5db', fontSize: '12px', fontWeight: orange ? '800' : '600', color: orange ? '#D95B00' : '#374151', background: 'white' }}>{text}</div>
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={DS.card}>
                <p style={DS.secTitle}>
                  Calculadora de Nuevo Salario Promedio Diario de las Últimas 250 semanas cotizadas con mod 40:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Inputs */}
                  <div>
                    <div style={{ background: '#1B3A6B', color: 'white', padding: '8px 12px', fontSize: '11.5px', fontWeight: '700', textAlign: 'center' as const }}>
                      INGRESAR DATOS DE LA COTIZACIÓN EN LA MODALIDAD 40
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #d1d5db', borderTop: 'none' }}>
                      <thead>
                        <tr style={{ background: '#F0F0F0' }}>
                          <th style={{ padding: '5px 10px', fontSize: '11.5px', fontWeight: '700', color: '#374151', textAlign: 'left', border: '1px solid #d1d5db', width: '55%' }}></th>
                          <th style={{ padding: '5px 10px', fontSize: '11.5px', fontWeight: '700', color: '#374151', textAlign: 'center', border: '1px solid #d1d5db' }}>AÑOS</th>
                          <th style={{ padding: '5px 10px', fontSize: '11.5px', fontWeight: '700', color: '#374151', textAlign: 'center', border: '1px solid #d1d5db' }}>MESES</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '8px 10px', fontSize: '11.5px', fontWeight: '600', border: '1px solid #d1d5db' }}>¿A QUÉ EDAD DESEAS INGRESAR A MODALIDAD 40?</td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #d1d5db' }}>
                            <input type="number" readOnly value={Math.floor(datos.edad_actual || 58)} style={{ width: '55px', border: '1px solid #9CA3AF', padding: '4px', textAlign: 'center', fontSize: '14px', fontWeight: '800', color: '#1B3A6B' }} />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #d1d5db' }}>
                            <input type="number" readOnly value={Math.round(((datos.edad_actual || 58) % 1) * 12)} style={{ width: '55px', border: '1px solid #9CA3AF', padding: '4px', textAlign: 'center', fontSize: '14px', fontWeight: '800', color: '#1B3A6B' }} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '8px 10px', fontSize: '11.5px', fontWeight: '600', border: '1px solid #d1d5db' }}>TIEMPO A COTIZAR EN MODALIDAD 40</td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #d1d5db' }}>
                            <input type="number" min={1} max={10} value={Math.floor(mod40Meses / 12)} onChange={e => setMod40Meses(parseInt(e.target.value) * 12 + (mod40Meses % 12))} style={{ width: '55px', border: '1px solid #D95B00', padding: '4px', textAlign: 'center', fontSize: '14px', fontWeight: '800', color: '#D95B00' }} />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #d1d5db' }}>
                            <input type="number" min={0} max={11} value={mod40Meses % 12} onChange={e => setMod40Meses(Math.floor(mod40Meses / 12) * 12 + parseInt(e.target.value))} style={{ width: '55px', border: '1px solid #D95B00', padding: '4px', textAlign: 'center', fontSize: '14px', fontWeight: '800', color: '#D95B00' }} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '8px 10px', fontSize: '11.5px', fontWeight: '600', border: '1px solid #d1d5db' }}>SALARIO DIARIO REGISTRADO EN UMA'S</td>
                          <td colSpan={2} style={{ padding: '8px', textAlign: 'center', border: '1px solid #d1d5db' }}>
                            <input type="number" min={1} max={100} step={0.5} value={mod40Umas} onChange={e => setMod40Umas(parseFloat(e.target.value) || 25)} style={{ width: '70px', border: '1px solid #D95B00', padding: '4px', textAlign: 'center', fontSize: '14px', fontWeight: '800', color: '#D95B00' }} />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ border: '1px solid #FCD34D', background: '#FFFBEB', padding: '8px 10px', borderTop: 'none', fontSize: '12.5px', color: '#92400E' }}>
                      <strong>MODALIDAD 40 TOPADA:</strong> 250 SEMANAS = 4 AÑOS + 9.6 MESES<br/>
                      Nota: el IMSS redondea tu edad al siguiente año cumplido después de 6 meses + 1 día.
                    </div>
                  </div>
                  {/* Salida */}
                  <div>
                    <div style={{ background: '#374151', color: 'white', padding: '8px 12px', fontSize: '11.5px', fontWeight: '700', textAlign: 'center' as const }}>SALIDA DE DATOS</div>
                    {escRec && escRec.mod40_meses > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #d1d5db', borderTop: 'none' }}>
                        <tbody>
                          {[
                            ['FECHA DE INGRESO A MODALIDAD 40 (APROX.)', escRec.fecha_ingreso_mod40 || '—', false],
                            ['FECHA DE BAJA DE MODALIDAD 40 (APROX.)', escRec.fecha_baja_mod40 || '—', false],
                            ['EDAD AL CONCLUIR MODALIDAD 40 (PARA EL IMSS)', escRec.edad_retiro?.toFixed(3) || '—', false],
                            ['VALOR DE LA UMA DIARIA', fmtMXN2(sys.UMA_DIARIA), false],
                            ['EQUIVALENCIA DEL SALARIO REGISTRADO (MXN)', fmtMXN2(escRec.sdi_mod40 ?? (mod40Umas * sys.UMA_DIARIA)), false],
                            ['ANTERIOR SALARIO PROMEDIO DE 250 SEMANAS', fmtMXN2(sdiPromedio), false],
                            ['NUEVO SALARIO PROMEDIO DE 250 SEMANAS', fmtMXN2(escRec.nuevo_sdi_250), true],
                          ].map(([label, value, big], i) => (
                            <tr key={i} style={{ background: big ? '#1B3A6B' : i % 2 === 0 ? 'white' : '#F9FAFB' }}>
                              <td style={{ padding: big ? '10px 12px' : '6px 10px', fontSize: big ? '11.5px' : '11px', fontWeight: '600', color: big ? 'white' : '#374151', border: '1px solid #d1d5db', width: '60%' }}>{label as string}</td>
                              <td style={{ padding: big ? '10px 12px' : '6px 10px', textAlign: 'right', fontSize: big ? '20px' : '12px', fontWeight: '800', color: big ? 'white' : '#374151', border: '1px solid #d1d5db' }}>{value as string}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', border: '1px solid #d1d5db', borderTop: 'none' }}>Ingresa los datos de Mod 40</div>
                    )}
                  </div>
                </div>
                {/* Mini 250 sem con Mod 40 */}
                {escRec && escRec.mod40_meses > 0 && (
                  <div style={{ marginTop: '14px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr>
                          {['PERÍODO','SEMANAS','SDI DIARIO','SDI MENSUAL','PESO'].map((h,i) => (
                            <th key={i} style={{ padding: '6px 10px', background: '#F0F0F0', textAlign: i === 0 ? 'left' : 'right', fontWeight: '700', fontSize: '12.5px', color: '#374151', border: '1px solid #d1d5db' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {periodos.map((p, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F9FAFB' }}>
                            <td style={{ padding: '5px 10px', border: '1px solid #d1d5db' }}>{p.fecha_inicio?.slice(0,7)} → {p.fecha_fin?.slice(0,7)}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>{p.semanas}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '700', color: '#D95B00', border: '1px solid #d1d5db' }}>{fmtMXN2(p.sdi)}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>{fmtMXN(p.sdi * 30.4167)}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'right', color: '#6B7280', border: '1px solid #d1d5db' }}>{p.peso.toFixed(1)}%</td>
                          </tr>
                        ))}
                        <tr style={{ fontWeight: '700', background: '#FFFBE6' }}>
                          <td style={{ padding: '6px 10px', border: '1px solid #d1d5db' }}>Promedio ponderado</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>250</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#D95B00', fontSize: '14px', border: '1px solid #d1d5db' }}>{fmtMXN2(escRec.nuevo_sdi_250)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>{fmtMXN(escRec.nuevo_sdi_250 * 30.4167)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', border: '1px solid #d1d5db' }}>100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {tab === 3 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF' }}>
              <p>Configura los datos de Modalidad 40 en la pestaña anterior</p>
            </div>
          )
          const anioInicio = parseInt(escRec.fecha_ingreso_mod40?.slice(0,4) || '2027')
          const anioFin = parseInt(escRec.fecha_baja_mod40?.slice(0,4) || '2030')
          const mesesFin = parseInt(escRec.fecha_baja_mod40?.slice(5,7) || '07')
          const rows = []
          for (let a = 2019; a <= 2031; a++) {
            const tasaPct = a >= anioInicio && a <= anioFin ? getMod40Pct(a) : 0
            let diasPagados = 0
            if (a > anioInicio && a < anioFin) diasPagados = a % 4 === 0 ? 366 : 365
            else if (a === anioInicio) diasPagados = Math.round((anioFin - anioInicio) * 365 * 0.3)
            else if (a === anioFin) diasPagados = Math.round(mesesFin / 12 * (a % 4 === 0 ? 366 : 365))
            const sdi = tasaPct > 0 ? (escRec.sdi_mod40 ?? 0) : 0
            const cuotaMensual = sdi > 0 ? sdi * (tasaPct / 100) * (a % 4 === 0 ? 366 : 365) / 12 : 0
            const cuotaAnual = cuotaMensual > 0 ? cuotaMensual * (diasPagados / (a % 4 === 0 ? 366 : 365) * 12) : 0
            rows.push({ a, tasaPct, sdi, diasPagados, cuotaMensual, cuotaAnual })
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={DS.card}>
                <p style={DS.secTitle}>Costo de la Modalidad 40 (2019 a +2030):</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr>
                      <th colSpan={6} style={{ padding: '8px 12px', background: '#1B3A6B', color: 'white', textAlign: 'center', fontWeight: '700', fontSize: '12px', border: '1px solid #d1d5db' }}>
                        COSTO DE LA MODALIDAD 40 (2019 A +2030)
                      </th>
                    </tr>
                    <tr>
                      {['CONCEPTO','SALARIO REGISTRADO','COSTO SOBRE EL SALARIO REGISTRADO (%)','DÍAS PAGADOS','CUOTA MENSUAL PROMEDIO','CUOTA ANUAL'].map((h,i) => (
                        <th key={i} style={{ padding: '7px 10px', background: '#F0F0F0', textAlign: i === 0 ? 'left' : 'right', fontWeight: '700', fontSize: '11.5px', color: '#374151', border: '1px solid #d1d5db' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ background: r.tasaPct > 0 ? (i % 2 === 0 ? 'white' : '#F9FAFB') : '#F5F5F5' }}>
                        <td style={{ padding: '6px 10px', color: '#374151', fontWeight: r.tasaPct > 0 ? '600' : '400', fontSize: '12.5px', border: '1px solid #d1d5db' }}>COSTO MODALIDAD 40 {r.a <= 2021 ? '2019-2021' : r.a === 2031 ? '2031 EN ADELANTE' : r.a}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151', border: '1px solid #d1d5db' }}>{r.sdi > 0 ? fmtMXN2(r.sdi) : '$0.00'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151', border: '1px solid #d1d5db' }}>{r.tasaPct.toFixed(3)}%</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151', border: '1px solid #d1d5db' }}>{r.diasPagados}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151', border: '1px solid #d1d5db' }}>{r.cuotaMensual > 0 ? fmtMXN2(r.cuotaMensual) : '$0.00'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151', border: '1px solid #d1d5db' }}>{r.cuotaAnual > 0 ? fmtMXN2(r.cuotaAnual) : '$0.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Totales — igual al mockup */}
                {[
                  { label: 'INVERSIÓN TOTAL EN MODALIDAD 40', value: fmtMXN(escRec.costo_total) },
                  { label: 'MONTO APROXIMADO DE RECUPERACIÓN POR "AFORE"', value: fmtMXN(escRec.recuperacion_afore) },
                  { label: 'INVERSIÓN EN MODALIDAD 40 - RECUPERACION DE LA AFORE', value: fmtMXN(escRec.inversion_neta) },
                ].map((k, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid #d1d5db', borderTop: i === 0 ? '2px solid #1B3A6B' : '1px solid #d1d5db', background: 'white', marginTop: i === 0 ? '8px' : 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151', textTransform: 'uppercase' }}>{k.label}</span>
                    <span style={{ fontSize: '20px', fontWeight: '900', color: '#1B3A6B' }}>{k.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {tab === 4 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          const sem = datos.semanas_totales - datos.semanas_descontadas
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF' }}>
              <p>Configura los datos de Modalidad 40 primero</p>
            </div>
          )
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={DS.card}>
                <p style={DS.secTitle}>Datos generales mod 40:</p>
                <div style={{ background: '#1B3A6B', padding: '10px 16px', textAlign: 'center' as const, marginBottom: '12px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '800', color: 'white', margin: '0 0 2px', letterSpacing: '0.5px' }}>1. INFORMACIÓN GENERAL DEL (LA) PENSIONADO (A)</p>
                  <p style={{ fontSize: '12.5px', fontWeight: '700', color: '#93C5FD', margin: 0, letterSpacing: '1px' }}>PROYECTO DE PLAN DE RETIRO</p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '12px' }}>
                  <tbody>
                    {[
                      ['NOMBRE', datos.nombre_trabajador || datos.nombre || '—'],
                      ['EDAD DE RETIRO (EDAD DE INICIO DE MOD 40 + AÑOS EN MOD 40)', escRec.edad_retiro?.toFixed(3) || '—'],
                      ['NUEVA FECHA CALCULADA PARA EL TRÁMITE DE PENSIÓN (DD/MM/AAAA)*', escRec.fecha_baja_mod40 || '—'],
                      ['SEMANAS COTIZADAS ANTES DE MODALIDAD 40', Math.round(sem).toLocaleString()],
                      ['SEMANAS COTIZADAS EN MODALIDAD 40', Math.round(escRec.semanas_mod40 || 0).toLocaleString()],
                      ['¿ESPOSA (O) O CONCUMBINO (A)?', datos.tiene_conyuge ? 'SÍ' : 'NO'],
                      ['HIJOS MENORES DE 16 AÑOS O ESTUDIANTES HASTA LOS 25 AÑOS', datos.num_hijos.toString()],
                      ['PADRES QUE DEPENDAN ECONÓMICAMENTE DE USTED', datos.num_padres.toString()],
                    ].map(([label, value], i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F9FAFB' }}>
                        <td style={{ padding: '8px 12px', fontSize: '12.5px', color: '#374151', border: '1px solid #d1d5db', width: '70%' }}>{label}</td>
                        <td style={{ padding: '8px 12px', fontWeight: '700', color: '#1B3A6B', textAlign: 'right', border: '1px solid #d1d5db' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {[
                  ['EDAD DE RETIRO EN AÑOS ENTEROS (PARA EL IMSS)', Math.floor(escRec.edad_retiro || 62).toString()],
                  ['SALARIO PROMEDIO DIARIO DE LAS ÚLTIMAS 250 SEMANAS COTIZADAS', fmtMXN2(escRec.nuevo_sdi_250)],
                  ['TOTAL DE SEMANAS COTIZADAS PARA EL CÁLCULO DE PENSIÓN (3)', Math.round(escRec.semanas_finales || 0).toLocaleString()],
                ].map(([label, value], i) => (
                  <div key={i} style={DS.kpiBlock}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'white', maxWidth: '65%', lineHeight: 1.4 }}>{label}</span>
                    <span style={{ fontSize: '22px', fontWeight: '900', color: 'white' }}>{value}</span>
                  </div>
                ))}
                <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '8px 0 0', lineHeight: 1.6 }}>
                  (1) Semanas no cotizadas en períodos de desempleo que se podrían recuperar al pagarlas al IMSS de manera retroactiva (es opcional hacerlo).<br/>
                  (2) Semanas que, considerando la fecha de cálculo del proyecto y la fecha de retiro, se pueden calcular.<br/>
                  (3) Total de semanas utilizadas para el cálculo de pensión: Semanas cotizadas actuales + Semanas por cotizar.<br/>
                  * (DD/MM/AAAA) indica que la fecha debe introducirse en formato DIA/MES/AÑO
                </p>
              </div>
            </div>
          )
        })()}

        {tab === 5 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF' }}>
              <p>Configura los datos de Modalidad 40 primero</p>
            </div>
          )
          const pensionVejez100 = escRec.pension_mensual / ((escRec.edad_retiro || 62) < 65 ? (75 + (Math.floor(escRec.edad_retiro || 62) - 60) * 5) / 100 : 1)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={DS.card}>
                <p style={DS.secTitle}>Pensión Mod 40:</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                  <div style={{ ...DS.kpiBlock, justifyContent: 'center', flexDirection: 'column' as const }}>
                    <p style={{ fontSize: '12.5px', fontWeight: '700', color: '#93C5FD', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>IMPORTE DE PENSIÓN ANUAL</p>
                    <p style={{ fontSize: '28px', fontWeight: '900', color: 'white', margin: 0 }}>{fmtMXN2(escRec.pension_mensual * 12)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '12.5px', fontWeight: '700', color: '#374151', margin: '0 0 8px', textTransform: 'uppercase' }}>5. Calculadora de Pensión</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <tbody>
                        {[
                          ['TOTAL DE PENSIÓN ANUAL POR VEJEZ (100%)', fmtMXN2(pensionVejez100 * 12)],
                          ['EDAD DE RETIRO EN AÑOS ENTEROS (PARA EL IMSS)', Math.floor(escRec.edad_retiro || 62).toString()],
                          ['PORCENTAJE ASIGNADO POR EDAD DEL TRABAJADOR', `${((escRec.edad_retiro || 62) >= 65 ? 100 : 75 + (Math.floor(escRec.edad_retiro || 62) - 60) * 5).toFixed(2)}%`],
                          ['PENSIÓN ANUAL MÍNIMA GARANTIZADA', fmtMXN2(sys.PMG_L73 * 12)],
                          ['¿APLICA LA PENSIÓN MÍNIMA GARANTIZADA? (1)', escRec.pmg_aplica ? 'SÍ' : 'NO'],
                        ].map(([l, v], i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '5px 8px', color: '#6B7280', lineHeight: 1.3, fontSize: '12px' }}>{l}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: '700', color: '#1B3A6B', whiteSpace: 'nowrap' }}>{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {/* KPI grande mensual */}
                <div style={DS.kpiBlock}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: 'white', margin: 0 }}>IMPORTE DE PENSIÓN POR MES DE 30 DÍAS</p>
                    <p style={{ fontSize: '11.5px', color: '#93C5FD', margin: '2px 0 0' }}>Monto de pensión calculado con base a lo estipulado en la Ley de 1973 de Seguro Social.</p>
                  </div>
                  <span style={{ fontSize: '26px', fontWeight: '900', color: 'white' }}>{fmtMXN2(escRec.pension_mensual)}</span>
                </div>
                {/* Tabla factor edad */}
                <div style={{ marginTop: '14px' }}>
                  <p style={{ fontSize: '12.5px', fontWeight: '700', color: '#374151', textAlign: 'center' as const, margin: '0 0 6px', textTransform: 'uppercase' }}>CALCULADORA DE PENSIÓN POR CESANTÍA EN EDAD AVANZADA Y VEJEZ</p>
                  <p style={{ fontSize: '12px', color: '#6B7280', textAlign: 'center' as const, margin: '0 0 8px' }}>Tabla de porcentaje de cuantía que corresponde respecto a la cuantía por vejez</p>
                  <table style={{ width: '60%', margin: '0 auto', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr style={{ background: '#F0F0F0' }}>
                        <th style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid #d1d5db', fontWeight: '700', fontSize: '12.5px' }}>Tipo de Pensión</th>
                        <th style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid #d1d5db', fontWeight: '700', fontSize: '12.5px' }}>Edad</th>
                        <th style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid #d1d5db', fontWeight: '700', fontSize: '12.5px' }}>Porcentaje de Pensión por Vejez</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td rowSpan={2} style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid #d1d5db' }}>Por vejez</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid #d1d5db' }}>65</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: '700', border: '1px solid #d1d5db' }}>100%</td>
                      </tr>
                      <tr><td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid #d1d5db' }}>64</td><td style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid #d1d5db' }}>95%</td></tr>
                      {[63,62,61,60].map((edad, i) => {
                        const esActual = Math.floor(escRec.edad_retiro || 62) === edad
                        return (
                          <tr key={edad} style={{ background: esActual ? '#EEF2F8' : i % 2 === 0 ? '#F9FAFB' : 'white', borderBottom: '1px solid #e5e7eb' }}>
                            {i === 0 && <td rowSpan={4} style={{ padding: '6px 12px', textAlign: 'center', border: '1px solid #d1d5db' }}>Por cesantía en edad avanzada</td>}
                            <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: esActual ? '800' : 'normal', color: esActual ? '#1B3A6B' : '#374151', border: '1px solid #d1d5db' }}>{edad}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: esActual ? '800' : 'normal', color: esActual ? '#1B3A6B' : '#374151', border: '1px solid #d1d5db' }}>{75 + (edad - 60) * 5}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        })()}

        {tab === 6 && (() => {
          const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!escRec || escRec.mod40_meses === 0) return (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF' }}>
              <p>Configura los datos de Modalidad 40 primero</p>
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
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#374151', margin: 0 }}>Inversión:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {/* Col 1: Mejora de pensión */}
                <div style={{ border: '1px solid #d1d5db', background: 'white' }}>
                  <div style={{ background: '#1B3A6B', color: 'white', padding: '6px 12px', fontSize: '12.5px', fontWeight: '700', textAlign: 'center' as const }}>MEJORA DE PENSIÓN</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ background: '#F0F0F0' }}>
                        <th style={{ padding: '5px 8px', border: '1px solid #d1d5db', fontWeight: '700', fontSize: '11.5px' }}></th>
                        <th style={{ padding: '5px 8px', border: '1px solid #d1d5db', fontWeight: '700', fontSize: '11.5px', textAlign: 'center' as const }}>SIN MODALIDAD 40</th>
                        <th style={{ padding: '5px 8px', border: '1px solid #d1d5db', fontWeight: '700', fontSize: '11.5px', textAlign: 'center' as const }}>CON MODALIDAD 40</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '5px 8px', fontSize: '11.5px', color: '#6B7280', border: '1px solid #d1d5db' }}>EDAD DE RETIRO</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #d1d5db', fontWeight: '700' }}>{edadRetBase}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #d1d5db', fontWeight: '700', color: '#1B3A6B' }}>{Math.floor(escRec.edad_retiro || 62)}</td>
                      </tr>
                      <tr style={{ background: '#F9FAFB' }}>
                        <td style={{ padding: '5px 8px', fontSize: '11.5px', color: '#6B7280', border: '1px solid #d1d5db' }}>MONTO DE MEJORA DE PENSIÓN</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #d1d5db', color: '#9CA3AF' }}>—</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #d1d5db', fontWeight: '800', color: '#15803D', fontSize: '13px' }}>{fmtMXN(escRec.incremento_vs_base)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {/* Análisis de la inversión */}
                  <div style={{ padding: '8px 10px', borderTop: '2px solid #d1d5db' }}>
                    <p style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', margin: '0 0 6px', textTransform: 'uppercase' }}>ANÁLISIS DE LA INVERSIÓN</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280', maxWidth: '65%', lineHeight: 1.3 }}>PERÍODOS DE RECUPERACIÓN DE LA INVERSIÓN (MESES)</span>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: '#1B3A6B' }}>—</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', padding: '3px 0' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280' }}>SIN MODALIDAD 40</span>
                      <span style={{ fontSize: '12.5px', fontWeight: '700' }}>—</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span style={{ fontSize: '11.5px', color: '#6B7280' }}>CON MODALIDAD 40</span>
                      <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#1B3A6B' }}>{escRec.roi_meses.toFixed(2)}</span>
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', borderTop: '1px solid #d1d5db' }}>
                    <p style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', margin: '0 0 4px', textTransform: 'uppercase' }}>ANÁLISIS DE FLUJOS DE PENSIÓN RECIBIDOS</p>
                    {[
                      ['PENSIÓN MENSUAL POR MES DE 30 DÍAS', fmtMXN(escRec.pension_base), fmtMXN(escRec.pension_mensual)],
                      ['FLUJOS DE PENSIÓN COBRADOS HASTA LOS 80 AÑOS', fmtMXN(escRec.pension_base * Math.max(0, (80 - edadRetBase) * 12)), fmtMXN(escRec.pension_mensual * Math.max(0, (80 - Math.floor(escRec.edad_retiro || 62)) * 12))],
                    ].map(([l, v1, v2], i) => (
                      <Fragment key={i}>
                        <p style={{ fontSize: '12.5px', color: '#6B7280', margin: '4px 0 2px' }}>{l}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '3px' }}>
                          <span style={{ fontSize: '12px', color: '#374151' }}>{v1}</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803D' }}>{v2}</span>
                        </div>
                      </Fragment>
                    ))}
                    <div style={{ borderTop: '2px solid #d1d5db', marginTop: '6px', paddingTop: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', textTransform: 'uppercase' }}>GANANCIA TOTAL GRACIAS A MODALIDAD 40</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11.5px', color: '#6B7280' }}>(MXN)</span>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#15803D' }}>{fmtMXN(escRec.ganancia_a80)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11.5px', color: '#6B7280' }}>Tasa de Rendimiento Total</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#1B3A6B' }}>{escRec.tasa_rendimiento.toFixed(2)}%</span>
                      </div>
                    </div>
                    <div style={{ background: termRec.bg, border: `1px solid ${termRec.color}`, padding: '6px 10px', marginTop: '8px', textAlign: 'center' as const }}>
                      <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 2px', textTransform: 'uppercase' }}>NUESTRO TERMÓMETRO DE INVERSIÓN</p>
                      <p style={{ fontSize: '13px', fontWeight: '800', color: termRec.color, margin: 0 }}>{termRec.label}</p>
                    </div>
                  </div>
                </div>

                {/* Col 2: Financiamiento */}
                <div style={{ border: '1px solid #d1d5db', background: 'white' }}>
                  <div style={{ background: '#374151', color: 'white', padding: '6px 12px', fontSize: '12.5px', fontWeight: '700', textAlign: 'center' as const }}>FINANCIAMIENTO — PAGO RETROACTIVO</div>
                  <div style={{ padding: '8px 10px', borderBottom: '2px solid #1B3A6B' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#374151' }}>INVERSIÓN TOTAL</span>
                      <span style={{ fontSize: '16px', fontWeight: '900', color: '#1B3A6B' }}>{fmtMXN(escRec.costo_retroactivo)}</span>
                    </div>
                  </div>
                  <div style={{ padding: '6px 10px' }}>
                    <p style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', margin: '0 0 4px', textTransform: 'uppercase' }}>PARTICIPACIONES</p>
                    {[
                      ['BANCO', fmtMXN(escRec.aportacion_banco)],
                      ['CUENTA PROPIA O SEGUNDO FONDEADOR', fmtMXN(escRec.aportacion_segundo_fondeo)],
                    ].map(([l, v], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', padding: '3px 0', fontSize: '12.5px' }}>
                        <span style={{ color: '#374151' }}>{l}</span>
                        <span style={{ fontWeight: '700', color: '#374151' }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ background: '#F5F5F5', border: '1px solid #d1d5db', padding: '6px 8px', margin: '6px 0' }}>
                      <p style={{ fontSize: '12.5px', fontWeight: '700', color: '#374151', margin: '0 0 3px', textTransform: 'uppercase' }}>PORCENTAJES DE PARTICIPACIÓN</p>
                      {[
                        ['BANCO REGULADO', `${((escRec.aportacion_banco / escRec.costo_retroactivo) * 100).toFixed(2)}%`],
                        ['CUENTA PROPIA O SEGUNDO FONDEADOR', `${((escRec.aportacion_segundo_fondeo / escRec.costo_retroactivo) * 100).toFixed(2)}%`],
                      ].map(([l, v], i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid #e5e7eb', padding: '2px 0' }}>
                          <span style={{ color: '#374151' }}>{l}</span>
                          <span style={{ fontWeight: '700', color: '#1B3A6B' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', margin: '4px 0 3px', textTransform: 'uppercase' }}>COSTO DEL FINANCIAMIENTO (BANCO REGULADO)</p>
                    {[
                      ['MONTO DEL CRÉDITO', fmtMXN(escRec.aportacion_banco)],
                      ['DURACIÓN DEL TRÁMITE (MESES)', String(escRec.duracion_tramite_meses || 12)],
                      ['COSTO DE FINANCIAMIENTO DURANTE EL TRÁMITE', fmtMXN(escRec.costo_financiamiento_banco)],
                      ['MONTO MÁXIMO A PAGAR', fmtMXN(escRec.monto_maximo_pago)],
                    ].map(([l, v], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', padding: '3px 0', fontSize: '12px' }}>
                        <span style={{ color: '#6B7280', maxWidth: '60%', lineHeight: 1.3 }}>{l}</span>
                        <span style={{ fontWeight: '700', color: '#374151' }}>{v}</span>
                      </div>
                    ))}
                    <p style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', margin: '6px 0 3px', textTransform: 'uppercase' }}>¿CÓMO VOY A PAGAR EL FINANCIAMIENTO DEL BANCO?</p>
                    {[
                      ['MONTO DEL CRÉDITO', fmtMXN(escRec.aportacion_banco)],
                      ['PLAZO (MESES)', '60'],
                      ['DESCUENTO MENSUAL A LA PENSIÓN MEJORADA', fmtMXN(escRec.descuento_mensual)],
                    ].map(([l, v], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', padding: '3px 0', fontSize: '12px' }}>
                        <span style={{ color: '#6B7280' }}>{l}</span>
                        <span style={{ fontWeight: '700', color: '#374151' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Col 3: Análisis */}
                <div style={{ border: '1px solid #d1d5db', background: 'white', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ background: '#15803D', color: 'white', padding: '6px 12px', fontSize: '12.5px', fontWeight: '700', textAlign: 'center' as const }}>ANÁLISIS DE LA INVERSIÓN</div>
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid #d1d5db', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11.5px', color: '#6B7280', maxWidth: '70%', lineHeight: 1.3 }}>PERÍODOS DE RECUPERACIÓN DE LA INVERSIÓN (MESES)</span>
                    <span style={{ fontSize: '16px', fontWeight: '900', color: '#1B3A6B' }}>{escRec.roi_financiado.toFixed(2)}</span>
                  </div>
                  {/* Tabla año×año compacta */}
                  <div style={{ flex: 1, overflowY: 'auto', maxHeight: '200px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead style={{ position: 'sticky' as const, top: 0, background: '#F0F0F0' }}>
                        <tr>
                          {['Año\nCobr.','Edad','Esc.\nActual','Pen.\nMejorada','Desc.\nFin.','Pensión\nInmediata','Gan.\nAnual','Gan.\nAcum.'].map((h,i) => (
                            <th key={i} style={{ padding: '3px 4px', textAlign: 'right' as const, fontWeight: '700', fontSize: '8.5px', border: '1px solid #d1d5db', lineHeight: 1.2, whiteSpace: 'pre' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((f, i) => (
                          <tr key={i} style={{ background: f.edad === 80 ? '#F0FDF4' : i % 2 === 0 ? 'white' : '#F9FAFB' }}>
                            <td style={{ padding: '2px 4px', textAlign: 'right', color: '#9CA3AF', border: '1px solid #e5e7eb' }}>{f.anio}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right', fontWeight: f.edad === 80 ? '800' : '600', color: f.edad === 80 ? '#15803D' : '#374151', border: '1px solid #e5e7eb' }}>{f.edad}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right', color: '#9CA3AF', border: '1px solid #e5e7eb' }}>{fmtMXN(f.penSin)}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right', color: '#1B3A6B', border: '1px solid #e5e7eb' }}>{fmtMXN(f.penCon)}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right', color: f.desc < 0 ? '#B91C1C' : '#9CA3AF', border: '1px solid #e5e7eb' }}>{f.desc < 0 ? fmtMXN(f.desc) : '—'}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right', fontWeight: '600', color: '#15803D', border: '1px solid #e5e7eb' }}>{fmtMXN(f.penInm)}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right', color: f.ganAnio > 0 ? '#15803D' : '#B91C1C', border: '1px solid #e5e7eb' }}>{fmtMXN(f.ganAnio)}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right', fontWeight: '600', color: f.ganAcum > 0 ? '#15803D' : '#B91C1C', border: '1px solid #e5e7eb' }}>{fmtMXN(f.ganAcum)}</td>
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
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', padding: '4px 0' }}>
                        <span style={{ fontSize: '12.5px', color: '#6B7280', maxWidth: '55%', lineHeight: 1.3 }}>{k.l}</span>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: k.c }}>{k.v}</span>
                      </div>
                    ))}
                    <div style={{ background: termFin.bg, border: `1px solid ${termFin.color}`, padding: '6px 10px', marginTop: '8px', textAlign: 'center' as const }}>
                      <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 2px', textTransform: 'uppercase' }}>NUESTRO TERMÓMETRO DE INVERSIÓN</p>
                      <p style={{ fontSize: '13px', fontWeight: '800', color: termFin.color, margin: 0 }}>{termFin.label}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}



            </div>{/* fin overflowY */}

            {/* Tab bar en la parte inferior */}
            {/* Tab bar — radio buttons */}
            <div style={{ display: 'flex', borderTop: '1px solid #e2e8f0', background: '#F8FAFC', flexShrink: 0, padding: '6px 10px', overflowX: 'auto', alignItems: 'center', justifyContent: 'center' }}>
              {TABS.map((t, i) => (
                <button key={i} onClick={() => setTab(i)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'inherit' }}>
                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: `2px solid ${tab === i ? NARANJA : '#94a3b8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: tab === i ? NARANJA : 'white' }}>
                    {tab === i && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'white' }} />}
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: tab === i ? '700' : '500', color: tab === i ? NARANJA : '#64748b', whiteSpace: 'nowrap' }}>{t}</span>
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
