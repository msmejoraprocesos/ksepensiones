'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { pdf } from '@react-pdf/renderer'
import { DiagnosticoPDF } from '@/app/utils/DiagnosticoPDF'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F05B21'
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

const FACTOR_CESANTIA: Record<number, number> = { 60: 0.75, 61: 0.80, 62: 0.85, 63: 0.90, 64: 0.95 }

interface SysVars {
  UMA_DIARIA: number
  SALARIO_MIN: number
  PMG_L73: number
  PMG_L97: number
  RENDIMIENTO_DEFAULT: number
  mod40_pct?: number
  pct_afore_mod40?: number
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
  const TABS = ['Datos generales','Salario 250 sem.','Pensión actual','Modalidad 40','Inversión','Financiamiento','Resumen / Proyecto']

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
  const [showWappModal, setShowWappModal] = useState(false)

  const [showAllMonths, setShowAllMonths] = useState(false)
  const [showClienteModal, setShowClienteModal] = useState(false)
  const [showSugerirEtapa, setShowSugerirEtapa] = useState(false)
  const [etapaSugerida, setEtapaSugerida] = useState('')
  const [showConfirmCambio, setShowConfirmCambio] = useState(false)
  const [pendingClienteId, setPendingClienteId] = useState('')
  const [buscarCliente, setBuscarCliente] = useState('')
  const [showAllMonthsM10, setShowAllMonthsM10] = useState(false)

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

  // Show client selection modal on mount if no client pre-selected
  useEffect(() => {
    if (!clienteId) setShowClienteModal(true)
  }, [])

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
    // UMA y SDI proyectados — Datos-proyecto!C11, SAL. PROM MOD 40!E17
    const umaProyectada = proyectarValor(sys.UMA_DIARIA, anioBase, anioI)
    const sdiMod40 = umas * umaProyectada
    // Tasa y costo mensual usando días reales del año (no 30.4 fijo — igual que Excel COSTO MOD.40)
    const tasaProyectada = getMod40Pct(anioI) / 100
    const diasAnio = anioI % 4 === 0 ? 366 : 365
    const costoMensual = sdiMod40 * tasaProyectada * diasAnio / 12
    const costo_total = costoMensual * meses
    // SDI ponderado 250 semanas
    const semMod40 = Math.min(meses * 4.33, 250)
    const semEfectivo = Math.min(sem, 250 - semMod40)
    const sdiNuevo = semEfectivo + semMod40 > 0
      ? (sdiBase * semEfectivo + sdiMod40 * semMod40) / (semEfectivo + semMod40)
      : sdiBase
    const semTotal = sem + meses * 4.33
    const { monto: pension, pmg_aplica } = calcPensionLey73(semTotal, sdiNuevo, edadR, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, anioR, datos.tiene_ayuda_asistencial)
    const incr = pension - pensionBase
    // Inversión neta y ROI — Datos-proyecto!C20, C21
    const pctAfore = (sys.pct_afore_mod40 ?? 20) / 100
    const recuperacion_afore = costo_total * pctAfore
    const inversion_neta = costo_total - recuperacion_afore
    const roi = incr > 0 ? Math.ceil(inversion_neta / incr) : 0
    // Ganancia a los 80 años y tasa de rendimiento — Datos-proyecto!C22, C23
    const mesesHasta80 = Math.max(0, (80 - edadR) * 12)
    const mesesHasta80base = Math.max(0, (80 - Math.max(edadRetiro, datos.edad_actual || 60)) * 12)
    const flujosCon = pension * mesesHasta80
    const flujosSin = pensionBase * mesesHasta80base
    const ganancia_a80 = flujosCon - flujosSin - inversion_neta
    const tasa_rendimiento = inversion_neta > 0 ? (ganancia_a80 / inversion_neta) * 100 : 0
    // Aguinaldo anual — Datos-proyecto!C24
    const aguinaldo_anual = (pension * 15) / 30
    // Fechas de ingreso/baja — Datos-proyecto!C13, C15
    const fechaIngreso = new Date(anioI, 0, 1)
    const fechaBaja = new Date(fechaIngreso)
    fechaBaja.setMonth(fechaBaja.getMonth() + meses)
    const fecha_ingreso_mod40 = fechaIngreso.toISOString().slice(0, 10)
    const fecha_baja_mod40 = fechaBaja.toISOString().slice(0, 10)
    // Retroactivo estimado — Datos-proyecto!C25-C30 (estimación rápida usando factor de recargos)
    const factorRetroactivo = 1.49 // ~49% de incremento por recargos y actualizaciones (validado contra Excel)
    const costo_retroactivo = costo_total * factorRetroactivo
    const recuperacion_afore_retro = costo_retroactivo * pctAfore
    const inversion_neta_retro = costo_retroactivo - recuperacion_afore_retro
    const roi_retro = incr > 0 ? Math.ceil(inversion_neta_retro / incr) : 0
    const ganancia_a80_retro = flujosCon - flujosSin - inversion_neta_retro
    const tasa_rendimiento_retro = inversion_neta_retro > 0 ? (ganancia_a80_retro / inversion_neta_retro) * 100 : 0
    // Financiamiento — Datos-proyecto!C33-C44
    const aportacion_banco = costo_retroactivo * 0.356 // porcentaje validado en Excel (FINANCIAMIENTO!C10)
    const aportacion_segundo_fondeo = costo_retroactivo - recuperacion_afore_retro - aportacion_banco
    const cantidad_minima_afore = costo_retroactivo - aportacion_banco // SEGUNDO FONDEADOR!C9
    const plazo_fin = 60 // meses de financiamiento (estándar FINANCIAMIENTO!C21)
    const tasa_fin_mensual = 0.0322 / 12 // tasa bancaria regulada (FINANCIAMIENTO hoja!G32)
    const cuota_banco = tasa_fin_mensual > 0
      ? aportacion_banco * (tasa_fin_mensual * Math.pow(1 + tasa_fin_mensual, plazo_fin)) / (Math.pow(1 + tasa_fin_mensual, plazo_fin) - 1)
      : aportacion_banco / plazo_fin
    const descuento_mensual = cuota_banco // descuento que se aplica a la pensión durante 60 meses
    const pension_inmediata = pension - descuento_mensual
    const pension_al_liquidar = pension
    const flujos_financiados = pension_inmediata * Math.min(plazo_fin, mesesHasta80) + pension * Math.max(0, mesesHasta80 - plazo_fin)
    const ganancia_a80_financiado = flujos_financiados - flujosSin - inversion_neta_retro
    const roi_financiado = incr > 0 ? Math.ceil(inversion_neta_retro / incr) : 0
    const tasa_rendimiento_financiado = inversion_neta_retro > 0 ? (ganancia_a80_financiado / inversion_neta_retro) * 100 : 0

