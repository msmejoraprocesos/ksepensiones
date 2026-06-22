/**
 * formulas.ts — KSE Pensiones
 * ════════════════════════════════════════════════════════════════════
 * ÚNICA FUENTE DE VERDAD para todas las fórmulas y constantes del
 * sistema pensional (Ley del Seguro Social 1973 — Ley 73).
 *
 * Estructura:
 *   A. Tipos compartidos
 *   B. Constantes legales (inmutables — cambian solo si cambia la ley)
 *   C. Constantes configurables (se leen de Supabase / configuración)
 *   D. Fórmulas puras (sin estado, sin side-effects)
 *   E. Helpers de presentación
 *
 * Cada función y constante documenta:
 *   - Artículo de ley que la sustenta
 *   - Celda del Excel de referencia
 *   - Nota si hay una interpretación o supuesto asumido
 *
 * Si la ley cambia, SOLO se modifica este archivo.
 * ════════════════════════════════════════════════════════════════════
 */

// ══════════════════════════════════════════════════════════════════════
// A. TIPOS COMPARTIDOS
// ══════════════════════════════════════════════════════════════════════

export interface SysVars {
  UMA_DIARIA: number           // CONASAMI — actualiza cada febrero
  SALARIO_MIN: number          // CONASAMI — actualiza cada enero
  PMG_L73: number              // IMSS — Pensión Mínima Garantizada Ley 73 (mensual)
  PMG_L97: number              // IMSS — Pensión Mínima Garantizada Ley 97 (mensual)
  pct_afore_mod40: number      // Estimado de recuperación AFORE (~20%) — configurable
  mod40_pct: number            // Tasa Mod40 del año actual — configurable
  RENDIMIENTO_DEFAULT: number  // Tasa de rendimiento AFORE para proyecciones — configurable
}

export interface PeriodoSalarial {
  fecha_inicio: string
  fecha_fin: string
  sdi: number
  semanas: number
  patron?: string
}

export interface ResultadoPension {
  pensionMensual: number
  pensionAnual: number
  cuantiaBasicaAnual: number
  incrementosAnual: number
  asignacionesAnual: number
  ayudaAsistencialAnual: number
  aguinaldoAnual: number
  pmg_aplica: boolean
  factorEdad: number
  vecesUMA: number
  pctBasica: number
  pctIncremento: number
  numIncrementos: number
}

export interface ResultadoMod40 {
  costoMensual: number
  invTotal: number
  sdiNuevo: number
  semTotal: number
  pension: ResultadoPension
  incr: number          // incremento mensual vs pensión base
  roi: number           // meses para recuperar inversión neta
  gananciaa80: number   // ganancia total a los 80 años vs sin Mod40
  tasaRendimiento: number // (ganancia / inversión_neta) × 100
  umaProyectada: number
  tasaProyectada: number
  sdiMod40: number
  recuperaAfore: number
  inversionNeta: number // invTotal - recuperaAfore
}

export interface ResultadoRetroactivo {
  costoBase: number
  totalActualizacion: number
  totalRecargos: number
  costoTotal: number
  pctIncremento: number
  recuperaAfore: number
  costoNeto: number
}

// ══════════════════════════════════════════════════════════════════════
// B. CONSTANTES LEGALES (NO EDITAR salvo cambio de ley)
// ══════════════════════════════════════════════════════════════════════

/**
 * Semanas mínimas para tener derecho a pensión de vejez o cesantía.
 * Art. 162 y 182 LSS 1973.
 * Excel: DATOS GEN.!B7 (referencia implícita)
 */
export const SEMANAS_MINIMAS_PENSION = 500

/**
 * Factor de cuantía de pensión por edad al momento del trámite.
 * Art. 167 LSS 1973: 100% a los 65 años; se reduce 5% por cada año antes.
 * El mínimo reconocido por la ley es 60 años (75%).
 * Excel: DATOS GEN.!D27-D32 y E27-E32
 */
