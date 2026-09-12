import { describe, it, expect } from 'vitest'
import { evaluarCobranza, calcularNuevaVigencia, cotizar, diasEntre, DIAS_AVISO_PREVIO, normalizarTramos, validarTramos, TRAMOS_DEFAULT } from '../lib/cartera'

const HOY = '2026-09-12'

describe('estado de cobranza', () => {
  it('vigente cuando falta más que el aviso previo', () => {
    const r = evaluarCobranza('2026-12-31', 5, HOY)
    expect(r.estado).toBe('vigente')
    expect(r.diasVencido).toBe(0)
  })

  it('por vencer dentro de los 15 días de aviso', () => {
    expect(evaluarCobranza('2026-09-20', 5, HOY).estado).toBe('por_vencer')
  })

  it('el día exacto del vencimiento todavía cuenta como por vencer, no vencido', () => {
    const r = evaluarCobranza(HOY, 5, HOY)
    expect(r.estado).toBe('por_vencer')
    expect(r.diasRestantes).toBe(0)
  })

  it('en tolerancia: venció pero el margen aún cubre el acceso', () => {
    const r = evaluarCobranza('2026-09-10', 5, HOY)
    expect(r.estado).toBe('en_tolerancia')
    expect(r.diasVencido).toBe(0)
  })

  it('el último día de tolerancia sigue dando acceso', () => {
    // venció el 7, tolerancia 5 → límite el 12, que es hoy
    expect(evaluarCobranza('2026-09-07', 5, HOY).estado).toBe('en_tolerancia')
  })

  it('un día después del límite ya es vencido', () => {
    const r = evaluarCobranza('2026-09-06', 5, HOY)
    expect(r.estado).toBe('vencido')
    expect(r.diasVencido).toBe(1)
  })

  it('tolerancia cero corta al día siguiente del vencimiento', () => {
    expect(evaluarCobranza('2026-09-11', 0, HOY).estado).toBe('vencido')
  })

  it('sin vigencia capturada no inventa un estado', () => {
    expect(evaluarCobranza(null, 5, HOY).estado).toBe('sin_contrato')
    expect(evaluarCobranza(undefined, 5, HOY).limiteAcceso).toBeNull()
  })

  it('el aviso previo es de 15 días', () => {
    expect(DIAS_AVISO_PREVIO).toBe(15)
  })
})

describe('cálculo de nueva vigencia al pagar', () => {
  it('un pago adelantado suma al periodo que corre, no lo reinicia', () => {
    // vigencia al 31 dic, paga hoy: debe quedar 31 ene, no 12 oct
    expect(calcularNuevaVigencia('2026-12-31', 'mensual', HOY)).toBe('2027-01-31')
  })

  it('un pago tardío no regala los días de atraso', () => {
    // venció en julio y paga en septiembre: corre desde hoy
    expect(calcularNuevaVigencia('2026-07-01', 'mensual', HOY)).toBe('2026-10-12')
  })

  it('el primer pago arranca desde hoy', () => {
    expect(calcularNuevaVigencia(null, 'mensual', HOY)).toBe('2026-10-12')
  })

  it('la periodicidad anual suma un año', () => {
    expect(calcularNuevaVigencia(null, 'anual', HOY)).toBe('2027-09-12')
  })

  it('respeta meses de distinta duración', () => {
    expect(calcularNuevaVigencia('2026-01-31', 'mensual', '2026-01-15')).toBe('2026-03-03')
  })
})

describe('cotizador por volumen', () => {
  it('un solo usuario paga el precio más alto', () => {
    expect(cotizar(1).precioUsuario).toBe(1200)
  })

  it('el precio unitario baja al crecer el volumen', () => {
    const precios = [1, 5, 15, 30, 100].map(n => cotizar(n).precioUsuario)
    for (let i = 1; i < precios.length; i++) {
      expect(precios[i]).toBeLessThan(precios[i - 1])
    }
  })

  it('más usuarios nunca cuesta menos en total', () => {
    const totales = [1, 5, 15, 30, 100].map(n => cotizar(n).totalMensual)
    for (let i = 1; i < totales.length; i++) {
      expect(totales[i]).toBeGreaterThan(totales[i - 1])
    }
  })

  it('el plan anual cobra 10 meses y el ahorro son 2', () => {
    const c = cotizar(10, 'anual')
    expect(c.totalAnual).toBe(c.totalMensual * 10)
    expect(c.ahorroAnual).toBe(c.totalMensual * 2)
  })

  it('el total del periodo cambia según la periodicidad', () => {
    expect(cotizar(10, 'mensual').totalPeriodo).toBe(cotizar(10).totalMensual)
    expect(cotizar(10, 'anual').totalPeriodo).toBe(cotizar(10).totalAnual)
  })

  it('entradas inválidas se normalizan a un usuario', () => {
    expect(cotizar(0).usuarios).toBe(1)
    expect(cotizar(-5).usuarios).toBe(1)
    expect(cotizar(3.7).usuarios).toBe(3)
  })
})

describe('diferencia en días', () => {
  it('ignora la hora del día', () => {
    expect(diasEntre('2026-09-12T23:00:00', '2026-09-13T01:00:00')).toBe(1)
  })
  it('es negativa hacia atrás', () => {
    expect(diasEntre('2026-09-12', '2026-09-10')).toBe(-2)
  })
})

describe('tramos de precio editables', () => {
  it('ordena los tramos aunque se capturen desordenados', () => {
    const r = normalizarTramos([
      { hasta: 30, precioUsuario: 700 },
      { hasta: 5, precioUsuario: 1000 },
      { hasta: null, precioUsuario: 600 },
    ])
    expect(r.map(t => t.hasta)).toEqual([5, 30, null])
  })

  it('convierte el último tramo en abierto si todos tienen tope', () => {
    // Sin esto, cotizar 500 usuarios no encontraría precio.
    const r = normalizarTramos([{ hasta: 5, precioUsuario: 1000 }, { hasta: 30, precioUsuario: 700 }])
    expect(r[r.length - 1].hasta).toBeNull()
  })

  it('una tabla vacía cae a los valores por defecto', () => {
    expect(normalizarTramos([])).toEqual(TRAMOS_DEFAULT)
  })

  it('cotiza con los tramos que se le pasen, no con los de fábrica', () => {
    const propios = [{ hasta: 10, precioUsuario: 500 }, { hasta: null, precioUsuario: 300 }]
    expect(cotizar(3, 'mensual', propios).precioUsuario).toBe(500)
    expect(cotizar(50, 'mensual', propios).precioUsuario).toBe(300)
  })

  it('detecta un precio que sube al crecer el volumen', () => {
    const errores = validarTramos([
      { hasta: 5, precioUsuario: 500 },
      { hasta: null, precioUsuario: 900 },
    ])
    expect(errores.some(e => /cuesta más por usuario/.test(e))).toBe(true)
  })

  it('detecta dos tramos con el mismo tope', () => {
    const errores = validarTramos([
      { hasta: 5, precioUsuario: 900 },
      { hasta: 5, precioUsuario: 800 },
      { hasta: null, precioUsuario: 700 },
    ])
    expect(errores.some(e => /terminan en 5/.test(e))).toBe(true)
  })

  it('los tramos por defecto son válidos', () => {
    expect(validarTramos(TRAMOS_DEFAULT)).toEqual([])
  })
})
