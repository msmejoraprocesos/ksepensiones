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
  ley: '73' | '97' | ''
  nss: string
}

interface Escenario {
  id: string
  label: string
  descripcion: string
  mod40_meses: number
  mod40_umas: number
  sdi_base: number
  pension_mensual: number
  inversion_total: number
  costo_mensual_mod40: number
  incremento_vs_base: number
  roi_meses: number
  recomendado: boolean
  pmg_aplica?: boolean
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

// ── FÓRMULAS OFICIALES (Art. 167-171 LSS) — replica fiel del Excel de referencia ──────────
function calcPensionLey73(semanas: number, sdi: number, edadRetiro: number, sys: SysVars, tieneConyuge: boolean, numHijos: number, numPadres: number, anioRetiro?: number): { monto: number; pmg_aplica: boolean } {
  if (semanas < 500) return { monto: 0, pmg_aplica: false }

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

  // Ayuda asistencial (solo si no hay cónyuge, hijos, ni padres dependientes — o solo 1 padre)
  const sinBeneficiarios = !tieneConyuge && numHijos === 0 && numPadres === 0
  const soloUnPadre = !tieneConyuge && numHijos === 0 && numPadres === 1
  const pctAyuda = sinBeneficiarios ? 0.15 : soloUnPadre ? 0.10 : 0
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

  return { monto: montoFinal, pmg_aplica }
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
  num_hijos: 0, num_padres: 0, ley: '', nss: ''
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
  const TABS = ['Datos generales','Salario 250 sem.','Conservación','Modalidad 40','Modalidad 10','Escenarios','Resumen']

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
        // Build periodos from PDF data
        if (result.periodos && Array.isArray(result.periodos)) {
          setPeriodosCompletos(result.periodos)
          buildPeriodos250(result.periodos, result.semanas || 0)
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
    // UMA proyectada al año de inicio del trámite
    const umaProyectada = proyectarValor(sys.UMA_DIARIA, anioBase, anioI)
    // SDI con UMA proyectada
    const sdiMod40 = umas * umaProyectada
    // Tasa Mod 40 del año real de inicio del trámite (tabla configurada en Configuración, refleja el ajuste de enero)
    const tasaProyectada = getMod40Pct(anioI) / 100
    const costoMensual = sdiMod40 * 30.4 * tasaProyectada
    const invTotal = costoMensual * meses
    // SDI ponderado 250 semanas (las más recientes desplazan las más antiguas)
    const semMod40 = Math.min(meses * 4.33, 250)
    const semEfectivo = Math.min(sem, 250 - semMod40)
    const sdiNuevo = semEfectivo + semMod40 > 0
      ? (sdiBase * semEfectivo + sdiMod40 * semMod40) / (semEfectivo + semMod40)
      : sdiBase
    const semTotal = sem + meses * 4.33
    const { monto: pension, pmg_aplica } = calcPensionLey73(semTotal, sdiNuevo, edadR, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, anioR)
    const incr = pension - pensionBase
    // ROI usa la inversión NETA (descontando el % que regresa la AFORE), como en el Excel de referencia
    const invNeta = invTotal * (1 - (sys.pct_afore_mod40 ?? 20) / 100)
    const roi = incr > 0 ? Math.ceil(invNeta / incr) : 0
    return { costoMensual, invTotal, sdiNuevo, semTotal, pension, pmg_aplica, incr, roi, umaProyectada, tasaProyectada, sdiMod40 }
  }

  function recalcEscenarios() {
    const sem = datos.semanas_totales - datos.semanas_descontadas
    // No calcular sin datos reales cargados
    if (datos.semanas_totales === 0 || sdiPromedio <= 0) return
    const sdiBase = sdiPromedio > 0 ? sdiPromedio : sys.SALARIO_MIN
    const anioBase = new Date().getFullYear()
    const anioR = anioBase + (edadRetiro - (datos.edad_actual || 60))

    const { monto: pensionBase, pmg_aplica: pmgAplicaBase } = calcPensionLey73(sem, sdiBase, edadRetiro, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres, anioR)

    // E0: Sin ninguna modalidad
    const escs: Escenario[] = [{
      id: 'e0', label: 'Sin modalidad', descripcion: 'Pensión base con semanas y SDI actuales',
      mod40_meses: 0, mod40_umas: 0, sdi_base: sdiBase,
      pension_mensual: pensionBase, inversion_total: 0, costo_mensual_mod40: 0,
      incremento_vs_base: 0, roi_meses: 0, recomendado: false, pmg_aplica: pmgAplicaBase
    }]

    // E1: Modalidad 10 · 12 meses (~22% tasa, misma lógica de SDI ponderado)
    const TASA_M10 = 0.22
    const costoM10 = sdiBase * 30.4 * TASA_M10
    const sdiM10 = mod40Umas * sys.UMA_DIARIA
    const semM10 = Math.min(12 * 4.33, 250)
    const semEfM10 = Math.min(sem, 250 - semM10)
    const sdiNuevoM10 = (sdiBase * semEfM10 + sdiM10 * semM10) / (semEfM10 + semM10)
    const { monto: pensionM10, pmg_aplica: pmgAplicaM10 } = calcPensionLey73(sem + 12 * 4.33, sdiNuevoM10, 65, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres)
    escs.push({
      id: 'e_m10', label: 'Modalidad 10 · 12 meses', descripcion: 'Cobertura integral + semanas (independiente)',
      mod40_meses: 12, mod40_umas: mod40Umas, sdi_base: sdiNuevoM10,
      pension_mensual: pensionM10, inversion_total: costoM10 * 12, costo_mensual_mod40: costoM10,
      incremento_vs_base: pensionM10 - pensionBase, roi_meses: 0, recomendado: false, pmg_aplica: pmgAplicaM10
    })

    // E2–E4: Modalidad 40 a distintos plazos con UMA proyectada
    const mesesDisp = Math.max(12, (edadRetiro - (datos.edad_actual || 60)) * 12)
    for (const [meses, umas, label, desc, esOpt] of [
      [Math.min(24, mesesDisp), mod40Umas * 0.6, `Mod 40 · ${Math.min(24, mesesDisp)} meses · ${Math.round(mod40Umas * 0.6)} UMAs`, 'Inversión conservadora', false],
      [Math.min(36, mesesDisp), mod40Umas * 0.8, `Mod 40 · ${Math.min(36, mesesDisp)} meses · ${Math.round(mod40Umas * 0.8)} UMAs`, 'Estrategia media', false],
      [Math.min(mod40Meses, mesesDisp), mod40Umas, `Mod 40 · ${Math.min(mod40Meses, mesesDisp)} meses · ${mod40Umas} UMAs`, 'Estrategia configurada', true],
    ] as [number, number, string, string, boolean][]) {
      const r = calcEscenarioMod40(sem, sdiBase, umas, meses, pensionBase, edadRetiro, anioInicioTramite)
      escs.push({
        id: `e_m40_${meses}`, label, descripcion: desc,
        mod40_meses: meses, mod40_umas: umas, sdi_base: r.sdiNuevo,
        pension_mensual: r.pension, inversion_total: r.invTotal, costo_mensual_mod40: r.costoMensual,
        incremento_vs_base: r.incr, roi_meses: r.roi, recomendado: esOpt, pmg_aplica: r.pmg_aplica
      })
    }

    // E5: Simulación libre (si está activa)
    if (simulacionLibre) {
      const r = calcEscenarioMod40(sem, sdiBase, simUmas, simMeses, pensionBase, edadRetiro, anioInicioTramite)
      escs.push({
        id: 'e_sim', label: `Mi simulación · ${simMeses} meses · ${simUmas} UMAs`, descripcion: '🔧 Parámetros personalizados',
        mod40_meses: simMeses, mod40_umas: simUmas, sdi_base: r.sdiNuevo,
        pension_mensual: r.pension, inversion_total: r.invTotal, costo_mensual_mod40: r.costoMensual,
        incremento_vs_base: r.incr, roi_meses: r.roi, recomendado: false, pmg_aplica: r.pmg_aplica
      })
    }

    setEscenarios(escs)
    // Auto-select optimal if not already selected
    if (escElegidoIdx < 0) setEscElegidoIdx(escs.findIndex(e => e.recomendado))
  }

  const escSel = escenarios[escElegidoIdx >= 0 ? escElegidoIdx : escSelIdx] ?? escenarios[0]
  const finSel = financieras.find(f => f.id === finSelId)
  const corridaFin = finSel && escSel ? calcCorrida(escSel.inversion_total, finSel.tasa_anual, finPlazo) : null
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
      inversion_mod40: escElegido?.inversion_total,
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
              return (
                <div style={{ ...cardSt, borderLeft: `3px solid ${cumple ? VERDE : '#ef4444'}` }}>
                  {sectionTitle('Resumen automático')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                    {kpiBox('Semanas válidas', sem.toLocaleString(), 'descontadas AFORE', cumple ? VERDE : '#ef4444', cumple ? 'verde' : 'rojo')}
                    {kpiBox('Edad mín. pensión', `${edadMin} años`, 'Vejez (sin Mod 40)', AZUL, 'azul')}
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

            {navButtons(() => setTab(0), () => setTab(2), 'Siguiente: Conservación de derechos →')}
          </div>
        )}

        {/* ══ TAB 3: CONSERVACIÓN DE DERECHOS ════════════════════ */}
        {tab === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {datos.semanas_totales === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8', fontSize: '13px' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>📋</div>
                <p style={{ margin: '0 0 14px' }}>Carga primero la constancia IMSS en la pestaña <strong>Datos generales</strong> para calcular la conservación de derechos.</p>
                <button onClick={() => setTab(0)} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px' }}>← Ir a Datos generales</button>
              </div>
            )}
            {datos.semanas_totales > 0 && <>
            <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL, lineHeight: 1.6 }}>
              <strong>Art. 182 Ley del Seguro Social 1973:</strong> Cuando un trabajador deja de cotizar, sus derechos pensionarios se conservan por un período proporcional. Es crítico saber si el cliente puede iniciar el trámite ahora o si ya perdió sus derechos.
            </div>