export const FACTOR_EDAD_RETIRO: Record<number, number> = {
  60: 0.75,
  61: 0.80,
  62: 0.85,
  63: 0.90,
  64: 0.95,
  65: 1.00,
  66: 1.00, 67: 1.00, 68: 1.00, 69: 1.00, 70: 1.00,
}

/**
 * Tabla oficial de cuantía básica e incremento anual por semanas extra.
 * Está en función del salario del trabajador expresado en "veces UMA diaria".
 * A menor salario relativo → mayor porcentaje (diseño redistributivo de la ley).
 * Art. 167 LSS 1973 + Anexo de la Ley (tabla de 22 rangos).
 * Excel: Hoja implícita de cálculo en PENSIÓN ACTUAL y PENSION MOD. 40
 *
 * Columnas:
 *   min/max : rango de salario en veces-UMA (SDI_promedio / UMA_diaria)
 *   basica  : porcentaje de cuantía básica anual (× SDI × 365)
 *   incremento: porcentaje de incremento por cada año adicional sobre 500 sem
 */
export const TABLA_CUANTIA_UMA: {
  min: number; max: number; basica: number; incremento: number
}[] = [
  { min: 0,    max: 1.00, basica: 0.80,   incremento: 0.00563 },
  { min: 1.01, max: 1.25, basica: 0.7711, incremento: 0.00814 },
  { min: 1.26, max: 1.50, basica: 0.5818, incremento: 0.01178 },
  { min: 1.51, max: 1.75, basica: 0.4923, incremento: 0.01430 },
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
  { min: 4.51, max: 4.75, basica: 0.173,  incremento: 0.02330 },
  { min: 4.76, max: 5.00, basica: 0.1641, incremento: 0.02355 },
  { min: 5.01, max: 5.25, basica: 0.1561, incremento: 0.02377 },
  { min: 5.26, max: 5.50, basica: 0.1488, incremento: 0.02398 },
  { min: 5.51, max: 5.75, basica: 0.1422, incremento: 0.02416 },
  { min: 5.76, max: 6.00, basica: 0.1362, incremento: 0.02433 },
  { min: 6.01, max: Infinity, basica: 0.13, incremento: 0.02450 },
]

/**
 * Factor 1.11 de actualización.
 * El Excel lo aplica consistentemente sobre cuantía básica, incrementos,
 * asignaciones y PMG. Representa la actualización de la UMA de 2020 a la
 * UMA vigente del año de cálculo, congelada en el Excel de referencia.
 * NOTA: Idealmente debería calcularse dinámicamente como UMA_actual/UMA_base
 * pero se mantiene fijo para replicar fielmente el Excel validado.
 * Excel: Implícito en PENSIÓN ACTUAL!B11:B13 (×1.11 visible en fórmulas)
 */
export const FACTOR_ACTUALIZACION_UMA = 1.11

/**
 * Porcentajes de asignaciones familiares (Art. 164 LSS 1973).
 * Se aplican sobre la cuantía total cruda (antes del factor de edad).
 * Excel: PENSIÓN ACTUAL!A13 / PENSION MOD. 40
 */
export const ASIGNACIONES = {
  CONYUGE: 0.15,          // Art. 164 fracc. I — cónyuge o concubina(o)
  HIJO: 0.10,             // Art. 164 fracc. II — cada hijo menor de 16 / estudiante hasta 25
  PADRE: 0.10,            // Art. 164 fracc. III — cada padre económicamente dependiente
  // Solo cuando NO hay cónyuge, hijos ni padres (Art. 165 LSS)
  AYUDA_ASISTENCIAL_SIN_NADIE: 0.15,
  AYUDA_ASISTENCIAL_SOLO_PADRES: 0.10,
}

/**
 * Días de aguinaldo (Art. 171 LSS 1973).
 * El IMSS paga 15 días de pensión como aguinaldo anual.
 * Excel: PENSIÓN ACTUAL!A25
 */
export const DIAS_AGUINALDO = 15

