import { describe, it, expect } from 'vitest'

/**
 * La lógica de ordenamiento del hook, extraída para poder probarla sin montar
 * React. Debe mantenerse en paralelo con useTablaOrdenada.
 */
function comparar(va: any, vb: any, direccion: 'asc' | 'desc'): number {
  const signo = direccion === 'asc' ? 1 : -1
  const aVacio = va === null || va === undefined || va === ''
  const bVacio = vb === null || vb === undefined || vb === ''
  if (aVacio && bVacio) return 0
  if (aVacio) return 1
  if (bVacio) return -1
  if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo
  if (typeof va === 'boolean' && typeof vb === 'boolean') return (Number(va) - Number(vb)) * signo
  const fa = Date.parse(String(va)), fb = Date.parse(String(vb))
  if (!isNaN(fa) && !isNaN(fb) && /\d{4}-\d{2}-\d{2}|\//.test(String(va))) return (fa - fb) * signo
  return String(va).localeCompare(String(vb), 'es-MX', { numeric: true, sensitivity: 'base' }) * signo
}

const ordenar = <T,>(filas: T[], leer: (f: T) => any, dir: 'asc' | 'desc' = 'asc') =>
  [...filas].sort((a, b) => comparar(leer(a), leer(b), dir))

describe('ordenamiento de tablas', () => {
  it('los valores vacíos van al final en ambas direcciones', () => {
    const filas = [{ v: 'b' }, { v: null }, { v: 'a' }, { v: '' }]
    expect(ordenar(filas, f => f.v).map(f => f.v)).toEqual(['a', 'b', null, ''])
    expect(ordenar(filas, f => f.v, 'desc').map(f => f.v)).toEqual(['b', 'a', null, ''])
  })

  it('ordena números como números, no como texto', () => {
    const filas = [{ n: 100 }, { n: 9 }, { n: 25 }]
    expect(ordenar(filas, f => f.n).map(f => f.n)).toEqual([9, 25, 100])
  })

  it('respeta acentos y eñes en el orden alfabético', () => {
    const filas = [{ n: 'Zúñiga' }, { n: 'Ñanduti' }, { n: 'Álvarez' }, { n: 'Bravo' }]
    expect(ordenar(filas, f => f.n).map(f => f.n)).toEqual(['Álvarez', 'Bravo', 'Ñanduti', 'Zúñiga'])
  })

  it('ordena fechas ISO cronológicamente', () => {
    const filas = [{ d: '2026-03-01' }, { d: '2025-12-31' }, { d: '2026-01-15' }]
    expect(ordenar(filas, f => f.d).map(f => f.d)).toEqual(['2025-12-31', '2026-01-15', '2026-03-01'])
  })

  it('no altera el arreglo original', () => {
    const filas = [{ n: 3 }, { n: 1 }]
    ordenar(filas, f => f.n)
    expect(filas.map(f => f.n)).toEqual([3, 1])
  })
})

describe('paginación', () => {
  const rebanar = (total: number, pagina: number, porPagina: number) => ({
    desde: total === 0 ? 0 : (pagina - 1) * porPagina + 1,
    hasta: Math.min(pagina * porPagina, total),
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  })

  it('calcula el rango visible', () => {
    expect(rebanar(63, 1, 25)).toEqual({ desde: 1, hasta: 25, totalPaginas: 3 })
    expect(rebanar(63, 3, 25)).toEqual({ desde: 51, hasta: 63, totalPaginas: 3 })
  })

  it('una lista vacía no produce página cero ni rangos negativos', () => {
    expect(rebanar(0, 1, 25)).toEqual({ desde: 0, hasta: 0, totalPaginas: 1 })
  })

  it('un solo registro cabe en una página', () => {
    expect(rebanar(1, 1, 25)).toEqual({ desde: 1, hasta: 1, totalPaginas: 1 })
  })

  it('un múltiplo exacto no genera una página vacía de más', () => {
    expect(rebanar(50, 1, 25).totalPaginas).toBe(2)
  })
})