    return {
      costoMensual, costo_total, sdiNuevo, semTotal, pension, pmg_aplica, incr, roi,
      umaProyectada, tasaProyectada, sdiMod40,
      recuperacion_afore, inversion_neta, ganancia_a80, tasa_rendimiento, aguinaldo_anual,
      fecha_ingreso_mod40, fecha_baja_mod40,
      costo_retroactivo, recuperacion_afore_retro, inversion_neta_retro,
      roi_retro, ganancia_a80_retro, tasa_rendimiento_retro,
      aportacion_banco, aportacion_segundo_fondeo, cantidad_minima_afore,
      descuento_mensual, pension_inmediata, pension_al_liquidar,
      roi_financiado, ganancia_a80_financiado, tasa_rendimiento_financiado
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
      semTotal: sem + 12 * 4.33, pension: pensionM10, pmg_aplica: pmgAplicaM10,
      incr: pensionM10 - pensionBase, roi: 0, umaProyectada: sys.UMA_DIARIA,
      tasaProyectada: TASA_M10, sdiMod40: sdiM10,
      recuperacion_afore: costoM10 * 12 * (sys.pct_afore_mod40 ?? 20) / 100,
      inversion_neta: costoM10 * 12 * (1 - (sys.pct_afore_mod40 ?? 20) / 100),
      ganancia_a80: 0, tasa_rendimiento: 0, aguinaldo_anual: (pensionM10 * 15) / 30,
      fecha_ingreso_mod40: '', fecha_baja_mod40: '',
      costo_retroactivo: 0, recuperacion_afore_retro: 0, inversion_neta_retro: 0,
      roi_retro: 0, ganancia_a80_retro: 0, tasa_rendimiento_retro: 0,
      aportacion_banco: 0, aportacion_segundo_fondeo: 0, cantidad_minima_afore: 0,
      descuento_mensual: 0, pension_inmediata: pensionM10, pension_al_liquidar: pensionM10,
      roi_financiado: 0, ganancia_a80_financiado: 0, tasa_rendimiento_financiado: 0,
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

  const legendoDot = (bg: string, border: string) => (
    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: bg, border: `1px solid ${border}`, marginRight: '4px', verticalAlign: 'middle' }}></span>
  )

  const guiaCampos = (compact = false) => (
    <div style={{ padding: compact ? '8px 12px' : '12px 16px', background: '#FAFAFA', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: compact ? '10px' : '11px', color: '#64748b', display: 'flex', flexWrap: 'wrap' as const, gap: compact ? '10px' : '16px', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: compact ? '10px' : '16px', alignItems: 'center' }}>
        {!compact && <strong style={{ color: '#374151' }}>Guía de colores:</strong>}
        <span>⚡ <strong style={{ color: '#1e40af' }}>Azul</strong> — se llena solo al cargar la constancia IMSS</span>
        <span>⚙️ <strong style={{ color: '#5b21b6' }}>Morado</strong> — viene de Configuración del sistema</span>
        <span>✏️ <strong style={{ color: '#92400e' }}>Ámbar</strong> — tú debes llenarlo o confirmarlo</span>
      </div>
      <button onClick={() => setShowGlosario(true)}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 9px', fontSize: compact ? '10px' : '11px', fontWeight: '600', color: AZUL, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        📖 Glosario de términos
      </button>
    </div>
  )

  const labelSt: React.CSSProperties = {
    display: 'block', fontSize: '10px', fontWeight: '700',
    color: '#475569', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px',
  }

  const cardSt: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px',
  }

  const kpiSt: React.CSSProperties = {
    background: '#F4F6FB', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px',
  }

  const btnPrimary: React.CSSProperties = {
    padding: '9px 20px', background: NARANJA, color: 'white', border: 'none',
    borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
  }

  const btnSecondary: React.CSSProperties = {
    padding: '9px 16px', background: 'white', color: '#374151',
    border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px',
    fontWeight: '500', cursor: 'pointer',
  }

  const sectionTitle = (t: string, sub?: string) => (
    <div style={{ marginBottom: '10px' }}>
      <p style={{ fontSize: '11px', fontWeight: '700', color: '#475569', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t}</p>
      {sub && <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )

  const KPI_THEMES: Record<string, { bg: string; border: string; accent: string; labelColor: string }> = {
    naranja: { bg: '#FFF7ED', border: '#fed7aa', accent: '#F05B21', labelColor: '#92400e' },
    verde:   { bg: '#F0FDF4', border: '#bbf7d0', accent: '#2E8B57', labelColor: '#15803d' },
    azul:    { bg: '#EEF2F8', border: '#bfdbfe', accent: '#1B3A6B', labelColor: '#1e40af' },
    rojo:    { bg: '#FEF2F2', border: '#fecaca', accent: '#dc2626', labelColor: '#991b1b' },
    gris:    { bg: '#F4F6FB', border: '#e2e8f0', accent: '#64748b', labelColor: '#64748b' },
    verde2:  { bg: '#F0FDF4', border: '#bbf7d0', accent: '#16a34a', labelColor: '#15803d' },
  }

  const kpiBox = (label: string, value: string, sub?: string, color = '#1e293b', tema?: string, destacado = false) => {
    const th = tema ? KPI_THEMES[tema] : null
    return (
      <div style={th ? { background: th.bg, border: `0.5px solid ${th.border}`, borderLeft: `3px solid ${th.accent}`, borderRadius: '8px', padding: destacado ? '14px 14px' : '10px 12px' } : { ...kpiSt, padding: destacado ? '14px 14px' : kpiSt.padding }}>
        <div style={{ fontSize: destacado ? '11px' : '10px', fontWeight: destacado ? '700' : '400', color: th ? th.labelColor : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{label}</div>
        <div style={{ fontSize: destacado ? '24px' : '16px', fontWeight: '700', color: th ? th.accent : color, lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ fontSize: destacado ? '11px' : '10px', color: th ? th.labelColor : '#94a3b8', marginTop: '2px' }}>{sub}</div>}
      </div>
    )
  }

  const semaforo = (ok: boolean, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '5px 10px', background: ok ? '#F0FDF4' : '#FEF2F2', borderRadius: '6px', border: `0.5px solid ${ok ? '#bbf7d0' : '#fecaca'}` }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ok ? VERDE : '#ef4444', flexShrink: 0 }} />
      <span style={{ color: ok ? '#15803d' : '#991b1b', fontWeight: '500' }}>{label}</span>
    </div>
  )

  const clienteSeleccionado = clientes.find(c => c.id === clienteId)
  const navBar = (
    <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
      {!clienteId && (
        <div style={{ padding: '10px 20px', background: '#FFF7ED', borderBottom: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#92400e', fontWeight: '600' }}>⚠️ Selecciona un cliente para iniciar el diagnóstico</span>
          <span style={{ fontSize: '12px', color: '#92400e' }}>No se puede guardar ni generar PDF sin un cliente vinculado.</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', flexWrap: 'nowrap', gap: '14px', overflowX: 'auto' }}>
        <div style={{ flexShrink: 0 }}>
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: 0, whiteSpace: 'nowrap' }}>Calculadora de pensión</p>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '1px 0 0', whiteSpace: 'nowrap' }}>
            {tab + 1} de {TABS.length} — {TABS[tab]}
            {clienteSeleccionado && <span style={{ color: AZUL, fontWeight: '600' }}> · {clienteSeleccionado.nombre}</span>}
            {diagGuardadoId && <span style={{ color: estatus === 'autorizado' ? VERDE : '#f59e0b', fontWeight: '600' }}> · {estatus === 'autorizado' ? '✅ Autorizado' : '📝 Borrador'}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap', flexShrink: 0 }}>
          <select value={clienteId} onChange={e => {
              if (analisis.length > 0 || diagGuardadoId) {
                setPendingClienteId(e.target.value)
                setShowConfirmCambio(true)
              } else {
                setClienteId(e.target.value)
                setDiagGuardadoId(null)
                setEstatus('borrador')
              }
            }}
            style={{ ...inputSt, minWidth: '160px', maxWidth: '220px', fontSize: '12px', padding: '6px 10px', height: '34px', borderColor: !clienteId ? '#f97316' : '#e2e8f0' }}>
            <option value="">— Seleccionar cliente —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', height: '34px', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: extracting ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', color: AZUL, background: '#EEF2F8', whiteSpace: 'nowrap' }}>
            {extracting ? '⏳ Extrayendo...' : '📄 Cargar constancia IMSS'}
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} disabled={extracting}
              onChange={e => { const f = e.target.files?.[0]; if (f) extraerPDF(f) }} />
          </label>
        </div>
      </div>
    </div>
  )

  const tabBar = (
    <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', background: 'white', flexShrink: 0, padding: '8px 20px', alignItems: 'center' }}>
      {TABS.map((t, i) => (
        <button key={i} onClick={() => setTab(i)}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 12px 6px 8px',
            borderRadius: '20px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            background: tab === i ? '#FFF1EC' : 'transparent',
            transition: 'background 0.15s',
          }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '20px', height: '20px', borderRadius: '50%', fontSize: '10px', fontWeight: '700',
            background: i < tab ? VERDE : tab === i ? NARANJA : '#e2e8f0',
            color: i <= tab ? 'white' : '#94a3b8',
            flexShrink: 0,
          }}>
            {i < tab ? '✓' : i + 1}
          </span>
          <span style={{ fontSize: '12px', fontWeight: tab === i ? '700' : '500', color: tab === i ? NARANJA : i < tab ? '#374151' : '#94a3b8' }}>
            {t}
          </span>
        </button>
      ))}
    </div>
  )

  const navButtons = (prev?: () => void, next?: () => void, nextLabel = 'Siguiente →') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
      {prev ? <button onClick={prev} className="btn-secondary" style={btnSecondary}>← Anterior</button> : <div />}
      {next && <button onClick={next} className="btn-primary" style={btnPrimary}>{nextLabel}</button>}
    </div>
  )


  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>

      {/* ── Modal selección de cliente (bloqueante) ── */}
      {showClienteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🧮</div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1B3A6B', margin: '0 0 6px' }}>Calculadora de pensión</h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Selecciona un <strong>Prospecto</strong> o cliente en <strong>Diagnóstico</strong>, o registra uno nuevo.</p>
            </div>

            {/* Buscar cliente */}
            <div style={{ marginBottom: '12px' }}>
              <input
                value={buscarCliente}
                onChange={e => setBuscarCliente(e.target.value)}
                placeholder="🔍 Buscar cliente..."
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            {/* Lista de clientes */}
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px' }}>
              {clientes.filter(c => c.nombre.toLowerCase().includes(buscarCliente.toLowerCase())).length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Sin resultados</div>
              ) : (
                clientes.filter(c => c.nombre.toLowerCase().includes(buscarCliente.toLowerCase())).map(c => (
                  <button key={c.id} onClick={() => { setClienteId(c.id); setShowClienteModal(false); setBuscarCliente('') }}
                    style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', background: '#EEF2F8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#1B3A6B', flexShrink: 0 }}>
                      {c.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{c.nombre}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{c.telefono ?? ''}</div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px', background: c.etapa_kanban === 'diagnostico' ? '#EEF7F1' : '#EEF2F8', color: c.etapa_kanban === 'diagnostico' ? '#2E8B57' : '#1B3A6B', flexShrink: 0 }}>
                      {c.etapa_kanban === 'diagnostico' ? 'Diagnóstico' : 'Prospecto'}
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Registrar nuevo */}
            <a href="/clientes?nuevo=1"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', background: '#1B3A6B', color: 'white', borderRadius: '10px', textDecoration: 'none', fontSize: '13px', fontWeight: '700' }}>
              ＋ Registrar nuevo cliente
            </a>
            <a href="/"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px', background: '#F8FAFC', color: '#64748b', borderRadius: '10px', textDecoration: 'none', fontSize: '12px', fontWeight: '600', border: '1px solid #e2e8f0' }}>
              ← Salir — ir a mi día
            </a>
          </div>
        </div>
      )}

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

      {navBar}
      {tabBar}

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#FAFAFA' }}>

        {/* ══ TAB 1: DATOS GENERALES ══════════════════════════════ */}
        {tab === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {guiaCampos()}
            {datos.semanas_totales === 0 && (
              <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL }}>
                📄 Carga la constancia de semanas cotizadas del IMSS en PDF y los datos se completarán automáticamente.
              </div>
            )}

            <div style={cardSt}>
              {sectionTitle('Identificación del trabajador')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                <div><label style={labelSt}>✏️ Nombre del cliente / asesorado</label>
                  <input style={manualInputSt} value={datos.nombre} onChange={e => setDatos(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre del cliente (quien contrata)" /></div>
                <div><label style={labelSt}>⚡ Nombre del trabajador (constancia IMSS)</label>
                  <input style={autoInputSt} value={datos.nombre_trabajador} onChange={e => setDatos(p => ({ ...p, nombre_trabajador: e.target.value }))} placeholder="Nombre como aparece en la constancia" /></div>
                <div><label style={labelSt}>⚡ NSS</label>
                  <input style={autoInputSt} value={datos.nss} onChange={e => setDatos(p => ({ ...p, nss: e.target.value }))} placeholder="NSS" /></div>
                <div><label style={labelSt}>{datos.ley ? '⚡' : '✏️'} Régimen{!datos.ley && ' — confírmalo'}</label>
                  <select style={datos.ley ? autoInputSt : manualInputSt} value={datos.ley} onChange={e => setDatos(p => ({ ...p, ley: e.target.value as '73' | '97' }))}>
                    <option value="">Detectar automáticamente</option>
                    <option value="73">Ley 73 (cotizó antes de Jul 1997)</option>
                    <option value="97">Ley 97 (solo cotizó después de Jul 1997)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div><label style={labelSt}>⚡ Fecha de nacimiento</label>
                  <input type="date" style={autoInputSt} value={datos.fecha_nacimiento} onChange={e => {
                    const edad = e.target.value ? Math.floor((Date.now() - new Date(e.target.value).getTime()) / (365.25 * 86400000)) : 0
                    setDatos(p => ({ ...p, fecha_nacimiento: e.target.value, edad_actual: edad }))
                  }} /></div>
                <div><label style={labelSt}>⚡ Edad actual</label>
                  <input type="number" style={autoNumInputSt} value={datos.edad_actual || ''} onChange={e => setDatos(p => ({ ...p, edad_actual: parseInt(e.target.value) || 0 }))} />
                  {(() => {
                    const ed = edadDetallada(datos.fecha_nacimiento, nowTick)
                    if (!ed) return null
                    return (
                      <p style={{ fontSize: '10px', color: '#94a3b8', margin: '4px 0 0', lineHeight: '1.5' }}>
                        {ed.anios} años, {ed.meses} meses, {ed.dias} días, {ed.horas} h, {ed.minutos} min, {ed.segundos} s
                      </p>
                    )
                  })()}
                </div>
                <div><label style={labelSt}>⚡ Fecha de cálculo / baja IMSS</label>
                  <input type="date" style={autoInputSt} value={datos.fecha_calculo} onChange={e => setDatos(p => ({ ...p, fecha_calculo: e.target.value }))} /></div>
                <div><label style={labelSt}>⚡ Semanas cotizadas</label>
                  <input type="number" style={autoNumInputSt} value={datos.semanas_totales || ''} onChange={e => setDatos(p => ({ ...p, semanas_totales: parseInt(e.target.value) || 0 }))} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginTop: '10px' }}>
                <div><label style={labelSt}>
                    ✏️ ¿A qué edad quieres iniciar Mod 40? — años
                    <button onClick={() => setShowGuiaEdadMod40(true)} style={{ marginLeft: '6px', background: AZUL, color: 'white', border: 'none', borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', cursor: 'pointer', fontWeight: '700', lineHeight: '14px', padding: 0 }}>?</button>
                  </label>
                  <input type="number" min={0} style={manualNumInputSt} value={edadInicioMod40Anios} placeholder="ej. 61"
                    onChange={e => setEdadInicioMod40Anios(e.target.value === '' ? '' : parseInt(e.target.value) || 0)} /></div>
                <div><label style={labelSt}>✏️ ...y meses</label>
                  <input type="number" min={0} max={11} style={manualNumInputSt} value={edadInicioMod40Meses} placeholder="0-11"
                    onChange={e => setEdadInicioMod40Meses(e.target.value === '' ? '' : parseInt(e.target.value) || 0)} /></div>
                <div>
                  <label style={labelSt}>⚡ Año de inicio del trámite Mod 40 (automático)</label>
                  <div style={{ ...autoInputSt, display: 'flex', alignItems: 'center', fontWeight: '700', color: AZUL }}>
                    {edadInicioMod40Anios !== '' || edadInicioMod40Meses !== '' ? anioInicioTramite : '— define la edad de inicio —'}
                  </div>
                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0 0' }}>Calculado a partir de tu edad actual y la edad de inicio que indiques</p>
                </div>
              </div>
            </div>

            <div style={cardSt}>
              {sectionTitle('Situación laboral y familiar')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={labelSt}>{datos.fecha_calculo ? '⚡' : '✏️'} ¿Sigue cotizando al IMSS?{datos.fecha_calculo && <span style={{ color: AZUL, fontWeight: '600', textTransform: 'none' }}> · sugerido</span>}</label>
                  <select style={datos.fecha_calculo ? autoInputSt : manualInputSt} value={datos.sigue_cotizando ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, sigue_cotizando: e.target.value === 'si' }))}>
                    <option value="si">Sí</option><option value="no">No</option>
                  </select>
                  {datos.fecha_calculo && <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0 0' }}>Basado en la última cotización registrada. Verifica con el cliente.</p>}
                </div>
                <div>
                  <label style={labelSt}>{datos.semanas_descontadas > 0 ? '⚡' : '✏️'} Semanas descontadas AFORE/ISSSTE
                    <span style={{ fontSize: '9px', fontWeight: '400', color: '#94a3b8', marginLeft: '4px' }}>auto desde constancia · editable</span>
                  </label>
                  <input type="number" style={datos.semanas_descontadas > 0 ? autoNumInputSt : manualNumInputSt} value={datos.semanas_descontadas || ''} onChange={e => setDatos(p => ({ ...p, semanas_descontadas: parseInt(e.target.value) || 0 }))} placeholder="0" />
                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0 0' }}>Art. 150 LSS — semanas que se descuentan por haber retirado AFORE</p>
                </div>
                <div><label style={labelSt}>✏️ ¿Tiene esposa(o)/concubina(o)?</label>
                  <select style={manualInputSt} value={datos.tiene_conyuge ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, tiene_conyuge: e.target.value === 'si' }))}>
                    <option value="si">Sí (+15%)</option><option value="no">No</option>
                  </select></div>
                <div><label style={labelSt}>✏️ Hijos menores de 16 / est. hasta 25</label>
                  <input type="number" style={manualNumInputSt} value={datos.num_hijos || ''} onChange={e => setDatos(p => ({ ...p, num_hijos: parseInt(e.target.value) || 0 }))} placeholder="0" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div><label style={labelSt}>✏️ Padres económicamente dependientes</label>
                  <input type="number" style={manualNumInputSt} value={datos.num_padres || ''} onChange={e => setDatos(p => ({ ...p, num_padres: parseInt(e.target.value) || 0 }))} placeholder="0" /></div>
                <div><label style={labelSt}>✏️ Ayuda Asistencial (Art. 165 LSS)</label>
                  <select style={autoInputSt} value={datos.tiene_ayuda_asistencial ? 'SI' : 'NO'} onChange={e => setDatos(p => ({ ...p, tiene_ayuda_asistencial: e.target.value === 'SI' }))}>
                    <option value="NO">NO — tiene beneficiarios</option>
                    <option value="SI">SÍ — sin cónyuge, hijos ni padres</option>
                  </select>
                </div>
                <div><label style={labelSt}>✏️ Edad mínima de pensión (DATOS GEN.!E6)</label>
                  <select style={autoInputSt} value={datos.edad_min_pension || 60} onChange={e => setDatos(p => ({ ...p, edad_min_pension: parseInt(e.target.value) }))}>
                    {[60,61,62,63,64,65].map(e => <option key={e} value={e}>{e} años {e === 65 ? '(vejez 100%)' : `(${75 + (e-60)*5}%)`}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelSt}>
                    ✏️ Edad deseada de retiro
                    <button onClick={() => setShowTooltipCuantia(v => !v)} style={{ marginLeft: '6px', background: AZUL, color: 'white', border: 'none', borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', cursor: 'pointer', fontWeight: '700', lineHeight: '14px', padding: 0 }}>?</button>
                  </label>
                  <select style={manualInputSt} value={edadRetiro} onChange={e => setEdadRetiro(parseInt(e.target.value))}>
                    <option value={60}>60 años — Cesantía (75%)</option>
                    <option value={61}>61 años — Cesantía (80%)</option>
                    <option value={62}>62 años — Cesantía (85%)</option>
                    <option value={63}>63 años — Cesantía (90%)</option>
                    <option value={64}>64 años — Cesantía (95%)</option>
                    <option value={65}>65 años — Vejez (100%) ★</option>
                    <option value={66}>66 años — Vejez (100%)</option>
                    <option value={67}>67 años — Vejez (100%)</option>
                    <option value={68}>68 años — Vejez (100%)</option>
                  </select>
                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0 0' }}>Factor Cesantía aplica 60-64 años · Vejez 65+</p>
                </div>
                <div>
                  <label style={labelSt}>✏️ Año de inicio del trámite Mod 40 (ajuste manual)</label>
                  <select style={manualInputSt} value={anioInicioTramite} onChange={e => setAnioInicioTramite(parseInt(e.target.value))}>
                    {[2026,2027,2028,2029,2030].map(a => <option key={a} value={a}>{a} — UMA: {new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(proyectarValor(117.31, 2026, a))}/día</option>)}
                  </select>
                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0 0' }}>Se llena solo si llenaste "¿A qué edad iniciar Mod 40?" arriba — cámbialo aquí solo si quieres forzar un año distinto</p>
                </div>
              </div>
            </div>

            {/* Cálculos automáticos */}
            {datos.semanas_totales > 0 && (() => {
              const sem = datos.semanas_totales - datos.semanas_descontadas
              const cumple = sem >= 500
              const edadMin = 65
              const asignaciones = (datos.tiene_conyuge ? 15 : 0) + datos.num_hijos * 10 + datos.num_padres * 10
              // Fecha calculada para el trámite (DATOS GEN.!E16) — fecha de nacimiento + edad mínima de pensión
              const fechaTramite = datos.fecha_nacimiento ? (() => {
                const d = new Date(datos.fecha_nacimiento)
                d.setFullYear(d.getFullYear() + (datos.edad_min_pension || 60))
                return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
              })() : '—'
              const semanasRestantesTab1 = Math.max(0, Math.ceil(500 - sem))
              return (
                <div style={{ ...cardSt, borderLeft: `3px solid ${cumple ? VERDE : '#ef4444'}` }}>
                  {sectionTitle('Resumen automático')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                    {kpiBox('Semanas válidas', sem.toLocaleString(), 'descontadas AFORE', cumple ? VERDE : '#ef4444', cumple ? 'verde' : 'rojo')}
                    {kpiBox('Semanas restantes', semanasRestantesTab1 === 0 ? '✓ 0' : semanasRestantesTab1.toString(), semanasRestantesTab1 === 0 ? 'Ya cumplió las 500' : 'para llegar a 500 mínimas', semanasRestantesTab1 === 0 ? VERDE : '#ef4444')}
                    {kpiBox('Fecha calculada trámite', fechaTramite, `a los ${datos.edad_min_pension || 60} años — DATOS GEN.!E16`, AZUL, 'azul')}
                    {kpiBox('Asignaciones familiares', `+${asignaciones}%`, `cónyuge + ${datos.num_hijos} hijo(s)`, '#8b5cf6')}
                    {kpiBox('Régimen', datos.ley === '73' ? 'Ley 73' : datos.ley === '97' ? 'Ley 97' : 'Por detectar', datos.ley ? 'Detectado del PDF' : 'Carga la constancia', AZUL)}
                    {kpiBox('Estado', cumple ? 'Apto' : 'Insuficiente', `${Math.max(0, 500 - sem)} sem. faltan`, cumple ? VERDE : '#ef4444', cumple ? 'verde' : 'rojo')}
                  </div>
                  {semaforo(cumple, cumple ? `Cumple semanas mínimas — ${sem} de 500 requeridas` : `Faltan ${500 - sem} semanas para poder pensionarse`)}
                </div>
              )
            })()}

            {navButtons(undefined, () => setTab(1), 'Siguiente: Salario promedio 250 sem. →')}
          </div>
        )}

        {/* ══ TAB 2: SALARIO PROMEDIO 250 SEMANAS ════════════════ */}
        {tab === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL, lineHeight: 1.6 }}>
              <strong>¿Por qué calculamos esto?</strong> La Ley del IMSS 1973 (Art. 167) establece que la pensión se calcula sobre el promedio del SDI de las <strong>últimas 250 semanas cotizadas</strong> (~5 años), no sobre el SDI actual. Este promedio es la base real de la pensión. Si se usa el SDI actual, el cálculo puede estar sobreestimado o subestimado.
            </div>

            {/* Resumen */}
            <div style={{ ...cardSt, borderLeft: `3px solid ${NARANJA}` }}>
              {sectionTitle('Resumen del cálculo', periodos.length > 0 ? `${periodos.length} períodos analizados · ${periodos.reduce((s,p) => s+p.semanas, 0)} semanas` : 'Carga la constancia IMSS para calcular automáticamente')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                {kpiBox('SDI promedio 250 sem.', sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—', 'Base oficial de pensión', AZUL, 'azul', true)}
                {kpiBox('SDI mensual equivalente', sdiPromedio > 0 ? fmtMXN(sdiPromedio * 30.4) : '—', '× 30.4 días', '#1e293b', 'gris')}
                {kpiBox('Diferencia vs SDI actual', periodos.length > 0 && sdiPromedio > 0 ? fmtMXN2(periodos[periodos.length-1]?.sdi - sdiPromedio) : '—', 'SDI actual vs promedio', periodos.length > 0 && periodos[periodos.length-1]?.sdi > sdiPromedio ? '#ef4444' : VERDE)}
                {kpiBox('Período cubierto', periodos.length > 0 ? `${periodos[0]?.fecha_inicio?.slice(0,7) || '—'} → ${periodos[periodos.length-1]?.fecha_fin?.slice(0,7) || '—'}` : '—', '250 semanas hacia atrás')}
              </div>

              {periodos.length > 0 && (
                <>
                  {/* Tabla condensada — top 5 períodos por peso */}
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#F4F6FB' }}>
                          {['Período','Semanas','SDI diario','SDI mensual','Peso'].map((h, i) => (
                            <th key={i} style={{ padding: '7px 10px', textAlign: i > 0 ? 'right' : 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {periodos.slice(0, 5).map((p, i) => (
                          <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px', color: '#374151' }}>{p.fecha_inicio?.slice(0,7)} → {p.fecha_fin?.slice(0,7)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.semanas}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: NARANJA }}>{fmtMXN2(p.sdi)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{fmtMXN(p.sdi * 30.4)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{p.peso.toFixed(1)}%</td>
                          </tr>
                        ))}
                        {periodos.length > 5 && (
                          <tr style={{ background: '#F4F6FB' }}>
                            <td colSpan={5} style={{ padding: '6px 10px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
                              … {periodos.length - 5} períodos más — ver detalle completo
                            </td>
                          </tr>
                        )}
                        <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                          <td style={{ padding: '7px 10px', fontWeight: '700', color: AZUL }}>Promedio ponderado</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{periodos.reduce((s,p) => s+p.semanas, 0)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '800', color: NARANJA, fontSize: '14px' }}>{fmtMXN2(sdiPromedio)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{fmtMXN(sdiPromedio * 30.4)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setShowDetalle250(true)} className="btn-secondary" style={{ ...btnSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📊 Ver desglose completo de las 250 semanas
                    </button>
                    {periodosCompletos.length > 0 && (
                      <button onClick={() => setShowHistorialCompleto(true)} className="btn-secondary" style={{ ...btnSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        🗂️ Ver historial laboral completo ({periodosCompletos.reduce((s: number, p: any) => s + (p.semanas || 0), 0)} semanas, {periodosCompletos.length} períodos)
                      </button>
                    )}
                  </div>
                </>
              )}

              {periodos.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', background: '#F4F6FB', borderRadius: '8px', color: '#94a3b8', fontSize: '12px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>📄</div>
                  Carga la constancia IMSS en PDF (botón en la parte superior) para calcular automáticamente el promedio de las 250 semanas.<br />
                  También puedes ingresar los períodos manualmente.
                </div>
              )}
            </div>

            {navButtons(() => setTab(0), () => setTab(2), 'Siguiente: Pensión actual →')}
          </div>
        )}

        {/* ══ TAB 3: PENSIÓN ACTUAL (sin Mod 40) ══════════════════ */}
        {tab === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {sdiPromedio <= 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>📋</div>
                <p style={{ margin: '0 0 14px' }}>Carga la constancia IMSS en <strong>Datos generales</strong> para calcular la pensión actual.</p>
                <button onClick={() => setTab(0)} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px' }}>← Ir a Datos generales</button>
              </div>
            )}
            {sdiPromedio > 0 && (() => {
              const sem = datos.semanas_totales - datos.semanas_descontadas
              // Usa la función canónica de formulas.ts para el desglose completo
              // IMPORTANTE: en tab 3 mostramos la pensión con factor de edad REAL (no ×100%)
              // La función ya aplica FACTOR_111, factorEdad y PMG correctamente
              const edadPension = datos.edad_min_pension || datos.edad_actual || 60
              const resActual = calcPensionLey73(sem, sdiPromedio, edadPension, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, undefined, datos.tiene_ayuda_asistencial)
              const pensionMensual = resActual.pensionMensual
              const pensionActualAnual = resActual.pensionAnual
              const aguinaldo = resActual.aguinaldoAnual
              const vecesUMA = sdiPromedio / sys.UMA_DIARIA
              const { basica, incremento } = buscarCuantiaPorUMA(vecesUMA)
              const pmg_aplica = resActual.pmg_aplica
              const semanasRestantes = Math.max(0, 500 - sem)
              const mesesDesde = fechaUltimaCot ? Math.floor((Date.now() - new Date(fechaUltimaCot).getTime()) / (30 * 86400000)) : 0
              const cons = calcConservacion(datos.semanas_totales, mesesDesde)
              return (<>
                {/* Bloque conservación de derechos */}
                <div style={{ ...cardSt, borderLeft: `3px solid ${cons.vigente ? VERDE : '#ef4444'}` }}>
                  {sectionTitle('Estado de derechos')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                    {kpiBox('Estado', cons.vigente ? 'Vigente' : 'Vencido', cons.venceEn ? `${cons.venceEn} meses restantes` : 'Período vencido', cons.vigente ? VERDE : '#ef4444', undefined, true)}
                    {kpiBox('Semanas cotizadas', sem.toLocaleString(), 'netas', sem >= 500 ? VERDE : '#f59e0b')}
                    {kpiBox('Semanas restantes', semanasRestantes === 0 ? '✓ 0' : semanasRestantes.toString(), semanasRestantes === 0 ? 'Ya cumplió las 500' : 'para llegar a 500', semanasRestantes === 0 ? VERDE : '#ef4444')}
                    {kpiBox('Edad actual', `${(datos.edad_actual || 0).toFixed(1)} años`, 'Pensión mínima a los 60', AZUL)}
                    {kpiBox('Años para pensión', Math.max(0, 60 - (datos.edad_actual || 0)).toFixed(1), 'sin Mod 40', '#8b5cf6')}
                  </div>
                </div>

                {/* Desglose pensión actual — igual que PENSIÓN ACTUAL del Excel */}
                <div style={cardSt}>
                  {sectionTitle('Diagnóstico de Pensión Actual (sin Modalidad 40)', `Salario promedio: ${fmtMXN2(sdiPromedio)} | ${sem.toFixed(0)} semanas | ${vecesUMA.toFixed(2)} veces UMA`)}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                    {kpiBox('Cuantía básica anual', fmtMXN(resActual.cuantiaBasicaAnual), `${(basica * 100).toFixed(1)}% × SDI × 365 × ×1.11 × ${(resActual.factorEdad * 100).toFixed(0)}%`, AZUL, undefined, true)}
                    {kpiBox('Incrementos anuales', fmtMXN(resActual.incrementosAnual), `${resActual.numIncrementos.toFixed(1)} incrementos × ${(incremento * 100).toFixed(4)}%`, '#3b82f6', undefined, true)}
                    {kpiBox('Asignaciones familiares', fmtMXN(resActual.asignacionesAnual), datos.tiene_conyuge ? 'Cónyuge + hijos' : datos.num_hijos > 0 ? `${datos.num_hijos} hijo(s)` : 'Sin dependientes', '#0d9488', undefined, true)}
                    {resActual.ayudaAsistencialAnual > 0 && kpiBox('Ayuda asistencial', fmtMXN(resActual.ayudaAsistencialAnual), 'Sin beneficiarios (Art. 165 LSS)', '#8b5cf6', undefined, true)}
                    {kpiBox('Pensión total anual', fmtMXN(pensionActualAnual), 'cuantía + incrementos + asignaciones', AZUL)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                    {kpiBox('Factor de edad', `${(resActual.factorEdad * 100).toFixed(0)}%`, `${edadPension.toFixed(0)} años — Art. 167 LSS`, '#f59e0b')}
                    {pmg_aplica && kpiBox('🛡️ PMG aplica', fmtMXN(sys.PMG_L73) + '/mes', 'La PMG es mayor a la calculada', VERDE, undefined, true)}
                    {kpiBox('Pensión mensual', fmtMXN(pensionMensual), 'monto final (con PMG si aplica)', VERDE, undefined, true)}
                    {kpiBox('Pensión anual', fmtMXN(pensionActualAnual), 'total anual', VERDE)}
                    {kpiBox('Aguinaldo anual', fmtMXN(aguinaldo), '15 días de pensión (Art. 171 LSS)', '#8b5cf6')}
                  </div>
                  <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '11px', color: '#166534' }}>
                    💡 Esta es la pensión que recibiría el cliente hoy si se pensionara sin Modalidad 40. Es la línea base para comparar los escenarios.
                  </div>
                </div>
              </>)
            })()}
            {navButtons(() => setTab(1), () => setTab(3), 'Siguiente: Modalidad 40 →')}
          </div>
        )}

        {/* ══ TAB 4: MODALIDAD 40 ═════════════════════════════════ */}
        {tab === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {datos.semanas_totales === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8', fontSize: '13px' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>📋</div>
                <p style={{ margin: '0 0 14px' }}>Carga primero la constancia IMSS en <strong>Datos generales</strong> para configurar la Modalidad 40.</p>
                <button onClick={() => setTab(0)} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px' }}>← Ir a Datos generales</button>
              </div>
            )}
            {datos.semanas_totales > 0 && <>
            <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL, lineHeight: 1.6 }}>
              <strong>Modalidad 40 (Art. 218 LSS 1973):</strong> Permite al trabajador cotizar voluntariamente sobre un salario superior al actual, incrementando la base de cálculo de su pensión. Es la estrategia de optimización pensional más poderosa disponible en México.
            </div>

            {guiaCampos(true)}
            <div style={cardSt}>
              {sectionTitle('Configuración de la Modalidad 40')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={labelSt}>✏️ Salario base Mod 40 (veces UMA)</label>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 5px', lineHeight: 1.4 }}>El salario sobre el que el cliente quiere cotizar voluntariamente. A mayor UMA, mayor pensión final pero mayor costo mensual. Rango típico: 10–25 UMAs.</p>
                  <input type="number" step="0.5" style={manualNumInputSt} value={mod40Umas} onChange={e => setMod40Umas(parseFloat(e.target.value) || 1)} />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>SDI: {fmtMXN2(mod40Umas * sys.UMA_DIARIA)}/día</p>
                </div>
                <div>
                  <label style={labelSt}>✏️ Período de cotización (meses)</label>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 5px', lineHeight: 1.4 }}>Cuántos meses pagará Modalidad 40 antes de tramitar la pensión. Solo cuentan los <strong>últimos 60 meses</strong> (5 años) para el promedio del SDI — periodos más largos no incrementan más la pensión pero sí el costo total.</p>
                  <input type="number" style={manualNumInputSt} value={mod40Meses} onChange={e => setMod40Meses(parseInt(e.target.value) || 1)} />
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '5px' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>= </span>
                    <input type="number" min={0} style={{ ...manualNumInputSt, padding: '4px 6px', fontSize: '11px', width: '50px' }}
                      value={Math.floor(mod40Meses / 12)}
                      onChange={e => { const a = parseInt(e.target.value) || 0; const m = mod40Meses % 12; setMod40Meses(a * 12 + m) }} />
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>años</span>
                    <input type="number" min={0} max={11} style={{ ...manualNumInputSt, padding: '4px 6px', fontSize: '11px', width: '50px' }}
                      value={mod40Meses % 12}
                      onChange={e => { const m = Math.min(11, parseInt(e.target.value) || 0); const a = Math.floor(mod40Meses / 12); setMod40Meses(a * 12 + m) }} />
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>meses</span>
                  </div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{(mod40Meses * 4.33).toFixed(0)} semanas adicionales</p>
                </div>
                <div>
                  <label style={labelSt}>⚙️ Tasa Mod 40 {anioInicioTramite} (%)</label>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 5px', lineHeight: 1.4 }}>Porcentaje que el IMSS cobra mensualmente sobre el SDI elegido. Cambia cada año (ajuste de enero) — se toma la tasa configurada para el año real en que iniciaría el trámite.</p>
                  <input type="number" step="0.001" style={sysNumInputSt} value={getMod40Pct(anioInicioTramite)} readOnly />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Configurable en Configuración</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                {kpiBox('Costo mensual', fmtMXN(calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys)), 'Pago mensual al IMSS', NARANJA, 'naranja', true)}
                {kpiBox('Inversión total', fmtMXN(calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys) * mod40Meses), `${mod40Meses} meses`, '#dc2626', 'rojo')}
                {kpiBox('SDI con Mod 40', fmtMXN2(mod40Umas * sys.UMA_DIARIA), 'Salario cotizado', AZUL, 'azul')}
                {kpiBox('Semanas que agrega', `${(mod40Meses * 4.33).toFixed(0)}`, 'al historial', VERDE, 'verde')}
              </div>

              <button onClick={() => setShowDetallesMod40(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: AZUL, padding: '4px 0', marginBottom: showDetallesMod40 ? '10px' : '14px' }}>
                {showDetallesMod40 ? '▾' : '▸'} {showDetallesMod40 ? 'Ocultar' : 'Ver'} detalles adicionales (fecha de baja, semanas, costo real con AFORE)
              </button>

              {showDetallesMod40 && (() => {
                // Fecha estimada de baja (fin de Mod 40), semanas cotizadas y SDI en ese momento
                const fechaInicioMod40 = new Date(anioInicioTramite, 0, 1)
                const fechaBaja = new Date(fechaInicioMod40)
                fechaBaja.setMonth(fechaBaja.getMonth() + mod40Meses)
                const semanasEnBaja = Math.round((datos.semanas_totales || 0) + mod40Meses * 4.33)
                const umaEnInicio = proyectarValor(sys.UMA_DIARIA, new Date().getFullYear(), anioInicioTramite)
                const sdiEnBaja = mod40Umas * umaEnInicio
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                    {kpiBox('Fecha estimada de baja', fechaBaja.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }), 'Fin de Modalidad 40', '#7c3aed', 'azul')}
                    {kpiBox('Semanas cotizadas en ese momento', semanasEnBaja.toString(), `${datos.semanas_totales || 0} actuales + ${(mod40Meses * 4.33).toFixed(0)} de Mod 40`, VERDE, 'verde')}
                    {kpiBox('Salario (SDI) en ese momento', fmtMXN2(sdiEnBaja), `UMA proyectada a ${anioInicioTramite}`, AZUL, 'azul')}
                  </div>
                )
              })()}

              {showDetallesMod40 && (() => {
                const inversionTotal = calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys) * mod40Meses
                const PCT_AFORE = (sys.pct_afore_mod40 ?? 20) / 100
                const teRegresaAfore = inversionTotal * PCT_AFORE
                const costoReal = inversionTotal - teRegresaAfore
                return (
                  <div style={cardSt}>
                    {sectionTitle('Costo real vs. lo que te regresa la AFORE', 'De cada cuota de Mod 40, una parte va a tu subcuenta de Retiro 97 y SÍ se te regresa al pensionarte')}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                      {kpiBox('Inversión bruta total', fmtMXN(inversionTotal), `${mod40Meses} meses pagados al IMSS`, '#dc2626', 'rojo')}
                      {kpiBox(`Te regresa AFORE (~${(PCT_AFORE * 100).toFixed(0)}%)`, fmtMXN(teRegresaAfore), 'Subcuenta Retiro 97, pago único', '#0891b2', 'azul')}
                      {kpiBox('Costo real de Mod 40', fmtMXN(costoReal), 'Inversión bruta − lo que regresa AFORE', NARANJA, 'naranja', true)}
                    </div>
                    <p style={{ fontSize: '9px', color: '#94a3b8', marginTop: '8px' }}>
                      Estimado de mercado (~20% va a Retiro 97, ~80% financia el seguro de Cesantía/Vejez que paga tu pensión mensual). El porcentaje exacto depende de tu historial — verifica en tu estado de cuenta AFORE al pensionarte.
                    </p>
                  </div>
                )
              })()}

              {/* Pago retroactivo — solo si el cliente ya debería estar pagando Mod 40 y no lo ha hecho */}
              <div style={cardSt}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: tieneAtraso ? '14px' : 0 }}>
                  <input type="checkbox" checked={tieneAtraso} onChange={e => setTieneAtraso(e.target.checked)} />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>✏️ ¿El cliente ya debería haber iniciado Mod 40 y no lo ha hecho? (pago retroactivo)</span>
                </label>
                {tieneAtraso && (() => {
                  const fechaDebioIniciar = fechaAtrasoMod40 ? new Date(fechaAtrasoMod40 + 'T00:00:00') : null
                  const mesesAtraso = fechaDebioIniciar
                    ? Math.max(0, Math.round((Date.now() - fechaDebioIniciar.getTime()) / (30.4 * 86400000)))
                    : 0
                  const retro = mesesAtraso > 0 ? calcPagoRetroactivo(Math.min(mesesAtraso, 60), new Date(), mod40Umas, sys, getMod40Pct) : null
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <label style={labelSt}>✏️ ¿Desde cuándo debió iniciar?</label>
                          <input type="date" style={manualInputSt} value={fechaAtrasoMod40} onChange={e => setFechaAtrasoMod40(e.target.value)} />
                          <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0 0' }}>Máximo 5 años (60 meses) de retroactivo permitido por el IMSS</p>
                        </div>
                        <div>
                          <label style={labelSt}>⚡ Meses de atraso</label>
                          <div style={{ ...autoInputSt, display: 'flex', alignItems: 'center', fontWeight: '700' }}>{Math.min(mesesAtraso, 60)} meses{mesesAtraso > 60 ? ' (limitado a 60)' : ''}</div>
                        </div>
                      </div>
                      {retro && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                            {kpiBox('Costo base (cuotas atrasadas)', fmtMXN(retro.costoBase), `${Math.min(mesesAtraso, 60)} meses sin pagar`, '#64748b')}
                            {kpiBox('+ Actualización (INPC)', fmtMXN(retro.totalActualizacion), 'por inflación acumulada', '#0891b2')}
                            {kpiBox('+ Recargos', fmtMXN(retro.totalRecargos), '1.47-2.07% mensual', '#dc2626')}
                            {kpiBox('Costo total retroactivo', fmtMXN(retro.costoTotal), `+${(retro.pctIncremento * 100).toFixed(1)}% vs pagar a tiempo`, NARANJA, 'naranja', true)}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                            {kpiBox(`Te regresa AFORE (~${(sys.pct_afore_mod40 ?? 20).toFixed(0)}%)`, fmtMXN(retro.recuperaAfore), 'Subcuenta Retiro 97', '#0891b2', 'azul')}
                            {kpiBox('Costo neto del retroactivo', fmtMXN(retro.costoNeto), 'costo total − AFORE', VERDE, 'verde', true)}
                          </div>
                          <p style={{ fontSize: '9px', color: '#94a3b8', marginTop: '8px' }}>
                            Estimado — usa actualización por INPC histórico y una tasa de recargos de referencia (1.47% mensual antes de 2026, 2.07% desde 2026). El monto exacto lo determina el IMSS al emitir la línea de captura; puede variar hasta ~10%.
                          </p>
                        </>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>

            {/* Tabla de cotización mensual */}
            <div style={cardSt}>
              {(() => {
                const header = sectionTitle('Proyección de cotización mensual', `${mod40Meses} meses · ${fmtMXN(calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys))}/mes`)
                return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {header}
                  <button onClick={() => setShowAllMonths(v => !v)}
                    style={{ fontSize: '11px', padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#F4F6FB', cursor: 'pointer', color: '#64748b', fontFamily: 'inherit', flexShrink: 0 }}>
                    {showAllMonths ? '↩️ Ver resumen' : '📋 Ver todos los meses'}
                  </button>
                </div>
              })()}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F4F6FB' }}>
                      {['Mes','SDI cotizado','Cuota mensual','Acumulado','Semanas Mod 40'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 10px', textAlign: i === 0 ? 'center' : 'right', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const costoMensual = calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys)
                      const sdiMod40 = mod40Umas * sys.UMA_DIARIA
                      const rows = []
                      const showMonths = showAllMonths ? Array.from({length: mod40Meses}, (_, i) => i + 1) : [1, 2, 3, Math.floor(mod40Meses/2), mod40Meses]
                      for (const mes of [...new Set(showMonths)].filter(m => m >= 1 && m <= mod40Meses)) {
                        rows.push(
                          <tr key={mes} style={{ background: mes % 2 === 0 ? '#F8FAFC' : 'white', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8', fontWeight: '600', borderRight: '1px solid #f1f5f9' }}>{mes}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: AZUL, borderRight: '1px solid #f1f5f9' }}>{fmtMXN2(sdiMod40)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: NARANJA, fontWeight: '600', borderRight: '1px solid #f1f5f9' }}>{fmtMXN(costoMensual)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: VERDE, fontWeight: '600', borderRight: '1px solid #f1f5f9' }}>{fmtMXN(costoMensual * mes)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{(mes * 4.33).toFixed(1)}</td>
                          </tr>
                        )
                        if (!showAllMonths && mes === 3 && mod40Meses > 5) rows.push(
                          <tr key="dots" style={{ background: '#F8FAFC' }}>
                            <td colSpan={5} style={{ padding: '5px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>⋯ {mod40Meses - 4} meses intermedios — presiona "Ver todos los meses" para expandir ⋯</td>
                          </tr>
                        )
                      }
                      return rows
                    })()}
                    <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: '700', color: AZUL, borderRight: '1px solid #e2e8f0' }}>Total</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b', borderRight: '1px solid #e2e8f0' }}>—</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: NARANJA, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys))}/mes</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '800', color: AZUL, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys) * mod40Meses)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: VERDE }}>{(mod40Meses * 4.33).toFixed(0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabla costo año por año con tasa incremental */}
            <div style={cardSt}>
              {sectionTitle('Costo Modalidad 40 por año (con UMA proyectada)', `Inicio: ${anioInicioTramite} · UMA proyectada: ${fmtMXN2(proyectarValor(sys.UMA_DIARIA, new Date().getFullYear(), anioInicioTramite))}/día`)}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: AZUL }}>
                      {['Año', 'UMA diaria', 'Tasa Mod 40', 'Salario registrado', 'Cuota mensual', 'Cuota anual'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 10px', color: 'white', textAlign: i > 0 ? 'right' : 'left', fontSize: '10px', fontWeight: '700', borderRight: i < 5 ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const anioBase = new Date().getFullYear()
                      const anioFin = anioInicioTramite + Math.ceil(mod40Meses / 12)
                      const rows = []
                      let costoTotal = 0
                      for (let anio = anioInicioTramite; anio <= anioFin; anio++) {
                        const uma = proyectarValor(sys.UMA_DIARIA, anioBase, anio)
                        const tasa = getMod40Pct(anio) / 100
                        const salario = mod40Umas * uma * 30.4
                        const mesInicio = anio === anioInicioTramite ? 1 : 1
                        const mesesEnAnio = anio === anioInicioTramite
                          ? Math.min(12, mod40Meses)
                          : anio === anioFin
                          ? mod40Meses % 12 || 12
                          : 12
                        const cuotaMes = salario * tasa
                        const cuotaAnual = cuotaMes * mesesEnAnio
                        costoTotal += cuotaAnual
                        const isActive = mesesEnAnio > 0
                        rows.push(
                          <tr key={anio} style={{ background: isActive ? (rows.length % 2 === 0 ? 'white' : '#F8FAFC') : '#F8FAFC', borderBottom: '1px solid #f1f5f9', opacity: isActive ? 1 : 0.4 }}>
                            <td style={{ padding: '6px 10px', fontWeight: '600', color: isActive ? AZUL : '#94a3b8' }}>{anio}{anio === anioBase ? ' (hoy)' : ''}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{fmtMXN2(uma)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{(tasa * 100).toFixed(3)}%</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{fmtMXN(salario)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: isActive ? NARANJA : '#94a3b8' }}>{isActive ? fmtMXN(cuotaMes) : '—'}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: isActive ? VERDE : '#94a3b8' }}>{isActive ? fmtMXN(cuotaAnual) : '—'}</td>
                          </tr>
                        )
                      }
                      return rows
                    })()}
                    <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={4} style={{ padding: '7px 10px', fontWeight: '700', color: AZUL }}>Costo total Mod 40</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: NARANJA }}>{fmtMXN(calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys))}/mes aprox.</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '800', color: AZUL }}>{fmtMXN(calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys) * mod40Meses)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: '12px 16px', background: '#F0FDF4', border: '1px solid #bbf7d0', borderRadius: '10px', fontSize: '12px', color: '#15803d', lineHeight: 1.6 }}>
              <strong>¿Tu cliente es trabajador independiente o no califica para Mod 40?</strong> La <strong>Modalidad 10</strong> permite afiliarse al IMSS con cobertura completa (médica + pensión + Infonavit) y puede usarse como paso previo para habilitar Mod 40.{' '}
              <button onClick={() => setTab(4)} style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', fontSize: '12px', padding: 0 }}>Ver Modalidad 10 →</button>
            </div>

            {/* MOD 40 REC. VS RETRO. — comparativo igual a la hoja del Excel */}
            {escenarios.filter(e => e.mod40_meses > 0).length > 0 && (() => {
              const esc = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
              if (!esc || esc.mod40_meses === 0) return null
              return (
                <div style={cardSt}>
                  {sectionTitle('Recurrente vs Retroactivo', 'Hoja MOD 40 REC. VS RETRO. del Excel')}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ background: '#F4F6FB' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontSize: '10px', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', minWidth: '200px' }}>Concepto</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: AZUL, fontSize: '10px', textTransform: 'uppercase', borderBottom: `2px solid ${AZUL}` }}>Pago Recurrente (Mes a Mes)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: NARANJA, fontSize: '10px', textTransform: 'uppercase', borderBottom: `2px solid ${NARANJA}` }}>Pago Retroactivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Pensión sin Mod. 40', rec: fmtMXN(esc.pension_base), ret: fmtMXN(esc.pension_base) },
                          { label: 'Pensión mejorada', rec: fmtMXN(esc.pension_mensual), ret: fmtMXN(esc.pension_mensual), highlight: true },
                          { label: 'Inversión total', rec: fmtMXN(esc.costo_total), ret: fmtMXN(esc.costo_retroactivo) },
                          { label: 'Recuperación AFORE (~20%)', rec: fmtMXN(esc.recuperacion_afore), ret: fmtMXN(esc.recuperacion_afore_retro) },
                          { label: 'Inversión neta', rec: fmtMXN(esc.inversion_neta), ret: fmtMXN(esc.inversion_neta_retro), highlight: true },
                          { label: 'Meses para recuperar', rec: `${esc.roi_meses.toFixed(1)} meses`, ret: `${esc.roi_retro.toFixed(1)} meses` },
                          { label: 'Ganancia a los 80 años', rec: fmtMXN(esc.ganancia_a80), ret: fmtMXN(esc.ganancia_a80_retro), highlight: true },
                          { label: 'Tasa de rendimiento', rec: `${esc.tasa_rendimiento.toFixed(2)}%`, ret: `${esc.tasa_rendimiento_retro.toFixed(2)}%` },
                          { label: 'Termómetro de inversión',
                            rec: esc.tasa_rendimiento >= 25 ? '🟢 Excelente' : esc.tasa_rendimiento >= 18 ? '🔵 Buena' : esc.tasa_rendimiento >= 12 ? '🟡 Moderada' : '🔴 Riesgo',
                            ret: esc.tasa_rendimiento_retro >= 25 ? '🟢 Excelente' : esc.tasa_rendimiento_retro >= 18 ? '🔵 Buena' : esc.tasa_rendimiento_retro >= 12 ? '🟡 Moderada' : '🔴 Riesgo'
                          },
                        ].map((row, i) => (
                          <tr key={i} style={{ background: row.highlight ? '#f0f9ff' : i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 12px', fontWeight: '600', color: '#374151' }}>{row.label}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: row.highlight ? '700' : 'normal', color: row.highlight ? AZUL : '#374151' }}>{row.rec}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: row.highlight ? '700' : 'normal', color: row.highlight ? NARANJA : '#374151' }}>{row.ret}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {navButtons(() => setTab(2), () => setTab(4), 'Siguiente: Inversión →')}
            </>}

          </div>
        )}


        {/* ══ TAB 5: INVERSIÓN ══════════════════════════════════ */}
        {tab === 4 && (() => {
          if (datos.semanas_totales === 0 || escenarios.length === 0) return (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>📊</div>
              <p style={{ margin: '0 0 14px' }}>Calcula primero los escenarios en <strong>Modalidad 40</strong>.</p>
              <button onClick={() => setTab(3)} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px' }}>← Ir a Modalidad 40</button>
            </div>
          )
          const esc = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!esc) return null
          const pensionBase = esc.pension_base
          const pensionMejorada = esc.pension_mensual
          const mejora = pensionMejorada - pensionBase
          const roi = esc.roi_meses
          const edadRetiro = 62
          const mesesHasta80 = Math.max(0, (80 - edadRetiro) * 12)
          const gananciaa80 = esc.ganancia_a80
          const tasaRend = esc.tasa_rendimiento
          const invNeta = esc.inversion_neta
          const termometro = tasaRend >= 25 ? { label: 'Excelente Inversión', color: VERDE, bg: '#f0fdf4' }
            : tasaRend >= 18 ? { label: 'Buena Inversión', color: '#0891b2', bg: '#f0f9ff' }
            : tasaRend >= 12 ? { label: 'Inversión Moderada', color: '#f59e0b', bg: '#fffbeb' }
            : { label: 'Inversión de Riesgo', color: '#ef4444', bg: '#fef2f2' }
          // Tabla año × año (igual a hoja "Incremento Pen Esc 1" del Excel)
          const INPC = 0.045 // inflación anual supuesta para proyectar pensiones
          const mesesFin = 60 // duración del financiamiento
          const descuentoMensual = 0
          const filas: { anio: number; edad: number; penSin: number; penCon: number; descuento: number; penInmediata: number; gananciaAnio: number; gananciaAcum: number }[] = []
          let penSin = pensionBase, penCon = pensionMejorada, ganAcum = 0
          for (let i = 1; i <= Math.max(20, 80 - edadRetiro + 1); i++) {
            penSin *= (1 + INPC)
            penCon *= (1 + INPC)
            const edad = edadRetiro + i
            const desc = i <= (mesesFin / 12) && descuentoMensual > 0 ? -descuentoMensual : 0
            const penInmediata = penCon + desc
            const ganAnio = (penInmediata - penSin) * 12
            ganAcum += ganAnio
            filas.push({ anio: i, edad, penSin, penCon, descuento: desc, penInmediata, gananciaAnio: ganAnio, gananciaAcum: ganAcum })
            if (edad >= 81) break
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {sectionTitle('Análisis de Inversión', 'Hoja INVERSION del Excel — compara escenario actual vs con Modalidad 40')}

              {/* KPIs principales — MEJORA DE PENSIÓN */}
              <div style={cardSt}>
                {sectionTitle('Mejora de Pensión', 'Sin Modalidad 40 vs. Con Modalidad 40')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {kpiBox('Sin Modalidad 40', fmtMXN(pensionBase), 'pensión mensual actual', '#ef4444')}
                  {kpiBox('Con Modalidad 40', fmtMXN(pensionMejorada), `Edad de retiro: ${edadRetiro} años`, VERDE, undefined, true)}
                  {kpiBox('Mejora mensual', fmtMXN(mejora), `+${((mejora / pensionBase) * 100).toFixed(0)}% más pensión`, AZUL, undefined, true)}
                  {kpiBox('Aguinaldo anual', fmtMXN((pensionMejorada * 15) / 30), '15 días de pensión (Art. 171 LSS)', '#8b5cf6')}
                </div>
              </div>

              {/* KPIs de inversión */}
              <div style={cardSt}>
                {sectionTitle('Análisis de la Inversión', 'Hoja INVERSION!B7 del Excel')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  {kpiBox('Periodos de recuperación', `${roi.toFixed(1)} meses`, 'inversión neta ÷ mejora mensual', '#f59e0b', undefined, true)}
                  {kpiBox('Flujos cobrados a los 80', fmtMXN(pensionMejorada * mesesHasta80), 'total acumulado con Mod40', AZUL)}
                  {kpiBox('Ganancia total a los 80', fmtMXN(gananciaa80), 'flujos con − flujos sin − inversión', VERDE, undefined, true)}
                  {kpiBox('Tasa de rendimiento', `${tasaRend.toFixed(2)}%`, 'ganancia ÷ inversión neta × 100', AZUL)}
                </div>
                {/* Termómetro de inversión */}
                <div style={{ padding: '12px 16px', background: termometro.bg, border: `1.5px solid ${termometro.color}`, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '28px' }}>🌡️</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: termometro.color }}>{termometro.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>Tasa de rendimiento total: {tasaRend.toFixed(2)}% — {tasaRend >= 25 ? 'Inversión excepcional: el cliente recupera su dinero y gana mucho más.' : tasaRend >= 18 ? 'Buena inversión con retorno sólido.' : 'Evaluar con el cliente si es viable.'}</p>
                  </div>
                </div>
              </div>

              {/* Tabla año × año */}
              <div style={cardSt}>
                {sectionTitle('Detalle de Ganancia por Mejora de Pensión año × año', 'Hoja "Incremento Pen Esc 1" del Excel — pensiones proyectadas con inflación 4.5% anual')}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#F4F6FB' }}>
                        {['Año', 'Edad', 'Escenario Actual', 'Pensión Mejorada', 'Descuento Fin.', 'Pensión Inmediata', 'Ganancia en el Año', 'Ganancia Acumulada'].map((h, i) => (
                          <th key={i} style={{ padding: '7px 10px', textAlign: 'right' as const, fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f, i) => (
                        <tr key={i} style={{ background: f.edad === 80 ? '#f0fdf4' : i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9', fontWeight: f.edad === 80 ? '700' : 'normal' }}>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748b' }}>{f.anio}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: f.edad === 80 ? VERDE : '#374151' }}>{f.edad}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{fmtMXN(f.penSin)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: AZUL }}>{fmtMXN(f.penCon)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: f.descuento < 0 ? '#ef4444' : '#94a3b8' }}>{f.descuento < 0 ? fmtMXN(f.descuento) : '—'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: VERDE, fontWeight: '600' }}>{fmtMXN(f.penInmediata)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: f.gananciaAnio > 0 ? VERDE : '#ef4444' }}>{fmtMXN(f.gananciaAnio)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: f.gananciaAcum > 0 ? VERDE : '#ef4444', fontWeight: '600' }}>{fmtMXN(f.gananciaAcum)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px' }}>
                  Pensiones proyectadas con inflación anual del 4.5% (supuesto estándar). La fila en verde corresponde a los 80 años (edad de análisis de referencia del Excel).
                </p>
              </div>

              {navButtons(() => setTab(3), () => setTab(5), 'Siguiente: Financiamiento →')}
            </div>
          )
        })()}

        {/* ══ TAB 6: FINANCIAMIENTO ═══════════════════════════════════ */}
        {tab === 5 && (() => {
          const esc = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
          if (!esc || esc.mod40_meses === 0) return (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>🏦</div>
              <p style={{ margin: '0 0 14px' }}>Configura primero un escenario en <strong>Modalidad 40</strong> para ver las opciones de financiamiento.</p>
              <button onClick={() => setTab(3)} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px' }}>← Ir a Modalidad 40</button>
            </div>
          )
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {sectionTitle('Financiamiento del Pago Retroactivo', `Hoja FINANCIAMIENTO del Excel — ${esc.label}`)}

              {/* Participaciones */}
              <div style={cardSt}>
                {sectionTitle('Distribución del Pago Retroactivo', 'FINANCIAMIENTO!B5-B11')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  {kpiBox('Pago Retroactivo Total', fmtMXN(esc.costo_retroactivo), 'con recargos y actualizaciones', AZUL, undefined, true)}
                  {kpiBox('Recuperas vía AFORE', fmtMXN(esc.recuperacion_afore_retro), `~${sys.pct_afore_mod40 ?? 20}% del retroactivo`, VERDE)}
                  {kpiBox('Aportación Banco Regulado', fmtMXN(esc.aportacion_banco), '~35.6% del retroactivo', '#3b82f6', undefined, true)}
                  {kpiBox('Aportación Segundo Fondeo', fmtMXN(esc.aportacion_segundo_fondeo), 'ahorros propios o segundo fondeador', '#f59e0b')}
                  {kpiBox('Cantidad mínima en AFORE', fmtMXN(esc.cantidad_minima_afore), 'debes tener en tu AFORE — SEGUNDO FONDEADOR!C9', '#ef4444', undefined, true)}
                </div>
              </div>

              {/* Impacto en la pensión */}
              <div style={cardSt}>
                {sectionTitle('Impacto en la Pensión', 'FINANCIAMIENTO!E15-F17 — durante y después del crédito')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  {kpiBox('Pensión sin financiar', fmtMXN(esc.pension_base), 'situación actual', '#94a3b8')}
                  {kpiBox('Pensión mejorada', fmtMXN(esc.pension_mensual), `edad de retiro ${esc.edad_retiro} años`, AZUL)}
                  {kpiBox('Descuento mensual (60 meses)', fmtMXN(esc.descuento_mensual), 'cuota del crédito bancario', '#ef4444')}
                  {kpiBox('🚀 Pensión inmediata', fmtMXN(esc.pension_inmediata), 'durante los 60 meses del crédito', NARANJA, undefined, true)}
                  {kpiBox('🏆 Pensión al liquidar', fmtMXN(esc.pension_al_liquidar), 'después de pagar el crédito (mes 61+)', VERDE, undefined, true)}
                </div>
                {/* Comparativo visual */}
                <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '14px', display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', gap: '8px', alignItems: 'center', textAlign: 'center' as const }}>
                  {[
                    { label: 'Sin hacer nada', val: esc.pension_base, color: '#94a3b8' },
                    { label: '→', val: null, color: '#94a3b8' },
                    { label: 'Pensión inmediata', val: esc.pension_inmediata, color: NARANJA },
                    { label: '→', val: null, color: '#94a3b8' },
                    { label: 'Pensión al liquidar', val: esc.pension_al_liquidar, color: VERDE },
                  ].map((it, i) => it.val === null
                    ? <span key={i} style={{ fontSize: '20px', color: it.color }}>→</span>
                    : <div key={i}>
                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{it.label}</div>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: it.color }}>{fmtMXN(it.val)}</div>
                      </div>
                  )}
                </div>
              </div>

              {/* Análisis de inversión financiado */}
              <div style={cardSt}>
                {sectionTitle('Análisis de Inversión — Con Financiamiento', 'PENSIÓN SIN-CON FIN. del Excel')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  {kpiBox('ROI', `${esc.roi_financiado.toFixed(1)} meses`, 'meses para recuperar la inversión', '#f59e0b', undefined, true)}
                  {kpiBox('Flujos a los 80 años', fmtMXN(esc.ganancia_a80_financiado + esc.inversion_neta_retro), 'total cobrado con financiamiento', AZUL)}
                  {kpiBox('Ganancia total a los 80', fmtMXN(esc.ganancia_a80_financiado), 'flujos - inversión neta', VERDE, undefined, true)}
                  {kpiBox('Tasa de rendimiento', `${esc.tasa_rendimiento_financiado.toFixed(2)}%`, 'ganancia ÷ inversión neta', AZUL)}
                </div>
                {/* Termómetro */}
                {(() => {
                  const t = esc.tasa_rendimiento_financiado >= 25 ? { label: 'Excelente Inversión', color: VERDE, bg: '#f0fdf4' }
                    : esc.tasa_rendimiento_financiado >= 18 ? { label: 'Buena Inversión', color: '#0891b2', bg: '#f0f9ff' }
                    : esc.tasa_rendimiento_financiado >= 12 ? { label: 'Inversión Moderada', color: '#f59e0b', bg: '#fffbeb' }
                    : { label: 'Inversión de Riesgo', color: '#ef4444', bg: '#fef2f2' }
                  return (
                    <div style={{ padding: '12px 16px', background: t.bg, border: `1.5px solid ${t.color}`, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '28px' }}>🌡️</span>
                      <div>
                        <p style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: t.color }}>{t.label}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>Tasa de rendimiento: {esc.tasa_rendimiento_financiado.toFixed(2)}% — con financiamiento bancario regulado (60 meses)</p>
                      </div>
                    </div>
                  )
                })()}
              </div>
              {navButtons(() => setTab(4), () => setTab(6), 'Siguiente: Resumen / Proyecto →')}
            </div>
          )
        })()}

        {/* ══ TAB 7: RESUMEN / PROYECTO ════════════════════════════ */}
        {tab === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mensaje && <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: VERDE }}>{mensaje}</div>}

            {escenarios.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>📋</div>
                <p style={{ margin: '0 0 14px' }}>Calcula primero los escenarios en <strong>Modalidad 40</strong>.</p>
                <button onClick={() => setTab(3)} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px' }}>← Ir a Modalidad 40</button>
              </div>
            ) : (<>

              {/* Resumen Ejecutivo del Proyecto de Pensión — igual a hoja "Resumen" del Excel */}
              {sectionTitle('Resumen Ejecutivo del Proyecto de Pensión con Modalidad 40', 'Comparativo de escenarios — igual a la hoja "Resumen" del Excel')}

              {/* BLOQUE 1: Edad de Pensión y Monto Mensual */}
              <div style={cardSt}>
                {sectionTitle('1. Edad de Pensión y Monto Mensual', 'Hoja Resumen!B3 del Excel')}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#F4F6FB' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', minWidth: '180px' }}>Concepto</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0' }}>Situación Actual</th>
                        {escenarios.slice(0, 6).map((_, i) => (
                          <th key={i} style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', color: AZUL, textTransform: 'uppercase', borderBottom: `2px solid ${AZUL}` }}>Escenario {i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Fecha de ingreso a Mod. 40', actual: 'Sin Modalidad 40', fn: (e: any) => "—" },
                        { label: 'Años cotizados en Mod. 40', actual: 'Ninguno', fn: (e: any) => `${((e.mod40_meses ?? 0) / 12).toFixed(2)} años` },
                        { label: 'Edad de Pensión (IMSS)', actual: `${Math.floor(datos.edad_actual || 60)} años`, fn: (e: any) => `62 años` },
                        { label: 'Pensión Mensual Mejorada', actual: fmtMXN(escenarios[0]?.pension_base ?? 0), fn: (e: any) => fmtMXN(e.pension_mensual), highlight: true },
                        { label: 'Aguinaldo Anual', actual: fmtMXN((escenarios[0]?.pension_base ?? 0) * 15 / 30), fn: (e: any) => fmtMXN(e.aguinaldo_anual) },
                      ].map((row, ri) => (
                        <tr key={ri} style={{ background: row.highlight ? '#f0f9ff' : ri % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: '600', color: '#374151' }}>{row.label}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8' }}>{row.actual}</td>
                          {escenarios.slice(0, 6).map((e, i) => (
                            <td key={i} style={{ padding: '8px 12px', textAlign: 'center', fontWeight: row.highlight ? '700' : 'normal', color: row.highlight ? VERDE : '#374151' }}>{row.fn(e)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BLOQUE 2: Costo de Modalidad 40 */}
              <div style={cardSt}>
                {sectionTitle('2. Costo de la Modalidad 40 — Pago Mes a Mes', 'Hoja Resumen!B11 del Excel')}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#F4F6FB' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', minWidth: '180px' }}>Concepto</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0' }}>Situación Actual</th>
                        {escenarios.slice(0, 6).map((_, i) => (
                          <th key={i} style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', color: AZUL, textTransform: 'uppercase', borderBottom: `2px solid ${AZUL}` }}>Escenario {i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Costo Mensual Promedio', actual: 'Ninguno', fn: (e: any) => fmtMXN(e.costo_mensual_mod40) },
                        { label: 'Costo Total', actual: 'Ninguno', fn: (e: any) => fmtMXN(e.costo_total), highlight: true },
                        { label: 'Recuperas vía AFORE', actual: 'No aplica', fn: (e: any) => fmtMXN(e.recuperacion_afore) },
                        { label: 'Inversión Neta', actual: 'No aplica', fn: (e: any) => fmtMXN(e.inversion_neta), highlight: true },
                        { label: 'Meses para recuperar inversión', actual: 'No aplica', fn: (e: any) => `${(e.roi_meses ?? 0).toFixed(1)} meses` },
                        { label: 'Ganancia a los 80 años', actual: '—', fn: (e: any) => fmtMXN(e.ganancia_a80), highlight: true },
                        { label: 'Tasa de Rendimiento Total', actual: '—', fn: (e: any) => `${(e.tasa_rendimiento ?? 0).toFixed(2)}%` },
                      ].map((row, ri) => (
                        <tr key={ri} style={{ background: row.highlight ? '#f0f9ff' : ri % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: '600', color: '#374151' }}>{row.label}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8' }}>{row.actual}</td>
                          {escenarios.slice(0, 6).map((e, i) => (
                            <td key={i} style={{ padding: '8px 12px', textAlign: 'center', fontWeight: row.highlight ? '700' : 'normal', color: row.highlight ? AZUL : '#374151' }}>{row.fn(e)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BLOQUE 3: Financiamiento */}
              <div style={cardSt}>
                {sectionTitle('3. Financiamiento', 'Hoja Resumen!B23 del Excel')}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#F4F6FB' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', minWidth: '180px' }}>Concepto</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0' }}>Situación Actual</th>
                        {escenarios.slice(0, 6).map((_, i) => (
                          <th key={i} style={{ padding: '8px 12px', textAlign: 'center', fontSize: '10px', color: AZUL, textTransform: 'uppercase', borderBottom: `2px solid ${AZUL}` }}>Escenario {i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Descuento mensual a pensión', actual: 'No aplica', fn: (e: any) => e.descuento_mensual > 0 ? fmtMXN(-e.descuento_mensual) : '—' },
                        { label: 'Pensión Inmediata (con fin.)', actual: fmtMXN(escenarios[0]?.pension_base ?? 0), fn: (e: any) => fmtMXN(e.pension_inmediata), highlight: true },
                        { label: 'Pensión al liquidar fin.', actual: '—', fn: (e: any) => fmtMXN(e.pension_al_liquidar), highlight: true },
                        { label: 'Ganancia 80 años financiado', actual: '—', fn: (e: any) => fmtMXN(e.ganancia_a80_financiado), highlight: true },
                        { label: 'Tasa de rendimiento financiado', actual: '—', fn: (e: any) => `${(e.tasa_rendimiento_financiado ?? 0).toFixed(2)}%` },
                      ].map((row, ri) => (
                        <tr key={ri} style={{ background: row.highlight ? '#f0fdf4' : ri % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: '600', color: '#374151' }}>{row.label}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8' }}>{row.actual}</td>
                          {escenarios.slice(0, 6).map((e, i) => (
                            <td key={i} style={{ padding: '8px 12px', textAlign: 'center', fontWeight: row.highlight ? '700' : 'normal', color: row.highlight ? VERDE : '#374151' }}>{row.fn(e)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recomendaciones automáticas */}
              {escenarios.length > 1 && (() => {
                const sorted = [...escenarios]
                const mayorPension = sorted.reduce((a, b) => a.pension_mensual > b.pension_mensual ? a : b)
                const menorCosto = sorted.reduce((a, b) => a.costo_total < b.costo_total ? a : b)
                const mayorRendimiento = sorted.reduce((a, b) => (a.tasa_rendimiento ?? 0) > (b.tasa_rendimiento ?? 0) ? a : b)
                return (
                  <div style={cardSt}>
                    {sectionTitle('Recomendaciones automáticas', 'Hoja "PROYECTO DE PENSIÓN"!B47-B51 del Excel')}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                      {[
                        { icon: '🏆', label: 'Mayor Pensión', desc: `Escenario ${escenarios.indexOf(mayorPension) + 1}`, value: fmtMXN(mayorPension.pension_mensual) + '/mes', color: AZUL },
                        { icon: '💰', label: 'Menor Costo', desc: `Escenario ${escenarios.indexOf(menorCosto) + 1}`, value: fmtMXN(menorCosto.costo_total) + ' total', color: VERDE },
                        { icon: '📈', label: 'Mejor Inversión', desc: `Escenario ${escenarios.indexOf(mayorRendimiento) + 1}`, value: `${mayorRendimiento.roi_meses.toFixed(1)} meses ROI`, color: NARANJA },
                      ].map((r, i) => (
                        <div key={i} style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', border: `1.5px solid ${r.color}30` }}>
                          <div style={{ fontSize: '20px', marginBottom: '6px' }}>{r.icon}</div>
                          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{r.label}</p>
                          <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: '800', color: r.color }}>{r.desc}</p>
                          <p style={{ margin: 0, fontSize: '11px', color: '#374151' }}>{r.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {navButtons(() => setTab(5))}
            </>)}
          </div>
        )}

      </div>
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
