'use client'

import { useEffect, useState, useRef, Suspense, Fragment } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { pdf } from '@react-pdf/renderer'
import { DiagnosticoPDF } from '@/app/utils/DiagnosticoPDF'
import TabCliente from './components/TabCliente'
import TabEntregable from './components/TabEntregable'
import TabCuantias from './components/TabCuantias'
import TabImporte from './components/TabImporte'
import TabEscenarios from './components/TabEscenarios'
import TabSalarioMod40 from './components/TabSalarioMod40'
import TabCostoMod40 from './components/TabCostoMod40'
import TabFinanciamiento from './components/TabFinanciamiento'
import TabProyeccion from './components/TabProyeccion'

const AZUL = '#334E7B'
const AZUL_DARK = '#1E3A5F'
const MORADO = '#7C3AED'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
const ROJO = '#C0392B'
const FONDO = '#F4F6F9'
const BORDE = '#E2E8F0'
const TEXTO = '#1E293B'
const TEXTO2 = '#64748B'
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

// ── Design System ──────────────────────────────────────────────────
const DS = {
  txt: { xs: '10px', sm: '11px', base: '12px', md: '13px', lg: '14px', xl: '16px', h: '18px' },
  col: { azul: '#334E7B', verde: '#2E7D5A', naranja: '#E8724A', gris: '#64748B', borde: '#E2E8F0', bg: '#F4F6F9', bgAlt: '#FAFAFA' },
  sp: { xs: '4px', sm: '6px', md: '10px', lg: '16px', xl: '22px' },

  // ── Sistema de color semántico ────────────────────────────────────
  // Azul   = Dato IMSS (extraído de constancia, no editable)
  // Naranja = Captura manual del asesor (subjetivo, configurable)
  // Verde  = Decisión estratégica Mod. 40 (parámetros elegidos)
  // Morado = Resultado calculado automáticamente (read-only)
  semantic: {
    imss:     { bg: '#EEF2F8', border: '#334E7B', text: '#1E3A5F', badge: '#BFDBFE', label: 'Dato IMSS' },
    manual:   { bg: '#FFF3ED', border: '#E8724A', text: '#92400E', badge: '#FED7AA', label: 'Captura manual' },
    strategy: { bg: '#F0F7F4', border: '#2E7D5A', text: '#1A5C40', badge: '#86EFAC', label: 'Decisión estratégica' },
    result:   { bg: '#F5F3FF', border: '#7C3AED', text: '#4C1D95', badge: '#DDD6FE', label: 'Calculado' },
  },

  card: { background: 'white', borderRadius: '12px', padding: '18px 20px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as React.CSSProperties,
  cardHighlight: { background: 'white', borderRadius: '12px', padding: '18px 20px', marginBottom: '14px', boxShadow: '0 0 0 2px #334E7B, 0 4px 12px rgba(51,78,123,0.1)' } as React.CSSProperties,
  tHead: { background: '#334E7B', color: 'white', padding: '9px 12px', fontSize: '11px', fontWeight: '600' as const, textAlign: 'left' as const, whiteSpace: 'nowrap' as const },
  tHeadR: { background: '#334E7B', color: 'white', padding: '9px 12px', fontSize: '11px', fontWeight: '600' as const, textAlign: 'right' as const, whiteSpace: 'nowrap' as const },
  tCell: { padding: '9px 12px', fontSize: '12px', color: '#1E293B', borderBottom: '1px solid #F1F5F9' } as React.CSSProperties,
  tCellR: { padding: '9px 12px', fontSize: '12px', color: '#1E293B', borderBottom: '1px solid #F1F5F9', textAlign: 'right' as const } as React.CSSProperties,
  tCellBold: { padding: '9px 12px', fontSize: '13px', color: '#334E7B', fontWeight: '700' as const, borderBottom: '1px solid #F1F5F9', textAlign: 'right' as const } as React.CSSProperties,
  tRowAlt: (i: number) => ({ background: i % 2 === 0 ? 'white' : '#F8FAFC' }) as React.CSSProperties,
  secTitle: { fontSize: '11px', fontWeight: '600' as const, color: '#64748B', margin: '0 0 14px', textTransform: 'uppercase' as const, letterSpacing: '0.6px' } as React.CSSProperties,
  kpiBlock: { background: '#334E7B', borderRadius: '10px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } as React.CSSProperties,
  kpiGreen: { background: '#2E7D5A', borderRadius: '10px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } as React.CSSProperties,
  label: { fontSize: '11px', fontWeight: '500' as const, color: '#94A3B8', marginBottom: '5px', display: 'block' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  input: { width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: 'white', color: '#1E293B', outline: 'none', height: '44px' } as React.CSSProperties,
  inputReadonly: { width: '100%', border: '1px solid #F1F5F9', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', background: '#F8FAFC', color: '#64748B', fontFamily: 'inherit', boxSizing: 'border-box' as const, height: '44px' } as React.CSSProperties,
  // Inputs semánticos: fondo de color según tipo de dato
  inputImss:     { width: '100%', border: '1.5px solid #BFDBFE', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: '#EEF2F8', color: '#1E3A5F', fontWeight: '500' as const, height: '44px' } as React.CSSProperties,
  inputManual:   { width: '100%', border: '1.5px solid #FED7AA', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: '#FFF3ED', color: '#92400E', height: '44px' } as React.CSSProperties,
  inputStrategy: { width: '100%', border: '2px solid #2E7D5A', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: '#F0F7F4', color: '#1A5C40', fontWeight: '500' as const, height: '44px' } as React.CSSProperties,
  inputResult:   { width: '100%', border: '1px solid #DDD6FE', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', background: '#F5F3FF', color: '#4C1D95', fontWeight: '600' as const, height: '44px', boxSizing: 'border-box' as const } as React.CSSProperties,
  select: { width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' as const, color: '#1E293B', height: '44px' } as React.CSSProperties,
  selectManual:  { width: '100%', border: '1.5px solid #FED7AA', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: 'inherit', background: '#FFF3ED', color: '#92400E', boxSizing: 'border-box' as const, height: '44px' } as React.CSSProperties,
  selectStrategy:{ width: '100%', border: '2px solid #2E7D5A', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: 'inherit', background: '#F0F7F4', color: '#1A5C40', fontWeight: '500' as const, boxSizing: 'border-box' as const, height: '44px' } as React.CSSProperties,
  criticalNum: { fontSize: '26px', fontWeight: '800' as const, letterSpacing: '-0.5px', lineHeight: 1 } as React.CSSProperties,
  bigNum: { fontSize: '20px', fontWeight: '700' as const, letterSpacing: '-0.5px' } as React.CSSProperties,
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
  pct_banco_regulado?: number
  tasa_banco_anual?: number
  tasa_m10?: number
  inflacion_uma?: number
  inflacion_pension?: number   // % anual de actualizacion de pensiones por INPC (Art. 214 LSS)
  pct_actualizacion_inpc?: number
  pct_recargos_retroactivo?: number
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
  pension_sin_mod40?: number
  pct_ayuda_asistencial?: number
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
  // Campos adicionales para display y compatibilidad
  roi: number                          // alias de roi_meses
  cuantia_basica_anual: number
  incrementos_anual: number
  asignaciones_anual: number
  ayuda_asistencial_anual: number
  edadAlConcluir: number
  pension_sin_mod40: number
  nueva_pension: number
  cuota_banco: number
  nueva_pension_inmediata: number
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
    const umaDelAnio = proyectarValor(sys.UMA_DIARIA, new Date().getFullYear(), anioMes, (sys.inflacion_uma ?? 4) / 100)
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
function calcPensionLey73(semanas: number, sdi: number, edadRetiro: number, sys: SysVars, tieneConyuge: boolean, numHijos: number, numPadres: number, anioRetiro?: number, tieneAyudaAsistencial = false): { monto: number; pmg_aplica: boolean; pensionMensual: number; pensionAnual: number; cuantiaBasicaAnual: number; incrementosAnual: number; asignacionesAnual: number; ayudaAsistencialAnual: number; aguinaldoAnual: number; factorEdad: number; vecesUMA: number; pctBasica: number; pctIncremento: number; numIncrementos: number; cuantiaTotal: number; totalVejez100: number; pmgMensual: number; pensionSinPMG: number } {
  if (semanas < 500) return { monto: 0, pmg_aplica: false, pensionMensual: 0, pensionAnual: 0, cuantiaBasicaAnual: 0, incrementosAnual: 0, asignacionesAnual: 0, ayudaAsistencialAnual: 0, aguinaldoAnual: 0, factorEdad: 0, vecesUMA: 0, pctBasica: 0, pctIncremento: 0, numIncrementos: 0, cuantiaTotal: 0, totalVejez100: 0, pmgMensual: 0, pensionSinPMG: 0 }

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

  // Asignaciones familiares — Art. 164 LSS Ley 73
  // "En adición a su pensión" → NO se reducen por factor_edad (cesantía/vejez)
  // Fórmula: Asig = cuantía_total × % × 1.11  (factor_edad solo aplica a pensión base)
  const hayBeneficiarios = tieneConyuge || numHijos > 0
  const asignConyuge = tieneConyuge ? cuantiaTotalRaw * 0.15 : 0
  const asignHijos = numHijos > 0 ? cuantiaTotalRaw * 0.10 * numHijos : 0
  const asignPadres = (!hayBeneficiarios && numPadres > 0) ? cuantiaTotalRaw * 0.10 * numPadres : 0
  const asignaciones = (asignConyuge + asignHijos + asignPadres) * FACTOR_111

  // Ayuda asistencial — Art. 165 LSS (igual que asignaciones: sin factor_edad)
  const sinBeneficiarios = !tieneConyuge && numHijos === 0 && numPadres === 0
  const soloUnPadre = !tieneConyuge && numHijos === 0 && numPadres === 1
  const pctAyuda = tieneAyudaAsistencial && sinBeneficiarios ? 0.15 : tieneAyudaAsistencial && soloUnPadre ? 0.10 : 0
  const ayudaAsistencial = pctAyuda > 0
    ? Math.max(0, Math.min(
        cuantiaTotalRaw * pctAyuda * FACTOR_111,
        Math.max(0, sys.UMA_DIARIA * 25 * 365 - (baseConFactorYEdad + asignaciones)),
        sdi * 365 * FACTOR_111 - (baseConFactorYEdad + asignaciones)
      ))
    : 0

  const totalAnual = baseConFactorYEdad + asignaciones + ayudaAsistencial
  const pensionMensual = totalAnual / 12

  // PMG — proyectada al año de retiro. Importante: la PMG NO se reduce por el factor de edad/cesantía
  // (es la misma a los 60 que a los 65), a diferencia de la pensión calculada.
  const pmgBase = anioRetiro ? proyectarValor(sys.PMG_L73, new Date().getFullYear(), anioRetiro, (sys.inflacion_uma ?? 4) / 100) : sys.PMG_L73
  const pmg_aplica = pmgBase > pensionMensual
  const montoFinal = Math.max(pmgBase, pensionMensual)

  const cuantiaBasicaAnualFinal = cuantiaBasicaAnual * FACTOR_111 * factorEdad
  const incrementosAnualFinal = incrementosTotalAnual * FACTOR_111 * factorEdad

  // Aguinaldo anual — Art. 218 LSS Ley 73
  // = MIN(
  //     SI(pension > PMG) → (cuantíaBásica + incrementos) × %edad / 12
  //                SINO   → PMG mensual
  //     tope de 25 UMAs anuales = UMA × 25 × 365 / 12
  //   )
  // El aguinaldo es 1 mes de pensión BASE (sin asignaciones ni ayuda asistencial)
  const tope25UMAs = sys.UMA_DIARIA * 25 * 365 / 12
  const aguinaldoBase = pmg_aplica
    ? pmgBase                                                          // si aplica PMG: usa PMG mensual
    : (cuantiaBasicaAnualFinal + incrementosAnualFinal) / 12          // si no: cuantía+incr sin asignaciones / 12
  const aguinaldoAnual = Math.min(aguinaldoBase, tope25UMAs)

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
    numIncrementos,
    // Valores intermedios para desglose
    cuantiaTotal: cuantiaBasicaAnual + incrementosTotalAnual,             // antes de ×1.11 y ×factorEdad
    totalVejez100: (totalAnual) / factorEdad,                             // pensión al 100% sin factor edad
    pmgMensual: pmgBase,                                                  // PMG mensual proyectada
    pensionSinPMG: pensionMensual,                                        // pensión calculada antes de aplicar PMG
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
  // Siempre dividir entre 250 exactas — Art. 167 LSS 1973
  // =SUBTOTAL(9,F11:F123)/250 — suma de (SDI × semanas) / 250
  const suma = periodos.reduce((s, p) => s + p.sdi * p.semanas, 0)
  return suma / 250
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
  RENDIMIENTO_DEFAULT: 6, mod40_pct: 14.438, pct_afore_mod40: 20,
  inflacion_pension: 4.5,          // INPC anual para actualizacion de pensiones
  tasa_m10: 22,                    // 22% tasa anual Modalidad 10
  pct_actualizacion_inpc: 7.27,    // % INPC acumulado retroactivo
  pct_recargos_retroactivo: 41.80  // % recargos SAT retroactivo
}

// ══════════════════════════════════════════════════════════════════
// Simulador de impacto en vida real
// ══════════════════════════════════════════════════════════════════
function SimuladorVidaReal({ pensionSin, pensionCon }: { pensionSin: number; pensionCon: number }) {
  const AZUL = '#334E7B', VERDE = '#2E7D5A', ROJO = '#DC2626', NARANJA = '#E8724A'
  const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)

  const [renta, setRenta] = useState(6000)
  const [comida, setComida] = useState(4500)
  const [servicios, setServicios] = useState(1200)
  const [medicamentos, setMedicamentos] = useState(1800)
  const [transporte, setTransporte] = useState(800)
  const [entretenimiento, setEntretenimiento] = useState(1000)

  const gastoTotal = renta + comida + servicios + medicamentos + transporte + entretenimiento
  const excedenteSin = pensionSin - gastoTotal
  const excedenteCon = pensionCon - gastoTotal
  const mejora = pensionSin > 0 ? Math.round(((pensionCon - pensionSin) / pensionSin) * 100) : 0

  const gastos = [
    { label: '🏠 Renta/hipoteca', val: renta, set: setRenta, color: '#6366F1' },
    { label: '🛒 Alimentación', val: comida, set: setComida, color: '#F59E0B' },
    { label: '💡 Servicios', val: servicios, set: setServicios, color: '#10B981' },
    { label: '💊 Medicamentos', val: medicamentos, set: setMedicamentos, color: '#EF4444' },
    { label: '🚌 Transporte', val: transporte, set: setTransporte, color: '#8B5CF6' },
    { label: '🎬 Entretenimiento', val: entretenimiento, set: setEntretenimiento, color: '#EC4899' },
  ]

  const maxBar = Math.max(pensionCon * 1.1, gastoTotal * 1.1)
  const barPct = (v: number) => Math.min(100, Math.round((v / maxBar) * 100))

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', marginTop: '4px' }}>
      <div style={{ background: AZUL, padding: '12px 16px' }}>
        <p style={{ fontSize: '12px', color: '#93C5FD', margin: '0 0 2px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '700' }}>
          Simulador de vida real
        </p>
        <p style={{ fontSize: '14px', fontWeight: '800', color: 'white', margin: 0 }}>
          ¿Te alcanzará la pensión para vivir?
        </p>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>

        {/* Gastos ajustables */}
        <div>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#374151', margin: '0 0 10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
            Ajusta tus gastos mensuales estimados
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {gastos.map(g => (
              <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', flexShrink: 0 }}>{g.label.split(' ')[0]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <label style={{ fontSize: '10px', color: '#64748B' }}>{g.label.substring(3)}</label>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: g.color }}>{fmtMXN(g.val)}</span>
                  </div>
                  <input type="range" min={0} max={15000} step={500} value={g.val} onChange={e => g.set(Number(e.target.value))}
                    style={{ width: '100%', height: '4px', accentColor: g.color, cursor: 'pointer' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparativa visual */}
        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#374151', margin: '0 0 12px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
            Comparativa
          </p>

          {[
            { label: 'Tus gastos mensuales', val: gastoTotal, color: '#64748B' },
            { label: 'Pensión sin Modalidad 40', val: pensionSin, color: ROJO },
            { label: 'Pensión con Modalidad 40', val: pensionCon, color: VERDE },
          ].map((b, i) => (
            <div key={i} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#374151' }}>{b.label}</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: b.color }}>{fmtMXN(b.val)}</span>
              </div>
              <div style={{ height: '10px', background: '#E5E7EB', borderRadius: '5px', overflow: 'hidden' as const }}>
                <div style={{ height: '100%', background: b.color, borderRadius: '5px', width: `${barPct(b.val)}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Resultado */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ padding: '12px', background: excedenteSin >= 0 ? '#F0FDF4' : '#FEF2F2', borderRadius: '8px', borderLeft: `3px solid ${excedenteSin >= 0 ? VERDE : ROJO}` }}>
            <p style={{ fontSize: '10px', color: '#64748B', margin: '0 0 4px' }}>Sin Modalidad 40</p>
            <p style={{ fontSize: '16px', fontWeight: '800', color: excedenteSin >= 0 ? VERDE : ROJO, margin: '0 0 2px' }}>
              {excedenteSin >= 0 ? `+${fmtMXN(excedenteSin)}` : fmtMXN(excedenteSin)}
            </p>
            <p style={{ fontSize: '10px', color: '#64748B', margin: 0 }}>
              {excedenteSin >= 0 ? 'sobraría al mes' : 'faltaría al mes'}
            </p>
          </div>
          <div style={{ padding: '12px', background: excedenteCon >= 0 ? '#F0FDF4' : '#FEF2F2', borderRadius: '8px', borderLeft: `3px solid ${excedenteCon >= 0 ? VERDE : ROJO}` }}>
            <p style={{ fontSize: '10px', color: '#64748B', margin: '0 0 4px' }}>Con Modalidad 40</p>
            <p style={{ fontSize: '16px', fontWeight: '800', color: excedenteCon >= 0 ? VERDE : ROJO, margin: '0 0 2px' }}>
              {excedenteCon >= 0 ? `+${fmtMXN(excedenteCon)}` : fmtMXN(excedenteCon)}
            </p>
            <p style={{ fontSize: '10px', color: '#64748B', margin: 0 }}>
              {excedenteCon >= 0 ? 'sobraría al mes' : 'faltaría al mes'}
            </p>
          </div>
        </div>

        {/* Mensaje de impacto */}
        <div style={{ padding: '12px 14px', background: '#EEF2F8', borderRadius: '8px', borderLeft: `3px solid ${AZUL}` }}>
          <p style={{ fontSize: '12px', color: AZUL, fontWeight: '700', margin: '0 0 4px' }}>
            {mejora > 0 ? `Con Modalidad 40 tu pensión mejora ${mejora}%` : 'Completa el diagnóstico para ver la mejora'}
          </p>
          <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>
            {pensionCon > 0 && pensionSin > 0 && (
              `Eso significa ${fmtMXN(pensionCon - pensionSin)} más al mes — la diferencia entre ${excedenteCon >= 0 ? 'cubrir tus gastos y tener un margen' : 'reducir el déficit mensual'}.`
            )}
          </p>
        </div>

      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Semáforo de elegibilidad financiera
// ══════════════════════════════════════════════════════════════════
function SemaforoElegibilidad({ clienteId, diagnosticoId, datos, escenarioSel, supabase, userId }: {
  clienteId: string; diagnosticoId: string; datos: any; escenarioSel: any; supabase: any; userId: string
}) {
  const AZUL = '#334E7B', NARANJA = '#E8724A'
  const [financieras, setFinancieras] = useState<any[]>([])
  const [criterios, setCriterios] = useState<Record<string, any[]>>({})
  const [evaluaciones, setEvaluaciones] = useState<any[]>([])
  const [evaluando, setEvaluando] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    supabase.from('instituciones_financieras').select('*').eq('asesor_id', userId).order('nombre')
      .then(({ data }: any) => {
        setFinancieras(data ?? [])
        // Cargar criterios de todas las financieras
        if (data && data.length > 0) {
          Promise.all(data.map((f: any) =>
            supabase.from('criterios_financiera').select('*').eq('institucion_id', f.id)
              .then(({ data: c }: any) => ({ id: f.id, criterios: c ?? [] }))
          )).then((results: any[]) => {
            const map: Record<string, any[]> = {}
            results.forEach((r: any) => { map[r.id] = r.criterios })
            setCriterios(map)
          })
        }
      })
  }, [userId])

  function evaluarCliente(financieraId: string): { resultado: 'viable' | 'condicional' | 'no_viable'; detalles: any[] } {
    const crit = criterios[financieraId] ?? []
    if (crit.length === 0) return { resultado: 'condicional', detalles: [] }

    const valoresCliente: Record<string, number | string | null> = {
      semanas_min: datos.semanas_totales,
      semanas_max: datos.semanas_totales,
      edad_min: datos.edad_actual,
      edad_max: datos.edad_actual,
      monto_min: escenarioSel?.costo_total_mod40 ?? 0,
      monto_max: escenarioSel?.costo_total_mod40 ?? 0,
      mejora_pension_min_pct: escenarioSel && escenarioSel.pension_mensual > 0 && (datos.pension_sin_mod40 ?? 0) > 0
        ? ((escenarioSel.pension_mensual - (datos.pension_sin_mod40 ?? 0)) / (datos.pension_sin_mod40 ?? 1)) * 100
        : 0,
    }

    const detalles = crit.map((c: any) => {
      const valor = valoresCliente[c.variable_clave]
      let cumple = true
      let motivo = ''

      if (c.valor_min != null && valor != null) {
        if (Number(valor) < c.valor_min) { cumple = false; motivo = `Requiere mínimo ${c.valor_min}` }
      }
      if (c.valor_max != null && valor != null) {
        if (Number(valor) > c.valor_max) { cumple = false; motivo = `No debe superar ${c.valor_max}` }
      }

      return { clave: c.variable_clave, cumple, valor, motivo }
    })

    const noCumple = detalles.filter((d: any) => !d.cumple).length
    const resultado = noCumple === 0 ? 'viable' : noCumple <= 1 ? 'condicional' : 'no_viable'
    return { resultado, detalles }
  }

  useEffect(() => {
    if (financieras.length > 0 && Object.keys(criterios).length > 0) {
      const evals = financieras.map((f: any) => ({
        ...f,
        ...evaluarCliente(f.id)
      }))
      setEvaluaciones(evals)
    }
  }, [financieras, criterios, datos, escenarioSel])

  if (financieras.length === 0) return null

  const viables = evaluaciones.filter((e: any) => e.resultado === 'viable').length
  const condicionales = evaluaciones.filter((e: any) => e.resultado === 'condicional').length

  const colorResultado = (r: string) => r === 'viable' ? '#16A34A' : r === 'condicional' ? '#D97706' : '#DC2626'
  const bgResultado = (r: string) => r === 'viable' ? '#F0FDF4' : r === 'condicional' ? '#FFFBEB' : '#FEF2F2'
  const etiqueta = (r: string) => r === 'viable' ? '✅ Viable' : r === 'condicional' ? '⚠️ Condicional' : '❌ No cumple'

  return (
    <div style={{ marginTop: '4px' }}>
      <div style={{ background: '#334E7B', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: '12px', color: '#93C5FD', margin: '0 0 2px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '700' }}>Elegibilidad Financiera</p>
          <p style={{ fontSize: '14px', fontWeight: '800', color: 'white', margin: 0 }}>
            {viables > 0 ? `✅ Viable en ${viables} de ${financieras.length} financiera${financieras.length !== 1 ? 's' : ''}` :
             condicionales > 0 ? `⚠️ Condicional en ${condicionales} de ${financieras.length} financiera${financieras.length !== 1 ? 's' : ''}` :
             '❌ Sin elegibilidad en financieras configuradas'}
          </p>
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid #E5E7EB', borderTop: 'none' }}>
        {evaluaciones.map((e: any) => (
          <div key={e.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div onClick={() => setExpandida(expandida === e.id ? null : e.id)}
              style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <span style={{ fontSize: '16px' }}>🏦</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', flex: 1 }}>{e.nombre}</span>
              <span style={{ padding: '3px 10px', background: bgResultado(e.resultado), color: colorResultado(e.resultado), fontSize: '11px', fontWeight: '700', borderRadius: '4px' }}>
                {etiqueta(e.resultado)}
              </span>
              <span style={{ color: '#94A3B8', fontSize: '11px' }}>{expandida === e.id ? '▲' : '▼'}</span>
            </div>
            {expandida === e.id && e.detalles.length > 0 && (
              <div style={{ padding: '0 16px 12px 42px' }}>
                {e.detalles.map((d: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '11px' }}>
                    <span>{d.cumple ? '✓' : '✗'}</span>
                    <span style={{ color: d.cumple ? '#16A34A' : '#DC2626' }}>
                      {d.clave.replace(/_/g, ' ')} — {d.motivo || `Valor: ${d.valor}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
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
  const [tab, setTab] = useState(-1)
  // ── Glosario de términos ─────────────────────────────────────
  const GLOSARIO: Record<string, { titulo: string; desc: string; ejemplo?: string }> = {
    sdi: { titulo: 'SDI — Salario Diario Integrado', desc: 'El salario real que considera IMSS para el cálculo de la pensión. Incluye sueldo base, partes proporcionales de aguinaldo, vacaciones y prima vacacional.', ejemplo: 'Si ganas $15,000/mes tu SDI diario es aprox. $547/día.' },
    sdi250: { titulo: 'SDI Promedio 250 Semanas', desc: 'El IMSS calcula la pensión sobre el promedio del SDI de las últimas 250 semanas cotizadas (~5 años), no sobre el salario actual. Si en esos 5 años tu salario fue menor, tu pensión será menor.', ejemplo: 'Art. 167 LSS 1973.' },
    mod40: { titulo: 'Modalidad 40', desc: 'Permite cotizar voluntariamente ante el IMSS con un salario mayor al actual para incrementar el promedio de las 250 semanas. Es el instrumento clave para mejorar la pensión.', ejemplo: 'Se puede cotizar entre 1 y 25 UMAs diarias.' },
    uma: { titulo: 'UMA — Unidad de Medida y Actualización', desc: 'Referencia económica que actualiza el INEGI cada 1° de febrero. En Mod. 40 cotizas en múltiplos de UMA — a mayor número de UMAs, mayor SDI registrado y mayor pensión, pero también mayor cuota mensual al IMSS.', ejemplo: 'Cotizar a 25 UMAs = $2,932.75/día de SDI registrado.' },
    pmg: { titulo: 'PMG — Pensión Mínima Garantizada', desc: 'El Estado garantiza que ningún pensionado bajo Ley 73 reciba menos de cierta cantidad mensual, aunque el cálculo matemático dé un monto menor. Se calcula como salario mínimo × 365 × 1.11. Con Mod 40 el objetivo es superar la PMG para recibir la pensión real calculada.', ejemplo: 'PMG 2024: ~$10,636/mes. Si tu pensión calculada es $9,000 recibes $10,636.' },
    cuantia: { titulo: 'Cuantía Básica de Pensión', desc: 'Primer componente de la pensión. Se calcula como un % del SDI promedio de 250 semanas según la tabla del Art. 167 LSS. El porcentaje depende de cuántas veces el UMA representa el SDI — a mayor salario relativo al UMA, menor el porcentaje base pero mayor la pensión absoluta.', ejemplo: 'SDI = 4.43 UMAs → cuantía básica = 18.29% del SDI anual.' },
    incrementos: { titulo: 'Incrementos Anuales', desc: 'Por cada año completo (52 semanas) cotizado más allá de las 500 mínimas, la pensión sube entre 0.39% y 2.09% del SDI según el bracket salarial. Art. 167 LSS. Aquí es donde Mod 40 genera su mayor impacto — más semanas + mayor SDI = más incrementos.', ejemplo: 'Con 25 años adicionales (1,800 sem.) el incremento puede ser 25 × 2.3% = 57.5% del SDI.' },
    asignaciones: { titulo: 'Asignaciones Familiares', desc: 'Incremento a la pensión por dependientes económicos registrados ante el IMSS. Art. 164 LSS Ley 73: cónyuge/concubino +15%, cada hijo menor de 16 años +10%, cada padre dependiente +10% (solo si no hay cónyuge ni hijos).', ejemplo: 'Pensión base $10,000 + cónyuge + 1 hijo = $10,000 × 1.25 = $12,500/mes.' },
    ayuda165: { titulo: 'Ayuda Asistencial (Art. 165 LSS)', desc: 'Cuando el pensionado no tiene cónyuge, hijos ni padres dependientes, tiene derecho a un 15% adicional sobre la pensión base. Es excluyente con las asignaciones familiares — aplica uno u otro, no ambos.', ejemplo: 'Pensión de $10,000 sin familia dependiente → recibe $11,500 con Art. 165.' },
    conservacion: { titulo: 'Conservación de Derechos', desc: 'Derecho a pensionarse que se mantiene aunque el trabajador deje de cotizar. Requiere haber cotizado mínimo 250 semanas. El derecho se conserva por un tiempo equivalente a la mitad del período cotizado.', ejemplo: 'Con 500 sem. cotizadas, los derechos se conservan 250 semanas (~5 años) después de dejar de cotizar.' },
    retroactivo: { titulo: 'Pago Retroactivo (Mod. 40)', desc: 'Permite pagar cuotas de períodos anteriores (hasta 5 años atrás) para aumentar semanas cotizadas sin esperar ese tiempo. Incluye cuota original + actualización por INPC + recargos por mora SAT. Útil para acortar el plazo de Mod 40.', ejemplo: 'Actualizaciones INPC: ~7.27% anual. Recargos SAT: ~41.80% acumulado.' },
    roi: { titulo: 'ROI — Recuperación de Inversión', desc: 'Meses que tarda el pensionado en recuperar la inversión total de Mod 40 con el incremento mensual de pensión. Fórmula: inversión total ÷ incremento mensual. Un ROI menor a 60 meses se considera excelente.', ejemplo: 'Inversión $300K ÷ Incremento $5K/mes = 60 meses de ROI.' },
    factorEdad: { titulo: 'Factor por Edad de Retiro', desc: 'La pensión de cesantía en edad avanzada se reduce según la edad al jubilarse. A los 65 se recibe el 100% (pensión de vejez). Por cada año antes de los 65 se reduce 5%. Art. 167 LSS Ley 73.', ejemplo: '60 años = 75% | 61 = 80% | 62 = 85% | 63 = 90% | 64 = 95% | 65+ = 100%.' },
    duracionMod40: { titulo: 'Duración de Mod. 40 — decisión del cliente', desc: '6 meses = 26 semanas = el mínimo para sumar medio año de incremento en la pensión (Art. 167 LSS). Cada bloque mejora la pensión mensual de forma permanente. La duración la acuerda el asesor con el cliente según su capacidad de pago y cuándo quiere jubilarse.', ejemplo: '3 años → pensión puede mejorar +158% vs pensión sin Mod 40.' },
    sdiMod40: { titulo: 'SDI registrado en Mod. 40', desc: 'Es el salario que el trabajador declara al IMSS al inscribirse en Mod. 40. Fórmula: UMAs seleccionadas × UMA diaria vigente. Este salario "desplaza" los periodos de salario bajo en el promedio de las últimas 250 semanas — es la clave del mecanismo.', ejemplo: '25 UMAs × $117.31 = $2,932.75/día registrado ante IMSS.' },
    nuevoSdi250: { titulo: 'Nuevo SDI promedio 250 semanas', desc: 'Promedio ponderado del SDI de las últimas 250 semanas DESPUÉS de incluir Mod. 40. Fórmula: (semanas_Mod40 × SDI_alto + semanas_históricas × SDI_bajo) ÷ 250. A mayor duración y más UMAs en Mod 40, más se eleva este promedio y mayor es la pensión resultante.', ejemplo: '187 sem × $2,932 + 63 sem × $437 = $2,302/día promedio vs $520 anterior → +343%.' },
    // Tab 0
    regimen: { titulo: 'Régimen de pensión — Ley 73 vs Ley 97', desc: 'Define qué ley de pensiones aplica. Ley 73: cotizó antes del 1° de julio de 1997 — puede elegir jubilarse con pensión vitalicia calculada sobre SDI promedio. Ley 97: solo AFORE, pensión depende del ahorro acumulado, no del SDI. La constancia IMSS lo determina automáticamente por la fecha del primer empleo.', ejemplo: 'Primer empleo antes del 01/07/1997 → Ley 73 (más beneficiosa en la mayoría de casos).' },
    sigueCotizando: { titulo: '¿Sigue cotizando ante el IMSS?', desc: 'Indica si el trabajador está activo laboralmente. Si sí, se proyectan las semanas naturales adicionales que acumulará entre hoy y la fecha de retiro. Si no, el cálculo usa solo las semanas actuales de la constancia.', ejemplo: 'Con 1,677 semanas actuales y 2.26 años restantes → proyecta 118 semanas adicionales = 1,795 semanas al retiro.' },
    conyuge: { titulo: 'Cónyuge o concubino dependiente', desc: 'Si el pensionado tiene cónyuge o concubino registrado ante el IMSS como dependiente económico, agrega una asignación familiar del 15% sobre la pensión base (Art. 164 LSS Ley 73). Debe estar registrado en el IMSS para que aplique.', ejemplo: 'Pensión base $10,000/mes → con cónyuge recibe $11,500/mes.' },
    numHijos: { titulo: 'Hijos dependientes menores de 16 años', desc: 'Cada hijo menor de 16 años (o hasta 25 si estudia y está registrado en IMSS) agrega un 10% adicional sobre la pensión base. Art. 164 LSS Ley 73. Deben estar registrados como beneficiarios en el IMSS.', ejemplo: 'Pensión base $10,000 + 2 hijos = $10,000 × 1.20 = $12,000/mes.' },
    numPadres: { titulo: 'Padres como dependientes económicos', desc: 'Si el pensionado no tiene cónyuge ni hijos, los padres que dependan económicamente de él agregan un 10% por cada uno. Art. 164 LSS Ley 73. Es excluyente: solo aplica si no hay cónyuge ni hijos.', ejemplo: 'Sin cónyuge ni hijos + 2 padres → pensión base × 1.20.' },
    ingresoObjetivo: { titulo: 'Meta de pensión mensual', desc: 'Monto mensual que el cliente necesita recibir de pensión para mantener su nivel de vida o cubrir sus gastos en el retiro. Sirve como referencia para que el sistema marque qué escenario alcanza esta meta y cuántas UMAs necesita registrar en Mod 40.', ejemplo: 'Si la meta es $25,000/mes y la pensión actual proyectada es $10,985, el sistema mostrará cuántas UMAs en Mod 40 se necesitan para alcanzarla.' },
    // Tab 3
    cuotaMensualMod40: { titulo: 'Cuota mensual al IMSS por Mod. 40', desc: 'Pago que realiza el trabajador al IMSS por cotizar en Modalidad 40. Se calcula como: SDI registrado × tasa Mod 40 (14.438%) × días del bimestre ÷ 2. La tasa la establece el IMSS y puede cambiar; se actualiza en Admin Fórmulas.', ejemplo: 'SDI $2,932.75 × 14.438% × 30.4 días = ~$12,876/mes aprox.' },
    // Tab 6
    ganancia80: { titulo: 'Ganancia acumulada a los 80 años', desc: 'Diferencia total entre lo que recibirás de pensión CON Mod 40 vs SIN Mod 40, proyectada desde tu fecha de retiro hasta los 80 años, descontando la inversión realizada. Muestra el beneficio neto real de hacer Mod 40.', ejemplo: 'Si la diferencia mensual es $15,000 y faltan 20 años para los 80 → ganancia bruta = $3.6M antes de descontar inversión.' },
    tasaRendimiento: { titulo: 'Tasa de rendimiento efectiva', desc: 'Rendimiento anual efectivo que produce la inversión en Mod 40 comparado con el capital total invertido. Permite al cliente comparar Mod 40 contra otras alternativas de inversión como CETES, AFORE o fondos.', ejemplo: 'Inversión $300K → incremento de pensión genera retorno equivalente a 25% anual efectivo.' },
    // Tab 12
    mod10: { titulo: 'Modalidad 10 — Continuación voluntaria', desc: 'Permite seguir cotizando al IMSS durante 12 meses después de dejar de trabajar, con el mismo SDI del último empleo. No permite aumentar el SDI — solo conservarlo. Art. 218 LSS Ley 73. Útil para trabajadores que están entre empleos y no quieren perder semanas.', ejemplo: 'Último SDI $520/día → cotiza 12 meses más a $520/día agregando ~52 semanas.' },
    mod10vsMod40: { titulo: 'Mod 10 vs Mod 40 — ¿cuál conviene?', desc: 'Mod 10: conserva el SDI actual, dura solo 12 meses, costo bajo, no mejora el promedio de 250 semanas significativamente. Mod 40: registra SDI mayor (hasta 25 UMAs), cualquier duración, mayor costo pero impacto radical en la pensión. Se recomienda Mod 40 cuando el cliente puede invertir y quiere maximizar la pensión a largo plazo.', ejemplo: 'Con Mod 10: pensión mejora ~5%. Con Mod 40 a 25 UMAs: pensión puede mejorar +150%.' },
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
          <div style={{ position: 'absolute' as const, left: '50%', bottom: '120%', transform: 'translateX(-50%)', background: '#1e293b', color: 'white', padding: '10px 14px', fontSize: '13px', lineHeight: 1.6, width: '260px', zIndex: 999, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
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
  const [modoEntrada, setModoEntrada] = useState<null | 'auto' | 'manual'>(null)
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
  const [mod40AniosUI, setMod40AniosUI] = useState(3)
  const [mod40MesesUI, setMod40MesesUI] = useState(0)
  const [edadIngresoAnios, setEdadIngresoAnios] = useState(0)
  const [edadIngresoMeses, setEdadIngresoMeses] = useState(0)

  // Valores por defecto calculados de la constancia — para el botón de reset
  const [defaultEdadAnios, setDefaultEdadAnios] = useState(0)
  const [defaultEdadMeses, setDefaultEdadMeses] = useState(0)

  function resetParametrosMod40() {
    setEdadIngresoAnios(defaultEdadAnios)
    setEdadIngresoMeses(defaultEdadMeses)
    // Duración y UMAs no tienen "sugerencia automática" — se dejan como están
    // Solo la edad de ingreso viene pre-calculada de la constancia
  }

  // Tab 5 - Escenarios
  const [escenarios, setEscenarios] = useState<Escenario[]>([])
  const [escSelIdx, setEscSelIdx] = useState(2)

  // Tab 6 - Financiamiento
  const [finSelId, setFinSelId] = useState('')
  const [finPlazo, setFinPlazo] = useState(36)

  // Tab 7 - Analisis
  const [analisis, setAnalisis] = useState<AnalisisSeccion[]>([])
  const [analisisManual, setAnalisisManual] = useState('')
  const [analisisManualSecciones, setAnalisisManualSecciones] = useState({
    contexto: '',
    diagnostico: '',
    opciones: '',
    recomendacion: '',
    proximos_pasos: '',
  })
  const [modoAnalisis, setModoAnalisis] = useState<'manual' | 'ia'>('manual')
  const [sofiaOutput, setSofiaOutput] = useState<any>(null)
  const [generandoSofia, setGenerandoSofia] = useState(false)
  const [generandoAnalisis, setGenerandoAnalisis] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(null as number | null)
  const [subTabEntregable, setSubTabEntregable] = useState('analisis')
  const [mensaje, setMensaje] = useState('')
  const [asesorPerfil, setAsesorPerfil] = useState<{razon_social?: string; nombre?: string; logo_url?: string; encabezado_color?: string; encabezado_titulo?: string; encabezado_logo_size?: number; encabezado_font_size?: number} | null>(null)

  const pdfConfig = (asesorPerfil as any)?.pdf_config ? (() => { try { return JSON.parse((asesorPerfil as any).pdf_config) } catch { return null } })() : null
  const [showAllMonths, setShowAllMonths] = useState(false)
  const [showClienteModal, setShowClienteModal] = useState(false)
  const [showSugerirEtapa, setShowSugerirEtapa] = useState(false)
  const [etapaSugerida, setEtapaSugerida] = useState('')
  const [showConfirmCambio, setShowConfirmCambio] = useState(false)
  const [pendingClienteId, setPendingClienteId] = useState('')
  const [showContinuarDiag, setShowContinuarDiag] = useState(false)
  const [diagExistente, setDiagExistente] = useState<{ id: string; fecha: string } | null>(null)
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
  const [duracionTramiteMeses, setDuracionTramiteMeses] = useState(12)
  const [plazoCredito, setPlazoCredito] = useState(60)
  const [diagGuardadoId, setDiagGuardadoId] = useState<string | null>(null)

  // ── Dirty flag — avisa al layout cuando hay cambios sin guardar ──────────
  useEffect(() => {
    const isDirty = sdiPromedio > 0 && !diagGuardadoId
    if (typeof window !== 'undefined') (window as any).__kse_dirty = isDirty
  }, [sdiPromedio, diagGuardadoId])

  useEffect(() => {
    return () => { if (typeof window !== 'undefined') (window as any).__kse_dirty = false }
  }, [])

  // beforeunload — protege contra cierre/refresh de ventana
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (sdiPromedio > 0 && !diagGuardadoId) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [sdiPromedio, diagGuardadoId])
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
            if (p.periodos && p.periodos.length > 0) {
              setPeriodos(p.periodos)
              setPeriodosCompletos(p.periodos)
              // Recalcular sdiPromedio desde periodos si no está guardado
              const sdi = p.sdiPromedio && p.sdiPromedio > 0
                ? p.sdiPromedio
                : p.periodos.reduce((s: number, per: any) => s + (per.sdi || 0) * (per.semanas || 0), 0) / 250
              setSdiPromedio(sdi)
            }
            if (p.mod40Umas) setMod40Umas(p.mod40Umas)
            if (p.mod40Meses) {
              setMod40Meses(p.mod40Meses)
              setMod40AniosUI(Math.floor(p.mod40Meses / 12))
              setMod40MesesUI(p.mod40Meses % 12)
            }
            if (p.ingresoObjetivo) setIngresoObjetivo(p.ingresoObjetivo)
            if (p.simulacionLibre) setSimulacionLibre(p.simulacionLibre)
            if (p.simUmas) setSimUmas(p.simUmas)
            if (p.simMeses) setSimMeses(p.simMeses)
            if (typeof p.escElegidoIdx === 'number') setEscElegidoIdx(p.escElegidoIdx)
            if (p.fechaUltimaCot) setFechaUltimaCot(p.fechaUltimaCot)
            if (p.edadRetiro) setEdadRetiro(p.edadRetiro)
            if (p.anioInicioTramite) setAnioInicioTramite(p.anioInicioTramite)
            else if (p.datos?.fecha_calculo) setFechaUltimaCot(p.datos.fecha_calculo)
            // Restaurar edad de ingreso Mod 40
            if (p.datos?.edad_actual) {
              const anios = Math.floor(p.datos.edad_actual)
              const meses = Math.round((p.datos.edad_actual % 1) * 12)
              setEdadIngresoAnios(anios)
              setEdadIngresoMeses(meses)
              setDefaultEdadAnios(anios)
              setDefaultEdadMeses(meses)
            }
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
              if (Array.isArray(parsed)) {
                setAnalisis(parsed)
                setModoAnalisis('ia')
              } else if (typeof parsed === 'string') {
                setAnalisisManual(parsed)
                setModoAnalisis('manual')
              }
            } catch(e) {}
          }
          setTab(6) // Go to Resumen to show saved state
          setShowClienteModal(false)
          // ✅ Diagnóstico restaurado: saltar carátula, entrar directo
          setMostrarCaratula(false)
          setAppInicializado(true)
          return
        }
      }

      // Sin ?diag: mostrar carátula normalmente
      setMostrarCaratula(true)
      setModoEntrada(null)
      setAppInicializado(true)
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
        tasa_m10: data.tasa_m10 ?? 22,
        pct_actualizacion_inpc: data.pct_actualizacion_inpc ?? 7.27,
        pct_recargos_retroactivo: data.pct_recargos_retroactivo ?? 41.80,
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
        body: JSON.stringify({ pdf: base64, asesor_id: userId, cliente_id: clienteId || null })
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: response.statusText }))
        console.error('API error:', response.status, errData)
        alert(`Error al extraer la constancia: ${errData.detail || response.statusText}. Intenta de nuevo o usa captura manual.`)
        return
      }
      const result = await response.json()
      console.log('PDF result:', result)
      if (!result.nombre && !result.semanas && !result.nss) {
        alert('No se pudo leer la constancia. Verifica que sea un PDF del IMSS (SISEC) válido o usa captura manual.')
        return
      }
      if (result.nombre || result.semanas) {
        const edadCalc = result.fecha_nac
          ? parseFloat(((Date.now() - new Date(result.fecha_nac).getTime()) / (365.25 * 86400000)).toFixed(2))
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
          // sigue_cotizando: solo lo sobreescribe si el usuario no lo ha cambiado manualmente
          // (si sigue en el default 'true', acepta la sugerencia; si ya lo cambió, lo respeta)
          sigue_cotizando: sigueCotizandoSugerido ?? prev.sigue_cotizando,
          ley: leyDetectada ?? prev.ley,
          // num_hijos, tiene_conyuge, num_padres, tiene_ayuda_asistencial:
          // NO se tocan — no vienen en la constancia y el asesor los entra manualmente.
          // El ...prev de arriba ya los preserva.
        }))
        // Inicializar edad de ingreso a Mod. 40 con la edad actual del cliente
        if (edadCalc !== undefined) {
          const anios = Math.floor(edadCalc)
          const meses = Math.round((edadCalc % 1) * 12)
          setEdadIngresoAnios(anios)
          setEdadIngresoMeses(meses)
          setDefaultEdadAnios(anios)
          setDefaultEdadMeses(meses)
        }
        if (result.ultima_cotizacion) setFechaUltimaCot(result.ultima_cotizacion)
        // Build periodos from PDF data — recalcula "semanas" de forma determinística a partir de
        // fecha_inicio/fecha_fin en vez de confiar en el número que calculó la IA (las IA son
        // imprecisas haciendo aritmética de fechas en texto libre; esto elimina esa imprecisión).
        if (result.periodos && Array.isArray(result.periodos)) {
          const periodosRecalculados = result.periodos.map((p: any) => {
            // Si la IA ya extrajo semanas válidas, usarlas directamente
            // Solo recalcular desde fechas si semanas es 0 o falta Y hay ambas fechas
            if ((p.semanas || 0) === 0 && p.fecha_inicio && p.fecha_fin) {
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
    // Ordenar de más reciente a más antiguo por fecha_fin
    // Si fecha_fin es nula (empleo actual vigente), se trata como hoy
    const hoy = Date.now()
    const ordenados = [...rawPeriodos].sort((a, b) => {
      const fa = a.fecha_fin ? new Date(a.fecha_fin).getTime() : hoy
      const fb = b.fecha_fin ? new Date(b.fecha_fin).getTime() : hoy
      return fb - fa // más reciente primero
    })

    let acum = 0
    const result: PeriodoSalarial[] = []
    for (const p of ordenados) {
      if (acum >= 250) break
      const semDisponibles = p.semanas || 0
      const sem = Math.min(semDisponibles, 250 - acum)
      acum += sem
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
    // Calcular pesos
    const total = result.reduce((s, p) => s + p.semanas, 0)
    const withPeso = result.map(p => ({ ...p, peso: total > 0 ? (p.semanas / total) * 100 : 0 }))
    setPeriodos(withPeso)
    setSdiPromedio(calcPromedioSalarial250(withPeso))
  }

  // Recalculate escenarios when sdiPromedio or mod40 changes
  useEffect(() => { if (sdiPromedio > 0 || datos.semanas_totales > 0) recalcEscenarios() }, [sdiPromedio, datos, mod40Umas, mod40Meses, sys, simulacionLibre, simUmas, simMeses, edadRetiro, anioInicioTramite, edadIngresoAnios, edadIngresoMeses, duracionTramiteMeses, plazoCredito])

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
    // UMA usada — actual (sin proyectar), para mantener consistencia en el return
    const umaProyectada = sys.UMA_DIARIA
    const sdiMod40 = umas * umaProyectada

    // Costo mensual = SDI × tasa × días_año / 12  (fórmula oficial IMSS)
    // El Excel usa: SDI × tasa% × días_pagados → anual, luego /12 para mensual
    let costo_total = 0
    const fechaInicioMod40 = new Date(anioI, 0, 1)
    for (let m = 0; m < meses; m++) {
      const fechaMes = new Date(fechaInicioMod40)
      fechaMes.setMonth(fechaMes.getMonth() + m)
      const anioMes = fechaMes.getFullYear()
      const diasAnioMes = anioMes % 4 === 0 && (anioMes % 100 !== 0 || anioMes % 400 === 0) ? 366 : 365
      const umaMes = proyectarValor(sys.UMA_DIARIA, anioBase, anioMes, (sys.inflacion_uma ?? 4) / 100)
      const sdiMes = umas * umaMes
      const tasaMes = getMod40Pct(anioMes) / 100
      // SDI × tasa × días_año / 12 = cuota mensual de ese año
      costo_total += sdiMes * tasaMes * diasAnioMes / 12
    }
    const costoMensual = meses > 0 ? costo_total / meses : 0
    const tasaProyectada = getMod40Pct(anioI) / 100

    // Semanas cotizadas en Mod40 — usando días calendarios exactos como el Excel
    // Excel: (fecha_baja - fecha_inicio) / 7 + 1/7
    // Antes se usaba meses × (52/12) que da ~5 semanas menos → ~$26/día de diferencia en SDI
    const fechaBajaExacta = new Date(fechaInicioMod40)
    fechaBajaExacta.setMonth(fechaBajaExacta.getMonth() + meses)
    const diasMod40 = (fechaBajaExacta.getTime() - fechaInicioMod40.getTime()) / (1000 * 60 * 60 * 24)
    const semMod40 = diasMod40 / 7 + 1 / 7 // replicando fórmula exacta del Excel
    // Semanas antes de Mod40 incluye las naturales cotizadas hasta el inicio — DATOS GEN. MOD 40!C6
    const semAntesM40 = sem // ya incluye las proyectadas en recalcEscenarios
    const semTotal = semAntesM40 + semMod40

    // SDI ponderado 250 semanas — Art. 167 LSS
    // Reconstruye las últimas 250 semanas insertando Mod40 como período más reciente
    // y tomando los períodos históricos reales hacia atrás
    const semMod40en250 = Math.min(semMod40, 250)
    let sdiNuevo = sdiBase
    if (semMod40en250 > 0) {
      // Construir la ventana de 250 semanas con Mod40 primero
      const ventana: { sdi: number; semanas: number }[] = [
        { sdi: sdiMod40, semanas: semMod40en250 }
      ]
      let acum = semMod40en250
      // Agregar períodos históricos de más reciente a más antiguo
      const periodosOrdenados = [...periodos].sort((a, b) => {
        const fa = a.fecha_fin ? new Date(a.fecha_fin).getTime() : Date.now()
        const fb = b.fecha_fin ? new Date(b.fecha_fin).getTime() : Date.now()
        return fb - fa
      })
      for (const p of periodosOrdenados) {
        if (acum >= 250) break
        const disponibles = p.semanas || 0
        if (disponibles <= 0) continue
        const usar = Math.min(disponibles, 250 - acum)
        ventana.push({ sdi: p.sdi, semanas: usar })
        acum += usar
      }
      const sumaPonderada = ventana.reduce((s, v) => s + v.sdi * v.semanas, 0)
      sdiNuevo = sumaPonderada / 250
    }

    const { monto: pension, pmg_aplica } = calcPensionLey73(semTotal, sdiNuevo, edadR, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, anioR, datos.tiene_ayuda_asistencial)
    const incr = pension - pensionBase

    // Inversión neta y ROI — Datos-proyecto!C20, C21
    const pctAfore = (sys.pct_afore_mod40 ?? 20) / 100
    const recuperacion_afore = costo_total * pctAfore
    const inversion_neta = costo_total - recuperacion_afore
    const roi = incr > 0 ? Math.ceil(inversion_neta / incr) : 0

    // Ganancia a los 80 años — flujo acumulado con actualización anual por INPC.
    // El IMSS actualiza las pensiones cada febrero conforme al INPC (Art. 214 LSS)
    // y paga 13 mensualidades al año (12 + aguinaldo, Art. 218-A).
    //
    // Antes se usaba un factor plano de 1.54 tomado del Excel. Era incorrecto
    // aplicarlo a ambos flujos: el factor de acumulación depende de cuántos años
    // cobra cada uno, y el escenario con Mod. 40 suele retirarse más tarde que el
    // escenario base, por lo que sus horizontes NO son iguales.
    //
    //   flujo = mensual × 13 × Σ(1+i)^t  para t = 0..años-1
    //         = mensual × 13 × ((1+i)^años − 1) / i
    const PAGOS_POR_ANIO = 13
    const iINPC = (sys.inflacion_pension ?? sys.inflacion_uma ?? 4.5) / 100
    const flujoAcumulado = (mensual: number, anios: number) => {
      if (mensual <= 0 || anios <= 0) return 0
      const factor = iINPC === 0 ? anios : (Math.pow(1 + iINPC, anios) - 1) / iINPC
      return mensual * PAGOS_POR_ANIO * factor
    }
    const anosHasta80 = Math.max(0, 80 - edadR)
    const mesesHasta80 = Math.round(anosHasta80 * 12)
    const anosHasta80base = Math.max(0, 80 - Math.max(edadRetiro, datos.edad_actual || 60))
    const mesesHasta80base = Math.round(anosHasta80base * 12)
    const flujosCon = flujoAcumulado(pension, anosHasta80)
    const flujosSin = flujoAcumulado(pensionBase, anosHasta80base)
    const ganancia_a80 = flujosCon - flujosSin - inversion_neta
    const tasa_rendimiento = inversion_neta > 0 ? (ganancia_a80 / inversion_neta) * 100 : 0

    // Aguinaldo — mismo criterio que calcPensionLey73: MIN((básica+incr)/12, tope25UMAs)
    const resDetalle = calcPensionLey73(semTotal, sdiNuevo, edadR, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, anioR, datos.tiene_ayuda_asistencial)
    const aguinaldo_anual = resDetalle.aguinaldoAnual

    // Fechas de ingreso/baja — SAL. PROM MOD 40!E13, E14
    // Se usa formato local (no toISOString) para evitar bug de zona horaria que resta un día
    const fechaIngreso = new Date(anioI, 0, 1)
    const fechaBaja = new Date(fechaIngreso)
    fechaBaja.setMonth(fechaBaja.getMonth() + meses)
    const fmtFecha = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const fecha_ingreso_mod40 = fmtFecha(fechaIngreso)
    const fecha_baja_mod40 = fmtFecha(fechaBaja)
    // Edad al concluir Mod.40 — desde fecha_nacimiento hasta fecha_baja (igual que Excel)
    const edadAlConcluir = datos.fecha_nacimiento
      ? parseFloat(((fechaBaja.getTime() - new Date(datos.fecha_nacimiento).getTime()) / (365.25 * 86400000)).toFixed(3))
      : edadRetiro

    // Retroactivo con desglose completo — PAGO RETROACTIVO!E8-E12
    // Tasas configurables desde Configuración → Admin
    const pctActualizacion = (sys.pct_actualizacion_inpc ?? 7.27) / 100
    const pctRecargos = (sys.pct_recargos_retroactivo ?? 41.80) / 100
    const costo_retroactivo_base = costo_total // base antes de recargos
    const actualizaciones = costo_retroactivo_base * pctActualizacion
    const recargos = costo_retroactivo_base * pctRecargos
    const costo_retroactivo = costo_retroactivo_base + actualizaciones + recargos
    const recuperacion_afore_retro = costo_retroactivo * pctAfore
    const inversion_neta_retro = costo_retroactivo - recuperacion_afore_retro
    const roi_retro = incr > 0 ? Math.ceil(inversion_neta_retro / incr) : 0
    const ganancia_a80_retro = flujosCon - flujosSin - inversion_neta_retro
    const tasa_rendimiento_retro = inversion_neta_retro > 0 ? (ganancia_a80_retro / inversion_neta_retro) * 100 : 0

    // Financiamiento — participaciones correctas
    // El AFORE es una recuperación POSTERIOR, no reduce lo que se necesita hoy
    const pctBanco = (sys.pct_banco_regulado ?? 35.65) / 100
    const aportacion_banco = costo_retroactivo * pctBanco
    const aportacion_segundo_fondeo = costo_retroactivo - aportacion_banco  // 64.35% — sin descontar AFORE
    const cantidad_minima_afore = costo_retroactivo - aportacion_banco

    // Costo financiamiento banco regulado — editable por el asesor
    const duracion_tramite_meses = duracionTramiteMeses
    const tasa_banco_anual_val = (sys.tasa_banco_anual ?? 32.2) / 100
    const tasa_banco_mensual = tasa_banco_anual_val / 12
    const cuota_banco = tasa_banco_mensual > 0
      ? aportacion_banco * (tasa_banco_mensual * Math.pow(1 + tasa_banco_mensual, duracion_tramite_meses))
        / (Math.pow(1 + tasa_banco_mensual, duracion_tramite_meses) - 1)
      : aportacion_banco / duracion_tramite_meses
    const costo_financiamiento_banco = cuota_banco * duracion_tramite_meses - aportacion_banco
    const monto_maximo_pago = aportacion_banco + costo_financiamiento_banco

    // Descuento mensual basado en plazo del crédito (editable)
    const plazo_credito = plazoCredito
    const cuota_pago = tasa_banco_mensual > 0
      ? monto_maximo_pago * (tasa_banco_mensual * Math.pow(1 + tasa_banco_mensual, plazo_credito))
        / (Math.pow(1 + tasa_banco_mensual, plazo_credito) - 1)
      : monto_maximo_pago / plazo_credito

    const descuento_mensual = cuota_pago
    const pension_inmediata = pension - descuento_mensual
    const pension_al_liquidar = pension

    const flujos_financiados = pension_inmediata * Math.min(plazo_credito, mesesHasta80) +
      pension * Math.max(0, mesesHasta80 - plazo_credito)
    const ganancia_a80_financiado = flujos_financiados - flujosSin - inversion_neta_retro
    const roi_financiado = incr > 0 ? Math.ceil(inversion_neta_retro / incr) : 0
    const tasa_rendimiento_financiado = inversion_neta_retro > 0 ? (ganancia_a80_financiado / inversion_neta_retro) * 100 : 0

    return {
      costoMensual, costo_total, sdiNuevo, semTotal, semMod40, pension, pmg_aplica, incr, roi, edadAlConcluir,
      umaProyectada, tasaProyectada, sdiMod40,
      recuperacion_afore, inversion_neta, ganancia_a80, tasa_rendimiento, aguinaldo_anual,
      cuantia_basica_anual: resDetalle.cuantiaBasicaAnual,
      incrementos_anual: resDetalle.incrementosAnual,
      asignaciones_anual: resDetalle.asignacionesAnual,
      ayuda_asistencial_anual: resDetalle.ayudaAsistencialAnual,
      fecha_ingreso_mod40, fecha_baja_mod40,
      actualizaciones, recargos,
      costo_retroactivo, recuperacion_afore_retro, inversion_neta_retro,
      roi_retro, ganancia_a80_retro, tasa_rendimiento_retro,
      aportacion_banco, aportacion_segundo_fondeo, cantidad_minima_afore,
      descuento_mensual, pension_inmediata, pension_al_liquidar,
      roi_financiado, ganancia_a80_financiado, tasa_rendimiento_financiado,
      duracion_tramite_meses, plazo_segundo_fondeo: plazo_credito,
      costo_financiamiento_banco, costo_financiamiento_segundo: 0, monto_maximo_pago
    }
  }

  function recalcEscenarios() {
    const semBase = datos.semanas_totales - datos.semanas_descontadas
    const anioActual = new Date().getFullYear()
    // Año de inicio de Mod. 40: calculado desde la edad de ingreso editada por el asesor
    const edadIngresoDecimal = (edadIngresoAnios || Math.floor(datos.edad_actual || 57)) +
      (edadIngresoMeses || Math.round(((datos.edad_actual || 57) % 1) * 12)) / 12
    // Mínimo el año siguiente — nadie puede inscribirse a Mod.40 el mismo día (igual que Excel que usa ene del siguiente año)
    const anioInicioCalculado = Math.max(anioActual + 1, anioActual + Math.round((edadIngresoDecimal - (datos.edad_actual || 57)) * 12 / 12))
    const mesesHastaInicioMod40 = Math.max(0, (anioInicioCalculado - anioActual) * 12)
    // Semanas naturales antes de Mod.40 — días calendarios exactos, no meses × 4.33
    const hoy = new Date()
    const fechaInicioMod40Natural = new Date(anioInicioCalculado, 0, 1)
    const diasNaturales = Math.max(0, (fechaInicioMod40Natural.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
    const semanasNaturalesAntesM40 = diasNaturales / 7
    const sem = semBase + semanasNaturalesAntesM40
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
      edad_retiro: r.edadAlConcluir ?? edadRetiro,
      semanas_finales: r.semTotal,
      nuevo_sdi_250: r.sdiNuevo,
      recuperacion_afore: r.recuperacion_afore,
      inversion_neta: r.inversion_neta,
      ganancia_a80: r.ganancia_a80,
      tasa_rendimiento: r.tasa_rendimiento,
      aguinaldo_anual: r.aguinaldo_anual,
      cuantia_basica_anual: r.cuantia_basica_anual,
      incrementos_anual: r.incrementos_anual,
      asignaciones_anual: r.asignaciones_anual,
      ayuda_asistencial_anual: r.ayuda_asistencial_anual,
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
      roi: r.roi, edadAlConcluir: r.edadAlConcluir,
      pension_sin_mod40: pensionBase, nueva_pension: r.pension,
      cuota_banco: r.monto_maximo_pago, nueva_pension_inmediata: r.pension_inmediata,
    })

    // Edad de retiro efectiva — mínimo legal: 60 años (cesantía en edad avanzada)
    const edadRetiroEfectiva = Math.max(edadRetiro, 60)

    // E0: Sin modalidad — escenario base con campos vacíos/cero para los de Mod40
    const resBase = calcPensionLey73(sem, sdiBase, edadRetiroEfectiva, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, undefined, datos.tiene_ayuda_asistencial)
    const escs: Escenario[] = [{
      id: 'e0', label: 'Sin modalidad', descripcion: 'Pensión base con semanas y SDI actuales',
      mod40_meses: 0, mod40_umas: 0, pension_base: pensionBase,
      pension_mensual: pensionBase, costo_total: 0, costo_mensual_mod40: 0,
      incremento_vs_base: 0, roi_meses: 0, recomendado: false, pmg_aplica: pmgAplicaBase,
      fecha_ingreso_mod40: '', fecha_baja_mod40: '', edad_retiro: edadRetiroEfectiva,
      semanas_finales: sem, nuevo_sdi_250: sdiBase, recuperacion_afore: 0, inversion_neta: 0,
      ganancia_a80: 0, tasa_rendimiento: 0, aguinaldo_anual: resBase.aguinaldoAnual,
      cuantia_basica_anual: resBase.cuantiaBasicaAnual,
      incrementos_anual: resBase.incrementosAnual,
      asignaciones_anual: resBase.asignacionesAnual,
      ayuda_asistencial_anual: resBase.ayudaAsistencialAnual,
      costo_retroactivo: 0, recuperacion_afore_retro: 0, inversion_neta_retro: 0,
      roi_retro: 0, ganancia_a80_retro: 0, tasa_rendimiento_retro: 0,
      aportacion_banco: 0, aportacion_segundo_fondeo: 0, cantidad_minima_afore: 0,
      descuento_mensual: 0, pension_inmediata: pensionBase, pension_al_liquidar: pensionBase,
      roi_financiado: 0, ganancia_a80_financiado: 0, tasa_rendimiento_financiado: 0,
      semanas_mod40: 0, sdi_mod40: 0, actualizaciones: 0, recargos: 0,
      duracion_tramite_meses: 60, plazo_segundo_fondeo: 12,
      costo_financiamiento_banco: 0, costo_financiamiento_segundo: 0, monto_maximo_pago: 0,
      roi: 0, edadAlConcluir: edadRetiroEfectiva, pension_sin_mod40: pensionBase,
      nueva_pension: pensionBase, cuota_banco: 0, nueva_pension_inmediata: pensionBase,
    }]

    // E1: Modalidad 10 · 12 meses
    const TASA_M10 = (sys.tasa_m10 ?? 22) / 100
    const sdiM10 = mod40Umas * sys.UMA_DIARIA
    // Semanas M10 con días calendarios exactos (igual que Mod.40)
    const fechaInicioM10 = new Date()
    const fechaBajaM10 = new Date(fechaInicioM10)
    fechaBajaM10.setMonth(fechaBajaM10.getMonth() + 12)
    const diasM10 = (fechaBajaM10.getTime() - fechaInicioM10.getTime()) / (1000 * 60 * 60 * 24)
    const semM10Real = diasM10 / 7 + 1 / 7
    const semM10 = Math.min(semM10Real, 250)
    const semEfM10 = Math.min(sem, 250 - semM10)
    const sdiNuevoM10 = (sdiBase * semEfM10 + sdiM10 * semM10) / (semEfM10 + semM10)
    const { monto: pensionM10, pmg_aplica: pmgAplicaM10 } = calcPensionLey73(sem + semM10Real, sdiNuevoM10, 65, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, undefined, datos.tiene_ayuda_asistencial)
    // Costo M10 con días reales de cada mes (no días fijos 30.4)
    let costoM10Total = 0
    for (let m = 0; m < 12; m++) {
      const fechaMesM10 = new Date(fechaInicioM10)
      fechaMesM10.setMonth(fechaMesM10.getMonth() + m)
      const diasMesM10 = new Date(fechaMesM10.getFullYear(), fechaMesM10.getMonth() + 1, 0).getDate()
      const diasAnioM10 = fechaMesM10.getFullYear() % 4 === 0 ? 366 : 365
      costoM10Total += sdiM10 * TASA_M10 * diasMesM10 / diasAnioM10 * 30.4167
    }
    const costoM10 = costoM10Total / 12
    const r0: ReturnType<typeof calcEscenarioMod40> = {
      costoMensual: costoM10, costo_total: costoM10 * 12, sdiNuevo: sdiNuevoM10,
      semTotal: sem + semM10Real, semMod40: semM10Real, sdiMod40: sdiM10, pension: pensionM10, pmg_aplica: pmgAplicaM10,
      incr: pensionM10 - pensionBase, roi: 0, umaProyectada: sys.UMA_DIARIA,
      tasaProyectada: TASA_M10,
      recuperacion_afore: costoM10 * 12 * (sys.pct_afore_mod40 ?? 20) / 100,
      inversion_neta: costoM10 * 12 * (1 - (sys.pct_afore_mod40 ?? 20) / 100),
      ganancia_a80: 0, tasa_rendimiento: 0, aguinaldo_anual: calcPensionLey73(sem + semM10Real, sdiNuevoM10, 65, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, undefined, datos.tiene_ayuda_asistencial).aguinaldoAnual,
      fecha_ingreso_mod40: '', fecha_baja_mod40: '',
      actualizaciones: 0, recargos: 0,
      costo_retroactivo: 0, recuperacion_afore_retro: 0, inversion_neta_retro: 0,
      roi_retro: 0, ganancia_a80_retro: 0, tasa_rendimiento_retro: 0,
      aportacion_banco: 0, aportacion_segundo_fondeo: 0, cantidad_minima_afore: 0,
      descuento_mensual: 0, pension_inmediata: pensionM10, pension_al_liquidar: pensionM10,
      roi_financiado: 0, ganancia_a80_financiado: 0, tasa_rendimiento_financiado: 0,
      duracion_tramite_meses: 60, plazo_segundo_fondeo: 12,
      costo_financiamiento_banco: 0, costo_financiamiento_segundo: 0, monto_maximo_pago: 0,
      edadAlConcluir: 65,
      cuantia_basica_anual: 0, incrementos_anual: 0, asignaciones_anual: 0, ayuda_asistencial_anual: 0,
    }
    escs.push(makeEsc('e_m10', 'Modalidad 10 · 12 meses', 'Cobertura integral + semanas (independiente)', 12, mod40Umas, r0))

    // E2–E4: Modalidad 40 a distintos plazos
    const mesesDisp = Math.max(12, (edadRetiro - (datos.edad_actual || 60)) * 12)
    for (const [meses, umas, label, desc, esOpt] of [
      [Math.min(24, mesesDisp), mod40Umas * 0.6, `Mod 40 · ${Math.min(24, mesesDisp)} meses · ${Math.round(mod40Umas * 0.6)} UMAs`, 'Inversión conservadora', false],
      [Math.min(36, mesesDisp), mod40Umas * 0.8, `Mod 40 · ${Math.min(36, mesesDisp)} meses · ${Math.round(mod40Umas * 0.8)} UMAs`, 'Estrategia media', false],
      [Math.min(mod40Meses, mesesDisp), mod40Umas, `Mod 40 · ${Math.min(mod40Meses, mesesDisp)} meses · ${mod40Umas} UMAs`, 'Estrategia configurada', true],
    ] as [number, number, string, string, boolean][]) {
      const r = calcEscenarioMod40(sem, sdiBase, umas, meses, pensionBase, Math.max(edadRetiro, 60), anioInicioCalculado)
      escs.push(makeEsc(`e_m40_${meses}`, label, desc, meses, umas, r, esOpt))
    }

    // E5: Simulación libre
    if (simulacionLibre) {
      const r = calcEscenarioMod40(sem, sdiBase, simUmas, simMeses, pensionBase, Math.max(edadRetiro, 60), anioInicioCalculado)
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
  async function exportarPDF(sofiaOutputArg?: any) {
    if (!diagGuardadoId) {
      setMensaje('⚠️ Primero guarda el diagnóstico antes de generar el PDF')
      setTimeout(() => setMensaje(''), 4000)
      return
    }
    const esBorrador = estatus === 'borrador'
    const idxToUse = escElegidoIdx >= 0 ? escElegidoIdx : escSelIdx
    const escToUse = escenarios[idxToUse] ?? escenarios.find((e: any) => e.recomendado) ?? escenarios[0]
    if (!escToUse) { setMensaje('⚠️ Selecciona un escenario antes de generar el PDF'); setTimeout(() => setMensaje(''), 4000); return }
    try {
      setMensaje('⏳ Generando PDF...')
      const sfOutput = sofiaOutputArg ?? sofiaOutput
      const elemento = (
        <DiagnosticoPDF
          datos={datos}
          periodos={periodos}
          sdiPromedio={sdiPromedio}
          escenarios={escenarios}
          escSelIdx={idxToUse}
          logoUrl={asesorPerfil?.logo_url ?? undefined}
          razonSocial={asesorPerfil?.razon_social ?? undefined}
          asesorNombre={asesorPerfil?.nombre ?? undefined}
          encabezadoColor={asesorPerfil?.encabezado_color ?? undefined}
          encabezadoTitulo={asesorPerfil?.encabezado_titulo ?? undefined}
          esBorrador={esBorrador}
          umaDiaria={sys.UMA_DIARIA}
          pdfConfig={pdfConfig}
          sofiaOutput={sfOutput}
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

  // ── Restaurar borrador ──────────────────────────────────────────
  async function restaurarBorrador(diagId: string, cId: string) {
    const { data: diag } = await supabase.from('diagnosticos').select('*').eq('id', diagId).single()
    if (!diag) return
    setClienteId(cId)
    setDiagGuardadoId(diag.id)
    setEstatus(diag.estatus ?? 'borrador')
    const p = diag.params_json
    if (p) {
      if (p.datos) setDatos(p.datos)
      if (p.periodos && p.periodos.length > 0) {
        setPeriodos(p.periodos)
        setPeriodosCompletos(p.periodos)
        const sdi = p.sdiPromedio && p.sdiPromedio > 0
          ? p.sdiPromedio
          : p.periodos.reduce((s: number, per: any) => s + (per.sdi || 0) * (per.semanas || 0), 0) / 250
        setSdiPromedio(sdi)
      }
      if (p.mod40Umas) setMod40Umas(p.mod40Umas)
      if (p.mod40Meses) {
        setMod40Meses(p.mod40Meses)
        setMod40AniosUI(Math.floor(p.mod40Meses / 12))
        setMod40MesesUI(p.mod40Meses % 12)
      }
      if (p.ingresoObjetivo) setIngresoObjetivo(p.ingresoObjetivo)
      if (p.simulacionLibre) setSimulacionLibre(p.simulacionLibre)
      if (p.simUmas) setSimUmas(p.simUmas)
      if (p.simMeses) setSimMeses(p.simMeses)
      if (typeof p.escElegidoIdx === 'number') setEscElegidoIdx(p.escElegidoIdx)
      if (p.fechaUltimaCot) setFechaUltimaCot(p.fechaUltimaCot)
      if (p.edadRetiro) setEdadRetiro(p.edadRetiro)
      if (p.anioInicioTramite) setAnioInicioTramite(p.anioInicioTramite)
      if (p.datos?.edad_actual) {
        const anios = Math.floor(p.datos.edad_actual)
        const meses = Math.round((p.datos.edad_actual % 1) * 12)
        setEdadIngresoAnios(anios); setEdadIngresoMeses(meses)
        setDefaultEdadAnios(anios); setDefaultEdadMeses(meses)
      }
    }
    if (diag.analisis_narrativo) {
      try {
        const parsed = JSON.parse(diag.analisis_narrativo)
        if (Array.isArray(parsed)) { setAnalisis(parsed); setModoAnalisis('ia') }
        else if (typeof parsed === 'string') { setAnalisisManual(parsed); setModoAnalisis('manual') }
      } catch(e) {}
    }
    setShowContinuarDiag(false)
    setDiagExistente(null)
    setPendingClienteId('')
    setMostrarCaratula(false)
    setTab(6)
  }
  async function generarAnalisisIA() {
    console.log('generarAnalisisIA called', { escSel, sdiPromedio, escenarios: escenarios.length })
    const escUsar = escSel ?? escenarios[0]
    if (!escUsar && sdiPromedio <= 0) {
      console.log('returning early — no escUsar and no sdiPromedio')
      return
    }
    setGenerandoAnalisis(true)
    try {
      const clienteObj = clientes.find(c => c.id === clienteId)
      const esc0 = escenarios[0]
      const escM10 = escenarios.find(e => e.id === 'e_m10')
      const escM40 = escenarios.find(e => e.recomendado) ?? escenarios.find(e => e.id.startsWith('e_m40')) ?? escenarios[escenarios.length - 1]
      const res = await fetch('/api/analisis-pensional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asesor_id: userId,
          cliente_id: clienteId || null,
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
          inflacion: sys.inflacion_uma ?? 4,
          sys,
          e1: { pension_real: esc0?.pension_mensual ?? 0 },
          e2: { pension_real: escM10?.pension_mensual ?? esc0?.pension_mensual ?? 0 },
          e3: { pension_real: escM40?.pension_mensual ?? esc0?.pension_mensual ?? 0 },
          e4: { pension_real: escUsar?.pension_mensual ?? 0 },
          escRecomendado: escUsar?.label ?? 'Sin Modalidad 40',
          mod10Activo: !!escM10,
          mod40Activo: (escUsar?.mod40_meses ?? 0) > 0,
          mod40UMAs: escUsar?.mod40_umas ?? 0,
          mod40Anios: (escUsar?.mod40_meses ?? 0) / 12,
          mod40Costo: escUsar?.costo_mensual_mod40 ?? 0,
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
        setModoAnalisis('ia')
      } else {
        console.error('Analisis error:', data.error, data.raw)
        setMensaje(`Error al generar el análisis: ${data.error}. Raw: ${data.raw ?? ''}`)
        setTimeout(() => setMensaje(''), 6000)
      }
    } catch (e) {
      console.error('generarAnalisisIA catch:', e)
      setMensaje('Error: ' + (e instanceof Error ? e.message : String(e)))
      setTimeout(() => setMensaje(''), 5000)
    }
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
    if (!userId) return
    if (!clienteId) {
      setMensaje('⚠️ Vincula un cliente antes de guardar el diagnóstico')
      setTimeout(() => setMensaje(''), 4000)
      return
    }
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
      analisis_narrativo: modoAnalisis === 'ia' && analisis.length > 0
        ? JSON.stringify(analisis)
        : analisisManual
        ? JSON.stringify(analisisManual)
        : null,
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
    if (diagGuardadoId) {
      // Actualizar borrador existente (no crear uno nuevo)
      const { error } = await supabase.from('diagnosticos').update({
        ...payload,
        estatus: nuevoEstatus,
        fecha_autorizacion: nuevoEstatus === 'autorizado' ? new Date().toISOString() : null,
      }).eq('id', diagGuardadoId)
      if (error) {
        console.error('Error al actualizar diagnóstico:', error)
        setMensaje('❌ Error al guardar: ' + error.message)
        setTimeout(() => setMensaje(''), 6000)
      } else {
        setEstatus(nuevoEstatus)
        setMensaje(nuevoEstatus === 'borrador' ? '💾 Borrador actualizado' : '✅ Diagnóstico autorizado')
        setTimeout(() => setMensaje(''), 4000)
      }
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

        // ── Auto-crear financiamiento si el diagnóstico tiene financiamiento bancario ──
        if (nuevoEstatus === 'autorizado') {
          const escRec = escenarios.find((e: any) => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (escRec && escRec.aportacion_banco > 0) {
            await supabase.from('financiamientos').insert({
              asesor_id: userId,
              cliente_id: clienteId,
              diagnostico_id: data.id,
              monto_total: escRec.aportacion_banco,
              plazo_meses: escRec.duracion_tramite_meses || 60,
              cuota_mensual: escRec.cuota_banco || 0,
              tasa_anual: sys.tasa_banco_anual || 32.2,
              tipo: 'banco',
              comision_pct: 0,
              comision_monto: 0,
              estatus: 'pendiente',
              pension_sin_mod40: escRec.pension_base || 0,
              pension_con_mod40: escRec.pension_mensual || 0,
              umas_registradas: mod40Umas,
              meses_mod40: mod40Meses,
            })
          }
        }

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
                    <p style={{ fontSize: '13px', color: '#1E293B', margin: 0, lineHeight: 1.5 }}>{p.mensaje}</p>
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
              <h3 style={{ fontSize: '16px', fontWeight: '700' as const, color: '#334E7B', margin: '0 0 10px', textAlign: 'center' as const }}>
                {esAutorizacion ? '¡Diagnóstico autorizado!' : '¡Diagnóstico guardado!'}
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px', lineHeight: 1.6, textAlign: 'center' as const }}>
                <strong>{clienteActual?.nombre}</strong> está en <strong>{ETAPA_LABELS[clienteActual?.etapa_kanban ?? '']}</strong>.
                ¿Deseas moverlo a <strong style={{ color: '#2E7D5A' }}>{ETAPA_LABELS[etapaSugerida]}</strong>?
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowSugerirEtapa(false)}
                  style={{ flex: 1, padding: '9px', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#F4F6F9', color: '#64748b', fontSize: '13px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Ahora no
                </button>
                <button onClick={() => moverEtapa(clienteId, etapaSugerida)}
                  style={{ flex: 2, padding: '9px', border: 'none', borderRadius: '8px', background: '#2E7D5A', color: 'white', fontSize: '13px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
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

      {/* ── Modal: ¿Continuar diagnóstico existente o nuevo? ── */}
      {showContinuarDiag && diagExistente && (
        <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ background: AZUL, padding: '16px 20px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700' as const, color: 'white', margin: 0 }}>📋 Este cliente tiene un diagnóstico en progreso</p>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: '#1E293B', margin: '0 0 6px', lineHeight: 1.6 }}>
                Guardado el {new Date(diagExistente.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}.
              </p>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 20px', lineHeight: 1.6 }}>
                ¿Deseas continuar donde lo dejaste, o iniciar un diagnóstico nuevo? Si inicias uno nuevo tendrás que cargar la constancia de nuevo.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                <button onClick={() => restaurarBorrador(diagExistente.id, pendingClienteId)}
                  style={{ padding: '12px', background: AZUL, color: 'white', border: 'none', fontSize: '13px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✓ Continuar el diagnóstico guardado
                </button>
                <button onClick={() => {
                  setClienteId(pendingClienteId)
                  setDiagGuardadoId(null)
                  setEstatus('borrador')
                  setAnalisis([])
                  setDiagExistente(null)
                  setPendingClienteId('')
                  setShowContinuarDiag(false)
                }}
                  style={{ padding: '12px', background: '#F8FAFC', color: '#374151', border: '1px solid #E5E7EB', fontSize: '13px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Iniciar diagnóstico nuevo
                </button>
                <button onClick={() => { setShowContinuarDiag(false); setDiagExistente(null); setPendingClienteId('') }}
                  style={{ padding: '8px', background: 'none', color: '#94A3B8', border: 'none', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal confirmación cambio de cliente ── */}
      {showConfirmCambio && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' as const, color: '#334E7B', margin: '0 0 10px' }}>⚠️ ¿Cambiar de cliente?</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.6 }}>
              {diagGuardadoId
                ? 'El diagnóstico ya fue guardado. Puedes cambiar de cliente sin perder nada.'
                : 'El análisis generado y los datos actuales se perderán si no has guardado el diagnóstico.'}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowConfirmCambio(false); setPendingClienteId('') }}
                style={{ flex: 1, padding: '9px', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#F4F6F9', color: '#64748b', fontSize: '13px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                style={{ flex: 2, padding: '9px', border: 'none', borderRadius: '8px', background: '#334E7B', color: 'white', fontSize: '13px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                <tr style={{ background: '#F4F6F9' }}>
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
                <tr style={{ background: '#F4F6F9' }}>
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
                    {!clienteId && <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#94A3B8' }}>Requerido</p>}
                  </div>
                  {clienteId && (
                    <button onClick={() => setClienteId('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94A3B8', padding: '0 2px' }}>✕</button>
                  )}
                </div>
                {!clienteId && (
                  <button onClick={() => setShowClienteModal(true)}
                    style={{ width: '100%', padding: '9px', background: 'white', color: AZUL, border: `1.5px solid ${AZUL}`, cursor: 'pointer', fontSize: '13px', fontWeight: '600' as const, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    👤 Seleccionar cliente existente
                  </button>
                )}
              </div>

              {/* Paso 2: Modo de entrada */}
              <div style={{ border: `2px solid ${datos.semanas_totales > 0 ? VERDE : '#E5E7EB'}`, padding: '14px 16px', background: datos.semanas_totales > 0 ? '#F0FDF4' : 'white', borderRadius: '10px', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: datos.semanas_totales > 0 ? '0' : '12px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: datos.semanas_totales > 0 ? VERDE : '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px', fontWeight: '700' as const, color: 'white' }}>
                    {datos.semanas_totales > 0 ? '✓' : '2'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: '700' as const, color: datos.semanas_totales > 0 ? VERDE : '#374151' }}>
                      {datos.semanas_totales > 0 ? `Datos cargados — ${datos.semanas_totales} semanas` : 'Datos del trabajador'}
                    </p>
                    {datos.semanas_totales === 0 && !modoEntrada && <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#94A3B8' }}>¿Cómo quieres ingresar los datos?</p>}
                  </div>
                  {modoEntrada && datos.semanas_totales === 0 && (
                    <button onClick={() => setModoEntrada(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#94A3B8', padding: '2px 4px' }}>← Cambiar</button>
                  )}
                </div>

                {datos.semanas_totales === 0 && (
                  <>
                    {/* Pantalla A: Selección de modo */}
                    {!modoEntrada && (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                        <button onClick={() => setModoEntrada('auto')}
                          style={{ width: '100%', padding: '14px 16px', background: '#EEF2F8', border: `1.5px solid ${AZUL}`, borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' as const }}>
                          <span style={{ fontSize: '24px' }}>📎</span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '700' as const, color: AZUL }}>Cargar constancia PDF</div>
                            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Sofía IA extrae los datos automáticamente</div>
                          </div>
                          <span style={{ marginLeft: 'auto', fontSize: '18px', color: AZUL }}>→</span>
                        </button>
                        <button onClick={() => setModoEntrada('manual')}
                          style={{ width: '100%', padding: '14px 16px', background: 'white', border: '1.5px solid #E2E8F0', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' as const }}>
                          <span style={{ fontSize: '24px' }}>✏️</span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151' }}>Captura manual</div>
                            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Ingresa los datos del NSS y semanas tú mismo</div>
                          </div>
                          <span style={{ marginLeft: 'auto', fontSize: '18px', color: '#CBD5E1' }}>→</span>
                        </button>
                      </div>
                    )}

                    {/* Pantalla B: Carga automática PDF */}
                    {modoEntrada === 'auto' && (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
                        <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#64748B' }}>
                          Selecciona el PDF de la constancia oficial del IMSS (SISEC). Sofía IA leerá y extraerá los datos automáticamente.
                        </p>
                        <label style={{ width: '100%', padding: '13px', background: extracting ? '#E2E8F0' : AZUL, color: 'white', cursor: extracting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxSizing: 'border-box' as const, opacity: extracting ? 0.8 : 1, borderRadius: '8px' }}>
                          {extracting ? '⏳ Extrayendo datos...' : '📎 Seleccionar archivo PDF'}
                          <input type="file" accept=".pdf" style={{ display: 'none' }} disabled={extracting} onChange={e => {
                            const f = e.target.files?.[0]
                            if (f) extraerPDF(f)
                          }} />
                        </label>
                        {extracting && (
                          <div style={{ background: '#EEF2F8', borderRadius: '8px', padding: '10px 12px', fontSize: '11px', color: AZUL }}>
                            Sofía IA está leyendo el documento... esto toma entre 10 y 30 segundos.
                          </div>
                        )}
                        <p style={{ margin: 0, fontSize: '10px', color: '#94A3B8' }}>Solo archivos PDF del portal oficial del IMSS. No funciona con fotos ni escaneos.</p>
                      </div>
                    )}

                    {/* Pantalla C: Captura manual */}
                    {modoEntrada === 'manual' && (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
                        <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#64748B' }}>
                          Captura los datos principales de la constancia. Puedes completar el resto en el Tab 1.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: '10px', fontWeight: '600' as const, color: '#94A3B8', display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Nombre del trabajador</label>
                            <input type="text" placeholder="Nombre completo"
                              onChange={e => setDatos(prev => ({ ...prev, nombre_trabajador: e.target.value }))}
                              style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: '600' as const, color: '#94A3B8', display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Semanas cotizadas *</label>
                            <input type="number" placeholder="Ej. 850" min={0} max={2000}
                              onChange={e => { const val = Number(e.target.value); if (val > 0) setDatos(prev => ({ ...prev, semanas_totales: val })) }}
                              style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: '600' as const, color: '#94A3B8', display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>NSS</label>
                            <input type="text" placeholder="11 dígitos"
                              onChange={e => setDatos(prev => ({ ...prev, nss: e.target.value }))}
                              style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: '600' as const, color: '#94A3B8', display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>SDI actual ($/día)</label>
                            <input type="number" placeholder="Ej. 450.00" min={0}
                              onChange={e => { const val = Number(e.target.value); if (val > 0) setDatos(prev => ({ ...prev, sdi_actual: val })) }}
                              style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: '10px', color: '#94A3B8' }}>* Las semanas son requeridas para habilitar el botón Continuar.</p>
                      </div>
                    )}
                  </>
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
              <a href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px', color: '#94A3B8', border: '1px solid #E5E7EB', fontSize: '12px', textDecoration: 'none' }}>
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
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94A3B8' }}>Selecciona un Prospecto o cliente en Diagnóstico</p>
              </div>
              <button onClick={() => { setShowClienteModal(false); setBuscarCliente('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#94A3B8', lineHeight: 1, padding: '0 4px' }}>✕</button>
            </div>

            {/* Buscador */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>🔍</span>
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
                  onClick={async () => {
                    // Verificar si el cliente ya tiene un diagnóstico en borrador
                    const { data: diagsPrevios } = await supabase
                      .from('diagnosticos')
                      .select('id, created_at')
                      .eq('cliente_id', c.id)
                      .eq('estatus', 'borrador')
                      .order('created_at', { ascending: false })
                      .limit(1)
                    if (diagsPrevios && diagsPrevios.length > 0) {
                      setPendingClienteId(c.id)
                      setDiagExistente({ id: diagsPrevios[0].id, fecha: diagsPrevios[0].created_at })
                      setShowContinuarDiag(true)
                      setBuscarCliente('')
                      setShowClienteModal(false)
                    } else {
                      setClienteId(c.id); setBuscarCliente(''); setShowClienteModal(false)
                    }
                  }}
                  style={{ width: '100%', padding: '11px 16px', background: 'white', border: 'none', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '34px', height: '34px', background: '#EEF2F8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700' as const, color: AZUL }}>
                    {c.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600' as const, color: '#1e293b' }}>{c.nombre}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>{c.telefono ?? ''}</div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: '700' as const, padding: '3px 10px', background: c.etapa_kanban === 'diagnostico' ? '#DCFCE7' : '#EEF2F8', color: c.etapa_kanban === 'diagnostico' ? '#15803D' : AZUL, flexShrink: 0 }}>
                    {c.etapa_kanban === 'diagnostico' ? 'Diagnóstico' : 'Prospecto'}
                  </span>
                </button>
              ))}
              {clientes.filter(c => c.nombre.toLowerCase().includes(buscarCliente.toLowerCase())).length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center' as const, color: '#94A3B8', fontSize: '13px' }}>Sin resultados</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ LAYOUT PRINCIPAL: 2 columnas ══ */}
      {(!mostrarCaratula || clienteId) && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── Panel único dinámico (ocupa todo el ancho) ── */}
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
                    style={{ padding: '5px 10px', background: showGuia ? '#EEF2F8' : 'white', border: '1px solid #E5E7EB', cursor: 'pointer', fontSize: '11px', fontWeight: '600' as const, color: '#334E7B', fontFamily: 'inherit' }}
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
                <div style={{ background: '#334E7B', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700' as const, color: 'white', margin: 0 }}>📖 Glosario de Términos</p>
                  <button onClick={() => setShowGuia(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ padding: '12px' }}>
                  {Object.entries(GLOSARIO).map(([id, g]) => (
                    <div key={id} style={{ padding: '10px 12px', marginBottom: '6px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderLeft: '3px solid #1B3A6B' }}>
                      <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#334E7B', margin: '0 0 4px' }}>{g.titulo}</p>
                      <p style={{ fontSize: '13px', color: '#1E293B', margin: '0 0 4px', lineHeight: 1.5 }}>{g.desc}</p>
                      {g.ejemplo && <p style={{ fontSize: '10.5px', color: '#94A3B8', margin: 0, fontStyle: 'italic' }}>Ej: {g.ejemplo}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Navegación superior — 4 grupos con dropdown ── */}
            {(() => {
              const grupos = [
                { label: 'Datos generales', tiIcon: 'ti-clipboard-list', tabs: [-1],       color: '#64748B', nombres: ['Resumen del trabajador'] },
                { label: 'El cliente',       tiIcon: 'ti-user',           tabs: [0,1,2],    color: AZUL,      nombres: ['Datos y perfil','Cuantías anuales','Salario Mod.40'] },
                { label: 'La pensión',       tiIcon: 'ti-coin',           tabs: [5,8],      color: VERDE,     nombres: ['Importe de pensión','Escenarios'] },
                { label: 'La inversión',     tiIcon: 'ti-chart-bar',      tabs: [3,6,10],   color: '#B45309', nombres: ['SDI 250 sem.','Inversión y proyecto','Financiamiento'] },
                { label: 'Modalidad 10',     tiIcon: 'ti-shield-plus',    tabs: [12],       color: '#0891B2', nombres: ['Vía alterna'] },
                { label: 'El entregable',    tiIcon: 'ti-file-text',      tabs: [11],       color: '#7C3AED', nombres: ['Análisis y PDF'] },
              ]
              const grupoActivo = grupos.findIndex(g => g.tabs.includes(tab))
              const todosLosTabs = grupos.flatMap(g => g.tabs)
              return (
                <div className="kse-riel" style={{ background: '#F4F6F9', borderBottom: `1px solid ${BORDE}`, flexShrink: 0, position: 'relative' as const, zIndex: 20, padding: '6px 8px' }}>
                  <style>{`
                    /* Responsivo del riel: con 6 grupos y flex:1 las etiquetas
                       se vuelven ilegibles en tablet y movil. Pasa a franja
                       desplazable con ancho minimo por grupo. */
                    @media (max-width: 1100px) {
                      .kse-riel { overflow-x: auto; -webkit-overflow-scrolling: touch; }
                      .kse-riel::-webkit-scrollbar { height: 3px; }
                      .kse-riel::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
                      .kse-riel-track { min-width: max-content; }
                      .kse-riel-item { flex: 0 0 auto !important; min-width: 112px; }
                    }
                    @media (max-width: 760px) {
                      .kse-riel-item { min-width: 94px; }
                    }
                  `}</style>
                  <div className="kse-riel-track" style={{ display: 'flex', gap: '6px' }}>
                    {grupos.map((g, gi) => {
                      const activo = gi === grupoActivo
                      const abierto = menuAbierto === gi
                      const completado = g.tabs.every(t => t < tab)
                      return (
                        <div key={gi} className="kse-riel-item" style={{ flex: 1, position: 'relative' as const }}>
                          <button
                            onClick={() => setMenuAbierto(abierto ? null : gi)}
                            style={{ width: '100%', padding: '10px 8px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: activo ? AZUL : 'white', fontFamily: 'inherit', transition: 'all 0.15s', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '4px', boxShadow: activo ? '0 2px 8px rgba(51,78,123,0.3)' : '0 1px 2px rgba(0,0,0,0.06)' }}>
                            {/* Ícono grande */}
                            <span style={{ fontSize: '22px', lineHeight: 1, display: 'block' }}>
                              <i className={`ti ${g.tiIcon}`} style={{ color: activo ? 'white' : '#94A3B8', fontSize: '22px' }} />
                            </span>
                            {/* Label */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ fontSize: '11px', fontWeight: activo ? '700' : '500', color: activo ? 'white' : '#9CA3AF', whiteSpace: 'nowrap' as const }}>{g.label}</span>
                              <span style={{ fontSize: '9px', color: activo ? 'rgba(255,255,255,0.7)' : '#CBD5E1', display: 'inline-block', transform: abierto ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
                            </div>
                            {/* Indicador completado */}
                            {completado && !activo && (
                              <span style={{ position: 'absolute' as const, top: '6px', right: '8px', fontSize: '9px', color: VERDE, fontWeight: '700' }}>✓</span>
                            )}
                          </button>

                          {/* Dropdown */}
                          {abierto && (
                            <div style={{ position: 'absolute' as const, top: 'calc(100% + 4px)', left: 0, minWidth: '210px', background: 'white', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: `1px solid ${BORDE}`, zIndex: 100, overflow: 'hidden' }}>
                              <div style={{ background: AZUL, padding: '8px 14px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: 'white', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <i className={`ti ${g.tiIcon}`} style={{ fontSize: '13px' }} /> {g.label}
                                </span>
                              </div>
                              {g.tabs.map((tabIdx, si) => {
                                const esCurrent = tab === tabIdx
                                const esCompletado = tabIdx < tab
                                return (
                                  <button key={tabIdx}
                                    onClick={() => { setTab(tabIdx); setMenuAbierto(null) }}
                                    style={{ width: '100%', padding: '10px 14px', border: 'none', borderBottom: `1px solid ${BORDE}`, cursor: 'pointer', background: esCurrent ? '#EEF2F8' : 'white', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' as const, transition: 'background 0.1s' }}>
                                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', background: esCompletado ? VERDE : esCurrent ? AZUL : '#F1F5F9', color: esCompletado || esCurrent ? 'white' : '#94A3B8' }}>
                                      {esCompletado ? '✓' : si + 1}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: '12px', fontWeight: esCurrent ? '700' : '500', color: esCurrent ? AZUL : esCompletado ? '#374151' : '#64748B' }}>{g.nombres[si]}</div>
                                      {esCurrent && <div style={{ fontSize: '10px', color: AZUL, marginTop: '1px' }}>← Estás aquí</div>}
                                    </div>
                                    {esCurrent && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: AZUL, flexShrink: 0 }} />}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {menuAbierto !== null && (
                    <div onClick={() => setMenuAbierto(null)} style={{ position: 'fixed' as const, inset: 0, zIndex: 19 }} />
                  )}

                  {/* Opciones adicionales — regímenes alternativos */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#94A3B8', whiteSpace: 'nowrap' as const }}>Opciones:</span>
                    <button onClick={() => setTab(12)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${tab === 12 ? '#0891B2' : '#E2E8F0'}`, background: tab === 12 ? '#ECFEFF' : 'white', color: tab === 12 ? '#0891B2' : '#64748B', fontSize: '11px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
                      <i className="ti ti-droplet" style={{ fontSize: '12px', marginRight: '4px' }} />Mod. 10 / Ley 97
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* ── KPI bar semántica — puntos de color indican origen del dato ── */}
            <div style={{ display: 'flex', background: 'white', borderBottom: `1px solid ${BORDE}`, flexShrink: 0, overflowX: 'auto' }}>
              {[
                { label: 'Semanas netas', value: datos.semanas_totales > 0 ? (datos.semanas_totales - datos.semanas_descontadas).toLocaleString() : '—', tipo: 'imss', accent: (datos.semanas_totales - datos.semanas_descontadas) >= 500 ? VERDE : AZUL },
                { label: 'Régimen', value: datos.ley ? 'Ley ' + datos.ley : '—', tipo: 'imss', accent: AZUL },
                { label: 'SDI promedio', value: sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—', tipo: 'result', accent: '#7C3AED' },
                { label: 'Sem. faltantes', value: datos.semanas_totales > 0 ? String(Math.max(0, 500 - (datos.semanas_totales - datos.semanas_descontadas))) : '—', tipo: Math.max(0, 500 - (datos.semanas_totales - datos.semanas_descontadas)) === 0 ? 'result' : 'manual', accent: Math.max(0, 500 - (datos.semanas_totales - datos.semanas_descontadas)) === 0 ? VERDE : '#DC2626' },
                { label: 'Edad de pensión', value: (datos.edad_min_pension || 60) + ' años', tipo: 'manual', accent: '#E8724A' },
                { label: 'Sem. con Mod. 40', value: escenarios.find(e => e.recomendado)?.semanas_finales ? String(Math.round(escenarios.find(e => e.recomendado)!.semanas_finales)) : '—', tipo: 'strategy', accent: VERDE },
                { label: 'Pensión actual', value: (() => { const r = calcPensionLey73(datos.semanas_totales - datos.semanas_descontadas, sdiPromedio, datos.edad_min_pension || 60, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, undefined, datos.tiene_ayuda_asistencial); return r.pensionMensual > 0 ? fmtMXN(r.pensionMensual) + (r.pmg_aplica ? '/mes (PMG)' : '/mes') : '—' })(), tipo: 'result', accent: '#7C3AED' },
              ].map((k, i) => {
                const dotColors: any = { imss: '#334E7B', manual: '#E8724A', strategy: '#2E7D5A', result: '#7C3AED' }
                const dotColor = dotColors[k.tipo] || '#94A3B8'
                return (
                  <div key={i} style={{ flex: '1 1 0', padding: '8px 12px', borderRight: `1px solid ${BORDE}`, borderBottom: `3px solid ${k.accent}`, background: 'white', minWidth: '90px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, whiteSpace: 'nowrap' as const }}>{k.label}</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '700' as const, color: k.accent, whiteSpace: 'nowrap' as const }}>{k.value}</div>
                  </div>
                )
              })}
            </div>
{/* Contenido de la pestaña actual */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#F4F6F9', fontSize: '13px', minWidth: 0, position: 'relative' as const }}>

              {/* ── Botón guardar borrador flotante — visible en todos los tabs ── */}
              {sdiPromedio > 0 && (
                <div style={{ position: 'sticky' as const, top: 0, zIndex: 10, display: 'flex', justifyContent: 'flex-end', marginBottom: '10px', pointerEvents: 'none' as const }}>
                  <button
                    onClick={() => guardarDiagnostico('borrador')}
                    disabled={guardando}
                    style={{ pointerEvents: 'auto' as const, padding: '7px 16px', background: !clienteId ? '#FEF2F2' : diagGuardadoId ? '#F0FDF4' : AZUL, color: !clienteId ? '#DC2626' : diagGuardadoId ? VERDE : 'white', border: `1px solid ${!clienteId ? '#FCA5A5' : diagGuardadoId ? '#86EFAC' : AZUL}`, borderRadius: '8px', fontSize: '12px', fontWeight: '700' as const, cursor: guardando ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', opacity: guardando ? 0.7 : 1 }}>
                    {guardando ? '⏳ Guardando...' : !clienteId ? '⚠️ Sin cliente vinculado' : diagGuardadoId ? '✓ Borrador guardado' : '💾 Guardar borrador'}
                  </button>
                </div>
              )}

              {/* ── Marca de agua KSE ── */}
              <div style={{ position: 'fixed' as const, inset: 0, pointerEvents: 'none' as const, zIndex: 1, overflow: 'hidden' }}>
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute' as const, top: 0, left: 0 }}>
                  <defs>
                    <pattern id="kse-wm" x="0" y="0" width="260" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
                      <text x="10" y="60" fontFamily="Arial Black, sans-serif" fontSize="22" fontWeight="900" fill="#334E7B" fillOpacity="0.045" letterSpacing="4">KSE®</text>
                      <text x="30" y="110" fontFamily="Arial, sans-serif" fontSize="9" fill="#334E7B" fillOpacity="0.04" letterSpacing="2">PENSIONES</text>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#kse-wm)" />
                </svg>
              </div>

            {/* ── Tab -1: Datos generales ── */}
            {tab === -1 && (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '20px' }}>

                {/* Hero KPIs — resumen del caso */}
                {(escenarios[0]?.pension_mensual || sdiPromedio > 0) && (
                  <section style={{ position: 'relative' as const, overflow: 'hidden', borderRadius: '18px', background: 'linear-gradient(118deg, #0D2440 0%, #14375F 60%, #245287 100%)' }}>
                    <div style={{ position: 'absolute' as const, width: 440, height: 440, right: -150, top: -190, borderRadius: 999, pointerEvents: 'none' as const, background: 'radial-gradient(circle, #E8622C33 0%, transparent 68%)' }} />
                    <div style={{ position: 'relative' as const, padding: '28px 34px 22px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', margin: 0 }}>
                        SU PENSION HOY, SIN MODALIDAD 40
                      </p>
                      <p style={{ fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 800, color: 'white', margin: '8px 0 0', lineHeight: 1, letterSpacing: '-.035em', whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' as const }}>
                        {escenarios[0]?.pension_mensual
                          ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(escenarios[0].pension_mensual)
                          : '—'}
                      </p>
                      <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.68)', margin: '10px 0 0' }}>
                        {datos.nombre_trabajador || 'Trabajador'} — la constancia del IMSS es la base de todo el calculo.
                      </p>
                    </div>
                    <div style={{ position: 'relative' as const, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1px', background: 'rgba(255,255,255,.11)' }}>
                      {[
                        { label: 'Semanas netas', value: datos.semanas_totales ? (datos.semanas_totales - (datos.semanas_descontadas || 0)).toLocaleString() : '—', sub: 'cotizadas ante el IMSS', color: '#1FA873' },
                        { label: 'SDI promedio 250 sem.', value: sdiPromedio > 0 ? fmtMXN2(sdiPromedio) + '/dia' : '—', sub: 'base real del calculo', color: '#F2B544' },
                        { label: 'Edad actual', value: datos.edad_actual ? `${datos.edad_actual.toFixed(1)} anios` : '—', sub: 'al dia de hoy', color: 'white' },
                        { label: 'Regimen', value: `Ley ${datos.ley || '73'}`, sub: datos.ley === '97' ? 'cuenta individual' : 'pension por cuantia', color: 'white' },
                      ].map((k, i) => (
                        <div key={i} style={{ background: '#0D2440', padding: '18px 24px' }}>
                          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.56)', margin: 0 }}>{k.label}</p>
                          <p style={{ fontSize: '24px', fontWeight: 700, color: k.color, margin: '3px 0 0', whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' as const }}>{k.value}</p>
                          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.44)', margin: '2px 0 0' }}>{k.sub}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Leyenda del sistema de colores */}
                <div style={{ display: 'flex', gap: '6px', padding: '8px 12px', background: '#F4F6F9', borderRadius: '8px', flexWrap: 'wrap' as const }}>
                  <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginRight: '4px' }}>Referencias:</span>
                  {[
                    { color: AZUL, label: 'Dato IMSS (constancia)' },
                    { color: NARANJA, label: 'Captura manual' },
                    { color: VERDE, label: 'Decisión estratégica' },
                    { color: '#7C3AED', label: 'Resultado calculado' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: '10px', color: '#64748B' }}>{item.label}</span>
                    </div>
                  ))}
                </div>



                {/* Card Identificación — borde azul */}
                <div style={{ background: 'white', borderRadius: '10px', borderLeft: `4px solid ${AZUL}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '9px', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.6px', background: '#EEF2F8', color: AZUL, padding: '3px 8px', borderRadius: '4px' }}>Identificación</span>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>{clientes.find(c => c.id === clienteId)?.nombre || 'Sin cliente'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      { label: 'Nombre del trabajador', value: datos.nombre_trabajador, highlight: true },
                      { label: 'NSS', value: datos.nss },
                      { label: 'Fecha de nacimiento', value: datos.fecha_nacimiento },
                      { label: 'Edad actual / Régimen', value: datos.edad_actual ? `${datos.edad_actual.toFixed(1)} años${datos.ley ? ' · Ley ' + datos.ley : ''}` : '' },
                    ].map((k, i) => (
                      <div key={i}>
                        <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: '3px' }}>{k.label}</div>
                        <div style={{ padding: '7px 10px', background: k.highlight && k.value ? '#EEF2F8' : k.value ? 'white' : '#F9FAFB', border: `1px solid ${k.highlight && k.value ? '#BFDBFE' : k.value ? '#E2E8F0' : '#E5E7EB'}`, borderRadius: '6px', fontSize: '13px', fontWeight: k.highlight ? '600' : '400' as const, color: k.highlight && k.value ? AZUL : k.value ? '#1E293B' : '#9CA3AF', fontStyle: k.value ? 'normal' : 'italic' }}>
                          {k.value || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Cotización — borde naranja */}
                <div style={{ background: 'white', borderRadius: '10px', borderLeft: `4px solid ${NARANJA}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '9px', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.6px', background: '#FFF7ED', color: '#B45309', padding: '3px 8px', borderRadius: '4px' }}>Cotización</span>
                    <span style={{ fontSize: '11px', fontWeight: '600' as const, color: conservacion.vigente ? VERDE : '#DC2626' }}>{datos.semanas_totales ? (conservacion.vigente ? '✓ Vigente' : '✕ Vencida') : '—'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    {[
                      { label: 'Total semanas', value: datos.semanas_totales || '—', bg: '#FFFBEB', color: '#92400E', border: '#FCD34D' },
                      { label: 'Descontadas', value: datos.semanas_descontadas > 0 ? datos.semanas_descontadas : '—', bg: 'white', color: datos.semanas_descontadas > 0 ? '#DC2626' : '#CBD5E1', border: '#E2E8F0' },
                      { label: 'Netas', value: datos.semanas_totales ? (datos.semanas_totales - datos.semanas_descontadas) : '—', bg: '#EEF2F8', color: AZUL, border: AZUL },
                    ].map((k, i) => (
                      <div key={i} style={{ textAlign: 'center' as const, padding: '10px 8px', background: k.bg, border: `1px solid ${k.border}`, borderRadius: '8px' }}>
                        <div style={{ fontSize: '24px', fontWeight: '800' as const, color: k.color, lineHeight: 1 }}>{k.value}</div>
                        <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {[
                      { label: 'Cotizando actualmente', value: datos.sigue_cotizando ? '✓ Sí' : '✕ No', color: datos.sigue_cotizando ? VERDE : '#94A3B8' },
                      { label: 'Art. 165 (Asistencial)', value: datos.tiene_ayuda_asistencial ? '✓ Aplica' : 'No aplica', color: datos.tiene_ayuda_asistencial ? VERDE : '#94A3B8' },
                      { label: 'Edad de pensión', value: `${datos.edad_min_pension || 60} años`, color: AZUL },
                    ].map((k, i) => (
                      <div key={i} style={{ padding: '8px 10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '13px', fontWeight: '600' as const, color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '3px', textTransform: 'uppercase' as const, letterSpacing: '0.3px' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Card Familia — borde verde */}
                  <div style={{ background: 'white', borderRadius: '10px', borderLeft: `4px solid ${VERDE}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <span style={{ fontSize: '9px', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.6px', background: '#F0F7F4', color: VERDE, padding: '3px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '12px' }}>Familia y beneficiarios</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                      {[
                        { label: 'Cónyuge', value: datos.tiene_conyuge ? 'Sí' : 'No', ok: datos.tiene_conyuge },
                        { label: 'Hijos < 16', value: String(datos.num_hijos), ok: datos.num_hijos > 0 },
                        { label: 'Padres dep.', value: String(datos.num_padres), ok: datos.num_padres > 0 },
                      ].map(({ label, value, ok }, i) => (
                        <div key={i} style={{ textAlign: 'center' as const, padding: '10px 6px', background: ok ? '#F0F7F4' : '#F8FAFC', border: `1px solid ${ok ? '#86EFAC' : '#E2E8F0'}`, borderRadius: '8px' }}>
                          <div style={{ fontSize: '22px', fontWeight: '800' as const, color: ok ? VERDE : '#9CA3AF' }}>{value}</div>
                          <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '3px', textTransform: 'uppercase' as const, letterSpacing: '0.3px' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card Tabla edad — borde morado */}
                  <div style={{ background: 'white', borderRadius: '10px', borderLeft: '4px solid #7C3AED', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <span style={{ fontSize: '9px', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.6px', background: '#F5F3FF', color: '#7C3AED', padding: '3px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '12px' }}>% Pensión por edad (Ley 73)</span>
                    <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '11px' }}>
                      <thead>
                        <tr style={{ background: AZUL }}>
                          {['Edad', '% Cuantía', 'Tipo'].map((h, i) => (
                            <th key={i} style={{ padding: '6px 8px', color: 'white', fontSize: '9px', fontWeight: '600' as const, textAlign: i === 0 ? 'center' as const : i === 1 ? 'center' as const : 'left' as const, textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[[60,'75%','Cesantía'],[61,'80%','Cesantía'],[62,'85%','Cesantía'],[63,'90%','Cesantía'],[64,'95%','Cesantía']].map(([edad, pct, tipo], i) => {
                          const isActive = datos.edad_actual && Math.floor(datos.edad_actual) === Number(edad)
                          return (
                            <tr key={i} style={{ background: isActive ? '#EEF2F8' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '6px 8px', textAlign: 'center' as const, fontWeight: isActive ? '700' : '400' as const, color: isActive ? AZUL : '#374151' }}>{edad} años</td>
                              <td style={{ padding: '6px 8px', textAlign: 'center' as const, fontSize: '13px', fontWeight: '700' as const, color: isActive ? AZUL : '#374151' }}>{pct}</td>
                              <td style={{ padding: '6px 8px', color: '#64748B', fontSize: '10px' }}>{tipo as string}</td>
                            </tr>
                          )
                        })}
                        <tr style={{ background: VERDE }}>
                          <td style={{ padding: '6px 8px', textAlign: 'center' as const, fontWeight: '700' as const, color: 'white' }}>65+ años</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' as const, fontSize: '13px', fontWeight: '700' as const, color: 'white' }}>100%</td>
                          <td style={{ padding: '6px 8px', color: 'white', fontSize: '10px', fontWeight: '600' as const }}>Vejez (IDEL)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

        {/* ══ TAB 0: DATOS Y PERFIL — componente externo ══ */}
        {tab === 0 && (
          <TabCliente
            datos={datos}
            setDatos={setDatos}
            ingresoObjetivo={ingresoObjetivo}
            setIngresoObjetivo={setIngresoObjetivo}
            setEdadRetiro={setEdadRetiro}
            sdiPromedio={sdiPromedio}
            periodos={periodos}
            periodosCompletos={periodosCompletos}
            conservacion={conservacion}
            escenarios={escenarios}
            clientes={clientes}
            clienteId={clienteId}
            setShowDetalle250={setShowDetalle250}
            setShowHistorialCompleto={setShowHistorialCompleto}
            Tip={Tip}
            setTab={setTab}
          />
        )}


        {/* ══ TAB 1: CUANTÍAS ANUALES — componente externo ══ */}
        {tab === 1 && (() => {
          const semBase = datos.semanas_totales - datos.semanas_descontadas
          const edadRet = datos.edad_min_pension || 60
          const edadRef = (() => {
            if (datos.fecha_nacimiento && datos.fecha_calculo) {
              const nac = new Date(datos.fecha_nacimiento).getTime()
              const ref = new Date(datos.fecha_calculo).getTime()
              return parseFloat(((ref - nac) / (365.25 * 86400000)).toFixed(2))
            }
            return datos.edad_actual || 0
          })()
          const semanasNaturales = (() => {
            try {
              if (datos.fecha_nacimiento) {
                const nac = new Date(datos.fecha_nacimiento)
                const fechaRetiro = new Date(nac.getFullYear() + Math.floor(edadRet), nac.getMonth(), nac.getDate())
                const ref = datos.fecha_calculo ? new Date(datos.fecha_calculo) : new Date()
                const dias = Math.max(0, (fechaRetiro.getTime() - ref.getTime()) / 86400000)
                return Math.round(dias / 7)
              }
            } catch {}
            return Math.max(0, Math.round((edadRet - edadRef) * 52))
          })()
          const sem = semBase + semanasNaturales
          const res = calcPensionLey73(sem, sdiPromedio, edadRet, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, undefined, datos.tiene_ayuda_asistencial)
          return (
            <TabCuantias res={res} sdiPromedio={sdiPromedio} datos={datos} setTab={setTab} Tip={Tip} />
          )
        })()}


        {/* ══ TAB 2: SALARIO MOD.40 — componente externo ══ */}
        {tab === 2 && (
          <TabSalarioMod40
            escenarios={escenarios}
            datos={datos}
            sys={sys}
            mod40Umas={mod40Umas}
            setMod40Umas={setMod40Umas}
            edadIngresoAnios={edadIngresoAnios as number}
            setEdadIngresoAnios={setEdadIngresoAnios}
            edadIngresoMeses={edadIngresoMeses as number}
            setEdadIngresoMeses={setEdadIngresoMeses}
            mod40Meses={mod40Meses}
            setMod40Meses={setMod40Meses}
            ingresoObjetivo={ingresoObjetivo}
            resetParametrosMod40={resetParametrosMod40}
            tieneAtraso={tieneAtraso}
            setTieneAtraso={setTieneAtraso}
            fechaAtrasoMod40={fechaAtrasoMod40}
            setFechaAtrasoMod40={setFechaAtrasoMod40}
            setTab={setTab}
            Tip={Tip}
          />
        )}


        {tab === 3 && (
          <TabCostoMod40 escenarios={escenarios} sys={sys} getMod40Pct={getMod40Pct} setTab={setTab} />
        )}


        {/* ══ TAB 6: INVERSIÓN Y PROYECTO ══ */}
        {tab === 6 && (
          <TabProyeccion escenarios={escenarios} sys={sys} setTab={setTab} />
        )}


        {tab === 6 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
            <button onClick={() => setTab(7)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#334E7B', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const, fontFamily: 'inherit' }}>
              Datos del Proyecto →
            </button>
          </div>
        )}

        {/* ══ TAB 7: DATOS DEL PROYECTO ════════════════════════════════ */}
        {tab === 7 && (() => { setTab(6); return null })()}

        {/* ══ TAB 8: ESCENARIOS — componente externo ══ */}
        {tab === 8 && (
          <TabEscenarios escenarios={escenarios} setTab={setTab} fmtMXN={fmtMXN} />
        )}


                {tab === 9 && (() => { setTab(8); return null })()}

        {/* ══ TAB 10: FINANCIAMIENTO — componente externo ══ */}
        {tab === 10 && (
          <TabFinanciamiento
            escenarios={escenarios}
            sys={sys}
            duracionTramiteMeses={duracionTramiteMeses}
            setDuracionTramiteMeses={setDuracionTramiteMeses}
            plazoCredito={plazoCredito}
            setPlazoCredito={setPlazoCredito}
            setTab={setTab}
          />
        )}


        {tab === 11 && (() => {
          const escsConMod40 = escenarios.filter(e => e.mod40_meses > 0).slice(0, 3)
          const escRec = escsConMod40[0] ?? null
          const resumenNode = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: AZUL, padding: '16px 20px', borderRadius: '8px' }}>
                <p style={{ fontSize: '14px', fontWeight: '800' as const, color: 'white', margin: '0 0 4px' }}>Resumen Ejecutivo — Proyecto de Pensión con Modalidad 40</p>
                <div style={{ display: 'flex', gap: '20px', fontSize: '11px', color: '#93C5FD' }}>
                  <span>{datos.nombre_trabajador || 'Trabajador'}</span>
                  {datos.nss && <span>NSS: {datos.nss}</span>}
                  {datos.ley && <span>Régimen: Ley {datos.ley}</span>}
                  {escRec && <span>{escsConMod40.length} escenario{escsConMod40.length > 1 ? 's' : ''} analizados</span>}
                </div>
              </div>
              {escsConMod40.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center' as const, color: '#94A3B8' }}>
                  <p>Completa los escenarios en La pensión para ver el resumen.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {escsConMod40.map((esc: any, i: number) => (
                    <div key={i} style={{ background: esc.recomendado ? VERDE : 'white', border: esc.recomendado ? 'none' : '1.5px solid #E2E8F0', borderRadius: '10px', padding: '14px', textAlign: 'center' as const, boxShadow: esc.recomendado ? '0 4px 12px rgba(46,125,90,0.2)' : '0 1px 3px rgba(0,0,0,0.06)' }}>
                      {esc.recomendado && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', marginBottom: '6px', fontWeight: '600' as const }}>⭐ RECOMENDADO</div>}
                      <div style={{ fontSize: '11px', color: esc.recomendado ? 'rgba(255,255,255,0.7)' : '#94A3B8', marginBottom: '4px' }}>{esc.mod40_meses} meses Mod. 40</div>
                      <div style={{ fontSize: '24px', fontWeight: '800' as const, color: esc.recomendado ? 'white' : AZUL, letterSpacing: '-0.5px' }}>
                        {fmtMXN(esc.pension_mensual)}
                      </div>
                      <div style={{ fontSize: '11px', color: esc.recomendado ? 'rgba(255,255,255,0.7)' : '#64748B', marginTop: '2px' }}>mensual</div>
                      <div style={{ fontSize: '13px', fontWeight: '700' as const, color: esc.recomendado ? 'white' : '#92400E', marginTop: '8px' }}>
                        {fmtMXN(esc.aportacion_banco || esc.costo_total || 0)}
                      </div>
                      <div style={{ fontSize: '10px', color: esc.recomendado ? 'rgba(255,255,255,0.6)' : '#94A3B8' }}>inversión total</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
          const semaforoNode = diagGuardadoId && clienteId ? (
            <SemaforoElegibilidad
              clienteId={clienteId}
              diagnosticoId={diagGuardadoId}
              datos={datos}
              escenarioSel={escSel}
              supabase={supabase}
              userId={userId}
            />
          ) : null
          const simuladorNode = escSel ? (
            <SimuladorVidaReal
              pensionSin={datos.pension_sin_mod40 ?? 0}
              pensionCon={escSel.pension_mensual ?? 0}
            />
          ) : null
          return (
            <TabEntregable
              escenarios={escenarios}
              datos={datos}
              periodos={periodos}
              sdiPromedio={sdiPromedio}
              sys={sys as any}
              diagGuardadoId={diagGuardadoId}
              estatus={estatus}
              pdfConfig={pdfConfig}
              sofiaOutput={sofiaOutput}
              setSofiaOutput={setSofiaOutput}
              generandoSofia={generandoSofia}
              setGenerandoSofia={setGenerandoSofia}
              exportarPDF={(so?: any) => exportarPDF(so)}
              guardarDiagnostico={(estatus: string) => guardarDiagnostico(estatus as "borrador" | "autorizado")}
              userId={userId}
              clienteId={clienteId}
            />
          )
        })()}


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
                          <div style={{ fontSize: '11px', color: '#64748B' }}>{desc}</div>
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
                      { label: 'Pensión sin Mod 10', value: fmtMXN2(pensionActual), color: '#94A3B8', bg: '#F9FAFB', border: '#E5E7EB' },
                      { label: 'Pensión con Mod 10', value: fmtMXN2(escM10.pension_mensual), color: '#0891B2', bg: '#F0F9FF', border: '#0891B2' },
                      { label: 'Costo total (12 meses)', value: fmtMXN2(escM10.costo_total), color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
                      { label: 'Recuperación AFORE', value: fmtMXN2(escM10.recuperacion_afore), color: '#065F46', bg: '#F0FDF4', border: '#86EFAC' },
                    ].map((k, i) => (
                      <div key={i} style={{ background: k.bg, border: '2px solid ' + k.border, padding: '14px', textAlign: 'center' as const }}>
                        <div style={{ fontSize: '9.5px', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600', marginBottom: '6px' }}>{k.label}</div>
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
                          <span style={{ fontSize: '12px', color: '#64748B' }}>{label}</span>
                          <span style={{ fontSize: highlight ? '14px' : '12px', fontWeight: highlight ? '800' : '600', color: highlight ? '#0891B2' : '#374151' }}>{value}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Comparativo Mod 10 vs Mod 40 */}
                      <div style={DS.card}>
                        <p style={DS.secTitle}>⚖️ Mod 10 vs Mod 40 — ¿Cuál conviene?</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ background: '#F4F6F9' }}>
                              <th style={{ padding: '7px 10px', textAlign: 'left' as const, fontSize: '10px', color: '#94A3B8', fontWeight: '700' }}>Concepto</th>
                              <th style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '10px', color: '#0891B2', fontWeight: '700' }}>Mod 10</th>
                              <th style={{ padding: '7px 10px', textAlign: 'center' as const, fontSize: '10px', color: '#334E7B', fontWeight: '700' }}>Mod 40</th>
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
                                <td style={{ padding: '7px 10px', fontSize: '13px', color: '#1E293B' }}>{label}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontWeight: highlight ? '800' : '600', color: highlight ? '#0891B2' : '#374151', fontSize: highlight ? '13px' : '11.5px' }}>{m10}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center' as const, fontWeight: highlight ? '800' : '600', color: highlight ? '#334E7B' : '#374151', fontSize: highlight ? '13px' : '11.5px' }}>{m40}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Diferencia clave */}
                      <div style={{ background: '#F0F9FF', border: '2px solid #0891B2', padding: '14px' }}>
                        <p style={{ fontSize: '12px', fontWeight: '700', color: '#0C4A6E', margin: '0 0 8px' }}>💡 Diferencia clave con Mod 40</p>
                        <p style={{ fontSize: '13px', color: '#1E293B', lineHeight: 1.7, margin: 0 }}>
                          La <strong>Modalidad 40</strong> está diseñada para trabajadores que <em>siguen empleados</em> y quieren cotizar con un salario más alto para mejorar su pensión. La <strong>Modalidad 10</strong> es para quienes <em>ya no están empleados</em> y necesitan mantener sus derechos activos, incluyendo acceso a servicios médicos del IMSS. Son complementarias, no excluyentes.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!escM10 && (
                <div style={DS.card}>
                  <div style={{ textAlign: 'center' as const, padding: '40px', color: '#94A3B8' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                    <p style={{ fontSize: '14px', margin: '0 0 6px' }}>Carga la constancia IMSS para ver el análisis de Modalidad 10</p>
                    <p style={{ fontSize: '12px' }}>El sistema calcula automáticamente el escenario de Mod 10 con los datos de semanas cotizadas y SDI del trabajador</p>
                  </div>
                </div>
              )}

            </div>
          )
        })()}

            </div>{/* fin overflowY */}

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