/**
 * Meses de límite para pago retroactivo de Modalidad 40.
 * El IMSS solo acepta retroactivos de hasta 5 años (60 meses).
 * Fuente: Reglamento de la LSS / criterio IMSS validado en Excel.
 * Excel: lógica implícita en COSTO MOD. 40 y PAGO RETROACTIVO
 */
export const MAX_MESES_RETROACTIVO = 60

/**
 * Tasas históricas de actualización mensual (INPC) para el cálculo
 * de pagos retroactivos de Modalidad 40.
 * Fuente: INEGI / SAT, validadas contra Excel de referencia.
 * Excel: Hoja de PAGO RETROACTIVO (fórmulas de actualización)
 */
export const TASA_ACTUALIZACION_MENSUAL: Record<number, number> = {
  2019: 0.0030333,
  2020: 0.002625,
  2021: 0.005000,
  2022: 0.0065166,
  2023: 0.0038833,
  2024: 0.004300,
  // Años posteriores: usar TASA_ACTUALIZACION_DEFAULT
}
export const TASA_ACTUALIZACION_DEFAULT = 0.0036 // estimado conservador

/**
 * Tasas de recargos mensuales por mora en pagos IMSS.
 * Fuente: SAT / IMSS, cambió a partir de 2026.
 * Excel: Hoja PAGO RETROACTIVO
 */
export const TASA_RECARGO_MENSUAL = {
  HASTA_2025: 0.0147,  // 1.47% mensual
  DESDE_2026: 0.0207,  // 2.07% mensual
}

/**
 * Tasas oficiales de cotización Modalidad 40 por año.
 * Fuente: IMSS, cuota del Seguro de Cesantía en Edad Avanzada y Vejez.
 * Sube aproximadamente 1.091% anual hasta alcanzar 18.8% en 2030.
 * Excel: COSTO MOD. 40!D4-D14
 * NOTA: Estas son las tasas del Excel de referencia validado. Si el IMSS
 * las actualiza, modificar este objeto y la tabla en Configuración.
 */
export const TASAS_MOD40_POR_ANIO: Record<number, number> = {
  2019: 10.075, 2020: 10.075, 2021: 10.075,
  2022: 10.075,
  2023: 11.166,
  2024: 12.256,
  2025: 13.347,
  2026: 14.438,
  2027: 15.528,
  2028: 16.619,
  2029: 17.709,
  2030: 18.800,
  // 2031 en adelante: 18.800 (techo de la ley)
}
export const TASA_MOD40_TECHO = 18.800

/**
 * Tasa de recuperación vía AFORE (subcuenta Retiro 97).
 * Aproximadamente el 20% de cada cuota de Mod40 va a la subcuenta
 * individual y se devuelve al pensionarse. Validado en Excel.
 * Excel: COSTO MOD. 40!G17 / PROYECTO DE PENSIÓN!B19
 * NOTA: Es un estimado de mercado. El porcentaje exacto depende del
 * historial de cotización individual. Configurable por el administrador.
 */
export const PCT_RECUPERACION_AFORE_DEFAULT = 20

/**
 * Número de meses de vida asumidos para el cálculo de flujos totales
 * hasta los 80 años. Estándar de la industria para comparar escenarios.
 * Excel: INVERSION!D46/F46 implícito
 */
export const EDAD_ANALISIS_FLUJOS = 80

// ══════════════════════════════════════════════════════════════════════
// D. FÓRMULAS PURAS
// ══════════════════════════════════════════════════════════════════════

/**
 * Busca la fila de la tabla de cuantía según el salario en veces-UMA.
 * Art. 167 LSS 1973.
 */
export function buscarCuantiaPorUMA(vecesUMA: number): typeof TABLA_CUANTIA_UMA[0] {
  return TABLA_CUANTIA_UMA.find(f => vecesUMA <= f.max) ?? TABLA_CUANTIA_UMA[TABLA_CUANTIA_UMA.length - 1]
}

