// ══════════════════════════════════════════════════════════════════
// KSE Pensiones — Funciones de cálculo puras (Art. 167-171 LSS 1973)
// Exportadas para testing con Vitest
// ══════════════════════════════════════════════════════════════════

export interface SysVars {
  UMA_DIARIA: number
  PMG_L73: number
  SALARIO_MIN: number
  inflacion_uma?: number
  tasa_m10?: number
  mod40_pct?: number
  pct_actualizacion_inpc?: number
  pct_recargos_retroactivo?: number
  pct_afore_mod40?: number
  tasa_banco_anual?: number
  pct_banco_regulado?: number
  rendimiento_afore_default?: number
}

export interface PeriodoSalarial {
  id: string
  fecha_inicio: string
  fecha_fin: string
  sdi: number
  semanas: number
  peso: number
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
  return TABLA_CUANTIA_UMA.find(f => vecesUMA <= f.max) ?? TABLA_CUANTIA_UMA[TABLA_CUANTIA_UMA.length - 1]
}

const FACTOR_111 = 1.11

const FACTOR_EDAD_RETIRO: Record<number, number> = {
  60: 0.75, 61: 0.80, 62: 0.85, 63: 0.90, 64: 0.95, 65: 1.00,
}

export function proyectarValor(base: number, anioBase: number, anioTarget: number, inpc = 0.04): number {
  if (anioTarget <= anioBase) return base
  let v = base
  for (let a = anioBase + 1; a <= anioTarget; a++) v *= (1 + inpc)
  return v
}

export function calcPensionLey73(
  semanas: number,
  sdi: number,
  edadRetiro: number,
  sys: SysVars,
  tieneConyuge: boolean,
  numHijos: number,
  numPadres: number,
  anioRetiro?: number,
  tieneAyudaAsistencial = false
) {
  if (semanas < 500) return {
    monto: 0, pmg_aplica: false, pensionMensual: 0, pensionAnual: 0,
    cuantiaBasicaAnual: 0, incrementosAnual: 0, asignacionesAnual: 0,
    ayudaAsistencialAnual: 0, aguinaldoAnual: 0, factorEdad: 0,
    vecesUMA: 0, pctBasica: 0, pctIncremento: 0, numIncrementos: 0,
  }

  const vecesUMA = sdi / sys.UMA_DIARIA
  const { basica: pctBasica, incremento: pctIncremento } = buscarCuantiaPorUMA(vecesUMA)
  const cuantiaBasicaAnual = sdi * pctBasica * 365

  const numIncrementosCrudo = (semanas - 500) / 52
  const numIncrementos = Math.floor(numIncrementosCrudo) +
    (numIncrementosCrudo % 1 >= 27 / 52 ? 1 : numIncrementosCrudo % 1 >= 13 / 52 ? 0.5 : 0)

  const incrementosTotalAnual = sdi * pctIncremento * 365 * numIncrementos
  const cuantiaTotalRaw = cuantiaBasicaAnual + incrementosTotalAnual
  const factorEdad = FACTOR_EDAD_RETIRO[edadRetiro] ?? 1.0
  const baseConFactorYEdad = cuantiaTotalRaw * FACTOR_111 * factorEdad

  const hayBeneficiarios = tieneConyuge || numHijos > 0
  const asignConyuge = tieneConyuge ? cuantiaTotalRaw * 0.15 : 0
  const asignHijos = numHijos > 0 ? cuantiaTotalRaw * 0.10 * numHijos : 0
  const asignPadres = (!hayBeneficiarios && numPadres > 0) ? cuantiaTotalRaw * 0.10 * numPadres : 0
  const asignaciones = (asignConyuge + asignHijos + asignPadres) * FACTOR_111 * factorEdad

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

  const pmgBase = anioRetiro
    ? proyectarValor(sys.PMG_L73, new Date().getFullYear(), anioRetiro, (sys.inflacion_uma ?? 4) / 100)
    : sys.PMG_L73
  const pmg_aplica = pmgBase > pensionMensual
  const montoFinal = Math.max(pmgBase, pensionMensual)

  const cuantiaBasicaAnualFinal = cuantiaBasicaAnual * FACTOR_111 * factorEdad
  const incrementosAnualFinal = incrementosTotalAnual * FACTOR_111 * factorEdad
  const tope25UMAs = sys.UMA_DIARIA * 25 * 365 / 12
  const aguinaldoBase = pmg_aplica ? pmgBase : (cuantiaBasicaAnualFinal + incrementosAnualFinal) / 12
  const aguinaldoAnual = Math.min(aguinaldoBase, tope25UMAs)

  return {
    monto: montoFinal, pmg_aplica, pensionMensual: montoFinal, pensionAnual: montoFinal * 12,
    cuantiaBasicaAnual: cuantiaBasicaAnualFinal, incrementosAnual: incrementosAnualFinal,
    asignacionesAnual: asignaciones, ayudaAsistencialAnual: ayudaAsistencial,
    aguinaldoAnual, factorEdad, vecesUMA, pctBasica, pctIncremento, numIncrementos,
  }
}

export function calcPromedioSalarial250(periodos: PeriodoSalarial[]): number {
  if (!periodos.length) return 0
  const totalSem = periodos.reduce((s, p) => s + p.semanas, 0)
  if (totalSem === 0) return 0
  return periodos.reduce((s, p) => s + p.sdi * p.semanas, 0) / totalSem
}
