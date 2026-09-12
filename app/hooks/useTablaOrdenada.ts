'use client'
import { useState, useMemo, useEffect } from 'react'

/**
 * Ordenamiento y paginación para tablas de listado.
 *
 * Las tablas de Clientes, Seguimiento y Reportes renderizaban todos los
 * registros sin orden. Con pocos clientes no se nota; con varios cientos el
 * navegador tiene que montar miles de nodos en cada filtrado y la pantalla
 * se congela.
 *
 * El ordenamiento es en memoria a propósito: los datos ya están cargados y
 * ordenar en el cliente evita un viaje a Supabase por cada clic en una
 * columna. Si el volumen crece al punto de no poder traer todo, habrá que
 * mover ambas cosas al servidor con .range() y .order().
 */

export type Direccion = 'asc' | 'desc'

interface Opciones<T> {
  /** Campo inicial. Si se omite, la lista conserva el orden de origen. */
  campoInicial?: keyof T | null
  direccionInicial?: Direccion
  porPagina?: number
  /** Lector personalizado para campos calculados o anidados. */
  valorDe?: (fila: T, campo: keyof T) => any
}

export function useTablaOrdenada<T extends Record<string, any>>(
  filas: T[],
  { campoInicial = null, direccionInicial = 'asc', porPagina = 25, valorDe }: Opciones<T> = {}
) {
  const [campo, setCampo] = useState<keyof T | null>(campoInicial)
  const [direccion, setDireccion] = useState<Direccion>(direccionInicial)
  const [pagina, setPagina] = useState(1)

  /* Si el filtro reduce la lista y la página actual queda fuera de rango,
     el usuario vería una tabla vacía sin entender por qué. */
  const totalPaginas = Math.max(1, Math.ceil(filas.length / porPagina))
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(1)
  }, [totalPaginas, pagina])

  const ordenadas = useMemo(() => {
    if (!campo) return filas
    const leer = valorDe ?? ((f: T, c: keyof T) => f[c])
    const signo = direccion === 'asc' ? 1 : -1

    return [...filas].sort((a, b) => {
      const va = leer(a, campo)
      const vb = leer(b, campo)

      // Los vacíos siempre al final, sin importar la dirección: un cliente sin
      // fecha de pago no es "el más antiguo", es un dato que falta.
      const aVacio = va === null || va === undefined || va === ''
      const bVacio = vb === null || vb === undefined || vb === ''
      if (aVacio && bVacio) return 0
      if (aVacio) return 1
      if (bVacio) return -1

      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo
      if (typeof va === 'boolean' && typeof vb === 'boolean') return (Number(va) - Number(vb)) * signo

      const fa = Date.parse(String(va))
      const fb = Date.parse(String(vb))
      const pareceFecha = !isNaN(fa) && !isNaN(fb) && /\d{4}-\d{2}-\d{2}|\//.test(String(va))
      if (pareceFecha) return (fa - fb) * signo

      // Comparación local: respeta acentos y ñ en el orden alfabético.
      return String(va).localeCompare(String(vb), 'es-MX', { numeric: true, sensitivity: 'base' }) * signo
    })
  }, [filas, campo, direccion, valorDe])

  const visibles = useMemo(
    () => ordenadas.slice((pagina - 1) * porPagina, pagina * porPagina),
    [ordenadas, pagina, porPagina]
  )

  /** Alterna dirección si es la misma columna; si es otra, empieza ascendente. */
  function ordenarPor(nuevo: keyof T) {
    if (campo === nuevo) {
      setDireccion(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setCampo(nuevo)
      setDireccion('asc')
    }
    setPagina(1)
  }

  return {
    visibles,
    campo,
    direccion,
    ordenarPor,
    pagina,
    setPagina,
    totalPaginas,
    total: filas.length,
    desde: filas.length === 0 ? 0 : (pagina - 1) * porPagina + 1,
    hasta: Math.min(pagina * porPagina, filas.length),
    porPagina,
  }
}