/**
 * Obtiene el factor de cuantía por edad de retiro.
 * Para edades mayores a 65, siempre es 1.0 (100% de vejez).
 * Para edades menores a 60, devuelve 0 (no se puede pensar antes de 60 bajo Ley 73).
 * Art. 167 LSS 1973.
 */
export function getFactorEdad(edadRetiro: number): number {
  if (edadRetiro >= 65) return 1.0
  if (edadRetiro < 60) return 0
  return FACTOR_EDAD_RETIRO[Math.floor(edadRetiro)] ?? 0.75
}

/**
 * Tasa de recargo mensual según el año en que cayó el mes adeudado.
 * Excel: Hoja PAGO RETROACTIVO
 */
export function getTasaRecargoMensual(anio: number): number {
  return anio < 2026 ? TASA_RECARGO_MENSUAL.HASTA_2025 : TASA_RECARGO_MENSUAL.DESDE_2026
}

/**
 * Tasa de actualización (INPC) mensual para el año dado.
 * Excel: Hoja PAGO RETROACTIVO
 */
export function getTasaActualizacion(anio: number): number {
  return TASA_ACTUALIZACION_MENSUAL[anio] ?? TASA_ACTUALIZACION_DEFAULT
}

/**
 * Tasa de cotización Modalidad 40 para un año dado.
 * Si el año es posterior a 2030, usa el techo de 18.8%.
 * Si es anterior a 2019, usa el valor más bajo conocido.
 * Excel: COSTO MOD. 40!D4-D14
 */
export function getTasaMod40(anio: number, override?: Record<number, number>): number {
  const tabla = override ?? TASAS_MOD40_POR_ANIO
  if (tabla[anio] != null) return tabla[anio]
  const anios = Object.keys(tabla).map(Number).sort((a, b) => a - b)
  if (anio > anios[anios.length - 1]) return TASA_MOD40_TECHO
  return tabla[anios[0]]
}

/**
 * Proyecta un valor (UMA, PMG, salario mínimo) a un año futuro
 * usando una tasa de inflación anual compuesta.
 * NOTA: El Excel usa 4% anual como supuesto estándar de inflación.
 */
export function proyectarValor(
  base: number,
  anioBase: number,
  anioTarget: number,
  inpc = 0.04
): number {
  if (anioTarget <= anioBase) return base
  let v = base
  for (let a = anioBase + 1; a <= anioTarget; a++) v *= (1 + inpc)
  return v
}

/**
 * Calcula el salario promedio ponderado de las últimas N semanas.
 * El peso de cada período es proporcional a sus semanas cotizadas.
 * Excel: CAL. PROM. 250 SEM (columna F / E22)
 */
export function calcPromedioSalarial(periodos: PeriodoSalarial[]): number {
  if (!periodos.length) return 0
  const totalSem = periodos.reduce((s, p) => s + p.semanas, 0)
  if (totalSem === 0) return 0
  return periodos.reduce((s, p) => s + p.sdi * p.semanas, 0) / totalSem
}

/**
 * Calcula el número de semanas entre dos fechas.
 * Usa aritmética exacta de fechas (no texto libre) para evitar
 * imprecisiones del LLM.
 */
export function calcSemanas(fechaInicio: string, fechaFin: string): number {
  const inicio = new Date(fechaInicio)
  const fin = new Date(fechaFin)
  const dias = (fin.getTime() - inicio.getTime()) / 86400000
  return Math.max(0, Math.round((dias / 7) * 100) / 100)
}

/**
 * Calcula la pensión completa bajo Ley 73.
 * Art. 162-171 LSS 1973.
 * Excel: PENSIÓN ACTUAL!A11-C30 / PENSION MOD. 40!B12-C30
 *
 * Flujo del cálculo:
 * 1. Semanas < 500 → sin derecho
 * 2. Cuantía básica anual = SDI × %basica × 365 × FACTOR_111
 * 3. Incrementos = SDI × %incremento × 365 × numIncrementos × FACTOR_111
 * 4. Asignaciones familiares (sobre cuantía cruda × FACTOR_111 × factorEdad)
 * 5. Ayuda asistencial (si no hay beneficiarios)
 * 6. Aplicar factor de edad al total
 * 7. Comparar vs PMG (PMG no se reduce por factor de edad)
 */
