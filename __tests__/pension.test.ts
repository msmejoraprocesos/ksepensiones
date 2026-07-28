import { describe, it, expect } from 'vitest'
import { calcPensionLey73, calcPromedioSalarial250, proyectarValor } from '../lib/calculos-pension'

// ── Valores del sistema (Admin Fórmulas) ──────────────────────────────────
const SYS = {
  UMA_DIARIA: 117.31,
  PMG_L73: 10636.54,   // salario_min × 365 × 1.11 / 12
  SALARIO_MIN: 248.93,
  inflacion_uma: 4,
}

// ── Datos del cliente de prueba (constancia real del Excel) ───────────────
const CLIENTE = {
  semanas: 1795,       // 1677 actuales + 118 proyectadas al retiro
  sdi: 518.07,         // SDI del Excel (referencia)
  sdiApp: 520.02,      // SDI que extrae la app (pequeña diferencia en extracción)
  edadRetiro: 60,
  tieneConyuge: false,
  numHijos: 1,
  numPadres: 0,
}

// ── Valores esperados del Excel ───────────────────────────────────────────
const EXCEL = {
  vecesUMA: 4.4148,         // 518.07 / 117.31
  pctBasica: 0.1829,        // bracket 4.26-4.50 UMAs
  pctIncremento: 0.02302,
  numIncrementos: 25,
  factorEdad: 0.75,         // 60 años = 75%
  cuantiaBasicaAnual: 38389.64,  // sin ×1.11 ni ×%edad
  incrementosAnual: 120794.09,   // sin ×1.11 ni ×%edad
  asignacionesMensuales: 994.90, // 1 hijo
  pensionMensual: 10943.88,
  pensionAnual: 131326.58,
  aguinaldo: 9948.98,
  aplicaPMG: false,
}

const TOLERANCIA = 10  // ±$10 MXN de tolerancia por diferencias de SDI

describe('calcPensionLey73 — validación contra Excel de referencia', () => {

  it('numIncrementos = 25 con 1795 semanas', () => {
    const res = calcPensionLey73(CLIENTE.semanas, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, CLIENTE.tieneConyuge, CLIENTE.numHijos, CLIENTE.numPadres)
    expect(res.numIncrementos).toBe(25)
  })

  it('factorEdad = 0.75 a los 60 años', () => {
    const res = calcPensionLey73(CLIENTE.semanas, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, CLIENTE.tieneConyuge, CLIENTE.numHijos, CLIENTE.numPadres)
    expect(res.factorEdad).toBe(0.75)
  })

  it('pctBasica = 18.29% para SDI = 4.44 UMAs', () => {
    const res = calcPensionLey73(CLIENTE.semanas, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, CLIENTE.tieneConyuge, CLIENTE.numHijos, CLIENTE.numPadres)
    expect(res.pctBasica).toBe(0.1829)
  })

  it('NO aplica PMG — pensión calculada > PMG', () => {
    const res = calcPensionLey73(CLIENTE.semanas, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, CLIENTE.tieneConyuge, CLIENTE.numHijos, CLIENTE.numPadres)
    expect(res.pmg_aplica).toBe(false)
  })

  it('pensión mensual ≈ $10,943 (±$50 por diferencia de SDI)', () => {
    const res = calcPensionLey73(CLIENTE.semanas, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, CLIENTE.tieneConyuge, CLIENTE.numHijos, CLIENTE.numPadres)
    expect(res.pensionMensual).toBeGreaterThan(EXCEL.pensionMensual - 50)
    expect(res.pensionMensual).toBeLessThan(EXCEL.pensionMensual + 50)
  })

  it('aguinaldo ≈ $9,948 (sin incluir asignaciones)', () => {
    const res = calcPensionLey73(CLIENTE.semanas, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, CLIENTE.tieneConyuge, CLIENTE.numHijos, CLIENTE.numPadres)
    expect(res.aguinaldoAnual).toBeGreaterThan(EXCEL.aguinaldo - 50)
    expect(res.aguinaldoAnual).toBeLessThan(EXCEL.aguinaldo + 50)
  })

  it('con < 500 semanas retorna pensión = 0', () => {
    const res = calcPensionLey73(499, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, false, 0, 0)
    expect(res.monto).toBe(0)
    expect(res.pmg_aplica).toBe(false)
  })

  it('aplica PMG cuando la pensión calculada es baja', () => {
    const res = calcPensionLey73(500, 200, 60, SYS, false, 0, 0)
    expect(res.pmg_aplica).toBe(true)
    expect(res.monto).toBeCloseTo(SYS.PMG_L73, 0)
  })

  it('factor de edad correcto para cada edad', () => {
    const factores = [60, 61, 62, 63, 64, 65].map(edad => ({
      edad,
      factor: calcPensionLey73(600, 500, edad, SYS, false, 0, 0).factorEdad
    }))
    expect(factores[0].factor).toBe(0.75)
    expect(factores[1].factor).toBe(0.80)
    expect(factores[2].factor).toBe(0.85)
    expect(factores[3].factor).toBe(0.90)
    expect(factores[4].factor).toBe(0.95)
    expect(factores[5].factor).toBe(1.00)
  })

  it('cónyuge agrega 15% sobre pensión base', () => {
    const sinConyuge = calcPensionLey73(CLIENTE.semanas, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, false, 0, 0)
    const conConyuge = calcPensionLey73(CLIENTE.semanas, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, true, 0, 0)
    expect(conConyuge.pensionMensual).toBeGreaterThan(sinConyuge.pensionMensual)
  })

  it('numIncrementos redondeo: fracción ≥ 27/52 sube a entero', () => {
    // (1795-500)/52 = 24.90 → fracción 0.90 ≥ 27/52=0.519 → numIncrementos = 25
    const res = calcPensionLey73(1795, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, false, 0, 0)
    expect(res.numIncrementos).toBe(25)
  })

  it('numIncrementos redondeo: fracción < 13/52 no sube', () => {
    // (552-500)/52 = 1.0 → fracción 0.0 < 13/52 → numIncrementos = 1
    const res = calcPensionLey73(552, CLIENTE.sdi, CLIENTE.edadRetiro, SYS, false, 0, 0)
    expect(res.numIncrementos).toBe(1)
  })
})

