'use client'
import { useEffect, useCallback } from 'react'

/**
 * Confirmación al cerrar un formulario con datos capturados.
 *
 * Cerrar un modal por error después de llenar diez campos es de las cosas que
 * más molestan de una aplicación, y no deja rastro: el usuario simplemente
 * vuelve a capturar de mal humor, o abandona.
 *
 * Cubre las tres formas de salir: el botón de cerrar, la tecla Escape y el
 * clic fuera del diálogo. También avisa si se intenta cerrar la pestaña.
 */
export function useConfirmarCierre(
  hayDatos: boolean,
  cerrar: () => void,
  mensaje = 'Hay información capturada que se va a perder. ¿Cerrar de todas formas?'
) {
  const intentarCerrar = useCallback(() => {
    if (!hayDatos || window.confirm(mensaje)) cerrar()
  }, [hayDatos, cerrar, mensaje])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') intentarCerrar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [intentarCerrar])

  useEffect(() => {
    if (!hayDatos) return
    const antesDeSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', antesDeSalir)
    return () => window.removeEventListener('beforeunload', antesDeSalir)
  }, [hayDatos])

  return intentarCerrar
}