export function calcPensionLey73(
  sdi: number,
  semanas: number,
  edadRetiro: number,
  sys: SysVars,
  opciones: {
    tieneConyuge?: boolean
    numHijos?: number
    numPadres?: number
    tieneAyudaAsistencial?: boolean
    anioRetiro?: number
  } = {}
): ResultadoPension {
  const { tieneConyuge = false, numHijos = 0, numPadres = 0, anioRetiro } = opciones

  // Sin semanas suficientes
  if (semanas < SEMANAS_MINIMAS_PENSION || sdi <= 0) {
    return {
      pensionMensual: 0, pensionAnual: 0,
      cuantiaBasicaAnual: 0, incrementosAnual: 0,
      asignacionesAnual: 0, ayudaAsistencialAnual: 0,
      aguinaldoAnual: 0, pmg_aplica: false,
      factorEdad: 0, vecesUMA: 0,
      pctBasica: 0, pctIncremento: 0, numIncrementos: 0
    }
  }

  const vecesUMA = sdi / sys.UMA_DIARIA
  const { basica: pctBasica, incremento: pctIncremento } = buscarCuantiaPorUMA(vecesUMA)
  const factorEdad = getFactorEdad(edadRetiro)

  // Cuantía básica
  const cuantiaBasicaRaw = sdi * pctBasica * 365

  // Incrementos (redondeo oficial Art. 167: enteros de 52 sem, más 13/52 o 27/52)
  const aniosExtra = (semanas - SEMANAS_MINIMAS_PENSION) / 52
  const enteros = Math.floor(aniosExtra)
  const fraccion = aniosExtra - enteros
  const numIncrementos = enteros +
    (fraccion >= 27 / 52 ? 1 : fraccion >= 13 / 52 ? 0.5 : 0)

  const incrementoRaw = sdi * pctIncremento * 365 * numIncrementos
  const cuantiaTotalRaw = cuantiaBasicaRaw + incrementoRaw

  // Asignaciones familiares (base: cuantía cruda × FACTOR_111 × factorEdad)
  const baseAsig = cuantiaTotalRaw * FACTOR_ACTUALIZACION_UMA * factorEdad
  const hayBeneficiarios = tieneConyuge || numHijos > 0
  const asigConyuge = tieneConyuge ? baseAsig * ASIGNACIONES.CONYUGE : 0
  // Límite: 2 hijos con cónyuge, 3 sin cónyuge (Art. 164 fracc. II)
  const maxHijos = tieneConyuge ? 2 : 3
  const asigHijos = numHijos > 0 ? baseAsig * ASIGNACIONES.HIJO * Math.min(numHijos, maxHijos) : 0
  // Padres: solo si no hay cónyuge ni hijos (Art. 164 fracc. III)
  const asigPadres = (!hayBeneficiarios && numPadres > 0) ? baseAsig * ASIGNACIONES.PADRE * numPadres : 0
  const asignacionesAnual = asigConyuge + asigHijos + asigPadres

  // Ayuda asistencial (Art. 165 LSS — solo cuando NO hay ningún beneficiario)
  let ayudaAsistencialAnual = 0
  if (!tieneConyuge && numHijos === 0) {
    if (numPadres === 0) {
      ayudaAsistencialAnual = baseAsig * ASIGNACIONES.AYUDA_ASISTENCIAL_SIN_NADIE
    } else if (numPadres === 1) {
      ayudaAsistencialAnual = baseAsig * ASIGNACIONES.AYUDA_ASISTENCIAL_SOLO_PADRES
    }
  }

  // Total anual
  const cuantiaBasicaAnual = cuantiaBasicaRaw * FACTOR_ACTUALIZACION_UMA * factorEdad
  const incrementosAnual = incrementoRaw * FACTOR_ACTUALIZACION_UMA * factorEdad
  const pensionAnualSinPMG = cuantiaBasicaAnual + incrementosAnual + asignacionesAnual + ayudaAsistencialAnual
  const pensionMensualSinPMG = pensionAnualSinPMG / 12

  // PMG — proyectada al año de retiro si se proporciona; NO se reduce por factor de edad
  const pmgBase = anioRetiro
    ? proyectarValor(sys.PMG_L73, new Date().getFullYear(), anioRetiro)
    : sys.PMG_L73
  const pmg_aplica = pmgBase > pensionMensualSinPMG

  const pensionMensual = Math.max(pmgBase, pensionMensualSinPMG)
  const pensionAnual = pensionMensual * 12
  const aguinaldoAnual = pensionMensual * DIAS_AGUINALDO / 30

  return {
    pensionMensual,
    pensionAnual,
    cuantiaBasicaAnual,
    incrementosAnual,
    asignacionesAnual,
    ayudaAsistencialAnual,
    aguinaldoAnual,
    pmg_aplica,
    factorEdad,
    vecesUMA,
    pctBasica,
    pctIncremento,
    numIncrementos
  }
}