describe('calcPromedioSalarial250', () => {
  it('promedio ponderado correcto', () => {
    const periodos = [
      { id: '1', fecha_inicio: '2020-01-01', fecha_fin: '2022-12-31', sdi: 400, semanas: 150, peso: 60 },
      { id: '2', fecha_inicio: '2018-01-01', fecha_fin: '2019-12-31', sdi: 300, semanas: 100, peso: 40 },
    ]
    const result = calcPromedioSalarial250(periodos)
    expect(result).toBeCloseTo((400 * 150 + 300 * 100) / 250, 2)
  })

  it('retorna 0 con periodos vacíos', () => {
    expect(calcPromedioSalarial250([])).toBe(0)
  })
})

describe('proyectarValor', () => {
  it('no modifica si anioTarget <= anioBase', () => {
    expect(proyectarValor(100, 2025, 2024)).toBe(100)
    expect(proyectarValor(100, 2025, 2025)).toBe(100)
  })

  it('aplica inflación compuesta correctamente', () => {
    // 100 × 1.04 = 104
    expect(proyectarValor(100, 2024, 2025, 0.04)).toBeCloseTo(104, 2)
    // 100 × 1.04² = 108.16
    expect(proyectarValor(100, 2024, 2026, 0.04)).toBeCloseTo(108.16, 2)
  })
})

describe('Casos límite y regresiones', () => {
  it('exactamente 500 semanas — accede a pensión', () => {
    const res = calcPensionLey73(500, 500, 60, SYS, false, 0, 0)
    expect(res.monto).toBeGreaterThan(0)
    expect(res.numIncrementos).toBe(0)
  })

  it('SDI muy alto (25 UMAs) — pensión alta sin PMG', () => {
    const sdiAlto = SYS.UMA_DIARIA * 25
    const res = calcPensionLey73(1500, sdiAlto, 65, SYS, false, 0, 0)
    expect(res.pmg_aplica).toBe(false)
    expect(res.monto).toBeGreaterThan(50000)
  })

  it('edad 65 = factor 1.0 — pensión mayor que a los 60', () => {
    const sdiAlto = SYS.UMA_DIARIA * 10  // ~1173/día
    const a60 = calcPensionLey73(2000, sdiAlto, 60, SYS, false, 0, 0)
    const a65 = calcPensionLey73(2000, sdiAlto, 65, SYS, false, 0, 0)
    expect(a65.monto).toBeGreaterThan(a60.monto)
    expect(a65.factorEdad).toBe(1.00)
    expect(a60.factorEdad).toBe(0.75)
  })
})