            {guiaCampos(true)}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              <div style={cardSt}>
                <label style={labelSt}>⚡ Fecha de última cotización</label>
                <input type="date" style={autoInputSt} value={fechaUltimaCot} onChange={e => setFechaUltimaCot(e.target.value)} />
              </div>
              <div style={cardSt}>
                <label style={labelSt}>⚡ Semanas cotizadas totales</label>
                <input type="number" style={autoNumInputSt} value={datos.semanas_totales || ''} readOnly />
              </div>
            </div>

            {(() => {
              const mesesDesde = fechaUltimaCot ? Math.floor((Date.now() - new Date(fechaUltimaCot).getTime()) / (30 * 86400000)) : 0
              const cons = calcConservacion(datos.semanas_totales, mesesDesde)
              const color = cons.vigente ? VERDE : '#ef4444'
              return (
                <div style={{ ...cardSt, borderLeft: `3px solid ${color}` }}>
                  {sectionTitle('Estado de conservación de derechos')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                    {kpiBox('Estado', cons.vigente ? 'Vigente' : 'Vencido', cons.venceEn ? `${cons.venceEn} meses restantes (${cons.semanasConservacion} sem de conservación)` : 'Período vencido', color, undefined, true)}
                    {kpiBox('Semanas cotizadas', datos.semanas_totales.toLocaleString(), 'total histórico', datos.semanas_totales >= 500 ? VERDE : '#f59e0b')}
                    {kpiBox('Plazo de conservación', cons.indefinida ? 'Indefinido' : cons.venceEn !== null ? `${cons.venceEn} meses` : 'Sin conservación', cons.semanasConservacion ? `${cons.semanasConservacion} semanas = semanas ÷ 4` : 'Art. 183 LSS')}
                    {kpiBox('Meses desde última cot.', mesesDesde.toString(), fechaUltimaCot ? new Date(fechaUltimaCot).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }) : '—')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {semaforo(cons.vigente, cons.indefinida ? 'Derechos conservados indefinidamente — puede tramitar en cualquier momento' : cons.vigente ? `Derechos vigentes — le quedan ${cons.venceEn} meses para iniciar el trámite` : 'Derechos vencidos — no puede pensionarse bajo este régimen')}
                    {semaforo(datos.semanas_totales >= 500, datos.semanas_totales >= 500 ? 'Cumple semanas mínimas (500)' : `Faltan ${Math.max(0, 500 - datos.semanas_totales)} semanas`)}
                  </div>
                </div>
              )
            })()}