/**
 * Calcula el costo mensual de Modalidad 40.
 * Usa días reales del año (365 o 366) igual que el Excel.
 * Excel: COSTO MOD. 40!F10-F13
 *
 * IMPORTANTE: El Excel calcula: SDI_diario × tasa × días_año / 12
 * NO usa 30.4 días fijos — hay diferencia en años bisiestos.
 */
export function calcCostoMod40Mensual(
  umasSalario: number,
  tasa: number,          // porcentaje (ej. 14.438, no 0.14438)
  umadiaria: number,
  anio: number
): number {
  const esBisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)
  const diasAnio = esBisiesto ? 366 : 365
  const sdiDiario = umasSalario * umadiaria
  return sdiDiario * (tasa / 100) * diasAnio / 12
}

/**
 * Calcula el nuevo promedio de las últimas 250 semanas incluyendo
 * las semanas de Modalidad 40, igual que el Excel de referencia.
 * Excel: SAL. PROM MOD 40!B19
 */
export function calcNuevoPromedio250(
  sdiMod40: number,
  semanasMod40: number,
  periodosHistoricos: PeriodoSalarial[],
): { nuevasSemanas: number; nuevasSemanas250: PeriodoSalarial[]; nuevoPromedio: number } {
  // Inserta el período de Mod40 al final y toma las últimas 250 sem
  const periodoMod40: PeriodoSalarial = {
    fecha_inicio: '',
    fecha_fin: '',
    sdi: sdiMod40,
    semanas: semanasMod40
  }
  const todos = [...periodosHistoricos, periodoMod40]
  const ultimas250: PeriodoSalarial[] = []
  let restante = 250
  for (let i = todos.length - 1; i >= 0 && restante > 0; i--) {
    const p = todos[i]
    const semsUsar = Math.min(p.semanas, restante)
    ultimas250.unshift({ ...p, semanas: semsUsar })
    restante -= semsUsar
  }
  return {
    nuevasSemanas: semanasMod40,
    nuevasSemanas250: ultimas250,
    nuevoPromedio: calcPromedioSalarial(ultimas250)
  }
}

/**
 * Calcula el costo retroactivo de Modalidad 40 con recargos y actualizaciones.
 * Excel: Hoja PAGO RETROACTIVO
 *
 * Para cada mes adeudado se calcula:
 *   - Monto base del mes
 *   - Actualización por inflación (interés simple × tasa mensual × meses vencidos)
 *   - Recargos por mora (interés simple × tasa mensual × meses vencidos)
 * Límite: MAX_MESES_RETROACTIVO (60 meses / 5 años)
 */
