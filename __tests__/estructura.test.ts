import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Pruebas de estructura sobre el código fuente.
 *
 * Nacen de un bug real: la pantalla "Importe de pensión" salió en blanco
 * durante toda una sesión de trabajo. El componente existía, se importaba y
 * estaba rediseñado por completo — pero no había ningún `tab === 5` en el
 * árbol de render, así que nadie la pintaba nunca.
 *
 * Ni el compilador ni los tests de lógica detectan eso: el código es válido y
 * las funciones son correctas. Solo se nota abriendo la pantalla.
 */

const raiz = process.cwd()
const leer = (p: string) => readFileSync(join(raiz, p), 'utf-8')
const calculadora = leer('app/(app)/calculadora/page.tsx')

describe('riel de navegación de la calculadora', () => {
  const declarados = new Set<number>()
  for (const m of calculadora.matchAll(/tabs: \[([-\d, ]+)\]/g)) {
    for (const t of m[1].split(',')) declarados.add(Number(t.trim()))
  }
  const conRender = new Set(
    [...calculadora.matchAll(/tab === (-?\d+)/g)].map(m => Number(m[1]))
  )

  it('el riel declara al menos las seis pantallas del flujo', () => {
    expect(declarados.size).toBeGreaterThanOrEqual(6)
  })

  it('toda pantalla del riel tiene su render', () => {
    // Este es el test que habría cazado el tab 5 en blanco.
    const huerfanas = [...declarados].filter(t => !conRender.has(t))
    expect(huerfanas).toEqual([])
  })

  it('no hay render de pantallas que el riel no ofrece', () => {
    // Un render sin entrada en el riel es código muerto o una pantalla
    // inalcanzable, como lo estuvo Modalidad 10 antes de agregarla.
    const inalcanzables = [...conRender].filter(t => !declarados.has(t) && t >= 0)
    // 7 y 9 son redirecciones internas, no pantallas
    expect(inalcanzables.filter(t => ![7, 9].includes(t))).toEqual([])
  })
})

describe('componentes de la calculadora', () => {
  const COMPONENTES = [
    'TabCliente', 'TabCuantias', 'TabSalarioMod40', 'TabImporte',
    'TabEscenarios', 'TabCostoMod40', 'TabProyeccion', 'TabFinanciamiento',
    'TabEntregable',
  ]

  it('cada componente importado se usa en el árbol', () => {
    const sinUsar = COMPONENTES.filter(c => {
      const importado = calculadora.includes(`import ${c} from`)
      const usado = calculadora.includes(`<${c}`)
      return importado && !usado
    })
    expect(sinUsar).toEqual([])
  })

  it('cada componente existe como archivo', () => {
    for (const c of COMPONENTES) {
      expect(() => leer(`app/(app)/calculadora/components/${c}.tsx`)).not.toThrow()
    }
  })
})

describe('sistema de diseño', () => {
  const ARCHIVOS = [
    'app/(app)/calculadora/page.tsx',
    'app/(app)/clientes/page.tsx',
    'app/(app)/dashboard/page.tsx',
    'app/(app)/seguimiento/page.tsx',
    'app/(app)/financiamiento/page.tsx',
    'app/(app)/reportes/page.tsx',
    'app/(app)/cartera/page.tsx',
    'app/(app)/configuracion/page.tsx',
    'app/(app)/admin/page.tsx',
    'app/(app)/super-admin/page.tsx',
  ]

  it('ningún módulo usa tipografía por debajo de la escala', () => {
    // El mínimo del sistema es 13px. Por debajo no se lee en tablet.
    const conFuentePequena = ARCHIVOS.filter(f =>
      /fontSize: '(9|9\.5|10|10\.5|11|12)px'/.test(leer(f))
    )
    expect(conFuentePequena).toEqual([])
  })

  it('ningún módulo usa mayúsculas forzadas con tracking', () => {
    // Era la firma del diseño anterior.
    const conMayusculas = ARCHIVOS.filter(f =>
      /textTransform: 'uppercase'/.test(leer(f))
    )
    expect(conMayusculas).toEqual([])
  })

  it('ningún módulo usa barras laterales de color de 4px', () => {
    const conBarra = ARCHIVOS.filter(f => /borderLeft: `4px solid/.test(leer(f)))
    expect(conBarra).toEqual([])
  })
})

describe('seguridad y consistencia', () => {
  it('no queda ningún alert() en la aplicación', () => {
    // alert bloquea el hilo y no se puede estilizar.
    const conAlert = [
      'app/(app)/calculadora/page.tsx', 'app/(app)/clientes/page.tsx',
      'app/(app)/admin/page.tsx', 'app/(app)/org-admin/page.tsx',
    ].filter(f => /(?<![.\w])alert\(/.test(leer(f)))
    expect(conAlert).toEqual([])
  })

  it('el borrado de datos siempre confirma', () => {
    const clientes = leer('app/(app)/clientes/page.tsx')
    const idxDelete = clientes.indexOf("from('pagos').delete()")
    expect(idxDelete).toBeGreaterThan(-1)
    // la confirmación debe estar en las líneas previas a la llamada
    expect(clientes.slice(Math.max(0, idxDelete - 400), idxDelete)).toMatch(/confirm\(/)
  })

  it('la marca de agua no vive en la interfaz, solo en el PDF', () => {
    expect(calculadora).not.toMatch(/kse-wm/)
    expect(leer('app/utils/DiagnosticoPDF.tsx')).toMatch(/wm:/)
  })
})