            {/* ── NIVEL 1: Estimación rápida ── */}
            <div style={cardSt}>
              {sectionTitle('Nivel 1 — Estimación rápida (Art. 183 LSS 1973)')}
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.7 }}>
                La conservación de derechos equivale a <strong>la cuarta parte (÷ 4) del total de semanas cotizadas</strong>, contada a partir de la última baja. Con {datos.semanas_totales} semanas cotizadas, el período de conservación estimado es de <strong>{Math.round(datos.semanas_totales / 4)} semanas (~{(Math.round(datos.semanas_totales / 4) / 4.33 / 12).toFixed(1)} años)</strong>.
              </p>
              <div style={{ padding: '8px 14px', background: '#F4F6FB', borderRadius: '8px', fontFamily: 'monospace', fontSize: '13px', color: '#374151' }}>
                {datos.semanas_totales} semanas ÷ 4 = {Math.round(datos.semanas_totales / 4)} semanas de conservación
              </div>
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: '8px 0 0', lineHeight: 1.6 }}>
                ⚠️ Estimación basada en Art. 183 LSS. El resultado definitivo está sujeto a validación con el historial oficial del IMSS.
              </p>
            </div>

            {/* ── NIVEL 2: Recuperación de derechos (Arts. 150, 151 y 152) ── */}
            {(() => {
              const mesesDesde = fechaUltimaCot ? Math.floor((Date.now() - new Date(fechaUltimaCot).getTime()) / (30 * 86400000)) : 0
              const aniosSinCotizan = mesesDesde / 12
              let recuperacion: { tipo: string; color: string; bg: string; descripcion: string; accion: string }
              if (mesesDesde === 0) {
                recuperacion = { tipo: 'Cotizando actualmente', color: VERDE, bg: '#f0fdf4', descripcion: 'El trabajador sigue activo. No aplica recuperación.', accion: '' }
              } else if (aniosSinCotizan <= 3) {
                recuperacion = { tipo: '≤ 3 años sin cotizar', color: VERDE, bg: '#f0fdf4', descripcion: 'Las semanas anteriores se reconocen de inmediato al reingresar.', accion: 'No requiere semanas adicionales para el reconocimiento (Art. 151 LSS).' }
              } else if (aniosSinCotizan <= 6) {
                recuperacion = { tipo: 'Entre 3 y 6 años sin cotizar', color: '#f59e0b', bg: '#fffbeb', descripcion: 'Para que el IMSS reconozca las semanas anteriores, el trabajador debe cotizar 26 semanas nuevas.', accion: 'Acción recomendada: cotizar 26 semanas (~6 meses) para recuperar el reconocimiento (Art. 151 LSS).' }
              } else {
                recuperacion = { tipo: 'Más de 6 años sin cotizar', color: '#ef4444', bg: '#fef2f2', descripcion: 'Para que el IMSS reconozca las semanas anteriores, el trabajador debe cotizar 52 semanas nuevas.', accion: 'Acción recomendada: cotizar 52 semanas (~12 meses) para recuperar el reconocimiento (Art. 151 LSS). Considerar Modalidad 10 primero, luego Modalidad 40.' }
              }
              return (
                <div style={cardSt}>
                  {sectionTitle('Nivel 2 — Recuperación de derechos (Arts. 150, 151 y 152 LSS)')}
                  <div style={{ padding: '14px 16px', background: recuperacion.bg, borderRadius: '10px', border: `1px solid ${recuperacion.color}30`, marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 10px', borderRadius: '10px', background: `${recuperacion.color}20`, color: recuperacion.color }}>{recuperacion.tipo}</span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{mesesDesde > 0 ? `${mesesDesde} meses sin cotizar` : ''}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 6px', lineHeight: 1.7 }}>{recuperacion.descripcion}</p>
                    {recuperacion.accion && <p style={{ fontSize: '12px', color: recuperacion.color, fontWeight: '600', margin: 0, lineHeight: 1.6 }}>{recuperacion.accion}</p>}
                  </div>
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#F4F6FB' }}>
                          {['Tiempo sin cotizar','Requisito para recuperar reconocimiento','Art. LSS'].map((h, i) => (
                            <th key={i} style={{ padding: '7px 12px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ['Hasta 3 años', 'Reconocimiento inmediato al reingresar', 'Art. 150', aniosSinCotizan <= 3 ? VERDE : '#94a3b8'],
                          ['3 a 6 años', '26 semanas nuevas de cotización (~6 meses)', 'Art. 151', aniosSinCotizan > 3 && aniosSinCotizan <= 6 ? '#f59e0b' : '#94a3b8'],
                          ['Más de 6 años', '52 semanas nuevas de cotización (~12 meses)', 'Art. 152', aniosSinCotizan > 6 ? '#ef4444' : '#94a3b8'],
                        ].map(([tiempo, requisito, art, color], i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 12px', fontWeight: '600', color }}>{tiempo}</td>
                            <td style={{ padding: '8px 12px', color: '#374151' }}>{requisito}</td>
                            <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '11px' }}>{art}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '8px 0 0', lineHeight: 1.6 }}>
                    Nota: Las semanas cotizadas nunca desaparecen. Lo que se regula es su reconocimiento formal al reingresar. Para casos con duplicidad de NSS o semanas no reconocidas, se requiere trámite de aclaración en la subdelegación IMSS correspondiente.
                  </p>
                </div>
              )
            })()}

            {navButtons(() => setTab(1), () => setTab(3), 'Siguiente: Modalidad 40 →')}
            </>}

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

              {(() => {
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

              {(() => {
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
            {navButtons(() => setTab(2), () => setTab(4), 'Siguiente: Modalidad 10 →')}
            </>}

          </div>
        )}


        {/* ══ TAB 4: MODALIDAD 10 ══════════════════════════════════ */}
        {tab === 4 && datos.semanas_totales === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8', fontSize: '13px' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>📋</div>
            <p style={{ margin: '0 0 14px' }}>Carga primero la constancia IMSS en <strong>Datos generales</strong> para ver la comparativa de Modalidad 10.</p>
            <button onClick={() => setTab(0)} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px' }}>← Ir a Datos generales</button>
          </div>
        )}
        {tab === 4 && datos.semanas_totales > 0 && (() => {
          const UMA_DIARIA = sys.UMA_DIARIA || 113.14
          const DIAS_MES = 30.4
          const TASA_M10 = 0.22
          const TASA_M40 = sys.mod40_pct ? sys.mod40_pct / 100 : 0.14438
          const sbcMensual = mod40Umas * UMA_DIARIA * DIAS_MES
          const cuotaM10 = sbcMensual * TASA_M10
          const cuotaM40 = sbcMensual * TASA_M40
          const diferencia = cuotaM10 - cuotaM40
          const totalM10 = cuotaM10 * mod40Meses
          const totalM40 = cuotaM40 * mod40Meses
          const semanas = Math.round(mod40Meses * 4.33)
          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL, lineHeight: 1.6 }}>
              <strong>Modalidad 10 — Incorporación Voluntaria al Régimen Obligatorio (Art. 240 LSS):</strong> Permite a trabajadores independientes afiliarse al IMSS con cobertura integral. Más cara que Mod 40 porque incluye todos los ramos de seguro, pero es la única vía legal para independientes sin patrón.
            </div>

            {guiaCampos(true)}

            <div style={cardSt}>
              {sectionTitle('Configuración (comparte parámetros con Mod 40)')}
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '-4px 0 10px' }}>Los valores de UMAs y meses se toman de la pestaña Modalidad 40. Ajústalos ahí para actualizar esta comparativa.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={labelSt}>🔗 Salario base (UMAs) — viene de Mod 40</label>
                  <input type="number" style={{ ...autoNumInputSt, background: '#F4F6FB', borderColor: '#cbd5e1', color: '#64748b' }} value={mod40Umas} readOnly />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>SDI: {fmtMXN2(mod40Umas * UMA_DIARIA)}/día</p>
                </div>
                <div>
                  <label style={labelSt}>🔗 Meses de cotización — viene de Mod 40</label>
                  <input type="number" style={{ ...autoNumInputSt, background: '#F4F6FB', borderColor: '#cbd5e1', color: '#64748b' }} value={mod40Meses} readOnly />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{semanas} semanas adicionales</p>
                </div>
                <div>
                  <label style={labelSt}>⚙️ Tasa Mod 10 (estimada)</label>
                  <input type="number" style={sysNumInputSt} value={22} readOnly />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>% promedio todos los ramos</p>
                </div>
              </div>
            </div>

            <div style={cardSt}>
              {sectionTitle('Comparativa de costos')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div style={{ background: '#EEF2F8', borderRadius: '10px', padding: '14px', border: '2px solid #bfdbfe' }}>
                  <p style={{ fontSize: '11px', color: '#1e40af', margin: '0 0 4px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Modalidad 40</p>
                  <p style={{ fontSize: '22px', fontWeight: '700', color: NARANJA, margin: '0 0 4px' }}>{fmtMXN(cuotaM40)}<span style={{ fontSize: '12px', fontWeight: '400' }}>/mes</span></p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Total {mod40Meses} meses: {fmtMXN(totalM40)}</p>
                </div>
                <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '14px', border: '1px solid #bbf7d0' }}>
                  <p style={{ fontSize: '11px', color: '#15803d', margin: '0 0 4px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Modalidad 10</p>
                  <p style={{ fontSize: '22px', fontWeight: '700', color: '#dc2626', margin: '0 0 4px' }}>{fmtMXN(cuotaM10)}<span style={{ fontSize: '12px', fontWeight: '400' }}>/mes</span></p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Total {mod40Meses} meses: {fmtMXN(totalM10)}</p>
                </div>
              </div>
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#92400e' }}>
                Por <strong>{fmtMXN(diferencia)}/mes</strong> más ({fmtMXN(totalM10 - totalM40)} en total), Mod 10 agrega: servicio médico completo para el titular y familia, guarderías, cobertura de riesgos de trabajo e Infonavit.
              </div>
            </div>

            <div style={cardSt}>
              {(() => {
                const header = sectionTitle('Proyección de cotización mensual — Mod 10', `${mod40Meses} meses · ${fmtMXN(Math.round(mod40Umas * (sys.UMA_DIARIA || 113.14) * 30.4 * 0.22))}/mes`)
                return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {header}
                  <button onClick={() => setShowAllMonthsM10(v => !v)}
                    style={{ fontSize: '11px', padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#F4F6FB', cursor: 'pointer', color: '#64748b', fontFamily: 'inherit', flexShrink: 0 }}>
                    {showAllMonthsM10 ? '↩️ Ver resumen' : '📋 Ver todos los meses'}
                  </button>
                </div>
              })()}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F4F6FB' }}>
                      {['Mes','SBC mensual','Cuota Mod 10 (22%)','Cuota Mod 40 (ref.)','Diferencia','Acumulado Mod 10'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 10px', textAlign: i === 0 ? 'center' : 'right', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const UMA = sys.UMA_DIARIA || 113.14
                      const sbcMensual = mod40Umas * UMA * 30.4
                      const cuotaM10 = sbcMensual * 0.22
                      const cuotaM40 = sbcMensual * (getMod40Pct(anioInicioTramite) / 100)
                      const diff = cuotaM10 - cuotaM40
                      const showM10Months = showAllMonthsM10 ? Array.from({length: mod40Meses}, (_, i) => i + 1) : (mod40Meses <= 24 ? Array.from({length: mod40Meses}, (_, i) => i + 1) : [1, 2, 3, 6, 12, mod40Meses])
                      const m10rows: React.ReactNode[] = []
                      ;[...new Set(showM10Months)].filter(m => m >= 1 && m <= mod40Meses).forEach((mes, i) => {
                        m10rows.push(
                        <tr key={mes} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8', fontWeight: '600' }}>{mes}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: AZUL, fontWeight: '600' }}>{fmtMXN(sbcMensual)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: VERDE, fontWeight: '700' }}>{fmtMXN(cuotaM10)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{fmtMXN(cuotaM40)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#f97316', fontWeight: '600' }}>+{fmtMXN(diff)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: AZUL, fontWeight: '700' }}>{fmtMXN(cuotaM10 * mes)}</td>
                        </tr>
                        )
                        if (!showAllMonthsM10 && mes === 3 && mod40Meses > 6) m10rows.push(
                          <tr key="dots-m10" style={{ background: '#F8FAFC' }}>
                            <td colSpan={6} style={{ padding: '5px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>⋯ {mod40Meses - 4} meses intermedios — presiona "Ver todos los meses" para expandir ⋯</td>
                          </tr>
                        )
                      })
                      return m10rows
                    })()}
                    <tr style={{ background: '#F0FDF4', borderTop: '2px solid #bbf7d0' }}>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: '700', color: VERDE }}>Tot</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>—</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '800', color: VERDE }}>{fmtMXN(mod40Umas * (sys.UMA_DIARIA || 113.14) * 30.4 * 0.22 * mod40Meses)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#94a3b8' }}>{fmtMXN(calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys) * mod40Meses)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#f97316', fontWeight: '700' }}>+{fmtMXN((mod40Umas * (sys.UMA_DIARIA || 113.14) * 30.4 * 0.22 - calcCostoMod40(mod40Umas, getMod40Pct(anioInicioTramite), sys)) * mod40Meses)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '800', color: VERDE }}>{fmtMXN(mod40Umas * (sys.UMA_DIARIA || 113.14) * 30.4 * 0.22 * mod40Meses)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: '6px 0 0', lineHeight: 1.6 }}>
                La columna "Diferencia" muestra cuánto más pagas con Mod 10 vs Mod 40 — ese extra te da cobertura médica completa y los demás seguros adicionales.
              </p>
            </div>


            <div style={cardSt}>
              {sectionTitle('¿Qué incluye cada modalidad?')}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Beneficio</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '700', color: AZUL, fontSize: '10px', textTransform: 'uppercase' }}>Mod 40</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '700', color: VERDE, fontSize: '10px', textTransform: 'uppercase' }}>Mod 10</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Mejora SDI para pensión', true, true],
                    ['Acumula semanas cotizadas', true, true],
                    ['Seguro de Invalidez y Vida', true, true],
                    ['Servicio médico IMSS', false, true],
                    ['Seguro de Enf. y Maternidad', false, true],
                    ['Seguro de Riesgos de Trabajo', false, true],
                    ['Guarderías y Prestaciones Sociales', false, true],
                    ['Aportaciones Infonavit', false, true],
                    ['Requiere historial previo IMSS', true, false],
                    ['Disponible para independientes', false, true],
                  ].map(([label, m40, m10], i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', color: '#374151' }}>{label as string}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{m40 ? '✅' : '❌'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{m10 ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={cardSt}>
              {sectionTitle('Flujo estratégico recomendado')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
                <div style={{ padding: '10px 14px', background: '#F4F6FB', borderRadius: '8px', borderLeft: '3px solid ' + AZUL }}>
                  <strong>Si el cliente tiene historial IMSS y no necesita servicio médico</strong> → Mod 40 directamente. Maximiza pensión al menor costo.
                </div>
                <div style={{ padding: '10px 14px', background: '#F4F6FB', borderRadius: '8px', borderLeft: '3px solid ' + VERDE }}>
                  <strong>Si el cliente es independiente sin cobertura médica</strong> → Mod 10. Protección completa para él y su familia mientras acumula semanas.
                </div>
                <div style={{ padding: '10px 14px', background: '#FFF7ED', borderRadius: '8px', borderLeft: '3px solid #f97316' }}>
                  <strong>Si no califica para Mod 40 (lleva mucho tiempo sin cotizar)</strong> → Mod 10 por mínimo 12 meses, luego migra a Mod 40. La Mod 10 rehabilita su vigencia de derechos.
                </div>
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: '#F8FAFC', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', color: '#64748b', lineHeight: 1.6 }}>
              ⚠️ La tasa del 22% es un estimado — el monto exacto varía según actividad económica y zona geográfica.{' '}
              <a href="https://serviciosdigitales.imss.gob.mx/gestionAsegurados-web/asegurados/incorporacionVoluntaria" target="_blank" rel="noopener noreferrer" style={{ color: AZUL, fontWeight: '700' }}>Calcular cuota exacta en el portal oficial del IMSS →</a>
            </div>

            {navButtons(() => setTab(3), () => setTab(5), 'Siguiente: Escenarios de pensión →')}
          </div>
          )
        })()}

        {/* ══ TAB 5: ESCENARIOS ═══════════════════════════════════ */}
        {tab === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 16px', background: '#F4F6FB', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                  <strong style={{ color: AZUL }}>Escenarios para {datos.nombre_trabajador || datos.nombre || 'el cliente'}</strong>
                  {' '}· Retiro a los <strong>{edadRetiro} años</strong> ({edadRetiro >= 65 ? 'Vejez · 100%' : `Cesantía · ${(FACTOR_EDAD_RETIRO[edadRetiro] ?? 1) * 100}%`}) · Trámite Mod 40 en <strong>{anioInicioTramite}</strong>
                  {' '}· Meses disponibles: <strong>{Math.max(0, (edadRetiro - (datos.edad_actual || 60)) * 12)}</strong>
                </div>
                <div style={{ background: edadRetiro >= 65 ? '#f0fdf4' : '#fffbeb', border: `1px solid ${edadRetiro >= 65 ? '#bbf7d0' : '#fde68a'}`, borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: '700', color: edadRetiro >= 65 ? '#15803d' : '#92400e', whiteSpace: 'nowrap' as const }}>
                  Factor: {((FACTOR_EDAD_RETIRO[edadRetiro] ?? 1) * 100).toFixed(0)}%
                </div>
              </div>
            </div>
            {escenarios.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>📊</div>
                <p style={{ margin: '0 0 14px' }}>Completa los datos generales y el salario promedio para ver los escenarios.</p>
                <button onClick={() => setTab(0)} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px' }}>← Ir a Datos generales</button>
              </div>
            ) : (
              <>
                {/* ── Pensión objetivo + simulación libre ── */}
                <div style={cardSt}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
                    <div>
                      {sectionTitle('Pensión objetivo del cliente')}
                      <label style={labelSt}>¿Cuánto quiere recibir al mes? ($)</label>
                      <input type="number" value={ingresoObjetivo || ''} onChange={e => setIngresoObjetivo(parseFloat(e.target.value) || 0)}
                        placeholder="Ej. 12000" style={numInputSt} />
                      {ingresoObjetivo > 0 && <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>Objetivo: {fmtMXN(ingresoObjetivo)}/mes</p>}
                    </div>
                    <div>
                      {sectionTitle('Simulación libre')}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={simulacionLibre} onChange={e => setSimulacionLibre(e.target.checked)} />
                          <span style={{ fontWeight: '600', color: simulacionLibre ? NARANJA : '#94a3b8' }}>🔧 Activar simulación personalizada</span>
                        </label>
                        {simulacionLibre && (
                          <button onClick={() => { setSimUmas(mod40Umas); setSimMeses(mod40Meses); if (escenarios[escElegidoIdx]?.id === 'e_sim') setEscElegidoIdx(escenarios.findIndex(e => e.recomendado)) }}
                            style={{ fontSize: '11px', padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#F4F6FB', cursor: 'pointer', color: '#64748b' }}>
                            ↩️ Restablecer base
                          </button>
                        )}
                      </div>
                      {simulacionLibre && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                          <div>
                            <label style={labelSt}>UMAs ({simUmas} = {fmtMXN(simUmas * sys.UMA_DIARIA * 30.4)}/mes)</label>
                            <input type="range" min="1" max="25" value={simUmas} onChange={e => setSimUmas(parseFloat(e.target.value))} style={{ width: '100%' }} />
                          </div>
                          <div>
                            <label style={labelSt}>Meses ({simMeses})</label>
                            <input type="range" min="12" max="120" step="12" value={simMeses} onChange={e => setSimMeses(parseInt(e.target.value))} style={{ width: '100%' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Escenarios grid ── */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${escenarios.length}, minmax(0, 1fr))`, gap: '10px' }}>
                  {escenarios.map((esc, i) => {
                    const isElegido = escElegidoIdx === i
                    const pctObjetivo = ingresoObjetivo > 0 ? Math.round((esc.pension_mensual / ingresoObjetivo) * 100) : null
                    const brecha = ingresoObjetivo > 0 ? ingresoObjetivo - esc.pension_mensual : null
                    const isSim = esc.id === 'e_sim'
                    const isM10 = esc.id === 'e_m10'
                    return (
                      <div key={esc.id}
                        style={{ border: `${isElegido ? '2px' : '1px'} solid ${isElegido ? NARANJA : isSim ? '#f97316' : '#e2e8f0'}`, borderRadius: '10px', padding: '12px', background: isElegido ? '#fff5f2' : isSim ? '#fff7ed' : 'white', position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {esc.recomendado && <div style={{ position: 'absolute', top: '-1px', right: '-1px', background: NARANJA, color: 'white', fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '0 8px 0 6px' }}>⭐ ÓPTIMO</div>}
                        {isSim && <div style={{ position: 'absolute', top: '-1px', left: '-1px', background: '#f97316', color: 'white', fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '8px 0 6px 0' }}>🔧 SIM</div>}
                        {isM10 && <div style={{ position: 'absolute', top: '-1px', left: '-1px', background: VERDE, color: 'white', fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '8px 0 6px 0' }}>M10</div>}
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>E{i + 1}</div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{esc.label}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{esc.descripcion}</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: i === 0 ? '#94a3b8' : isElegido ? VERDE : AZUL }}>{fmtMXN(esc.pension_mensual)}/mes</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '-4px' }}>{fmtMXN(esc.pension_mensual * 12)}/año</div>
                        {esc.pmg_aplica && (
                          <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#0891b2', background: '#ECFEFF', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                            🛡️ Aplica Pensión Mínima Garantizada
                          </div>
                        )}
                        {esc.incremento_vs_base > 0 && <div style={{ fontSize: '11px', color: VERDE, fontWeight: '600' }}>+{fmtMXN(esc.incremento_vs_base)}/mes vs base</div>}
                        {esc.inversion_total > 0 && <div style={{ fontSize: '10px' }}><span style={{ color: NARANJA, fontWeight: '600' }}>{fmtMXN(esc.costo_mensual_mod40)}/mes</span><span style={{ color: '#94a3b8' }}> · {fmtMXN(esc.inversion_total)} total</span></div>}
                        {pctObjetivo !== null && (
                          <div style={{ padding: '6px 8px', borderRadius: '6px', background: pctObjetivo >= 100 ? '#f0fdf4' : pctObjetivo >= 70 ? '#fffbeb' : '#fef2f2', fontSize: '11px', fontWeight: '700', color: pctObjetivo >= 100 ? VERDE : pctObjetivo >= 70 ? '#b45309' : '#ef4444' }}>
                            {pctObjetivo >= 100
                              ? `✅ ${pctObjetivo}% — alcanza el objetivo`
                              : pctObjetivo >= 70
                              ? `⚠️ ${pctObjetivo}% — faltan ${fmtMXN(brecha ?? 0)}/mes · Prueba con más UMAs o más meses en la simulación libre`
                              : `❌ ${pctObjetivo}% — faltan ${fmtMXN(brecha ?? 0)}/mes`}
                          </div>
                        )}
                        <button onClick={() => { setEscElegidoIdx(i); setEscSelIdx(i) }}
                          style={{ marginTop: '4px', padding: '6px 8px', border: `1px solid ${isElegido ? NARANJA : '#e2e8f0'}`, borderRadius: '6px', background: isElegido ? NARANJA : 'white', color: isElegido ? 'white' : '#64748b', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                          {isElegido ? '⭐ Elegido para diagnóstico' : 'Elegir para diagnóstico'}
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* ── Detalle del escenario elegido ── */}
                {escElegidoIdx >= 0 && escenarios[escElegidoIdx] && (() => {
                  const escSel = escenarios[escElegidoIdx]
                  return (
                    <div style={cardSt}>
                      {sectionTitle(`Detalle: ${escSel.label}`)}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                        {kpiBox('Pensión mensual', fmtMXN(escSel.pension_mensual), 'pesos de hoy', VERDE, 'verde')}
                        {kpiBox('Inversión total', fmtMXN(escSel.inversion_total), 'costo total Mod 40', AZUL, 'rojo')}
                        {escSel.incremento_vs_base > 0 ? kpiBox('Incremento vs base', `+${fmtMXN(escSel.incremento_vs_base)}/mes`, 'sobre pensión sin modalidad', NARANJA, 'naranja') : kpiBox('Pensión base', fmtMXN(escenarios[0]?.pension_mensual || 0), 'sin estrategia', '#94a3b8')}
                        {escSel.roi_meses > 0 ? kpiBox('Recuperación de inversión', `${escSel.roi_meses} meses`, `~${(escSel.roi_meses / 12).toFixed(1)} años`, '#8b5cf6', 'azul') : kpiBox('Sin inversión adicional', '—', 'pensión base', '#94a3b8')}
                      </div>
                      {ingresoObjetivo > 0 && (() => {
                        const brechaEsc = ingresoObjetivo - escSel.pension_mensual
                        const alcanza = brechaEsc <= 0
                        // Calculate what UMAs would be needed
                        const sem = datos.semanas_totales - datos.semanas_descontadas
                        const sdiBase = sdiPromedio > 0 ? sdiPromedio : sys.SALARIO_MIN
                        const pmg = sys.PMG_L73 ?? 6000
                        // Rough inverse: more UMAs = higher SDI ponderado
                        const umasNecesario = !alcanza && escSel.mod40_meses > 0
                          ? Math.ceil(escSel.mod40_umas * (ingresoObjetivo / Math.max(escSel.pension_mensual, pmg + 1)))
                          : null
                        const mesesNecesario = !alcanza && escSel.mod40_meses > 0 && escSel.pension_mensual > pmg
                          ? Math.ceil(escSel.mod40_meses * (ingresoObjetivo / escSel.pension_mensual))
                          : null
                        return (
                          <div style={{ padding: '12px 14px', background: alcanza ? '#f0fdf4' : '#fef2f2', border: `1px solid ${alcanza ? '#bbf7d0' : '#fecaca'}`, borderRadius: '8px', fontSize: '12px', color: alcanza ? '#15803d' : '#991b1b', lineHeight: 1.7 }}>
                            {alcanza ? (
                              `✅ Este escenario alcanza el objetivo de ${fmtMXN(ingresoObjetivo)}/mes`
                            ) : (
                              <>
                                <div style={{ fontWeight: '700', marginBottom: '6px' }}>⚠️ Faltan {fmtMXN(brechaEsc)}/mes para alcanzar {fmtMXN(ingresoObjetivo)}/mes</div>
                                <div style={{ fontSize: '11px', color: '#7f1d1d' }}>Para acercarte al objetivo puedes considerar:</div>
                                <ul style={{ margin: '4px 0 0', paddingLeft: '16px', fontSize: '11px', color: '#7f1d1d' }}>
                                  {escSel.mod40_meses > 0 && umasNecesario && umasNecesario <= 25 && <li>Aumentar el salario base a <strong>{umasNecesario} UMAs</strong> manteniendo el mismo plazo</li>}
                                  {escSel.mod40_meses > 0 && mesesNecesario && mesesNecesario <= 120 && <li>Extender el período a <strong>{mesesNecesario} meses</strong> con las mismas UMAs</li>}
                                  {(umasNecesario ?? 0) > 25 && <li>El objetivo supera lo alcanzable con Modalidad 40 solo (máx. 25 UMAs) — considera ajustar la expectativa de pensión</li>}
                                  <li>Usa la <strong>Simulación libre</strong> para explorar combinaciones de UMAs y meses</li>
                                  {ingresoObjetivo > 15000 && <li>Para objetivos altos considera combinar la pensión IMSS con ahorro privado (AFORE voluntario)</li>}
                                </ul>
                              </>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })()}
              </>
            )}
            {navButtons(() => setTab(4), () => setTab(6), 'Siguiente: Resumen →')}
          </div>
        )}

                {/* ══ TAB 7: RESUMEN EJECUTIVO ════════════════════════════ */}
        {tab === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mensaje && <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: VERDE }}>{mensaje}</div>}

            {/* Banner: análisis requerido */}
            {analisis.length === 0 && escenarios.length > 0 && (
              <div style={{ padding: '12px 16px', background: '#F5F3FF', border: '2px solid #8b5cf6', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#8b5cf6', margin: '0 0 2px' }}>✨ El análisis con IA es requerido antes de guardar</p>
                  <p style={{ fontSize: '11px', color: '#7c3aed', margin: 0 }}>Genera el análisis narrativo personalizado para poder guardar y exportar el diagnóstico.</p>
                </div>
                <button onClick={generarAnalisisIA} disabled={generandoAnalisis}
                  style={{ padding: '8px 18px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>
                  {generandoAnalisis ? '⏳ Generando...' : '✨ Generar ahora'}
                </button>
              </div>
            )}

            {/* Header resumen */}
            <div style={{ ...cardSt, borderLeft: `3px solid ${NARANJA}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: '0 0 3px' }}>
                    Proyecto de pensión — {datos.nombre || 'Sin nombre'}
                  </p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                    {datos.ley === '73' ? 'Ley 73' : datos.ley === '97' ? 'Ley 97' : 'Régimen pendiente'} · {escSel?.label || 'Escenario no seleccionado'} · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {/* 1. Análisis IA — obligatorio antes de guardar */}
                  <button onClick={generarAnalisisIA} disabled={generandoAnalisis || escenarios.length === 0 || estatus === 'autorizado'}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: `2px solid ${analisis.length === 0 ? '#8b5cf6' : '#c4b5fd'}`, borderRadius: '8px', background: analisis.length === 0 ? '#F5F3FF' : '#f8fafc', color: '#8b5cf6', fontSize: '12px', fontWeight: '700', cursor: generandoAnalisis || estatus === 'autorizado' ? 'not-allowed' : 'pointer', animation: analisis.length === 0 ? 'pulse 2s infinite' : 'none' }}>
                    {generandoAnalisis ? '⏳ Generando...' : analisis.length === 0 ? '✨ Generar análisis IA (requerido)' : '✨ Regenerar análisis'}
                  </button>
                  {/* 2. Guardar borrador — requiere análisis */}
                  <button onClick={() => guardarDiagnostico('borrador')} disabled={!clienteId || guardando || analisis.length === 0 || estatus === 'autorizado'} className="btn-secondary" style={{ ...btnSecondary, fontSize: '12px', opacity: (!clienteId || analisis.length === 0 || estatus === 'autorizado') ? 0.5 : 1 }}>
                    {guardando && estatus !== 'autorizado' ? '⏳ Guardando...' : diagGuardadoId ? '💾 Actualizar borrador' : '💾 Guardar borrador'}
                  </button>
                  {/* 3. PDF borrador — requiere diagnóstico guardado */}
                  {diagGuardadoId && estatus === 'borrador' && (
                    <button onClick={exportarPDF} className="btn-secondary" style={{ ...btnSecondary, fontSize: '12px', color: '#f59e0b', borderColor: '#fcd34d' }}>
                      📄 PDF borrador
                    </button>
                  )}
                  {/* 4. Autorizar — requiere borrador guardado */}
                  {diagGuardadoId && estatus === 'borrador' && (
                    <button onClick={() => guardarDiagnostico('autorizado')} disabled={guardando} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px', background: VERDE }}>
                      {guardando ? '⏳...' : '✅ Autorizar diagnóstico'}
                    </button>
                  )}
                  {/* 5. PDF oficial — solo si autorizado */}
                  {estatus === 'autorizado' && (
                    <button onClick={exportarPDF} className="btn-primary" style={{ ...btnPrimary, fontSize: '12px' }}>
                      📄 PDF oficial
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {/* Columna izq */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={cardSt}>
                  {sectionTitle('Datos del trabajador')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px' }}>
                    {[
                      ['Nombre', datos.nombre || '—'],
                      ['NSS', datos.nss || '—'],
                      ['Edad', datos.edad_actual ? `${datos.edad_actual} años` : '—'],
                      ['Régimen', datos.ley === '73' ? 'Ley 73 (pre-1997)' : datos.ley === '97' ? 'Ley 97 (post-1997)' : '—'],
                      ['Semanas cotizadas', datos.semanas_totales.toLocaleString()],
                      ['SDI promedio 250 sem.', sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—'],
                      ['Asignaciones familiares', `+${(datos.tiene_conyuge ? 15 : 0) + datos.num_hijos * 10}%`],
                      ['Conservación derechos', conservacion.vigente ? (conservacion.indefinida ? 'Indefinida ✓' : `${conservacion.venceEn} meses`) : 'Vencida ✗'],
                    ].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ color: '#94a3b8' }}>{l}</span>
                        <span style={{ fontWeight: '500', color: '#374151' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={cardSt}>
                  {sectionTitle('Pensión sin Modalidad 40')}
                  <div style={{ fontSize: '26px', fontWeight: '700', color: '#94a3b8', marginBottom: '4px' }}>{fmtMXN(escenarios[0]?.pension_mensual || 0)}/mes</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{fmtMXN((escenarios[0]?.pension_mensual || 0) * 12)}/año</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>SDI base: {fmtMXN2(sdiPromedio)} · Pensión base sin estrategia</div>
                </div>
              </div>

              {/* Columna der */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ ...cardSt, border: `2px solid ${NARANJA}` }}>
                  {sectionTitle('Pensión recomendada', escSel?.label)}
                  <div style={{ fontSize: '30px', fontWeight: '700', color: AZUL, marginBottom: '4px' }}>{fmtMXN(escSel?.pension_mensual || 0)}/mes</div>
                  <div style={{ fontSize: '13px', color: AZUL, fontWeight: '600', marginBottom: '4px' }}>{fmtMXN((escSel?.pension_mensual || 0) * 12)}/año</div>
                  {escSel?.pmg_aplica && (
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#0891b2', background: '#ECFEFF', padding: '3px 8px', borderRadius: '5px', display: 'inline-block', marginBottom: '6px' }}>
                      🛡️ Este monto aplica la Pensión Mínima Garantizada — el cálculo convencional habría dado menos
                    </div>
                  )}
                  {escSel && escSel.incremento_vs_base > 0 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', background: '#f0fdf4', borderRadius: '20px', fontSize: '12px', fontWeight: '700', color: VERDE, marginBottom: '10px' }}>
                      +{Math.round((escSel.incremento_vs_base / (escenarios[0]?.pension_mensual || 1)) * 100)}% sobre pensión base
                    </div>
                  )}
                  {escSel && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px' }}>
                      {kpiBox('Inversión total', fmtMXN(escSel.inversion_total))}
                      {kpiBox('Incremento mensual', `+${fmtMXN(escSel.incremento_vs_base)}`, 'vs sin Mod 40', VERDE)}
                      {kpiBox('ROI', escSel.roi_meses > 0 ? `${escSel.roi_meses} meses` : '—', 'punto de equilibrio', '#8b5cf6')}
                      {kpiBox('Aguinaldo anual', fmtMXN(escSel.pension_mensual / 30 * 15), '15 días de pensión · IMSS', '#0891b2')}
                    </div>
                  )}
                </div>

                <div style={cardSt}>
                  {sectionTitle('Semáforo de viabilidad')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {semaforo(datos.semanas_totales >= 500, datos.semanas_totales >= 500 ? `Cumple semanas mínimas — ${datos.semanas_totales} de 500` : 'No cumple semanas mínimas')}
                    {semaforo(conservacion.vigente, conservacion.vigente ? (conservacion.indefinida ? 'Derechos conservados indefinidamente' : `Derechos vigentes — ${conservacion.venceEn} meses restantes`) : 'Derechos pensionarios vencidos')}
                    {corridaFin && escSel && semaforo(corridaFin.cuota < escSel.pension_mensual, corridaFin.cuota < escSel.pension_mensual ? 'Pensión cubre la cuota del financiamiento' : 'Cuota supera la pensión — revisar')}
                    {escSel && semaforo((escSel.roi_meses || 999) < 60, (escSel.roi_meses || 0) < 60 ? `ROI positivo en ${escSel.roi_meses} meses` : 'ROI mayor a 5 años — evaluar con cliente')}
                  </div>
                </div>
              </div>
            </div>

            {/* Proyección de la pensión cada 5 años, ajustada por inflación estimada */}
            {escSel && (
              <div style={{ ...cardSt, marginTop: '10px' }}>
                {sectionTitle('Proyección de la pensión a futuro', 'Estimado con inflación anual de 4% · resalta los 80 años (esperanza de vida promedio)')}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#F4F6FB' }}>
                        {['Edad', 'Año', 'Pensión mensual', 'Pensión anual', '% vs hoy'].map((h, i) => (
                          <th key={i} style={{ padding: '7px 10px', textAlign: i > 0 ? 'right' : 'center', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const edadInicio = Math.max(edadRetiro, 65)
                        const edades: number[] = []
                        for (let e = edadInicio; e <= 100; e += 5) edades.push(e)
                        if (!edades.includes(100)) edades.push(100)
                        const anioBase = new Date().getFullYear()
                        const anioRetiroCal = anioBase + (edadRetiro - (datos.edad_actual || edadRetiro))
                        return edades.map((edad, i) => {
                          const aniosTranscurridos = edad - edadInicio
                          const pensionProyectada = escSel.pension_mensual * Math.pow(1.04, aniosTranscurridos)
                          const anioCal = anioRetiroCal + aniosTranscurridos
                          const pct = Math.round((pensionProyectada / escSel.pension_mensual - 1) * 100)
                          const esEsperanzaVida = edad === 80
                          return (
                            <tr key={i} style={{ background: esEsperanzaVida ? '#FFF7ED' : i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9', borderLeft: esEsperanzaVida ? `3px solid ${NARANJA}` : 'none' }}>
                              <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: esEsperanzaVida ? '800' : '600', color: esEsperanzaVida ? NARANJA : '#374151' }}>
                                {edad} {esEsperanzaVida ? '★' : ''}
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{anioCal}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', color: esEsperanzaVida ? NARANJA : AZUL }}>{fmtMXN(pensionProyectada)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{fmtMXN(pensionProyectada * 12)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', color: VERDE, fontWeight: '600' }}>+{pct}%</td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: '9px', color: '#94a3b8', marginTop: '8px' }}>
                  ★ 80 años = esperanza de vida promedio en México (fuente: INEGI). Proyección informativa — el IMSS aplica el incremento real anual conforme a inflación oficial (INPC), no necesariamente 4%.
                </p>
              </div>
            )}

            {/* Análisis narrativo IA */}
            {analisis.length > 0 && (
              <div style={cardSt}>
                {sectionTitle('Análisis narrativo — Resumen ejecutivo', 'Generado por IA · Editable por el asesor')}
                <div style={{ padding: '10px 14px', background: '#F5F3FF', border: '1px solid #ddd6fe', borderRadius: '8px', fontSize: '12px', color: '#6d28d9', lineHeight: 1.6, marginBottom: '4px' }}>
                  <strong>✏️ Este análisis es editable.</strong> El texto generado por IA es un punto de partida — puedes complementar, ajustar o depurar cualquier sección directamente en los campos de texto antes de guardar y generar el PDF. Los cambios se guardan junto con el diagnóstico.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {analisis.map((sec, i) => (
                    <div key={i} style={{ borderBottom: i < analisis.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: i < analisis.length - 1 ? '12px' : 0 }}>
                      <p style={{ fontSize: '12px', fontWeight: '700', color: AZUL, marginBottom: '6px' }}>{sec.titulo}</p>
                      <textarea
                        value={sec.contenido}
                        onChange={e => setAnalisis(prev => prev.map((s, j) => j === i ? { ...s, contenido: e.target.value } : s))}
                        rows={4}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', lineHeight: 1.7, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', color: '#374151' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {generandoAnalisis && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '12px' }}>
                ✨ Generando análisis narrativo... esto puede tomar unos segundos.
              </div>
            )}

            {navButtons(() => setTab(6))}
          </div>
        )}

        {/* ══ MODAL HISTORIAL LABORAL COMPLETO (todas las semanas, no solo las últimas 250) ═══════════════════════════ */}
        {showHistorialCompleto && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            onClick={e => { if (e.target === e.currentTarget) setShowHistorialCompleto(false) }}>
            <div style={{ background: 'white', borderRadius: '14px', padding: '20px', width: '720px', maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Historial laboral completo — toda la vida laboral</p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
                    {periodosCompletos.reduce((s: number, p: any) => s + (p.semanas || 0), 0)} semanas en {periodosCompletos.length} períodos extraídos de la constancia (incluye los que quedan fuera de las últimas 250 semanas).
                  </p>
                </div>
                <button onClick={() => setShowHistorialCompleto(false)}
                  style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8', padding: '4px 8px' }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: '#F4F6FB' }}>
                      {['#', 'Patrón', 'Fecha inicio', 'Fecha fin', 'Semanas', 'SDI diario', '¿En últimas 250?'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 10px', textAlign: i > 0 ? 'right' : 'center', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periodosCompletos.map((p: any, i: number) => {
                      const enUltimas250 = periodos.some(pp => pp.fecha_fin === p.fecha_fin && pp.sdi === p.sdi)
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.patron || '—'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_inicio}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_fin}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: AZUL }}>{p.semanas}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>{fmtMXN2(p.sdi || 0)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: enUltimas250 ? VERDE : '#cbd5e1', fontWeight: enUltimas250 ? '700' : '400' }}>{enUltimas250 ? '✓ Sí' : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ MODAL DETALLE 250 SEMANAS ═══════════════════════════ */}
        {showDetalle250 && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            onClick={e => { if (e.target === e.currentTarget) setShowDetalle250(false) }}>
            <div style={{ background: 'white', borderRadius: '14px', padding: '20px', width: '680px', maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Desglose completo — 250 semanas cotizadas</p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>SDI promedio ponderado: {fmtMXN2(sdiPromedio)}</p>
                </div>
                <button onClick={() => setShowDetalle250(false)}
                  style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8', padding: '4px 8px' }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: '#F4F6FB' }}>
                      {['#', 'Fecha inicio', 'Fecha fin', 'Semanas', 'SDI diario', 'SDI mensual', 'Peso'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 10px', textAlign: i > 0 ? 'right' : 'center', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periodos.map((p, i) => (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_inicio}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_fin}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: AZUL }}>{p.semanas}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>{fmtMXN2(p.sdi)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{fmtMXN(p.sdi * 30.4)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{p.peso.toFixed(2)}%</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={3} style={{ padding: '7px 10px', fontWeight: '700', color: AZUL }}>Promedio ponderado</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{periodos.reduce((s,p)=>s+p.semanas,0)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '800', color: NARANJA }}>{fmtMXN2(sdiPromedio)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{fmtMXN(sdiPromedio * 30.4)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
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