export function calcPagoRetroactivo(
  mesesAdeudados: number,
  fechaBaja: Date,
  mod40Umas: number,
  sys: SysVars,
  tasasMod40Override?: Record<number, number>
): ResultadoRetroactivo {
  const mesesEfectivos = Math.min(mesesAdeudados, MAX_MESES_RETROACTIVO)
  let costoBase = 0
  let totalActualizacion = 0
  let totalRecargos = 0

  for (let i = 1; i <= mesesEfectivos; i++) {
    const fechaMes = new Date(fechaBaja)
    fechaMes.setMonth(fechaMes.getMonth() - i)
    const anioMes = fechaMes.getFullYear()
    const umaDelAnio = proyectarValor(sys.UMA_DIARIA, new Date().getFullYear(), anioMes)
    const tasa = getTasaMod40(anioMes, tasasMod40Override)
    const costo = calcCostoMod40Mensual(mod40Umas, tasa, umaDelAnio, anioMes)
    costoBase += costo
    totalActualizacion += costo * i * getTasaActualizacion(anioMes)
    totalRecargos += costo * i * getTasaRecargoMensual(anioMes)
  }

  const costoTotal = costoBase + totalActualizacion + totalRecargos
  const pctIncremento = costoBase > 0 ? (totalActualizacion + totalRecargos) / costoBase : 0
  const pctAfore = (sys.pct_afore_mod40 ?? PCT_RECUPERACION_AFORE_DEFAULT) / 100
  const recuperaAfore = costoTotal * pctAfore
  const costoNeto = costoTotal - recuperaAfore

  return { costoBase, totalActualizacion, totalRecargos, costoTotal, pctIncremento, recuperaAfore, costoNeto }
}

/**
 * Calcula un escenario completo de Modalidad 40 incluyendo inversión,
 * ROI, ganancia a los 80 años y tasa de rendimiento.
 * Excel: SAL. PROM MOD 40 + COSTO MOD. 40 + PENSION MOD. 40 + INVERSION
 */
export function calcEscenarioMod40(
  semActuales: number,
  sdiActual: number,
  mod40Umas: number,
  mod40Meses: number,
  pensionBase: ResultadoPension,
  sys: SysVars,
  opciones: {
    edadRetiro?: number
    anioInicio?: number
    tieneConyuge?: boolean
    numHijos?: number
    numPadres?: number
    tasasMod40Override?: Record<number, number>
  } = {}
): ResultadoMod40 {
  const { edadRetiro = 62, anioInicio = new Date().getFullYear(), tieneConyuge = false, numHijos = 0, numPadres = 0 } = opciones
  const anioActual = new Date().getFullYear()

  // UMA y tasa proyectadas al año de inicio real
  const umaProyectada = proyectarValor(sys.UMA_DIARIA, anioActual, anioInicio)
  const tasaProyectada = getTasaMod40(anioInicio, opciones.tasasMod40Override)
  const sdiMod40 = mod40Umas * umaProyectada

  // Semanas totales (históricas + Mod40)
  const semTotal = semActuales + mod40Meses * (52 / 12)

  // Nuevo SDI promedio 250 semanas con Mod40
  const periodosHistoricos: PeriodoSalarial[] = [{ fecha_inicio: '', fecha_fin: '', sdi: sdiActual, semanas: semActuales }]
  const { nuevoPromedio: sdiNuevo } = calcNuevoPromedio250(sdiMod40, mod40Meses * (52 / 12), periodosHistoricos)

  // Pensión con Mod40
  const pension = calcPensionLey73(sdiNuevo, semTotal, edadRetiro, sys, {
    tieneConyuge, numHijos, numPadres, anioRetiro: anioInicio + Math.round(mod40Meses / 12)
  })

  // Costo total (usando días reales por año)
  let costoTotal = 0
  for (let m = 0; m < mod40Meses; m++) {
    const anioMes = anioInicio + Math.floor(m / 12)
    const tasa = getTasaMod40(anioMes, opciones.tasasMod40Override)
    costoTotal += calcCostoMod40Mensual(mod40Umas, tasa, proyectarValor(sys.UMA_DIARIA, anioActual, anioMes), anioMes)
  }
  const costoMensual = mod40Meses > 0 ? costoTotal / mod40Meses : 0

  // Recuperación AFORE e inversión neta
  const pctAfore = (sys.pct_afore_mod40 ?? PCT_RECUPERACION_AFORE_DEFAULT) / 100
  const recuperaAfore = costoTotal * pctAfore
  const inversionNeta = costoTotal - recuperaAfore

  // Mejora mensual y ROI
  const incr = pension.pensionMensual - pensionBase.pensionMensual
  const roi = incr > 0 ? Math.ceil(inversionNeta / incr) : 0

  // Ganancia a los 80 años y tasa de rendimiento
  // Excel: INVERSION!D46/F46/D49/D50
  const anioRetiroReal = anioInicio + Math.round(mod40Meses / 12)
  const mesesHasta80base = Math.max(0, (EDAD_ANALISIS_FLUJOS - (edadRetiro < 60 ? 60 : edadRetiro)) * 12)
  const mesesHasta80con = Math.max(0, (EDAD_ANALISIS_FLUJOS - edadRetiro) * 12)
  const flujosSin = pensionBase.pensionMensual * mesesHasta80base
  const flujosCon = pension.pensionMensual * mesesHasta80con
  const gananciaa80 = flujosCon - flujosSin - inversionNeta
  const tasaRendimiento = inversionNeta > 0 ? (gananciaa80 / inversionNeta) * 100 : 0

  return {
    costoMensual,
    invTotal: costoTotal,
    sdiNuevo,
    semTotal,
    pension,
    incr,
    roi,
    gananciaa80,
    tasaRendimiento,
    umaProyectada,
    tasaProyectada,
    sdiMod40,
    recuperaAfore,
    inversionNeta
  }
}

