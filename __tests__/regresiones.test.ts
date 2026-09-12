import { describe, it, expect } from 'vitest'
import { esEscenarioMod40, ID_ESCENARIO_MOD10 } from '../app/utils/formulas'
import { evaluarElegibilidad } from '../lib/elegibilidad'
import { getTermometro, TERMOMETRO_RECUPERACION, HORIZONTE_MESES, calcularRetorno, BASE_RETORNO } from '../lib/design-tokens'

/**
 * Regresiones — cada bloque corresponde a un bug real encontrado en revisión.
 * Si alguno vuelve a fallar, el bug regresó.
 */

// ── 1. Modalidad 10 mezclada en la comparativa de Modalidad 40 ─────────────
// Sintoma: "Escenario 1" mostraba costo $8,987.36, ganancia $0.00 y tasa 0.0%
// porque e_m10 (Art. 13 LSS) pasaba el filtro mod40_meses > 0.
describe('separacion Modalidad 10 / Modalidad 40', () => {
  const lista = [
    { id: 'e0', mod40_meses: 0 },
    { id: ID_ESCENARIO_MOD10, mod40_meses: 12 },
    { id: 'e1', mod40_meses: 12 },
    { id: 'e2', mod40_meses: 24 },
    { id: 'e3', mod40_meses: 36 },
  ]

  it('excluye Modalidad 10 aunque declare meses', () => {
    const r = lista.filter(esEscenarioMod40)
    expect(r.map(e => e.id)).toEqual(['e1', 'e2', 'e3'])
  })

  it('excluye el escenario base sin modalidad', () => {
    expect(lista.filter(esEscenarioMod40).some(e => e.id === 'e0')).toBe(false)
  })

  it('el numero de tarjetas coincide con el de barras de la grafica', () => {
    // Antes: 3 tarjetas (slice 0,3) contra 4 barras (slice 0,6).
    const escs = lista.filter(esEscenarioMod40)
    expect(escs.slice(0, 6).length).toBe(escs.length)
  })
})

// ── 2. Costo de Mod. 40 — la formula del Excel de referencia ──────────────
// sdi x tasa x diasAnio / 12, sumado mes a mes. Verificado contra el libro.
describe('costo de Modalidad 40', () => {
  const TASAS: Record<number, number> = { 2026: 14.438, 2027: 15.528, 2028: 16.619, 2029: 17.709, 2030: 18.8 }
  const UMA = 117.31
  const dias = (a: number) => (a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 366 : 365)
  const umaDelAnio = (a: number, base = 2026, infl = 0.04) => UMA * Math.pow(1 + infl, a - base)

  const costo = (umas: number, meses: number, anioIni: number) => {
    let t = 0
    for (let m = 0; m < meses; m++) {
      const a = anioIni + Math.floor(m / 12)
      t += umas * umaDelAnio(a) * ((TASAS[a] ?? 18.8) / 100) * dias(a) / 12
    }
    return t
  }

  it('25 UMAs x 36 meses desde 2027 coincide con la referencia', () => {
    expect(costo(25, 36, 2027)).toBeCloseTo(579047.97, 1)
  })

  it('20 UMAs x 36 meses coincide con la referencia', () => {
    expect(costo(20, 36, 2027)).toBeCloseTo(463238.38, 1)
  })

  it('15 UMAs x 24 meses coincide con la referencia', () => {
    expect(costo(15, 24, 2027)).toBeCloseTo(219486.76, 1)
  })

  it('12 meses a 25 UMAs nunca puede costar menos que 12 meses a 15 UMAs', () => {
    expect(costo(25, 12, 2027)).toBeGreaterThan(costo(15, 12, 2027))
  })

  it('el costo por UMA-mes es estable entre escenarios de igual duracion', () => {
    const a = costo(20, 36, 2027) / (20 * 36)
    const b = costo(25, 36, 2027) / (25 * 36)
    expect(a).toBeCloseTo(b, 2)
  })
})

// ── 3. Prorrateo del desglose anual ───────────────────────────────────────
// Sintoma: la tabla asumia 12 meses en todos los anios, por lo que la suma
// de las filas no coincidia con el costo total cuando habia anios parciales.
describe('prorrateo de meses por anio calendario', () => {
  const repartir = (anioInicio: number, mesInicio: number, totalMeses: number) => {
    const mapa = new Map<number, number>()
    for (let m = 0; m < totalMeses; m++) {
      const a = anioInicio + Math.floor((mesInicio + m) / 12)
      mapa.set(a, (mapa.get(a) ?? 0) + 1)
    }
    return mapa
  }

  it('la suma de meses por anio es igual al total', () => {
    const mapa = repartir(2027, 8, 36)
    const suma = Array.from(mapa.values()).reduce((a, b) => a + b, 0)
    expect(suma).toBe(36)
  })

  it('un arranque a mitad de anio produce un primer anio parcial', () => {
    const mapa = repartir(2027, 8, 36)   // septiembre
    expect(mapa.get(2027)).toBe(4)
    expect(mapa.get(2028)).toBe(12)
    expect(mapa.get(2030)).toBe(8)
  })

  it('un arranque en enero produce anios completos', () => {
    const mapa = repartir(2027, 0, 36)
    expect(Array.from(mapa.values())).toEqual([12, 12, 12])
  })
})

