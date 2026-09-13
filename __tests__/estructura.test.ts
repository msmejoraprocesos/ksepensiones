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

describe('consistencia de layout entre módulos', () => {
  const MODULOS = [
    'dashboard', 'clientes', 'seguimiento', 'calculadora', 'financiamiento',
    'reportes', 'cartera', 'configuracion', 'admin', 'super-admin',
    'org-admin', 'kanban',
  ]

  it('ningún módulo limita el ancho del contenido', () => {
    /* Configuración tenía un contenedor de 1600px centrado mientras los otros
       once usaban el viewport completo: en monitores anchos dejaba franjas
       vacías y la pantalla se veía de otro diseño. */
    const conTope = MODULOS.filter(m => {
      const s = leer(`app/(app)/${m}/page.tsx`)
      return /maxWidth: '?1[2-9]\d\d(px)?'?[^}]*margin: '0 auto'/.test(s)
    })
    expect(conTope).toEqual([])
  })

  it('el padding del contenedor raíz es uniforme y fluido', () => {
    /* Había ocho valores distintos, y además fijos: un padding de 24px es
       holgado en un monitor de 1920 y se come el 12% del ancho en un teléfono
       de 390. Ahora todos usan el mismo patrón con clamp. */
    const sinEstandar = MODULOS.filter(m => {
      const s = leer(`app/(app)/${m}/page.tsx`)
      return !/padding: 'clamp\(10px, 1\.2vw, 14px\) clamp\(12px, 1\.4vw, 18px\)/.test(s)
    })
    // Seguimiento es un calendario a pantalla completa: su contenedor no lleva
    // padding porque la rejilla ocupa todo el alto disponible.
    expect(sinEstandar.filter(m => m !== 'seguimiento')).toEqual([])
  })

  it('la tipografía es fluida, no de píxeles fijos', () => {
    /* Este es el problema que reportó el uso real: en tableta todo se veía
       correcto pero demasiado grande, porque la escala no cambiaba con el
       ancho disponible. */
    const conFijos = MODULOS.filter(m => {
      const s = leer(`app/(app)/${m}/page.tsx`)
      const fijos = [...s.matchAll(/fontSize: '(\d+)px'/g)].map(x => Number(x[1]))
      return fijos.some(n => n >= 13)
    })
    expect(conFijos).toEqual([])
  })
})

describe('responsividad', () => {
  const MODULOS = [
    'dashboard', 'clientes', 'seguimiento', 'calculadora', 'financiamiento',
    'reportes', 'cartera', 'configuracion', 'admin', 'super-admin',
    'org-admin', 'kanban',
  ]

  it('ninguna retícula usa un número fijo de columnas', () => {
    /* "1fr 1fr" no cede: en un teléfono de 360px deja dos columnas de 180
       con el texto partido. auto-fit con minmax las apila solas.
       La excepción es repeat(7,...), la rejilla semanal del calendario. */
    const conFijas: string[] = []
    for (const m of MODULOS) {
      const s = leer(`app/(app)/${m}/page.tsx`)
      const hits = [...s.matchAll(/gridTemplateColumns: '([^']+)'/g)]
        .map(x => x[1])
        .filter(v => /^(1fr[ ]+)+1fr$/.test(v) || /^repeat\((?!auto|7)\d+,/.test(v))
      if (hits.length) conFijas.push(`${m}: ${hits[0]}`)
    }
    expect(conFijas).toEqual([])
  })

  it('ningún ancho fijo puede desbordar un teléfono', () => {
    // Un solo elemento que desborde activa el scroll horizontal de la página.
    const conAnchoFijo: string[] = []
    for (const m of MODULOS) {
      const s = leer(`app/(app)/${m}/page.tsx`)
      const hits = [...s.matchAll(/width: '(\d{3,4})px'/g)]
        .map(x => Number(x[1]))
        .filter(n => n > 340)
      if (hits.length) conAnchoFijo.push(`${m}: ${hits[0]}px`)
    }
    expect(conAnchoFijo).toEqual([])
  })

  it('la hoja global evita el desbordamiento horizontal', () => {
    const css = leer('app/globals.css')
    expect(css).toMatch(/overflow-x: hidden/)
    expect(css).toMatch(/max-width: 640px/)
  })

  it('los controles tienen área táctil suficiente en dispositivos táctiles', () => {
    // 44px es el mínimo recomendado para uso con el dedo.
    const css = leer('app/globals.css')
    expect(css).toMatch(/pointer: coarse/)
    expect(css).toMatch(/min-height: 44px/)
  })
})

describe('densidad de los componentes', () => {
  const TODOS = [
    ...['dashboard', 'clientes', 'seguimiento', 'calculadora', 'financiamiento',
        'reportes', 'cartera', 'configuracion', 'admin', 'super-admin',
        'org-admin', 'kanban'].map(m => `app/(app)/${m}/page.tsx`),
  ]

  it('los modales ceden ante el viewport', () => {
    /* Un maxWidth en píxeles no sabe cuánto espacio hay: en tableta vertical,
       donde el viewport ronda 900px, un modal de 880 llenaba la pantalla y
       dejaba de leerse como capa sobre el contenido. */
    const rigidos: string[] = []
    for (const f of TODOS) {
      const s = leer(f)
      const hits = [...s.matchAll(/maxWidth: '(\d{3,4})px'/g)]
        .map(m => Number(m[1]))
        .filter(n => n >= 340)
      if (hits.length) rigidos.push(`${f.split('/')[1]}: ${hits[0]}px`)
    }
    expect(rigidos).toEqual([])
  })

  it('ningún relleno supera los 30px', () => {
    // Un estado vacío con 60px de relleno ocupa media pantalla sin decir nada.
    const inflados: string[] = []
    for (const f of TODOS) {
      const s = leer(f)
      const hits = [...s.matchAll(/padding: '(\d{2,})px/g)]
        .map(m => Number(m[1]))
        .filter(n => n > 30)
      if (hits.length) inflados.push(`${f.split('/')[1]}: ${hits[0]}px`)
    }
    expect(inflados).toEqual([])
  })
})