/**
 * Calcula conservación de derechos.
 * Art. 183 LSS 1973: el período de conservación es la cuarta parte
 * de las semanas cotizadas, contado desde la última baja.
 * Excel: implícito en DATOS GEN.!B4
 */
export function calcConservacion(semanas: number, mesesDesdeUltimaCot: number) {
  const semanasConservacion = Math.floor(semanas / 4)
  // Conversión exacta: semanas → meses (1 mes = 4.33 semanas promedio)
  const mesesConservacion = Math.round(semanasConservacion / 4.33)
  const mesesRestantes = mesesConservacion - mesesDesdeUltimaCot
  return {
    vigente: mesesRestantes > 0,
    indefinida: false,
    venceEn: Math.max(0, mesesRestantes),
    semanasConservacion,
    mesesConservacion,
  }
}

/**
 * Calcula la corrida de amortización de un crédito.
 * Usado en el módulo de Financiamiento.
 * Excel: FINANCIAMIENTO!B20-B22
 */
export function calcCorrida(capital: number, tasaAnual: number, plazo: number) {
  const tm = tasaAnual / 100 / 12
  const cuota = tm > 0
    ? capital * (tm * Math.pow(1 + tm, plazo)) / (Math.pow(1 + tm, plazo) - 1)
    : capital / plazo
  const rows: { mes: number; cuota: number; capital: number; interes: number; saldo: number }[] = []
  let saldo = capital
  for (let i = 1; i <= plazo; i++) {
    const interes = saldo * tm
    const cap = cuota - interes
    saldo = Math.max(0, saldo - cap)
    rows.push({ mes: i, cuota, capital: cap, interes, saldo })
  }
  return { cuota, totalPagado: cuota * plazo, rows }
}

// ══════════════════════════════════════════════════════════════════════
// E. HELPERS DE PRESENTACIÓN
// ══════════════════════════════════════════════════════════════════════

export const fmtMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

export const fmtMXN2 = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtPct = (n: number) => `${n.toFixed(1)}%`

export const fmtWeeks = (w: number) => w > 0 ? `${w.toFixed(1)} sem` : '—'