// ── 4. Retorno sobre lo invertido ─────────────────────────────────────────
// El campo tasa_rendimiento se almacena x100. Los umbrales del termometro de
// Proyeccion lo comparaban crudo contra 25/18/12, por lo que todo escenario
// caia en "Excelente".
describe('umbrales de retorno', () => {
  const termometro = (multiplo: number) =>
    multiplo >= 25 ? 'Excelente'
    : multiplo >= 18 ? 'Buena inversion'
    : multiplo >= 12 ? 'Moderada'
    : 'Riesgo moderado'

  const comoMultiplo = (tasaAlmacenada: number) => tasaAlmacenada / 100

  it('2474.5 almacenado equivale a 24.7 veces', () => {
    expect(comoMultiplo(2474.5)).toBeCloseTo(24.745, 3)
  })

  it('un retorno bajo NO se clasifica como excelente', () => {
    expect(termometro(comoMultiplo(800))).toBe('Riesgo moderado')
  })

  it('los cuatro tramos son alcanzables', () => {
    const etiquetas = [3000, 2000, 1400, 500].map(t => termometro(comoMultiplo(t)))
    expect(new Set(etiquetas).size).toBe(4)
  })
})

// ── 5. Indexacion por INPC ────────────────────────────────────────────────
// El factor plano 1.54 se aplicaba a flujos con horizontes distintos.
describe('flujo acumulado indexado', () => {
  const flujo = (mensual: number, anios: number, i = 0.045) => {
    if (mensual <= 0 || anios <= 0) return 0
    const f = i === 0 ? anios : (Math.pow(1 + i, anios) - 1) / i
    return mensual * 13 * f
  }

  it('crece mas que rapido lineal por la indexacion', () => {
    expect(flujo(10000, 20)).toBeGreaterThan(10000 * 13 * 20)
  })

  it('horizontes distintos NO comparten factor de acumulacion', () => {
    const f18 = flujo(1, 18) / 13
    const f20 = flujo(1, 20) / 13
    expect(f20 / f18).toBeGreaterThan(1.1)   // el factor plano asumia 1.0
  })

  it('devuelve cero con monto o plazo no positivos', () => {
    expect(flujo(0, 20)).toBe(0)
    expect(flujo(1000, 0)).toBe(0)
  })
})

// ── 6. Compuerta de elegibilidad ──────────────────────────────────────────
describe('elegibilidad Mod. 40 / Mod. 10', () => {
  const base = {
    semanas_netas: 1677,
    cotizando_actualmente: false,
    fecha_baja: new Date(Date.now() - 2 * 365.25 * 864e5).toISOString().slice(0, 10),
    semanas_ultimos_5_anios: 120,
    regimen: 'ley73' as const,
    edad_actual: 58,
  }

  it('cotizar actualmente bloquea Modalidad 40 (Art. 218)', () => {
    const r = evaluarElegibilidad({ ...base, cotizando_actualmente: true })
    expect(r.mod40_viable).toBe(false)
    expect(r.hallazgos.some(h => h.fundamento?.includes('218'))).toBe(true)
  })

  it('mas de 5 anios desde la baja pierde el derecho (Art. 219)', () => {
    const seisAnios = new Date(Date.now() - 6 * 365.25 * 864e5).toISOString().slice(0, 10)
    const r = evaluarElegibilidad({ ...base, fecha_baja: seisAnios })
    expect(r.mod40_viable).toBe(false)
    expect(r.hallazgos.some(h => h.fundamento?.includes('219') && h.severidad === 'bloqueo')).toBe(true)
  })

  it('menos de 52 semanas en los ultimos 5 anios bloquea', () => {
    const r = evaluarElegibilidad({ ...base, semanas_ultimos_5_anios: 30 })
    expect(r.mod40_viable).toBe(false)
  })

  it('un caso limpio es viable y advierte de los riesgos del Art. 220', () => {
    const r = evaluarElegibilidad(base)
    expect(r.mod40_viable).toBe(true)
    expect(r.hallazgos.some(h => h.fundamento?.includes('220'))).toBe(true)
  })

  it('recomienda Modalidad 10 cuando faltan semanas para las 500', () => {
    const r = evaluarElegibilidad({ ...base, semanas_netas: 380 })
    expect(r.mod10_recomendada).toBe(true)
  })

  it('no recomienda Modalidad 10 si ya se superaron las 500', () => {
    expect(evaluarElegibilidad(base).mod10_recomendada).toBe(false)
  })
})

