'use client'
import { useState, useCallback, useMemo } from 'react'

/**
 * Validación en tiempo real.
 *
 * Los formularios validaban solo al enviar: el usuario llenaba todo, daba
 * clic y hasta entonces descubría que el correo estaba mal. Validar al perder
 * el foco corrige en el momento, mientras el contexto sigue fresco.
 *
 * El error no se muestra mientras se escribe por primera vez —sería regañar a
 * alguien a media frase— sino al salir del campo o al intentar enviar.
 */

export type Regla<T> = (valor: any, todo: T) => string | null

export const reglas = {
  requerido: (etiqueta: string): Regla<any> =>
    v => (v === null || v === undefined || String(v).trim() === '' ? `${etiqueta} es obligatorio.` : null),

  correo: (): Regla<any> =>
    v => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v)) ? null : 'El correo no tiene un formato válido.'),

  telefono: (digitos = 10): Regla<any> =>
    v => {
      if (!v) return null
      const solo = String(v).replace(/\D/g, '')
      return solo.length === digitos ? null : `El teléfono debe tener ${digitos} dígitos.`
    },

  minimo: (n: number, etiqueta: string): Regla<any> =>
    v => (Number(v) >= n ? null : `${etiqueta} debe ser al menos ${n}.`),

  longitudMinima: (n: number, etiqueta: string): Regla<any> =>
    v => (String(v ?? '').length >= n ? null : `${etiqueta} debe tener al menos ${n} caracteres.`),
}

export function useValidacion<T extends Record<string, any>>(
  valores: T,
  esquema: Partial<Record<keyof T, Regla<T>[]>>
) {
  const [tocados, setTocados] = useState<Partial<Record<keyof T, boolean>>>({})
  const [enviado, setEnviado] = useState(false)

  const errores = useMemo(() => {
    const r: Partial<Record<keyof T, string>> = {}
    for (const campo in esquema) {
      for (const regla of esquema[campo] ?? []) {
        const e = regla(valores[campo], valores)
        if (e) { r[campo] = e; break }
      }
    }
    return r
  }, [valores, esquema])

  /** Solo se muestra si el campo ya fue tocado o si se intentó enviar. */
  const errorDe = useCallback(
    (campo: keyof T) => ((tocados[campo] || enviado) ? errores[campo] : undefined),
    [errores, tocados, enviado]
  )

  return {
    errores,
    errorDe,
    hayErrores: Object.keys(errores).length > 0,
    tocar: (campo: keyof T) => setTocados(p => ({ ...p, [campo]: true })),
    marcarEnviado: () => setEnviado(true),
    /** Devuelve true si se puede enviar; si no, revela todos los errores. */
    validarAntesDeEnviar: () => {
      setEnviado(true)
      return Object.keys(errores).length === 0
    },
  }
}
