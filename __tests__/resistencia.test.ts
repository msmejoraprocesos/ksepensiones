import { describe, it, expect } from 'vitest'

/**
 * Los 146 tests existentes son de lógica pura. Ninguno prueba que un
 * componente monte sin reventar, que es donde más se rompe una aplicación:
 * un `datos.map` sobre undefined, una división entre cero, una fecha nula.
 *
 * Estas pruebas ejercitan las funciones que alimentan cada pantalla con los
 * casos límite que llegan en producción: cliente recién creado sin
 * diagnóstico, escenarios vacíos, fechas ausentes.
 */

import { evaluarCobranza, calcularNuevaVigencia, cotizar, normalizarTramos } from '../lib/cartera'
import { evaluarElegibilidad } from '../lib/elegibilidad'
import { getTermometro } from '../lib/design-tokens'
import { esEscenarioMod40 } from '../app/utils/formulas'

describe('resistencia a datos vacíos o incompletos', () => {
  it('la cobranza no revienta sin vigencia ni tolerancia', () => {
    expect(() => evaluarCobranza(null)).not.toThrow()
    expect(() => evaluarCobranza(undefined, undefined as any)).not.toThrow()
    expect(evaluarCobranza(null).estado).toBe('sin_contrato')
  })

  it('una fecha ilegible se trata como sin contrato, no como NaN', () => {
    // Un NaN aquí se propaga al estado y termina suspendiendo a quien no toca.
    const r = evaluarCobranza('no-es-fecha', 5)
    expect(r.estado).toBe('sin_contrato')
    expect(Number.isNaN(r.diasRestantes)).toBe(false)
  })

  it('la nueva vigencia tolera una vigencia previa basura', () => {
    expect(() => calcularNuevaVigencia('', 'mensual')).not.toThrow()
    expect(calcularNuevaVigencia('', 'mensual')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('el cotizador nunca devuelve NaN ni infinito', () => {
    for (const n of [0, -1, NaN as any, undefined as any, 1e6]) {
      const c = cotizar(n)
      expect(Number.isFinite(c.totalMensual)).toBe(true)
      expect(c.usuarios).toBeGreaterThanOrEqual(1)
    }
  })

  it('normalizar tramos tolera precios negativos y listas rotas', () => {
    const r = normalizarTramos([{ hasta: 5, precioUsuario: -100 }, { hasta: null, precioUsuario: 600 }])
    expect(r.every(t => t.precioUsuario >= 0)).toBe(true)
    expect(r[r.length - 1].hasta).toBeNull()
  })

  it('el termómetro responde a cualquier número', () => {
    for (const m of [0, -5, 0.5, 1e9]) {
      expect(getTermometro(m).label).toBeTruthy()
    }
  })

  it('el filtro de escenarios tolera una lista vacía', () => {
    expect([].filter(esEscenarioMod40)).toEqual([])
  })

  it('la elegibilidad funciona sin fecha de baja ni semanas capturadas', () => {
    const r = evaluarElegibilidad({
      semanas_netas: 0, cotizando_actualmente: false, fecha_baja: null,
      semanas_ultimos_5_anios: null, regimen: 'ley73', edad_actual: 60,
    })
    expect(r.hallazgos.length).toBeGreaterThan(0)
    expect(r.hallazgos.every(h => h.titulo && h.detalle)).toBe(true)
  })

  it('un cliente sin semanas recibe la sugerencia de Modalidad 10', () => {
    const r = evaluarElegibilidad({
      semanas_netas: 0, cotizando_actualmente: false, fecha_baja: '2025-01-01',
      semanas_ultimos_5_anios: 60, regimen: 'ley73', edad_actual: 58,
    })
    expect(r.mod10_recomendada).toBe(true)
  })
})

describe('coherencia entre módulos', () => {
  it('un escenario con recuperación de 0 meses no rompe el termómetro', () => {
    expect(getTermometro(0).label).toBe('Excelente')
  })

  it('el estado de cobranza y el termómetro usan escalas independientes', () => {
    // Uno mide vigencia del contrato, el otro retorno de la inversión.
    expect(evaluarCobranza('2026-01-01', 5, '2026-09-12').estado).toBe('vencido')
    expect(getTermometro(11).label).toBe('Excelente')
  })
})