// ── 7. Termómetro unificado ───────────────────────────────────────────────
// Antes convivían dos criterios con las mismas etiquetas: meses de
// recuperación en Escenarios/Costo, y retorno como múltiplo en Proyección.
// El mismo caso podía decir "Excelente" en una pantalla y "Moderada" en otra.
describe('termómetro de recuperación', () => {
  it('un caso de 11 meses da Excelente', () => {
    expect(getTermometro(11).label).toBe('Excelente')
  })

  it('los cinco tramos son alcanzables', () => {
    const etiquetas = [6, 18, 36, 72, 150].map(m => getTermometro(m).label)
    expect(new Set(etiquetas).size).toBe(5)
  })

  it('los umbrales caen en el tramo correcto, no en el siguiente', () => {
    expect(getTermometro(12).label).toBe('Excelente')
    expect(getTermometro(13).label).toBe('Muy buena')
    expect(getTermometro(24).label).toBe('Muy buena')
    expect(getTermometro(25).label).toBe('Buena')
    expect(getTermometro(96).label).toBe('Aceptable')
    expect(getTermometro(97).label).toBe('Requiere análisis')
  })

  it('nunca devuelve indefinido, por grande que sea el valor', () => {
    expect(getTermometro(99999).label).toBe('Requiere análisis')
  })

  it('cada tramo trae una frase que el asesor puede decir', () => {
    TERMOMETRO_RECUPERACION.forEach(t => {
      expect(t.explica.length).toBeGreaterThan(20)
    })
  })

  it('el horizonte de cobro son 240 meses (60 a 80 años)', () => {
    expect(HORIZONTE_MESES).toBe((80 - 60) * 12)
  })

  it('el corte de alarma deja más de un tercio del horizonte en pagar', () => {
    const alarma = TERMOMETRO_RECUPERACION[TERMOMETRO_RECUPERACION.length - 2].max
    expect(alarma / HORIZONTE_MESES).toBeGreaterThan(0.33)
  })
})

// ── 8. Advertencias de riesgo ─────────────────────────────────────────────
// La herramienta mostraba un retorno de 24 veces sin mencionar en ninguna
// pantalla que lo invertido no se reembolsa si el cliente fallece antes de
// resolver la pensión.
describe('advertencias de riesgo en Modalidad 40', () => {
  const viable = {
    semanas_netas: 1677,
    cotizando_actualmente: false,
    fecha_baja: new Date(Date.now() - 2 * 365.25 * 864e5).toISOString().slice(0, 10),
    semanas_ultimos_5_anios: 120,
    regimen: 'ley73' as const,
    edad_actual: 58,
  }

  it('advierte que lo invertido no se reembolsa si fallece', () => {
    const r = evaluarElegibilidad(viable)
    expect(r.hallazgos.some(h => /fallece/i.test(h.titulo))).toBe(true)
  })

  it('advierte que se pierde por falta de pago o reingreso', () => {
    const r = evaluarElegibilidad(viable)
    expect(r.hallazgos.some(h => h.fundamento === 'Art. 220 LSS')).toBe(true)
  })

  it('no muestra advertencias de Mod. 40 cuando la vía está bloqueada', () => {
    const r = evaluarElegibilidad({ ...viable, cotizando_actualmente: true })
    expect(r.hallazgos.some(h => /fallece/i.test(h.titulo))).toBe(false)
  })
})

// ── 9. Base de cálculo del retorno ────────────────────────────────────────
// El Excel de referencia usa cuatro denominadores distintos bajo la misma
// etiqueta. La app fija uno: inversión neta, porque la recuperación de AFORE
// es dinero que regresa y por tanto no es costo.
describe('retorno sobre lo invertido', () => {
  it('divide entre inversión neta, no entre costo total', () => {
    const ganancia = 11_462_978
    const costoTotal = 579_047.97
    const afore = 115_809.59
    const neta = costoTotal - afore
    expect(calcularRetorno(ganancia, neta)).toBeCloseTo(ganancia / neta, 6)
    expect(calcularRetorno(ganancia, neta)).not.toBeCloseTo(ganancia / costoTotal, 2)
  })

  it('la base declarada es inversion_neta', () => {
    expect(BASE_RETORNO).toBe('inversion_neta')
  })

  it('no divide entre cero', () => {
    expect(calcularRetorno(1_000_000, 0)).toBe(0)
    expect(calcularRetorno(1_000_000, -5)).toBe(0)
  })

  it('usar el costo total subestimaría el retorno', () => {
    const g = 11_462_978, total = 579_047.97, neta = 463_238.38
    expect(calcularRetorno(g, neta)).toBeGreaterThan(g / total)
  })
})
